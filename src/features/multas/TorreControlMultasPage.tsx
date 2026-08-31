// src/features/multas/TorreControlMultasPage.tsx
// ─── TORRE DE CONTROL — SECCIÓN MULTAS ───────────────────────────────────────
// Réplica del formato de la Torre general, pero sobre multas y montada en
// estadoMultaEfectivo (la MISMA fuente que Revisión de Multas → estados
// sincronizados). Vistas: Dashboard · Monitor · Estados · Secretarios · Alertas.
// Motor de alertas POR ESTADO TRABADO (docs requerida, RENAPER, etc.).
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radar, Search, ChevronRight, ShieldAlert, Archive, Bell,
  LayoutDashboard, LayoutGrid, Users, Activity,
} from 'lucide-react'
import { useMultaWorkflows } from '@/hooks/useMultaWorkflow'
import { useTramites } from '@/hooks/useTramites'
import { useEquipo } from '@/hooks/useEquipo'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePermisos } from '@/hooks/usePermisos'
import {
  estadoMultaEfectivo,
  ESTADO_MULTA_OP_ORDER, ESTADO_MULTA_OP_LABELS, ESTADO_MULTA_OP_COLORS,
} from '@/types/multa_types'
import type { EstadoMulta, MultaWorkflow } from '@/types/multa_types'
import type { Tramite } from '@/types'

type Vista = 'dashboard' | 'monitor' | 'estados' | 'secretarios' | 'alertas'
type Nivel = 'critico' | 'rojo' | 'naranja' | 'amarillo' | 'ok'

const NARANJA = '#D4621A'
const fmt = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0)
const norm = (s: string | undefined | null) => (s ?? '').toLowerCase()
const esArchivada = (e: EstadoMulta) => e === 'entregado' || e === 'cancelado'
const diasDesde = (ts?: { toDate?: () => Date } | null) => {
  const d = ts?.toDate?.()
  return d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null
}

// Motor de alertas: severidad por estado "trabado".
const SEVERIDAD: Partial<Record<EstadoMulta, Exclude<Nivel, 'critico' | 'ok'>>> = {
  docs_requerida:     'rojo',      // bloqueada: falta documentación
  p_envio_renaper:    'naranja',   // pendiente de envío
  esperando_renaper:  'naranja',   // esperando organismo
  pendiente_revision: 'amarillo',  // esperando pre-revisión interna
  // esperando_fecha_cliente → sin alerta (depende del cliente, es deliberado)
}

