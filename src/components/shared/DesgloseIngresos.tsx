import type { DesgloseFinanciero, Proyeccion } from '@/lib/firestore/finanzas'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

interface Props {
  d:            DesgloseFinanciero
  proyeccion?:  Proyeccion
  titulo?:      string
  compacto?:    boolean
}

export default function DesgloseIngresos({
  d, proyeccion, titulo = 'Desglose de ingresos', compacto = false,
}: Props) {
  const lineas = [
    { label: 'Devoluciones',             valor: d.devoluciones },
    { label: 'SUATS',                    valor: d.deducSUATS },
    { label: 'Informes de persona',      valor: d.deducInforme },
    { label: 'Comisiones a terceros',    valor: d.deducComision },
    { label: 'Costo financiero tarjeta', valor: d.deducFinanciero },
  ].filter(l => compacto ? l.valor > 0 : true)

  const pctNeto = d.cobradoBruto > 0
    ? Math.round((d.netoGestoria / d.cobradoBruto) * 100)
    : 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{titulo}</h3>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Cobrado al cliente</span>
          <span className="tabular-nums font-medium text-gray-900">
            {fmt(d.cobradoBruto)}
          </span>
        </div>

        {lineas.map(l => (
          <div key={l.label} className="flex justify-between text-sm">
            <span className="text-gray-400 pl-3">{l.label}</span>
            <span className={`tabular-nums ${l.valor > 0 ? 'text-red-500' : 'text-gray-300'}`}>
              {l.valor > 0 ? `−${fmt(l.valor)}` : '—'}
            </span>
          </div>
        ))}

        <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
          <span className="text-sm font-semibold text-gray-800">
            Ingreso real de la gestoría
          </span>
          <span className="tabular-nums text-lg font-semibold text-emerald-600">
            {fmt(d.netoGestoria)}
          </span>
        </div>

        <p className="text-xs text-gray-400">
          {pctNeto}% de lo cobrado · {d.recibos} recibos
          {d.recibosDevolucion > 0 && ` · ${d.recibosDevolucion} devoluciones`}
          {d.clientesUnicos > 0 && ` · ${d.clientesUnicos} clientes`}
        </p>
      </div>

      {proyeccion && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Proyección del mes
            </span>
            <span className="tabular-nums text-base font-medium text-gray-800">
              {fmt(proyeccion.proyeccionNeta)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Ritmo de {fmt(proyeccion.promedioDiario)} por día ·
            {' '}{proyeccion.diasTranscurridos} de {proyeccion.diasDelMes} días.
            Es una estimación lineal, no un pronóstico.
          </p>
        </div>
      )}

      {/* Formas de pago */}
      {Object.keys(d.porFormaPago).length > 0 && !compacto && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Formas de pago
          </p>
          <div className="space-y-1">
            {Object.entries(d.porFormaPago)
              .sort((a, b) => b[1] - a[1])
              .map(([forma, monto]) => {
                const pct = d.cobradoBruto > 0
                  ? Math.round((monto / d.cobradoBruto) * 100) : 0
                return (
                  <div key={forma} className="flex justify-between text-sm">
                    <span className="text-gray-500 capitalize">{forma}</span>
                    <span className="tabular-nums text-gray-700">
                      {fmt(monto)} <span className="text-gray-300">({pct}%)</span>
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}