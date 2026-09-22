// src/features/encargados/EncargadosPage.tsx
// ─── ENCARGADOS DE MULTAS Y REFERIDOS ────────────────────────────────────────
// Un secretario ve los suyos. El CEO y los admin ven todos, con filtro por
// secretario, y el total de comisiones pagadas en el período.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, AlertTriangle, Phone, ChevronRight, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useGestoriaId } from '@/context/GestoriaContext'
import { getMetricasEncargados, type MetricasEncargado } from '@/lib/firestore/encargadosMetricas'
import { TIPO_ENCARGADO_LABELS } from '@/lib/firestore/encargados'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

type Periodo = 'mes' | 'mes_anterior' | 'trimestre' | 'todo'

function rango(p: Periodo): [Date | undefined, Date | undefined] {
  const h = new Date()
  if (p === 'mes') return [new Date(h.getFullYear(), h.getMonth(), 1), h]
  if (p === 'mes_anterior') return [
    new Date(h.getFullYear(), h.getMonth() - 1, 1),
    new Date(h.getFullYear(), h.getMonth(), 0, 23, 59, 59),
  ]
  if (p === 'trimestre') return [new Date(h.getFullYear(), h.getMonth() - 2, 1), h]
  return [undefined, undefined]
}

export default function EncargadosPage() {
  usePageTitle('Encargados')
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const { puede }  = usePermisos()
  const gestoriaId = useGestoriaId()

  const verTodos = puede('verPanelMando') || puede('gestionarEquipo')

  const [datos,    setDatos]    = useState<MetricasEncargado[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [periodo,  setPeriodo]  = useState<Periodo>('mes')
  const [busca,    setBusca]    = useState('')
  const [secFiltro, setSecFiltro] = useState('')
  const [soloIncompletos, setSoloIncompletos] = useState(false)

  useEffect(() => {
    if (!gestoriaId || !user) return
    let vivo = true
    setLoading(true); setError(null)
    const [d, h] = rango(periodo)
    getMetricasEncargados({ gestoriaId, uid: user.uid, verTodos }, d, h)
      .then(r => { if (vivo) setDatos(r) })
      .catch(e => { if (vivo) setError(e?.message ?? 'No se pudieron cargar') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [gestoriaId, user?.uid, verTodos, periodo])

  const secretarios = useMemo(
    () => [...new Set(datos.map(d => d.asignadoANombre).filter(Boolean))].sort(),
    [datos],
  )

  const lista = useMemo(() => {
    let l = datos
    if (secFiltro) l = l.filter(d => d.asignadoANombre === secFiltro)
    if (soloIncompletos) l = l.filter(d => d.datosIncompletos)
    const t = busca.trim().toLowerCase()
    if (t) l = l.filter(d => `${d.nombre} ${d.apodo} ${d.telefono}`.toLowerCase().includes(t))
    return l
  }, [datos, secFiltro, soloIncompletos, busca])

  const tot = useMemo(() => ({
    encargados: lista.length,
    clientes:   lista.reduce((a, d) => a + d.clientes, 0),
    activos:    lista.reduce((a, d) => a + d.tramitesActivos, 0),
    cobrado:    lista.reduce((a, d) => a + d.cobradoBruto, 0),
    comision:   lista.reduce((a, d) => a + d.comisionPagada, 0),
    incompletos: datos.filter(d => d.datosIncompletos).length,
  }), [lista, datos])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Encargados y referidos</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {verTodos
            ? 'Todos los encargados de la gestoría, con lo que aportó cada uno.'
            : 'Tus encargados de multas y referidos.'}
        </p>
      </div>

      {/* Aviso de datos incompletos */}
      {tot.incompletos > 0 && (
        <button
          onClick={() => setSoloIncompletos(v => !v)}
          className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
            soloIncompletos ? 'border-amber-300 bg-amber-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{tot.incompletos}</strong> sin teléfono. Si el secretario que los
            trajo se va, se pierde el contacto.{' '}
            <span className="underline">{soloIncompletos ? 'Ver todos' : 'Ver cuáles'}</span>
          </p>
        </button>
      )}

      {/* Contadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          ['Encargados', tot.encargados, 'text-gray-900'],
          ['Clientes aportados', tot.clientes, 'text-gray-900'],
          ['Gestiones activas', tot.activos, 'text-blue-600'],
          ['Cobrado a sus clientes', fmt(tot.cobrado), 'text-emerald-600'],
          ['Comisiones pagadas', fmt(tot.comision), 'text-[#D4621A]'],
        ] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">{l}</p>
            <p className={`text-xl font-semibold tabular-nums mt-0.5 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm
                       focus:outline-none focus:border-[#D4621A]"
          />
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4621A]">
          <option value="mes">Este mes</option>
          <option value="mes_anterior">Mes anterior</option>
          <option value="trimestre">Últimos 3 meses</option>
          <option value="todo">Desde siempre</option>
        </select>
        {verTodos && secretarios.length > 1 && (
          <select value={secFiltro} onChange={e => setSecFiltro(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4621A]">
            <option value="">Todos los secretarios</option>
            {secretarios.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay encargados para mostrar.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-3">#</th>
                <th className="text-left font-medium px-2 py-3">Encargado</th>
                {verTodos && <th className="text-left font-medium px-2 py-3">Secretario</th>}
                <th className="text-center font-medium px-2 py-3">Clientes</th>
                <th className="text-center font-medium px-2 py-3">Activas</th>
                <th className="text-right font-medium px-2 py-3">Cobrado</th>
                <th className="text-right font-medium px-2 py-3">Comisión</th>
                <th className="text-left font-medium px-2 py-3">Últ. aporte</th>
                <th className="text-left font-medium px-2 py-3">Antigüedad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((d, i) => (
                <tr key={d.encargadoId}
                  onClick={() => navigate(`/admin/encargados/${d.encargadoId}`)}
                  className="border-b border-gray-50 hover:bg-orange-50/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-gray-900">
                      {d.nombre}{d.apodo && <span className="text-gray-400 font-normal"> ({d.apodo})</span>}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span>{TIPO_ENCARGADO_LABELS[d.tipo]}</span>
                      {d.telefono
                        ? <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{d.telefono.slice(-10)}</span>
                        : <span className="text-amber-600 font-medium">· sin teléfono</span>}
                    </p>
                  </td>
                  {verTodos && <td className="px-2 py-3 text-gray-500 text-xs">{d.asignadoANombre}</td>}
                  <td className="px-2 py-3 text-center tabular-nums font-medium">{d.clientes}</td>
                  <td className="px-2 py-3 text-center tabular-nums">
                    {d.tramitesActivos > 0
                      ? <span className="text-blue-600 font-medium">{d.tramitesActivos}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{d.cobradoBruto ? fmt(d.cobradoBruto) : '—'}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-[#D4621A]">
                    {d.comisionPagada ? fmt(d.comisionPagada) : '—'}
                  </td>
                  <td className="px-2 py-3 text-xs">
                    {d.diasSinAportar == null ? <span className="text-gray-300">—</span>
                      : <span className={d.diasSinAportar > 60 ? 'text-red-500' : d.diasSinAportar > 30 ? 'text-amber-600' : 'text-gray-500'}>
                          hace {d.diasSinAportar} días
                        </span>}
                  </td>
                  <td className="px-2 py-3 text-xs text-gray-400">
                    {d.antiguedadDias < 30 ? `${d.antiguedadDias} días` : `${Math.floor(d.antiguedadDias / 30)} meses`}
                  </td>
                  <td className="px-3 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
