// src/features/reportes/MetricasSecretariosPanel.tsx
// ─── SCORECARD DEL CEO: MÉTRICAS POR SECRETARIO ──────────────────────────────
// Tabla por asesor comercial con ingresos, cierres, conversión y consultas
// procesadas, en un rango de fechas. Pensado para que Matías vea quién cierra
// más. Solo visible para roles con acceso a finanzas (CEO / propietario).
//
// Montaje: renderizá <MetricasSecretariosPanel /> donde mire el CEO
// (AnalyticsPage / ReportesPage / Dashboard). Es autocontenido.

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, RefreshCw, Trophy } from 'lucide-react'
import { useEquipo }   from '@/hooks/useEquipo'
import { useAuth }     from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { getMetricasPorSecretario, type MetricaSecretario } from '@/lib/firestore/metricasEquipo'

type RangoKey = 'este_mes' | 'mes_pasado' | 'ult_30' | 'ult_90'

const RANGOS: { key: RangoKey; label: string }[] = [
  { key: 'este_mes',   label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: 'ult_30',     label: 'Últimos 30 días' },
  { key: 'ult_90',     label: 'Últimos 90 días' },
]

function rangoFechas(key: RangoKey): { desde: Date; hasta: Date } {
  const hoy = new Date()
  const finDia = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
  const iniDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  switch (key) {
    case 'este_mes':
      return { desde: iniDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: finDia(hoy) }
    case 'mes_pasado': {
      const ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
      return { desde: iniDia(ini), hasta: finDia(fin) }
    }
    case 'ult_30':
      return { desde: iniDia(new Date(Date.now() - 30 * 86400000)), hasta: finDia(hoy) }
    case 'ult_90':
      return { desde: iniDia(new Date(Date.now() - 90 * 86400000)), hasta: finDia(hoy) }
  }
}

const fmtARS = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

// Promedio de tiempo de respuesta legible: "45s" / "12m" / "2h 5m" / "—"
function fmtDuracion(segsTotal: number, count: number): string {
  if (count <= 0) return '—'
  const s = Math.round(segsTotal / count)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export default function MetricasSecretariosPanel() {
  const { user }          = useAuth()
  const { verFinanzas }   = usePermisos()
  const { equipo, activos } = useEquipo()

  const [rango,   setRango]   = useState<RangoKey>('este_mes')
  const [data,    setData]    = useState<MetricaSecretario[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const gestoriaId = String((user as any)?.gestoriaId ?? '')

  useEffect(() => {
    if (!verFinanzas || !gestoriaId) return
    let vivo = true
    setLoading(true); setError(null)
    const { desde, hasta } = rangoFechas(rango)
    getMetricasPorSecretario(gestoriaId, desde, hasta)
      .then(res => { if (vivo) setData(res) })
      .catch(e => { if (vivo) setError(e?.message ?? 'No se pudieron cargar las métricas.') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [rango, gestoriaId, verFinanzas])

  // Nombre por uid (incluye inactivos por si cerraron en el período y ya no están)
  const nombrePorUid = useMemo(() => {
    const m = new Map<string, string>()
    equipo.forEach(x => m.set(x.uid, `${x.nombre} ${x.apellido ?? ''}`.trim()))
    return m
  }, [equipo])

  // Filas: asesores activos + cualquier uid con datos en el período.
  const filas = useMemo(() => {
    const porUid = new Map(data.map(d => [d.uid, d]))
    const uids = new Set<string>([
      ...activos.filter(m => m.rol === 'asesor_comercial').map(m => m.uid),
      ...data.map(d => d.uid),
    ])
    return Array.from(uids)
      .map(uid => porUid.get(uid) ?? {
        uid, leadsAsignados: 0, leadsConvertidos: 0, consultasProcesadas: 0,
        cierresGanados: 0, cierresPerdidos: 0, ingresos: 0,
        respuestasMedidas: 0, tiempoRespuestaSegs: 0,
      })
      .sort((a, b) => b.ingresos - a.ingresos)
  }, [data, activos])

  const totalIngresos = useMemo(() => filas.reduce((a, f) => a + f.ingresos, 0), [filas])
  const topUid = filas.length && filas[0].ingresos > 0 ? filas[0].uid : null

  if (!verFinanzas) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#D4621A]" />
          <h3 className="text-base font-bold text-gray-900">Métricas por secretario</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rango}
            onChange={e => setRango(e.target.value as RangoKey)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-[#D4621A]"
          >
            {RANGOS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          {loading && <RefreshCw size={16} className="animate-spin text-gray-400" />}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Total del período */}
      <p className="mt-2 text-sm text-gray-500">
        Ingresos del período: <span className="font-bold text-gray-900">{fmtARS(totalIngresos)}</span>
      </p>

      {/* Tabla */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Secretario</th>
              <th className="py-2 px-3 text-right">Ingresos</th>
              <th className="py-2 px-3 text-right">Cierres</th>
              <th className="py-2 px-3 text-right">% cierre</th>
              <th className="py-2 px-3 text-right">Leads (conv/asig)</th>
              <th className="py-2 px-3 text-right">% conv.</th>
              <th className="py-2 px-3 text-right">Consultas</th>
              <th className="py-2 pl-3 text-right">1ª resp.</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && !loading && (
              <tr><td colSpan={8} className="py-6 text-center text-gray-400">Sin datos en el período.</td></tr>
            )}
            {filas.map(f => {
              const cierresTot = f.cierresGanados + f.cierresPerdidos
              return (
                <tr key={f.uid} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-gray-800">
                    <span className="inline-flex items-center gap-1.5">
                      {topUid === f.uid && <Trophy size={14} className="text-amber-500" />}
                      {nombrePorUid.get(f.uid) ?? 'Secretario'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-gray-900">{fmtARS(f.ingresos)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-700">
                    {f.cierresGanados}<span className="text-gray-400"> / {f.cierresPerdidos} perd.</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-700">{pct(f.cierresGanados, cierresTot)}%</td>
                  <td className="py-2.5 px-3 text-right text-gray-700">
                    {f.leadsConvertidos}<span className="text-gray-400"> / {f.leadsAsignados}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-700">{pct(f.leadsConvertidos, f.leadsAsignados)}%</td>
                  <td className="py-2.5 px-3 text-right text-gray-700">{f.consultasProcesadas}</td>
                  <td className="py-2.5 pl-3 text-right text-gray-700">{fmtDuracion(f.tiempoRespuestaSegs, f.respuestasMedidas)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Ingresos = suma de cierres ganados en el período. El tiempo de 1ª respuesta se mide desde que se activó el registro de envíos
        (cuenta hacia adelante). % conv. = leads convertidos / asignados.
      </p>
    </div>
  )
}