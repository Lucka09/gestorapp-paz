// src/features/multas/TorreControlMultasPage.tsx
// ─── TORRE DE CONTROL — SECCIÓN MULTAS ───────────────────────────────────────
// Tablero por estado de TODAS las multas, montado sobre estadoMultaEfectivo
// (la MISMA fuente que Revisión de Multas) → los estados quedan sincronizados
// en todo el módulo. Las reportadas caen en la columna "A Controlar"; las
// archivadas (entregado/cancelado) se muestran con un toggle.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, Search, ChevronRight, ShieldAlert, Archive } from 'lucide-react'
import { useMultaWorkflows } from '@/hooks/useMultaWorkflow'
import { useTramites } from '@/hooks/useTramites'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  estadoMultaEfectivo,
  ESTADO_MULTA_OP_ORDER, ESTADO_MULTA_OP_LABELS, ESTADO_MULTA_OP_COLORS,
} from '@/types/multa_types'
import type { EstadoMulta, MultaWorkflow } from '@/types/multa_types'
import type { Tramite } from '@/types'

const NARANJA = '#D4621A'
const fmt = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0)
const norm = (s: string | undefined | null) => (s ?? '').toLowerCase()
const esArchivada = (e: EstadoMulta) => e === 'entregado' || e === 'cancelado'

interface Fila {
  w:         MultaWorkflow
  est:       EstadoMulta
  reportada: boolean
  t?:        Tramite
}

// Columna especial fuera del enum operativo.
const COL_A_CONTROLAR = 'a_controlar'
const COLOR_A_CONTROLAR = 'bg-amber-100 text-amber-800 border border-amber-200'

function Tarjeta({ f, onClick }: { f: Fila; onClick: () => void }) {
  const { w, t } = f
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-[#D4621A] transition-all"
    >
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
        <span className="inline-block mt-2 font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
          {t.numero}
        </span>
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
      <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
        {filas.length === 0 ? (
          <p className="text-[11px] text-gray-300 text-center py-6">—</p>
        ) : (
          filas.map(f => <Tarjeta key={f.w.id} f={f} onClick={() => onCard(f)} />)
        )}
      </div>
    </div>
  )
}

export default function TorreControlMultasPage() {
  usePageTitle('Torre de Control · Multas')
  const navigate = useNavigate()
  const { multas, loading } = useMultaWorkflows()
  const { tramites } = useTramites()

  const [busqueda,      setBusqueda]      = useState('')
  const [verArchivadas, setVerArchivadas] = useState(false)

  const tramiteMap = useMemo(() => {
    const m = new Map<string, Tramite>()
    for (const t of tramites) if (t.tipo === 'descargo_multa') m.set(t.id, t)
    return m
  }, [tramites])

  const filas = useMemo<Fila[]>(() => {
    const q = busqueda.trim().toLowerCase()
    return multas
      .map(w => ({ w, est: estadoMultaEfectivo(w), reportada: !!w.reporteControl, t: tramiteMap.get(w.id) }))
      .filter(f => {
        if (!q) return true
        const p = f.w.paso1
        return [p?.patente, p?.dni, p?.nombreCompleto, f.t?.numero].some(v => norm(v).includes(q))
      })
  }, [multas, tramiteMap, busqueda])

  // Agrupar: archivadas → su columna; reportadas (no archivadas) → A Controlar;
  // el resto → su estado operativo.
  const { buckets, aControlar } = useMemo(() => {
    const b = new Map<EstadoMulta, Fila[]>()
    ESTADO_MULTA_OP_ORDER.forEach(e => b.set(e, []))
    const ctrl: Fila[] = []
    for (const f of filas) {
      if (esArchivada(f.est))      b.get(f.est)!.push(f)
      else if (f.reportada)        ctrl.push(f)
      else                         b.get(f.est)!.push(f)
    }
    return { buckets: b, aControlar: ctrl }
  }, [filas])

  const kpis = useMemo(() => {
    let enGestion = 0, archivadas = 0
    for (const f of filas) {
      if (esArchivada(f.est)) archivadas++
      else if (!f.reportada)  enGestion++
    }
    return { total: filas.length, enGestion, aControlar: aControlar.length, archivadas }
  }, [filas, aControlar])

  const irA = (f: Fila) => navigate(`/admin/tramites/${f.w.id}`)

  const estadosActivos = ESTADO_MULTA_OP_ORDER.filter(e => !esArchivada(e))
  const estadosArchivo = ESTADO_MULTA_OP_ORDER.filter(esArchivada)

  const KPIS: [string, number, string][] = [
    ['Total',       kpis.total,      'text-gray-800'],
    ['En gestión',  kpis.enGestion,  'text-[#D4621A]'],
    ['A Controlar', kpis.aControlar, 'text-amber-600'],
    ['Archivadas',  kpis.archivadas, 'text-gray-400'],
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

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {KPIS.map(([label, val, color]) => (
          <div key={label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
            <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{val}</p>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por patente, nombre, DNI o N°…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] placeholder-gray-400"
          />
        </div>
        <button
          onClick={() => setVerArchivadas(v => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
            verArchivadas ? 'border-[#D4621A] text-[#D4621A] bg-orange-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <Archive size={15} /> {verArchivadas ? 'Ocultar archivadas' : 'Ver archivadas'}
        </button>
      </div>

      {/* Tablero */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Cargando multas…</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {estadosActivos.map(e => (
            <Columna
              key={e}
              label={ESTADO_MULTA_OP_LABELS[e]}
              color={ESTADO_MULTA_OP_COLORS[e]}
              filas={buckets.get(e) ?? []}
              onCard={irA}
            />
          ))}
          <Columna
            key={COL_A_CONTROLAR}
            label="A Controlar"
            color={COLOR_A_CONTROLAR}
            filas={aControlar}
            onCard={irA}
          />
          {verArchivadas && estadosArchivo.map(e => (
            <Columna
              key={e}
              label={ESTADO_MULTA_OP_LABELS[e]}
              color={ESTADO_MULTA_OP_COLORS[e]}
              filas={buckets.get(e) ?? []}
              onCard={irA}
            />
          ))}
        </div>
      )}
    </div>
  )
}