const NIVEL: Record<Nivel, { label: string; dot: string; chip: string; peso: number }> = {
  critico:  { label: 'Reportada', dot: 'bg-red-600',     chip: 'bg-red-100 text-red-700',        peso: 4 },
  rojo:     { label: 'Bloqueada', dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700',        peso: 3 },
  naranja:  { label: 'Demorada',  dot: 'bg-orange-500',  chip: 'bg-orange-100 text-orange-700',  peso: 2 },
  amarillo: { label: 'En espera', dot: 'bg-yellow-400',  chip: 'bg-yellow-100 text-yellow-700',  peso: 1 },
  ok:       { label: 'OK',        dot: 'bg-emerald-400', chip: 'bg-emerald-100 text-emerald-700', peso: 0 },
}

interface Fila {
  w:         MultaWorkflow
  est:       EstadoMulta
  reportada: boolean
  archivada: boolean
  t?:        Tramite
  nivel:     Nivel
  dias:      number | null
}

function nivelDe(reportada: boolean, est: EstadoMulta): Nivel {
  if (reportada) return 'critico'
  if (esArchivada(est)) return 'ok'
  return SEVERIDAD[est] ?? 'ok'
}

function motivoDe(f: Fila): string {
  if (f.reportada) return `Reportada a control: ${f.w.reporteControl?.motivo ?? '—'}`
  switch (f.est) {
    case 'docs_requerida':     return 'Documentación requerida — trabada'
    case 'p_envio_renaper':    return 'Pendiente de envío a RENAPER'
    case 'esperando_renaper':  return 'Esperando respuesta de RENAPER'
    case 'pendiente_revision': return 'Esperando pre-revisión'
    default:                   return ESTADO_MULTA_OP_LABELS[f.est]
  }
}

// ─── Tarjeta / columna del tablero (vista Estados) ────────────────────────────
function Tarjeta({ f, onClick }: { f: Fila; onClick: () => void }) {
  const { w, t } = f
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-[#D4621A] transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800 font-mono uppercase truncate">{w.paso1?.patente || '—'}</p>
          <p className="text-xs text-gray-500 truncate">{w.paso1?.nombreCompleto || 'Sin nombre'}</p>
        </div>
        <ChevronRight size={14} className="text-gray-300 shrink-0 mt-0.5" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">DNI {w.paso1?.dni || '—'}</span>
        <span className="text-xs font-bold text-emerald-700">{fmt(t?.honorarios ?? w.paso2?.montoTotal)}</span>
      </div>
      {f.reportada && w.reporteControl && (
        <p className="mt-2 text-[11px] text-amber-700 font-medium flex items-start gap-1" title={w.reporteControl.motivo}>
          <ShieldAlert size={12} className="shrink-0 mt-0.5" />
          <span className="truncate">{w.reporteControl.motivo}</span>
        </p>
      )}
      {t?.numero && (
        <span className="inline-block mt-2 font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">{t.numero}</span>
      )}
    </button>
  )
}

function Columna({ label, color, filas, onCard }: {
  label: string; color: string; filas: Fila[]; onCard: (f: Fila) => void
}) {
  return (
    <div className="shrink-0 w-64 flex flex-col bg-gray-50/70 rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${color}`}>{label}</span>
        <span className="text-xs font-bold text-gray-400 tabular-nums">{filas.length}</span>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-360px)]">
        {filas.length === 0
          ? <p className="text-[11px] text-gray-300 text-center py-6">—</p>
          : filas.map(f => <Tarjeta key={f.w.id} f={f} onClick={() => onCard(f)} />)}
      </div>
    </div>
  )
}

