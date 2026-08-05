// src/lib/armarDatosPresupuesto.ts
// ─── PUENTE: COTIZACIÓN DE ACTAS → DATOS DEL PRESUPUESTADOR ──────────────────
//
// Toma la cotización que produce parseInfracciones.cotizar() (actas trabajables
// vs. excluidas) y arma los `filas` + totales que consume el presupuestador
// (canvas + WhatsApp). Todas las multas trabajables de PBA se agregan en una
// sola fila "Pag. Provincia de Buenos Aires", como en el diseño original.

import type { CotizacionMultas } from '@/infraccion_types'
import {
  calcularPresupuesto,
  textoWhatsappPresupuesto,
  CONFIG_PRESUPUESTO_DEFAULT,
  type ConfigPresupuesto,
  type FilaPresupuesto,
  type TotalesPresupuesto,
} from './calcularPresupuesto'

export interface DatosPresupuesto {
  filas:    FilaPresupuesto[]
  totales:  TotalesPresupuesto
  mensajeWhatsapp: string
}

export function armarDatosPresupuesto(params: {
  cotizacion: CotizacionMultas
  dominio:    string
  config?:    ConfigPresupuesto
  plazo?:     string
}): DatosPresupuesto {
  const config = params.config ?? CONFIG_PRESUPUESTO_DEFAULT

  // Una sola fila con todas las trabajables de PBA.
  const quedaSugerido = Math.round(params.cotizacion.importeTotalDeuda * config.transfPct / 100)
  const filas: FilaPresupuesto[] = [
    {
      jur:   'Pag. Provincia de Buenos Aires',
      cant:  params.cotizacion.cantidadTrabajable,
      deuda: params.cotizacion.importeTotalDeuda,
      resol: quedaSugerido,   // sugerencia editable (se usa si transfAuto=false)
    },
  ]

  const totales = calcularPresupuesto(filas, config)
  const mensajeWhatsapp = textoWhatsappPresupuesto({
    totales,
    dominio: params.dominio,
    plazo:   params.plazo,
  })

  return { filas, totales, mensajeWhatsapp }
}