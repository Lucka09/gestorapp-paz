// ═══════════════════════════════════════════════════════════════════════════
// TARJETA EN TODOS LOS PUNTOS DE COBRO + COSTO DEL SUATS
// ═══════════════════════════════════════════════════════════════════════════
//
// Hay TRES lugares donde entra plata. Los tres tienen que pedir lo mismo:
//
//   1. ModalOtrosPagos           src/components/multas/ModalOtrosPagos.tsx
//   2. GestorMultaWorkflow       paso 2 (honorarios) y paso 7 (cierre)
//   3. registrarPago             src/lib/firestore/tramites.ts:415 (Cobranzas)
//
// Si uno queda afuera, ese camino sigue guardando recibos sin desglose y los
// números vuelven a no cerrar.


// ─────────────────────────────────────────────────────────────────────────────
// 1 · AGREGAR 'tarjeta' AL TIPO
// ─────────────────────────────────────────────────────────────────────────────
// src/types/multa_types.ts línea 23 — hoy falta justamente el método que
// necesita el desglose:

/*
export type MetodoPago =
  | 'efectivo' | 'transferencia' | 'mercadopago'
  | 'tarjeta'                                      // ← NUEVO
  | 'cheque' | 'otro'
*/

// Y ampliar RegistroPago (línea 25) con los campos del desglose:
/*
export interface RegistroPago {
  monto:               number
  metodoPago:          MetodoPago
  nota?:               string
  pagadoPor?:          string
  origen?:             'workflow' | 'otros_pagos'
  registradoPor:       string
  registradoPorNombre: string
  registradoEn:        Timestamp

  // ── Desglose ──────────────────────────────────────────────────────────────
  montoSUATS?:          number   // precio cobrado al cliente
  costoSUATS?:          number   // costo de producción para la gestoría
  montoInformePersona?: number
  costoInformePersona?: number
  comisionReferido?:    number
  montoAcreditado?:     number   // tarjeta: lo que realmente entra
  cuotasTarjeta?:       number
}
*/


// ─────────────────────────────────────────────────────────────────────────────
// 2 · CamposDeduccion — actualizar con el costo del SUATS
// ─────────────────────────────────────────────────────────────────────────────
// src/components/shared/CamposDeduccion.tsx
//
// El costo del SUATS NO lo carga el secretario: es un dato de la gestoría, fijo
// en configuración. Se completa solo y se muestra como informativo, para que el
// secretario entienda por qué el neto no baja los $25.000 completos.

import { useMemo } from 'react'
import { Input } from '@/components/ui'
import {
  calcularNetoGestoria,
  SUATS_PRECIO_DEFAULT, SUATS_COSTO_DEFAULT,
} from '@/lib/firestore/finanzas'
import { useConfiguracion } from '@/hooks/useConfiguracion'

export interface ValoresDeduccion {
  montoSUATS?:          number
  costoSUATS?:          number
  montoInformePersona?: number
  costoInformePersona?: number
  comisionReferido?:    number
  comisionDestino?:     string
  montoAcreditado?:     number
  cuotasTarjeta?:       number
}

interface Props {
  monto:      number
  metodo:     string
  valores:    ValoresDeduccion
  onChange:   (v: ValoresDeduccion) => void
  requiereSUATS?:  boolean
  referidoNombre?: string
  compacto?:  boolean
  mostrarConceptos?: boolean
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export default function CamposDeduccion({
  monto, metodo, valores, onChange,
  requiereSUATS = false, referidoNombre, compacto = false, mostrarConceptos = true,
}: Props) {
  const { config } = useConfiguracion()
  const precioSUATS = config?.costosMulta?.suats      ?? SUATS_PRECIO_DEFAULT
  const costoSUATS  = config?.costosMulta?.costoSuats ?? SUATS_COSTO_DEFAULT

  const esTarjeta = metodo === 'tarjeta' || metodo === 'mercadopago'

  const set = <K extends keyof ValoresDeduccion>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const v = raw === '' ? undefined : Number(raw)
      const next = { ...valores, [k]: v as any }
      // Al cargar un SUATS, el costo se completa solo desde configuración.
      if (k === 'montoSUATS') {
        next.costoSUATS = (v && v > 0) ? costoSUATS : undefined
      }
      onChange(next)
    }

  const calc = useMemo(
    () => calcularNetoGestoria({ monto, ...valores }),
    [monto, valores],
  )
  const excede = calc.deducciones > monto && monto > 0

