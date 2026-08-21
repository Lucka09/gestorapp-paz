// src/features/cobranzas/BandejaRecibos.tsx
// Bandeja de supervisión de recibos emitidos (pestaña dentro de Cobranzas).
// Solo lectura: el CEO revisa el flujo de recibos sin inundar el Panel de Mando.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, FileCheck, ArrowRight } from 'lucide-react'
import { useRecibos } from '@/hooks/useRecibos'
import { usePaginacion } from '@/hooks/usePaginacion'
import ControlPaginacion from '@/components/shared/ControlPaginacion'
import { Card, Spinner } from '@/components/ui'
import { formatFecha, formatPesos } from '@/utils'

export default function BandejaRecibos() {
  const { recibos, loading } = useRecibos()
  const [search, setSearch] = useState('')

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recibos
    return recibos.filter(r =>
      r.numeroRecibo?.toLowerCase().includes(q) ||
      r.patente?.toLowerCase().includes(q) ||
      r.numeroTramite?.toLowerCase().includes(q)
    )
  }, [recibos, search])

  const pag = usePaginacion(filtrados, { porPagina: 12 })

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <>
      {/* Buscador */}
      <Card className="p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por recibo, patente o trámite..."
            aria-label="Buscar recibos"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                       outline-none focus:border-gp-orange transition-colors"
          />
        </div>
      </Card>

      {/* Tabla de recibos */}
      <Card className="overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <FileCheck size={40} className="mb-3 opacity-40" />
            <p className="text-base font-semibold text-gray-400">
              {search ? 'Sin recibos para esa búsqueda.' : 'Todavía no hay recibos emitidos.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50
                            border-b border-gray-100 text-xs font-bold text-gray-400
                            uppercase tracking-wider">
              <span className="col-span-3">Recibo</span>
              <span className="col-span-3">Trámite / Patente</span>
              <span className="col-span-2 text-right">Monto</span>
              <span className="col-span-2">Forma de pago</span>
              <span className="col-span-2">Emitido por</span>
            </div>

            {pag.itemsPagina.map(r => (
              <Link
                key={r.id}
                to={`/admin/recibos/${r.id}`}
                className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-50
                           items-center text-sm hover:bg-gray-50 transition-colors"
              >
                <div className="col-span-3 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{r.numeroRecibo}</div>
                  <div className="text-xs text-gray-400">{formatFecha(r.creadoEn)}</div>
                </div>
                <div className="col-span-3 min-w-0">
                  <div className="text-gray-700 truncate">{r.patente || '—'}</div>
                  <div className="text-xs text-gray-400 truncate">{r.tipoTramite}</div>
                </div>
                <div className="col-span-2 text-right">
                  <div className="font-semibold text-gray-900">{formatPesos(r.monto)}</div>
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                    r.tipo === 'total' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {r.tipo === 'total' ? 'total' : 'parcial'}
                  </span>
                </div>
                <div className="col-span-2 text-gray-600 capitalize truncate">{r.formaPago || '—'}</div>
                <div className="col-span-2 flex items-center justify-between gap-1 min-w-0">
                  <span className="text-gray-500 text-xs truncate">{r.emitidoPorNombre || '—'}</span>
                  <ArrowRight size={13} className="text-gray-300 shrink-0" />
                </div>
              </Link>
            ))}

            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-600">
                  Total página ({pag.itemsPagina.length})
                </span>
                <span className="text-base font-bold"
                      style={{ color: 'var(--gp-orange)', fontFamily: 'var(--font-display)' }}>
                  {formatPesos(pag.itemsPagina.reduce((a, r) => a + (r.monto ?? 0), 0))}
                </span>
              </div>
              <ControlPaginacion
                pagina={pag.pagina} paginas={pag.paginas}
                desde={pag.desde}   hasta={pag.hasta} total={pag.total}
                onChange={pag.setPagina} labelItem="recibos"
              />
            </div>
          </div>
        )}
      </Card>
    </>
  )
}