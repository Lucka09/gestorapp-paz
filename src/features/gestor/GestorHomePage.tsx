// src/features/gestor/GestorHomePage.tsx
import { useState, useMemo }  from 'react'
import { useNavigate }        from 'react-router-dom'
import {
  RefreshCw, CheckCircle2, Clock, AlertTriangle,
  Plus, FileText, ClipboardList, ChevronRight,
  Car, BarChart3,
} from 'lucide-react'
import { useAuth }            from '@/hooks/useAuth'
import { useTramites }        from '@/hooks/useTramites'
import { usePageTitle }       from '@/hooks/usePageTitle'
import { useGestoriaId }      from '@/context/GestoriaContext'
import { crearTramite }       from '@/lib/firestore/tramites'
import { formatRelativo }     from '@/utils'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import Modal                  from '@/components/shared/Modal'
import TramiteForm            from '@/features/tramites/TramiteForm'
import NumeroBadge            from '@/components/shared/NumeroBadge'
import toast                  from 'react-hot-toast'

// ─── TIPOS DE TRAMITE QUE PUEDE CREAR EL GESTOR ───────────────────────────────

const TIPOS_GESTOR: TipoTramite[] = [
  'transferencia',
  'inscripcion_inicial',
  'tramite_08',
  'prenda',
  'informe_dominio',
  'certificado_dominio',
  'inhibicion',
  'levantamiento_inhibicion',
  'duplicado_titulo',
  'duplicado_cedula',
  'cambio_radicacion',
  'vtv',
  'otro',
]

// ─── BADGE DE ESTADO ──────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  en_proceso:  { label: 'En proceso',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  completado:  { label: 'Completado',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  cancelado:   { label: 'Cancelado',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
}

