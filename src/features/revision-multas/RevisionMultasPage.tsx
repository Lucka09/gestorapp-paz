// src/features/revision-multas/RevisionMultasPage.tsx
// Lista operativa de multas — módulo propio, fuera de Trámites.
// Tabla estilo Trámites. Dato central resaltado: FECHA DE ENTREGA.
// Pestañas: En gestión · Vencidas (+10d) · Archivadas.
// JAH-NISSI Digital Studio · GestorApp
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, AlertTriangle, FileWarning, X, ChevronRight, Download } from 'lucide-react'
import { useMultaWorkflows } from '@/hooks/useMultaWorkflow'
import { useTramites } from '@/hooks/useTramites'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  estadoMultaEfectivo,
  ESTADO_MULTA_OP_LABELS,
  ESTADO_MULTA_OP_COLORS,
  ESTADO_MULTA_OP_ORDER,
  ESTADOS_MULTA_SIN_ALERTA_FECHA,
  type EstadoMulta,
  type MultaWorkflow,
} from '@/types/multa_types'
import type { Tramite } from '@/types'
import { usePermisos } from '@/hooks/usePermisos'
import { exportarMultas } from '@/utils/exportarMultas'   // ajustá la ruta a la real de exportar.ts

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const DIAS_VENCIDA = 10   // más de 10 días pasada la fecha de entrega → "Vencida"

function fechaEntrega(m: MultaWorkflow): string | undefined {
  return m.fechaTramiteActual ?? m.paso1?.fechaTramite ?? undefined
}

function diasHasta(fechaStr?: string): number | null {
  if (!fechaStr) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const f = new Date(fechaStr + 'T00:00:00-03:00'); f.setHours(0, 0, 0, 0)
  return Math.round((f.getTime() - hoy.getTime()) / 86_400_000)
}

function estiloFecha(dias: number | null, sinAlerta: boolean) {
  if (dias === null) return { bg: '#F3F4F6', fg: '#9CA3AF', chip: 'Sin fecha', chipCls: 'text-gray-400' }
  if (sinAlerta)     return { bg: '#F1F5F9', fg: '#64748B', chip: 'A confirmar', chipCls: 'text-slate-500' }
  if (dias < 0)      return { bg: '#FEE2E2', fg: '#B91C1C', chip: `Vencida ${Math.abs(dias)}d`, chipCls: 'text-red-700 font-bold' }
  if (dias === 0)    return { bg: '#FEE2E2', fg: '#B91C1C', chip: 'HOY', chipCls: 'text-red-700 font-bold' }
  if (dias <= 2)     return { bg: '#FFEDD5', fg: '#C2410C', chip: `En ${dias}d`, chipCls: 'text-orange-700 font-bold' }
  if (dias <= 5)     return { bg: '#FEF9C3', fg: '#92400E', chip: `En ${dias}d`, chipCls: 'text-yellow-700 font-semibold' }
  return { bg: '#ECFDF5', fg: '#047857', chip: `En ${dias}d`, chipCls: 'text-emerald-700' }
}

function fmtMoney(n?: number): string {
  return n && n > 0 ? `$ ${n.toLocaleString('es-AR')}` : '—'
}