  return (
    <div className="space-y-3">

      {/* ── TARJETA ───────────────────────────────────────────────────────── */}
      {esTarjeta && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider">
            Pago con tarjeta
          </p>

          <Input
            label="Monto abonado por el cliente"
            type="number"
            value={monto || ''}
            disabled
            hint="Es el monto del cobro. Va impreso en el recibo."
          />

          <Input
            label="Monto acreditado a la gestoría *"
            type="number"
            value={valores.montoAcreditado ?? ''}
            placeholder={String(monto || 0)}
            onChange={set('montoAcreditado')}
            hint="Lo que realmente entra después de intereses y comisión del procesador."
          />

          <Input
            label="Cuotas"
            type="number"
            value={valores.cuotasTarjeta ?? ''}
            placeholder="1"
            onChange={set('cuotasTarjeta')}
          />

          {calc.costoFinanciero > 0 && (
            <div className="flex justify-between text-xs pt-1 border-t border-violet-100">
              <span className="text-violet-600">Se queda el procesador</span>
              <span className="tabular-nums font-medium text-violet-700">
                −{fmt(calc.costoFinanciero)}
                {monto > 0 && (
                  <span className="text-violet-400 ml-1">
                    ({Math.round((calc.costoFinanciero / monto) * 100)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── PASS-THROUGH ──────────────────────────────────────────────────── */}
      {mostrarConceptos && <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Incluido en este cobro
        </p>
        <p className="text-xs text-gray-400 -mt-1.5">
          Conceptos del trámite. No cuentan para el premio del secretario.
        </p>

        <Input
          label={requiereSUATS ? 'SUATS cobrado al cliente *' : 'SUATS cobrado al cliente'}
          type="number"
          value={valores.montoSUATS ?? ''}
          placeholder={requiereSUATS ? String(precioSUATS) : '0'}
          onChange={set('montoSUATS')}
          hint={requiereSUATS && valores.montoSUATS == null
            ? `Esta multa lleva SUATS. Sugerido: ${fmt(precioSUATS)}. Poné 0 si se cobra después.`
            : undefined}
        />

        {/* El costo es informativo: sale de configuración, no lo carga nadie */}
        {(valores.montoSUATS ?? 0) > 0 && (
          <div className="flex justify-between text-xs px-1">
            <span className="text-gray-400">
              Costo del formulario para la gestoría
            </span>
            <span className="tabular-nums text-gray-500">
              {fmt(valores.costoSUATS ?? costoSUATS)}
              <span className="text-emerald-600 ml-2 font-medium">
                margen {fmt(calc.margenSUATS)}
              </span>
            </span>
          </div>
        )}

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
          <Input
            label={`Comisión entregada a ${referidoNombre}`}
            type="number"
            value={valores.comisionReferido ?? ''}
            placeholder="0"
            onChange={set('comisionReferido')}
            hint="Lo que se le pagó al referido por este cobro."
          />
        )}
      </div>}

      {/* ── RESULTADO EN VIVO ─────────────────────────────────────────────── */}
      {monto > 0 && (
        <div className={`rounded-xl p-3 border ${
          excede ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50/50'
        }`}>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cobrado al cliente</span>
            <span className="tabular-nums text-gray-800">{fmt(monto)}</span>
          </div>

          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-emerald-100">
            <span className="text-sm font-medium text-gray-700">Queda en la gestoría</span>
            <span className={`tabular-nums font-semibold ${
              excede ? 'text-red-600' : 'text-emerald-600'
            }`}>
              {fmt(calc.netoGestoria)}
            </span>
          </div>

          {/* Las dos cifras difieren cuando hay SUATS: conviene mostrarlo para
              que el secretario no crea que le están descontando de más. */}
          {calc.baseComisionable !== calc.netoGestoria && (
            <div className="flex justify-between">
              <span className="text-xs text-gray-400">Cuenta para el premio</span>
              <span className="tabular-nums text-xs text-gray-500">
                {fmt(calc.baseComisionable)}
              </span>
            </div>
          )}

          {excede && (
            <p className="text-xs text-red-600 mt-1.5">
              Las deducciones ({fmt(calc.deducciones)}) superan el cobro. Revisá los montos.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function deduccionesValidas(monto: number, v: ValoresDeduccion): boolean {
  const { deducciones } = calcularNetoGestoria({ monto, ...v })
  return monto > 0 && deducciones <= monto
}


/* ═══════════════════════════════════════════════════════════════════════════
   3 · MONTAJE EN LOS TRES PUNTOS
   ═══════════════════════════════════════════════════════════════════════════

── ModalOtrosPagos.tsx ────────────────────────────────────────────────────────

  Agregar 'tarjeta' al grid de métodos (hoy tiene efectivo, transferencia,
  Mercado Pago, cheque y otro):

    { v: 'tarjeta', l: 'Tarjeta' }

  Estado + montaje:

    const [deduc, setDeduc] = useState<ValoresDeduccion>({})

    {sel && (
      <CamposDeduccion
        monto={monto} metodo={metodo}
        valores={deduc} onChange={setDeduc}
        requiereSUATS={sel.paso1?.requiereSUATS === true}
        compacto
      />
    )}

  Y al guardar:  const pago: RegistroPago = { monto, metodoPago: metodo, ...deduc, ... }


── GestorMultaWorkflow.tsx ────────────────────────────────────────────────────

  Mismo bloque en el formulario de pago del paso 2. En el paso 7, los campos de
  SUATS e informe ya existen: solo hay que sumar `costoSUATS` al guardar, y los
  campos de tarjeta si el cierre se cobra con tarjeta.


── tramites.ts:415 (registrarPago, Cobranzas) ─────────────────────────────────

  Este es el que más fácil se olvida: es el cobro de trámites generales, no de
  multas. El ModalPago de CobranzasPage tiene que montar CamposDeduccion igual,
  y `registrarPago` pasar los campos:

    const reciboId = await crearRecibo({
      ...lo que ya tenías,
      montoSUATS:          pago.montoSUATS,
      costoSUATS:          pago.costoSUATS,
      montoInformePersona: pago.montoInformePersona,
      costoInformePersona: pago.costoInformePersona,
      comisionReferido:    pago.comisionReferido,
      montoAcreditado:     pago.montoAcreditado,
      cuotasTarjeta:       pago.cuotasTarjeta,
    })

  `crearRecibo` recalcula netoGestoria y baseComisionable solo, así que con
  reenviar los campos alcanza.


── recibos.ts — ReciboInput ───────────────────────────────────────────────────

  Sumar a la interface:
    costoSUATS?:          number
    costoInformePersona?: number
    baseComisionable?:    number   // lo calcula crearRecibo

  Y en crearRecibo, guardar las dos cifras:

    const { netoGestoria, baseComisionable, costoFinanciero, margenSUATS } =
      calcularNetoGestoria({ ...data })

    const dataFinal = limpiar({
      ...data,
      netoGestoria, baseComisionable, costoFinanciero, margenSUATS,
      ...
    })

═══════════════════════════════════════════════════════════════════════════ */
