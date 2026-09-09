// src/features/dashboard/ResumenSecretariosDashboard.tsx
// ─── PANEL DE MANDO: RESUMEN POR SECRETARIO ──────────────────────────────────
// Desglose del trabajo y del dinero que ingresa cada secretario comercial, con
// ingresos de ESTA SEMANA y del MES en curso, más leads / consultas / cierres
// del mes. Solo visible para roles con acceso a finanzas (CEO / propietario).
//
// Montaje: <ResumenSecretariosDashboard /> dentro del DashboardPage.

import { useEffect, useMemo, useState } from 'react'
import { Users, RefreshCw, Trophy } from 'lucide-react'
import { useEquipo }   from '@/hooks/useEquipo'
import { useAuth }     from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { getResumenSecretarios, type ResumenSecretario } from '@/lib/firestore/metricasEquipo'

const fmtARS = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const mesActualLabel = () =>
  new Date().toLocaleDateString('es-AR', { month: 'long' })

export default function ResumenSecretariosDashboard() {
  const { user }            = useAuth()
  const { verFinanzas }     = usePermisos()
  const { equipo, activos } = useEquipo()

  const [data, setData]       = useState<ResumenSecretario[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const gestoriaId = String((user as any)?.gestoriaId ?? '')

  useEffect(() => {
    if (!verFinanzas || !gestoriaId) return
    let vivo = true
    setLoading(true); setError(null)
    getResumenSecretarios(gestoriaId)
      .then(res => { if (vivo) setData(res) })
      .catch(e => { if (vivo) setError(e?.message ?? 'No se pudo cargar el resumen.') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [gestoriaId, verFinanzas])

  const nombrePorUid = useMemo(() => {
    const m = new Map<string, string>()
    equipo.forEach(x => m.set(x.uid, `${x.nombre} ${x.apellido ?? ''}`.trim()))
    return m
  }, [equipo])

  const filas = useMemo(() => {
    const porUid = new Map(data.map(d => [d.uid, d]))
    const uids = new Set<string>([
      ...activos.filter(m => m.rol === 'asesor_comercial').map(m => m.uid),
      ...data.map(d => d.uid),
    ])
    return Array.from(uids)
      .map(uid => porUid.get(uid) ?? { uid, ingresosSemana: 0, ingresosMes: 0, cierresMes: 0, leadsMes: 0, consultasMes: 0 })
      .sort((a, b) => b.ingresosMes - a.ingresosMes)
  }, [data, activos])

  const totalSemana = useMemo(() => filas.reduce((a, f) => a + f.ingresosSemana, 0), [filas])
  const totalMes    = useMemo(() => filas.reduce((a, f) => a + f.ingresosMes, 0), [filas])
  const topUid = filas.length && filas[0].ingresosMes > 0 ? filas[0].uid : null

  if (!verFinanzas) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-[#D4621A]" />
          <h3 className="text-base font-bold text-gray-900">Rendimiento por secretario</h3>
        </div>
        {loading && <RefreshCw size={16} className="animate-spin text-gray-400" />}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Ingresos de esta semana y de <span className="capitalize">{mesActualLabel()}</span>, más el trabajo del mes.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Totales */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-sky-50 p-3">
          <p className="text-xs font-semibold text-sky-700">Ingresos esta semana</p>
          <p className="text-lg font-bold text-sky-900">{fmtARS(totalSemana)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700 capitalize">Ingresos {mesActualLabel()}</p>
          <p className="text-lg font-bold text-emerald-900">{fmtARS(totalMes)}</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Secretario</th>
              <th className="py-2 px-3 text-right">Semana</th>
              <th className="py-2 px-3 text-right">Mes</th>
              <th className="py-2 px-3 text-right">Cierres</th>
              <th className="py-2 px-3 text-right">Leads</th>
              <th className="py-2 pl-3 text-right">Consultas</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && !loading && (
              <tr><td colSpan={6} className="py-6 text-center text-gray-400">Sin datos este mes.</td></tr>
            )}
            {filas.map(f => (
              <tr key={f.uid} className="border-b border-gray-100 last:border-0">
                <td className="py-2.5 pr-3 font-semibold text-gray-800">
                  <span className="inline-flex items-center gap-1.5">
                    {topUid === f.uid && <Trophy size={14} className="text-amber-500" />}
                    {nombrePorUid.get(f.uid) ?? 'Secretario'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-sky-700">{fmtARS(f.ingresosSemana)}</td>
                <td className="py-2.5 px-3 text-right font-bold text-gray-900">{fmtARS(f.ingresosMes)}</td>
                <td className="py-2.5 px-3 text-right text-gray-700">{f.cierresMes}</td>
                <td className="py-2.5 px-3 text-right text-gray-700">{f.leadsMes}</td>
                <td className="py-2.5 pl-3 text-right text-gray-700">{f.consultasMes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}