// ─── Fila compacta (Monitor / Alertas) ────────────────────────────────────────
function FilaCompacta({ f, onClick, mostrarMotivo }: { f: Fila; onClick: () => void; mostrarMotivo?: boolean }) {
  const n = NIVEL[f.nivel]
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-[#D4621A] transition-colors text-left">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${n.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 truncate">
          <span className="font-mono uppercase">{f.w.paso1?.patente || '—'}</span>
          <span className="text-gray-400 font-normal"> · {f.w.paso1?.nombreCompleto || 'Sin nombre'}</span>
        </p>
        <p className="text-[11px] text-gray-400 truncate">
          {mostrarMotivo ? motivoDe(f) : ESTADO_MULTA_OP_LABELS[f.est]}
          {f.dias != null && ` · ${f.dias}d sin mov.`}
        </p>
      </div>
      <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg ${n.chip}`}>{n.label}</span>
      <ChevronRight size={14} className="text-gray-300 shrink-0" />
    </button>
  )
}

export default function TorreControlMultasPage() {
  usePageTitle('Torre de Control · Multas')
  const navigate = useNavigate()
  const { multas, loading } = useMultaWorkflows()
  const { tramites } = useTramites()
  const { equipo } = useEquipo()
  const { rol } = usePermisos()
  const esControl = ['propietario', 'admin_gral', 'admin'].includes(rol)

  const [vista,         setVista]         = useState<Vista>('dashboard')
  const [busqueda,      setBusqueda]      = useState('')
  const [verArchivadas, setVerArchivadas] = useState(false)

  const tramiteMap = useMemo(() => {
    const m = new Map<string, Tramite>()
    for (const t of tramites) if (t.tipo === 'descargo_multa') m.set(t.id, t)
    return m
  }, [tramites])

  const secretarios = useMemo(
    () => equipo.filter(u => u.rol === 'asesor_comercial' && u.activo),
    [equipo],
  )

  const filas = useMemo<Fila[]>(() => {
    const q = busqueda.trim().toLowerCase()
    return multas.map(w => {
      const est = estadoMultaEfectivo(w)
      const reportada = !!w.reporteControl
      const t = tramiteMap.get(w.id)
      return {
        w, est, reportada, archivada: esArchivada(est), t,
        nivel: nivelDe(reportada, est),
        dias: diasDesde(t?.actualizadoEn ?? w.creadoEn),
      }
    }).filter(f => {
      if (!q) return true
      const p = f.w.paso1
      return [p?.patente, p?.dni, p?.nombreCompleto, f.t?.numero].some(v => norm(v).includes(q))
    })
  }, [multas, tramiteMap, busqueda])

  const activas = useMemo(() => filas.filter(f => !f.archivada), [filas])

  const alertas = useMemo(
    () => activas.filter(f => f.nivel !== 'ok').sort((a, b) => NIVEL[b.nivel].peso - NIVEL[a.nivel].peso),
    [activas],
  )

  const kpis = useMemo(() => ({
    enGestion:  activas.filter(f => !f.reportada).length,
    criticas:   filas.filter(f => f.reportada).length,
    bloqueadas: activas.filter(f => f.nivel === 'rojo').length,
    demoradas:  activas.filter(f => f.nivel === 'naranja' || f.nivel === 'amarillo').length,
    archivadas: filas.filter(f => f.archivada).length,
  }), [filas, activas])

  // Tablero por estado (vista Estados).
  const { buckets, aControlar } = useMemo(() => {
    const b = new Map<EstadoMulta, Fila[]>()
    ESTADO_MULTA_OP_ORDER.forEach(e => b.set(e, []))
    const ctrl: Fila[] = []
    for (const f of filas) {
      if (f.archivada)      b.get(f.est)!.push(f)
      else if (f.reportada) ctrl.push(f)
      else                  b.get(f.est)!.push(f)
    }
    return { buckets: b, aControlar: ctrl }
  }, [filas])

  // Stats por secretario: cargó (creadoPor) + asignado (asignadoA).
  const statsSecretarios = useMemo(() => {
    return secretarios.map(u => {
      const cargadas  = activas.filter(f => f.t?.creadoPor === u.uid)
      const asignadas = activas.filter(f => f.t?.asignadoA === u.uid)
      const total     = activas.filter(f => f.t?.creadoPor === u.uid || f.t?.asignadoA === u.uid)
      const trabadas  = total.filter(f => f.nivel === 'critico' || f.nivel === 'rojo').length
      return {
        uid: u.uid,
        nombre: `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email || '—',
        cargadas: cargadas.length,
        asignadas: asignadas.length,
        total: total.length,
        trabadas,
      }
    }).sort((a, b) => b.total - a.total)
  }, [secretarios, activas])

  const irA = (f: Fila) => navigate(`/admin/tramites/${f.w.id}`)

  const estadosActivos = ESTADO_MULTA_OP_ORDER.filter(e => !esArchivada(e))
  const estadosArchivo = ESTADO_MULTA_OP_ORDER.filter(esArchivada)

  const TABS: [Vista, ReactNode, string][] = [
    ['dashboard',   <LayoutDashboard size={13} />, 'Dashboard'],
    ['monitor',     <Activity size={13} />,        'Monitor'],
    ['estados',     <LayoutGrid size={13} />,      'Estados'],
    ...(esControl ? [['secretarios', <Users size={13} />, 'Secretarios'] as [Vista, ReactNode, string]] : []),
    ['alertas',     <Bell size={13} />,            `Alertas${alertas.length > 0 ? ` (${alertas.length})` : ''}`],
  ]

  const KPIS: [string, number, string][] = [
    ['En gestión', kpis.enGestion,  'text-[#D4621A]'],
    ['Reportadas', kpis.criticas,   'text-red-600'],
    ['Bloqueadas', kpis.bloqueadas, 'text-red-500'],
    ['Demoradas',  kpis.demoradas,  'text-orange-500'],
    ['Archivadas', kpis.archivadas, 'text-gray-400'],
  ]

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}>
          <Radar size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Torre de Control · Multas
          </h1>
          <p className="text-xs text-gray-400">Estado unificado de todas las multas en una vista</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(([id, icon, label]) => (
          <button key={id} onClick={() => setVista(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              vista === id ? 'bg-white text-[#D4621A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Búsqueda (todas las vistas salvo secretarios) */}
      {vista !== 'secretarios' && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por patente, nombre, DNI o N°…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] placeholder-gray-400" />
          </div>
          {vista === 'estados' && (
            <button onClick={() => setVerArchivadas(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                verArchivadas ? 'border-[#D4621A] text-[#D4621A] bg-orange-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              <Archive size={15} /> {verArchivadas ? 'Ocultar archivadas' : 'Ver archivadas'}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Cargando multas…</div>
      ) : (
        <>
          {/* ── DASHBOARD ── */}
          {vista === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {KPIS.map(([label, val, color]) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                    <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{val}</p>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700">⚠️ Alertas activas ({alertas.length})</p>
                  {alertas.length > 6 && (
                    <button onClick={() => setVista('alertas')} className="text-[11px] text-gray-400 hover:text-gray-600">Ver todas →</button>
                  )}
                </div>
                {alertas.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Sin multas trabadas ni reportadas. 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {alertas.slice(0, 6).map(f => <FilaCompacta key={f.w.id} f={f} onClick={() => irA(f)} mostrarMotivo />)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MONITOR ── */}
          {vista === 'monitor' && (
            <div className="space-y-2">
              {activas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No hay multas en gestión.</p>
              ) : (
                [...activas]
                  .sort((a, b) => NIVEL[b.nivel].peso - NIVEL[a.nivel].peso || (b.dias ?? 0) - (a.dias ?? 0))
                  .map(f => <FilaCompacta key={f.w.id} f={f} onClick={() => irA(f)} mostrarMotivo />)
              )}
            </div>
          )}

          {/* ── ESTADOS (tablero) ── */}
          {vista === 'estados' && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {estadosActivos.map(e => (
                <Columna key={e} label={ESTADO_MULTA_OP_LABELS[e]} color={ESTADO_MULTA_OP_COLORS[e]} filas={buckets.get(e) ?? []} onCard={irA} />
              ))}
              <Columna label="A Controlar" color="bg-amber-100 text-amber-800 border border-amber-200" filas={aControlar} onCard={irA} />
              {verArchivadas && estadosArchivo.map(e => (
                <Columna key={e} label={ESTADO_MULTA_OP_LABELS[e]} color={ESTADO_MULTA_OP_COLORS[e]} filas={buckets.get(e) ?? []} onCard={irA} />
              ))}
            </div>
          )}

          {/* ── SECRETARIOS (solo roles de control) ── */}
          {vista === 'secretarios' && esControl && (
            <div className="space-y-2">
              {statsSecretarios.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No hay secretarios comerciales activos.</p>
              ) : (
                statsSecretarios.map(s => (
                  <div key={s.uid} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {s.nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{s.nombre}</p>
                      <p className="text-[11px] text-gray-400">Cargó {s.cargadas} · Asignadas {s.asignadas}</p>
                    </div>
                    <div className="text-center shrink-0">
                      <p className="text-lg font-extrabold text-gray-800 tabular-nums">{s.total}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Total</p>
                    </div>
                    <div className="text-center shrink-0 w-16">
                      <p className={`text-lg font-extrabold tabular-nums ${s.trabadas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{s.trabadas}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Trabadas</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── ALERTAS ── */}
          {vista === 'alertas' && (
            <div className="space-y-2">
              {alertas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">Sin multas trabadas ni reportadas. 🎉</p>
              ) : (
                alertas.map(f => <FilaCompacta key={f.w.id} f={f} onClick={() => irA(f)} mostrarMotivo />)
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}