function fmtFecha(ts?: { toDate?: () => Date }): string {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

// ─── TILE DE FECHA DE ENTREGA (columna resaltada) ─────────────────────────────

function TileEntrega({ fechaStr, dias, sinAlerta }: { fechaStr?: string; dias: number | null; sinAlerta: boolean }) {
  const s = estiloFecha(dias, sinAlerta)
  const d = fechaStr ? new Date(fechaStr + 'T00:00:00-03:00') : null
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-12 rounded-lg flex flex-col items-center justify-center py-1 shrink-0" style={{ background: s.bg }}>
        {d ? (
          <>
            <span className="text-lg font-extrabold leading-none tabular-nums" style={{ color: s.fg }}>
              {String(d.getDate()).padStart(2, '0')}
            </span>
            <span className="text-[9px] font-bold tracking-wider" style={{ color: s.fg }}>{MESES[d.getMonth()]}</span>
          </>
        ) : (
          <span className="text-[9px] font-bold" style={{ color: s.fg }}>S/F</span>
        )}
      </div>
      <span className={`text-[10px] ${s.chipCls}`}>{s.chip}</span>
    </div>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

type Tab = 'activas' | 'vencidas' | 'archivadas'

export default function RevisionMultasPage() {
  usePageTitle('Revisión de Multas')
  const navigate = useNavigate()
  const { multas, loading } = useMultaWorkflows()
  const { puede } = usePermisos()
const [exportando, setExportando] = useState(false)
const handleExportar = async () => {
  setExportando(true)
  try { await exportarMultas(rows.map(r => r.w), tramites) }
  finally { setExportando(false) }
}
  const { tramites } = useTramites()

  const [search, setSearch] = useState('')
  const [tab, setTab]       = useState<Tab>('activas')
  const [refine, setRefine] = useState<EstadoMulta | 'todas'>('todas')

  const esArchivada = (e: EstadoMulta) => e === 'entregado' || e === 'cancelado'

  // Trámites de multa indexados por id → aportan N°, honorarios y nota interna
  const tramiteMap = useMemo(() => {
    const map = new Map<string, Tramite>()
    for (const t of tramites) if (t.tipo === 'descargo_multa') map.set(t.id, t)
    return map
  }, [tramites])

  // Clasificación de cada multa
  const enriquecidas = useMemo(() => multas.map(w => {
    const est       = estadoMultaEfectivo(w)
    const t         = tramiteMap.get(w.id)
    const fecha     = fechaEntrega(w)
    const dias      = diasHasta(fecha)
    const sinAlerta = ESTADOS_MULTA_SIN_ALERTA_FECHA.includes(est)
    const vencida   = !esArchivada(est) && !sinAlerta && dias !== null && dias < -DIAS_VENCIDA
    const grupo: Tab = esArchivada(est) ? 'archivadas' : vencida ? 'vencidas' : 'activas'
    return { w, t, est, fecha, dias, sinAlerta, grupo }
  }), [multas, tramiteMap])

  const counts = useMemo(() => {
    const c = { activas: 0, vencidas: 0, archivadas: 0 }
    for (const r of enriquecidas) c[r.grupo]++
    return c
  }, [enriquecidas])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enriquecidas
      .filter(r => r.grupo === tab)
      .filter(r => refine === 'todas' ? true : r.est === refine)
      .filter(r => {
        if (!q) return true
        const p = r.w.paso1
        return [p?.patente, p?.nombreCompleto, p?.dni, r.t?.numero]
          .some(v => v?.toLowerCase().includes(q))
      })
      .sort((a, b) => {
        if (!a.fecha && !b.fecha) return 0
        if (!a.fecha) return 1
        if (!b.fecha) return -1
        return a.fecha.localeCompare(b.fecha)
      })
  }, [enriquecidas, search, tab, refine])

  const TABS: [Tab, string, number][] = [
    ['activas',    'En gestión',    counts.activas],
    ['vencidas',   'Vencidas +10d', counts.vencidas],
    ['archivadas', 'Archivadas',    counts.archivadas],
  ]

  return (
    <div>
      {/* Encabezado */}
      {puede('exportarDatos') && (
  <button onClick={handleExportar} disabled={exportando}
    className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-[var(--gp-orange)] text-white disabled:opacity-50">
    <Download size={15} /> {exportando ? 'Exportando…' : 'Exportar'}
  </button>
)}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--gp-orange)' }}>
          <FileWarning size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Revisión de Multas
          </h1>
          <p className="text-xs text-gray-400">
            {counts.activas} en gestión · {counts.vencidas} vencidas · {counts.archivadas} archivadas
          </p>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-xl w-full sm:w-fit">
        {TABS.map(([val, label, count]) => (
          <button key={val}
            onClick={() => { setTab(val); setRefine('todas') }}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            <span className={`ml-1.5 text-xs ${
              tab === val ? (val === 'vencidas' ? 'text-red-500' : 'text-[var(--gp-orange)]') : 'text-gray-400'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N°, patente, nombre o DNI…"
            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[var(--gp-orange)] placeholder-gray-400" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          )}
        </div>
        <select value={refine} onChange={e => setRefine(e.target.value as typeof refine)}
          className="py-2.5 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[var(--gp-orange)] bg-white text-gray-700">
          <option value="todas">Todos los estados</option>
          {ESTADO_MULTA_OP_ORDER
            .filter(e => tab === 'archivadas' ? esArchivada(e) : !esArchivada(e))
            .map(e => <option key={e} value={e}>{ESTADO_MULTA_OP_LABELS[e]}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Cargando multas…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <AlertTriangle size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">
            {search || refine !== 'todas'
              ? 'Sin resultados con esos filtros.'
              : tab === 'archivadas' ? 'No hay multas archivadas.'
              : tab === 'vencidas'   ? 'No hay multas vencidas (+10d).'
              : 'No hay multas en gestión.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  {['N°', 'Cliente', 'Patente / Nota', 'Entrega', 'Estado', 'Honorarios', 'Creado'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ w, t, est, fecha, dias, sinAlerta }) => (
                  <tr key={w.id}
                    onClick={() => navigate(`/admin/tramites/${w.id}`)}
                    className="border-b border-gray-50 last:border-b-0 cursor-pointer hover:bg-gray-50/70 transition-colors">
                    {/* N° */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                        {t?.numero ?? w.id.slice(-6).toUpperCase()}
                      </span>
                    </td>
                    {/* Cliente */}
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">{w.paso1?.nombreCompleto || 'Sin nombre'}</p>
                      {w.paso1?.dni && <p className="text-[11px] text-gray-400">DNI {w.paso1.dni}</p>}
                    </td>
                    {/* Patente / Nota */}
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-bold text-gray-800 font-mono uppercase">{w.paso1?.patente || '—'}</p>
                      {(t?.observacionesInternas || w.paso1?.observacion) && (
                        <p className="text-[11px] text-gray-400 truncate max-w-[220px]" title={t?.observacionesInternas || w.paso1?.observacion}>
                          {t?.observacionesInternas || w.paso1?.observacion}
                        </p>
                      )}
                    </td>
                    {/* Entrega (resaltado) */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <TileEntrega fechaStr={fecha} dias={dias} sinAlerta={sinAlerta} />
                    </td>
                    {/* Estado */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_MULTA_OP_COLORS[est]}`}>
                        {ESTADO_MULTA_OP_LABELS[est]}
                      </span>
                    </td>
                    {/* Honorarios */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm font-semibold text-gray-700">
                      {fmtMoney(t?.honorarios ?? w.paso2?.montoTotal)}
                    </td>
                    {/* Creado */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        {fmtFecha(t?.creadoEn ?? w.creadoEn)}
                        <ChevronRight size={13} className="text-gray-300" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}