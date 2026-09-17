import { useMemo } from 'react'
import { Input } from '@/components/ui'
import { calcularNetoGestoria } from '@/lib/firestore/finanzas'

export interface ValoresDeduccion {
  montoSUATS?:          number
  montoInformePersona?: number
  comisionReferido?:    number
  comisionDestino?:     string
  montoAcreditado?:     number
  cuotasTarjeta?:       number
}

interface Props {
  /** Monto que paga el cliente. */
  monto:      number
  /** Método elegido; los campos de tarjeta aparecen solo si es 'tarjeta'. */
  metodo:     string
  valores:    ValoresDeduccion
  onChange:   (v: ValoresDeduccion) => void
  /** Si la multa requiere SUATS, se precarga el monto configurado. */
  requiereSUATS?: boolean
  suatsSugerido?: number
  /** Nombre del referido/encargado, si el cliente vino por un canal comercial. */
  referidoNombre?: string
  compacto?:  boolean
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export default function CamposDeduccion({
  monto, metodo, valores, onChange,
  requiereSUATS = false, suatsSugerido = 25000,
  referidoNombre, compacto = false,
}: Props) {
  const esTarjeta = metodo === 'tarjeta' || metodo === 'mercadopago'

  const set = <K extends keyof ValoresDeduccion>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const v = k === 'comisionDestino' ? raw : (raw === '' ? undefined : Number(raw))
      onChange({ ...valores, [k]: v as any })
    }

  const { netoGestoria, costoFinanciero, deducciones } = useMemo(
    () => calcularNetoGestoria({ monto, ...valores }),
    [monto, valores],
  )

  // Las deducciones no pueden superar el cobro: dejaría neto negativo.
  const excede = deducciones > monto && monto > 0

  return (
    <div className="space-y-3">

      {/* ── TARJETA ───────────────────────────────────────────────────────── */}
      {esTarjeta && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider">
            Pago con tarjeta
          </p>

          <Input
            label="Monto acreditado a la gestoría *"
            type="number"
            value={valores.montoAcreditado ?? ''}
            placeholder={String(monto || 0)}
            onChange={set('montoAcreditado')}
            hint="Lo que realmente entra después de intereses y comisión. El cliente ve el monto completo en su recibo."
          />

          <Input
            label="Cuotas"
            type="number"
            value={valores.cuotasTarjeta ?? ''}
            placeholder="1"
            onChange={set('cuotasTarjeta')}
          />

          {costoFinanciero > 0 && (
            <div className="flex justify-between text-xs pt-1 border-t border-violet-100">
              <span className="text-violet-600">Costo financiero</span>
              <span className="tabular-nums font-medium text-violet-700">
                −{fmt(costoFinanciero)}
                {monto > 0 && (
                  <span className="text-violet-400 ml-1">
                    ({Math.round((costoFinanciero / monto) * 100)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── PASS-THROUGH ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Incluido en este cobro
        </p>
        <p className="text-xs text-gray-400 -mt-1.5">
          Plata que pasa por la gestoría pero no es suya. No cuenta para premios.
        </p>

        <Input
          label={requiereSUATS ? 'SUATS incluido *' : 'SUATS incluido'}
          type="number"
          value={valores.montoSUATS ?? ''}
          placeholder={requiereSUATS ? String(suatsSugerido) : '0'}
          onChange={set('montoSUATS')}
          hint={requiereSUATS && valores.montoSUATS == null
            ? `Esta multa lleva SUATS. Sugerido: ${fmt(suatsSugerido)}. Poné 0 si se cobra después.`
            : undefined}
        />

        {!compacto && (
          <Input
            label="Informe de persona"
            type="number"
            value={valores.montoInformePersona ?? ''}
            placeholder="0"
            onChange={set('montoInformePersona')}
          />
        )}

        {referidoNombre && (
          <>
            <Input
              label={`Comisión entregada a ${referidoNombre}`}
              type="number"
              value={valores.comisionReferido ?? ''}
              placeholder="0"
              onChange={set('comisionReferido')}
              hint="Lo que se le pagó al referido por este cobro."
            />
            <input type="hidden" value={valores.comisionDestino ?? referidoNombre} />
          </>
        )}
      </div>

      {/* ── RESULTADO EN VIVO ─────────────────────────────────────────────── */}
      {monto > 0 && (
        <div className={`rounded-xl p-3 border ${
          excede ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50/50'
        }`}>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cobrado al cliente</span>
            <span className="tabular-nums text-gray-800">{fmt(monto)}</span>
          </div>
          {deducciones > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Deducciones</span>
              <span className="tabular-nums text-red-500">−{fmt(deducciones)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-emerald-100">
            <span className="text-sm font-medium text-gray-700">Queda en la gestoría</span>
            <span className={`tabular-nums font-semibold ${
              excede ? 'text-red-600' : 'text-emerald-600'
            }`}>
              {fmt(netoGestoria)}
            </span>
          </div>
          {excede && (
            <p className="text-xs text-red-600 mt-1.5">
              Las deducciones ({fmt(deducciones)}) superan el cobro. Revisá los montos.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Para deshabilitar el botón de guardar desde el formulario padre. */
export function deduccionesValidas(monto: number, v: ValoresDeduccion): boolean {
  const { deducciones } = calcularNetoGestoria({ monto, ...v })
  return monto > 0 && deducciones <= monto
}

