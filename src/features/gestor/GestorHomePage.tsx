// src/features/gestor/GestorHomePage.tsx
// Portal del Gestor/Mandatario — tema claro, alineado al branding GestorApp
// v2 — JAH-NISSI Digital Studio
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo }  from 'react'
import { useNavigate }        from 'react-router-dom'
import {
  RefreshCw, CheckCircle2, Clock, AlertTriangle,
  Plus, FileText, ClipboardList, ChevronRight, Car,
} from 'lucide-react'
import { useAuth }         from '@/hooks/useAuth'
import { useTramites }     from '@/hooks/useTramites'
import { usePageTitle }    from '@/hooks/usePageTitle'
import { useGestoriaId }   from '@/context/GestoriaContext'
import { crearTramite }    from '@/lib/firestore/tramites'
import { formatRelativo }  from '@/utils'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import Modal               from '@/components/shared/Modal'
import TramiteForm         from '@/features/tramites/TramiteForm'
import NumeroBadge         from '@/components/shared/NumeroBadge'
import toast               from 'react-hot-toast'

// ─── TIPOS DE TRÁMITE DISPONIBLES PARA EL GESTOR ─────────────────────────────

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

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  en_proceso:  { label: 'En proceso',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  completado:  { label: 'Completado',  color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  cancelado:   { label: 'Cancelado',   color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  en_organismo:{ label: 'Organismo',   color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  listo_para_retirar: { label: 'Para retirar', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  entregado:   { label: 'Entregado',   color: '#15803D', bg: '#F0FDF4', border: '#86EFAC' },
  documentacion_requerida: { label: 'Docs. Req.', color: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
}

function EstadoBadgeGestor({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG['pendiente']
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.label}
    </span>
  )
}

// ─── CÁLCULO DE NIVEL DE ALERTA ───────────────────────────────────────────────

function calcularAlerta(diasSinMov: number): 0 | 1 | 2 | 3 {
  if (diasSinMov > 5) return 1
  if (diasSinMov > 3) return 2
  if (diasSinMov > 1) return 3
  return 0
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

type Tab = 'asignados' | 'mis_tramites'

export default function GestorHomePage() {
  usePageTitle('Portal Gestor')
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const gestoriaId = useGestoriaId()
  const { tramites, loading } = useTramites()

  const [tab,        setTab]        = useState<Tab>('asignados')
  const [modalNuevo, setModalNuevo] = useState(false)

  // Trámites asignados al gestor (activos)
  const tramitesAsignados = useMemo(() =>
    tramites
      .filter(t =>
        (t.asignadoA === user?.uid || t.creadoPor === user?.uid) &&
        !['completado', 'cancelado'].includes(t.estado)
      )
      .sort((a, b) =>
        (b.actualizadoEn?.toDate?.()?.getTime() ?? 0) -
        (a.actualizadoEn?.toDate?.()?.getTime() ?? 0)
      ),
    [tramites, user?.uid]
  )

  // Trámites creados por el gestor
  const misTramites = useMemo(() =>
    tramites
      .filter(t => t.creadoPor === user?.uid && t.estado !== 'cancelado')
      .sort((a, b) =>
        (b.creadoEn?.toDate?.()?.getTime() ?? 0) -
        (a.creadoEn?.toDate?.()?.getTime() ?? 0)
      ),
    [tramites, user?.uid]
  )

  const stats = useMemo(() => ({
    asignados:   tramitesAsignados.length,
    propios:     misTramites.length,
    completados: tramites.filter(t =>
      (t.asignadoA === user?.uid || t.creadoPor === user?.uid) &&
      t.estado === 'entregado'
    ).length,
  }), [tramitesAsignados, misTramites, tramites, user?.uid])

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

  // Navegar al workflow correcto según tipo
  const irAlTramite = (tramite: any) => {
    if (tramite.tipo === 'inscripcion_inicial') {
      navigate(`/admin/gestor/tramite/${tramite.id}`)
    } else {
      navigate(`/admin/tramites/${tramite.id}`)
    }
  }

  // ─── CARD DE TRÁMITE ───────────────────────────────────────────────────────

  const TramiteCard = ({ t }: { t: any }) => {
    const ahora      = new Date()
    const ultima     = t.actualizadoEn?.toDate?.() ?? t.creadoEn?.toDate?.() ?? ahora
    const diasSinMov = (ahora.getTime() - ultima.getTime()) / 86_400_000
    const nivel      = calcularAlerta(diasSinMov)

    const borderStyle: Record<number, string> = {
      0: 'border-gray-200',
      1: 'border-red-300',
      2: 'border-orange-300',
      3: 'border-yellow-300',
    }

    return (
      <div
        onClick={() => irAlTramite(t)}
        className={`rounded-2xl border bg-white p-4 mb-3 cursor-pointer shadow-sm
          transition-all hover:shadow-md active:scale-[0.99] ${borderStyle[nivel]}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <NumeroBadge numero={t.numero ?? t.id.slice(-8)} tipo={t.tipo} size="sm" />
              {nivel === 1 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                  🚨 URGENTE
                </span>
              )}
              {nivel === 2 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                  ⏱ DEMORADO
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-gray-900 truncate">
              {t.patente || 'Sin patente'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {TIPO_TRAMITE_LABELS[t.tipo as TipoTramite] ?? t.tipo}
            </p>
          </div>
          <ChevronRight size={14} className="text-gray-400 mt-1 shrink-0 ml-2" />
        </div>

        <div className="flex items-center justify-between">
          <EstadoBadgeGestor estado={t.estado} />
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock size={9} /> {formatRelativo(t.actualizadoEn)}
          </span>
        </div>
      </div>
    )
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
              Portal del Gestor
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {user?.nombre} {user?.apellido}
            </p>
          </div>
          <button
            onClick={() => setModalNuevo(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold
                       text-white transition-all active:scale-95 hover:opacity-90 shadow-sm"
            style={{ background: '#D4621A' }}
          >
            <Plus size={14} /> Nuevo trámite
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[
          { label: 'Asignados',   value: stats.asignados,   color: '#3B82F6' },
          { label: 'Propios',     value: stats.propios,     color: '#D4621A' },
          { label: 'Completados', value: stats.completados, color: '#22C55E' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
            <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 mb-4">
        {([
          { key: 'asignados',    label: 'Asignados a mí', icon: <ClipboardList size={12} /> },
          { key: 'mis_tramites', label: 'Mis iniciados',  icon: <FileText size={12} /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                        text-xs font-semibold transition-all border ${
              tab === t.key
                ? 'text-white border-transparent shadow-sm'
                : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
            }`}
            style={tab === t.key ? { background: '#D4621A', borderColor: '#D4621A' } : {}}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-gray-400" />
          </div>
        ) : tab === 'asignados' ? (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              Trámites asignados — {tramitesAsignados.length} activos
            </p>
            {tramitesAsignados.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3 opacity-50" />
                <p className="text-sm text-gray-500 mb-1">Sin trámites asignados</p>
                <p className="text-xs text-gray-400">
                  Cuando un Admin te asigne un trámite, aparecerá acá.
                </p>
              </div>
            ) : (
              tramitesAsignados.map(t => <TramiteCard key={t.id} t={t} />)
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              Trámites iniciados por vos — {misTramites.length} total
            </p>
            {misTramites.length === 0 ? (
              <div className="text-center py-16">
                <Car size={36} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">Todavía no iniciaste ningún trámite</p>
                <button
                  onClick={() => setModalNuevo(true)}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                             font-semibold text-white mx-auto shadow-sm hover:opacity-90 transition-all"
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