function EstadoBadgeGestor({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG['pendiente']
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ─── ALERTA NIVEL ─────────────────────────────────────────────────────────────

function calcularAlerta(diasSinMov: number): 0 | 1 | 2 | 3 {
  if (diasSinMov > 5) return 1
  if (diasSinMov > 3) return 2
  if (diasSinMov > 1) return 3
  return 0
}

const ALERTA_BORDER: Record<number, string> = {
  0: 'border-white/8',
  1: 'border-red-600/35',
  2: 'border-orange-500/30',
  3: 'border-yellow-500/25',
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

type Tab = 'asignados' | 'mis_tramites' | 'nuevo'

export default function GestorHomePage() {
  usePageTitle('Portal Gestor')
  const { user }      = useAuth()
  const navigate      = useNavigate()
  const gestoriaId    = useGestoriaId()
  const { tramites, loading } = useTramites()

  const [tab,       setTab]       = useState<Tab>('asignados')
  const [modalNuevo, setModalNuevo] = useState(false)

  // ── Trámites asignados al gestor ──────────────────────────────────────────
  // Trámites activos: asignados al gestor O creados por él
  const tramitesAsignados = useMemo(() =>
    tramites.filter(t =>
      (t.asignadoA === user?.uid || t.creadoPor === user?.uid) &&
      !['completado', 'cancelado'].includes(t.estado)
    ).sort((a, b) =>
      (b.actualizadoEn?.toDate?.()?.getTime() ?? 0) -
      (a.actualizadoEn?.toDate?.()?.getTime() ?? 0)
    ),
  [tramites, user?.uid])

  // ── Trámites creados por el gestor ────────────────────────────────────────
  const misTramites = useMemo(() =>
    tramites.filter(t =>
      t.creadoPor === user?.uid &&
      !['cancelado'].includes(t.estado)
    ).sort((a, b) =>
      (b.creadoEn?.toDate?.()?.getTime() ?? 0) -
      (a.creadoEn?.toDate?.()?.getTime() ?? 0)
    ),
  [tramites, user?.uid])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    asignados:   tramitesAsignados.length,
    propios:     misTramites.length,
    completados: tramites.filter(t =>
      (t.asignadoA === user?.uid || t.creadoPor === user?.uid) &&
      t.estado === 'entregado'
    ).length,
  }), [tramitesAsignados, misTramites, tramites, user?.uid])

  // ── Crear trámite ─────────────────────────────────────────────────────────
  const handleCrear = async (data: any) => {
    try {
      const id = await crearTramite(
        { ...data, gestoriaId, asignadoA: user?.uid ?? null },
        user?.uid ?? ''
      )
      toast.success('Trámite creado correctamente')
      setModalNuevo(false)
      navigate(`/admin/tramites/${id}`)
    } catch {
      toast.error('Error al crear el trámite')
    }
  }

  // ── Navegar al detalle según tipo ─────────────────────────────────────────
  // Navegar al workflow correcto según tipo de trámite
  const irAlTramite = (tramite: any) => {
    if (tramite.tipo === 'inscripcion_inicial') {
      // Inscripción: portal gestor con workflow paso a paso
      navigate(`/admin/gestor/${tramite.id}`)
    } else {
      // Transferencia, Multa y otros: TramiteDetallePage con workflow integrado
      navigate(`/admin/tramites/${tramite.id}`)
    }
  }

  // ── Card de trámite ───────────────────────────────────────────────────────
  const TramiteCard = ({ t }: { t: any }) => {
    const ahora        = new Date()
    const ultima       = t.actualizadoEn?.toDate?.() ?? t.creadoEn?.toDate?.() ?? ahora
    const diasSinMov   = (ahora.getTime() - ultima.getTime()) / 86_400_000
    const nivelAlerta  = calcularAlerta(diasSinMov)

    return (
      <div
        onClick={() => irAlTramite(t)}
        className={`rounded-2xl border bg-[#0d1117] p-4 mb-3 cursor-pointer
          transition-all hover:bg-white/3 active:scale-[0.98] ${ALERTA_BORDER[nivelAlerta]}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <NumeroBadge numero={t.numero ?? t.id.slice(-8)} tipo={t.tipo} size="sm" />
              {nivelAlerta === 1 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded
                  bg-red-600/15 text-red-400 border border-red-600/25">🚨 URGENTE</span>
              )}
              {nivelAlerta === 2 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded
                  bg-orange-500/15 text-orange-400 border border-orange-500/25">⏱ DEMORADO</span>
              )}
            </div>
            <p className="text-sm font-bold text-gray-100 truncate">
              {t.patente || 'Sin patente'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {TIPO_TRAMITE_LABELS[t.tipo as TipoTramite] ?? t.tipo}
            </p>
          </div>
          <ChevronRight size={14} className="text-gray-700 mt-1 shrink-0 ml-2" />
        </div>

        <div className="flex items-center justify-between">
          <EstadoBadgeGestor estado={t.estado} />
          <span className="text-[10px] text-gray-600 flex items-center gap-1">
            <Clock size={9} /> {formatRelativo(t.actualizadoEn)}
          </span>
        </div>
      </div>
    )
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080d14] text-gray-200"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="bg-[#0a0f1a] border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white">Portal del Gestor</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {user?.nombre} {user?.apellido}
            </p>
          </div>
          <button
            onClick={() => setModalNuevo(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold
              text-white transition-all active:scale-95"
            style={{ background: '#D4621A' }}
          >
            <Plus size={14} /> Nuevo trámite
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[
          { label: 'Asignados',   value: stats.asignados,   color: '#3b82f6' },
          { label: 'Propios',     value: stats.propios,     color: '#D4621A' },
          { label: 'Completados', value: stats.completados, color: '#22c55e' },
        ].map(s => (
          <div key={s.label}
            className="rounded-xl border border-white/8 bg-[#0d1117] p-3 text-center">
            <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-4">
        {([
          { key: 'asignados',   label: 'Asignados a mí', icon: <ClipboardList size={12} /> },
          { key: 'mis_tramites',label: 'Mis iniciados',  icon: <FileText size={12} /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
              text-xs font-semibold transition-all ${
              tab === t.key
                ? 'text-white'
                : 'text-gray-600 bg-white/4 hover:bg-white/6'
            }`}
            style={tab === t.key ? { background: '#D4621A' } : {}}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-gray-600" />
          </div>
        ) : tab === 'asignados' ? (
          <>
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-3">
              Trámites asignados — {tramitesAsignados.length} activos
            </p>
            {tramitesAsignados.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 size={36} className="text-emerald-500/30 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-1">Sin trámites asignados</p>
                <p className="text-xs text-gray-700">
                  Cuando un Admin te asigne un trámite, aparecerá acá.
                </p>
              </div>
            ) : (
              tramitesAsignados.map(t => <TramiteCard key={t.id} t={t} />)
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-3">
              Trámites iniciados por vos — {misTramites.length} total
            </p>
            {misTramites.length === 0 ? (
              <div className="text-center py-16">
                <Car size={36} className="text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-1">Todavía no iniciaste ningún trámite</p>
                <button
                  onClick={() => setModalNuevo(true)}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                    font-semibold text-white mx-auto"
                  style={{ background: '#D4621A' }}
                >
                  <Plus size={14} /> Crear primer trámite
                </button>
              </div>
            ) : (
              misTramites.map(t => <TramiteCard key={t.id} t={t} />)
            )}
          </>
        )}
      </div>

      {/* Modal nuevo trámite */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="Nuevo trámite"
        subtitle="Completá los datos del trámite a gestionar"
        size="lg"
      >
        <TramiteForm
          gestoriaId={gestoriaId}
          onSubmit={handleCrear}
          onCancel={() => setModalNuevo(false)}
          submitLabel="Crear trámite"
        />
      </Modal>
    </div>
  )
}