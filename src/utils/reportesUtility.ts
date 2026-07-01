/**
 * REPORTES UTILITY
 * ─────────────────────────────────────────────────────────────────
 * Cálculos correctos de ingresos, desgloses y métricas financieras
 * Considerando SUATS, informe de persona y formas de pago
 */

export interface TramiteFinanciero {
  id: string
  tipo: string
  patente: string
  estado: string
  pagado?: boolean
  fechaPago?: any // Timestamp o Date
  creadoEn?: any
  totalCobradoCliente?: number // $ total recibido del cliente
  honorarios?: number // $ para la gestoría (después de restar SUATS)
  costosSUATS?: number // $16.000 o 0
  costosInformePersona?: number // $ costo de informe
  formaPago?: string // 'efectivo' | 'transferencia' | 'mercadopago' | 'cheque' | 'mixto'
}

/**
 * Calcula el monto de SUATS abonado (siempre $16.000 si fue abonado)
 */
export function calcularMontoSUATS(tramite: TramiteFinanciero): number {
  return (tramite.costosSUATS ?? 0) > 0 ? 16000 : 0
}

/**
 * Calcula los honorarios netos de la gestoría (descuenta SUATS e informe)
 * Este es el dinero que va a la gestoría, excluyendo costos de SUATS e informe
 */
export function calcularHonorariosNetos(tramite: TramiteFinanciero): number {
  const totalCobrado = tramite.totalCobradoCliente ?? tramite.honorarios ?? 0
  const suats = tramite.costosSUATS ?? 0
  const informe = tramite.costosInformePersona ?? 0
  return Math.max(0, totalCobrado - suats - informe)
}

/**
 * Calcula el total cobrado al cliente (lo que realmente ingresó)
 */
export function calcularTotalCobrado(tramite: TramiteFinanciero): number {
  return tramite.totalCobradoCliente ?? tramite.honorarios ?? 0
}

/**
 * Desglose completo financiero de un trámite
 */
export interface DesgloseFinanciero {
  totalCobradoCliente: number
  honorariosGestoria: number
  costosSUATS: number
  costosInformePersona: number
  formaPago: string
}

export function desgloseCompleto(tramite: TramiteFinanciero): DesgloseFinanciero {
  const totalCobrado = calcularTotalCobrado(tramite)
  const suats = tramite.costosSUATS ?? 0
  const informe = tramite.costosInformePersona ?? 0
  const honorarios = Math.max(0, totalCobrado - suats - informe)

  return {
    totalCobradoCliente: totalCobrado,
    honorariosGestoria: honorarios,
    costosSUATS: suats,
    costosInformePersona: informe,
    formaPago: tramite.formaPago ?? 'mixto',
  }
}

/**
 * Agrupa trámites por forma de pago
 */
export interface AgrupadoPorFormaPago {
  efectivo: number
  transferencia: number
  mercadopago: number
  cheque: number
  otro: number
}

export function agruparPorFormaPago(tramites: TramiteFinanciero[]): AgrupadoPorFormaPago {
  const resultado: AgrupadoPorFormaPago = {
    efectivo: 0,
    transferencia: 0,
    mercadopago: 0,
    cheque: 0,
    otro: 0,
  }

  tramites.forEach(t => {
    if (!t.pagado) return
    const cantidad = calcularTotalCobrado(t)
    const forma = (t.formaPago ?? 'otro') as keyof AgrupadoPorFormaPago
    if (forma in resultado) {
      resultado[forma] += cantidad
    } else {
      resultado.otro += cantidad
    }
  })

  return resultado
}

/**
 * Datos para gráficas de ingresos por período
 */
export interface IngresosPorPeriodo {
  periodo: string
  totalCobrado: number
  honorariosGestoria: number
  costosSUATS: number
  costosInformePersona: number
  cantidad: number
}

/**
 * Agrupa ingresos por día dentro de un mes/rango
 */
export function agruparPorDia(
  tramites: TramiteFinanciero[],
  inicioMes: Date,
  finMes: Date,
): IngresosPorPeriodo[] {
  const mapaDias: Record<string, {
    totalCobrado: number
    suats: number
    informe: number
    cantidad: number
  }> = {}

  tramites.forEach(t => {
    if (!t.pagado || !t.fechaPago) return

    const fecha = t.fechaPago?.toDate?.() ?? new Date(t.fechaPago)
    if (fecha < inicioMes || fecha > finMes) return

    const dia = fecha.toISOString().split('T')[0] // YYYY-MM-DD
    if (!mapaDias[dia]) {
      mapaDias[dia] = { totalCobrado: 0, suats: 0, informe: 0, cantidad: 0 }
    }

    const total = calcularTotalCobrado(t)
    const suats = t.costosSUATS ?? 0
    const informe = t.costosInformePersona ?? 0

    mapaDias[dia].totalCobrado += total
    mapaDias[dia].suats += suats
    mapaDias[dia].informe += informe
    mapaDias[dia].cantidad++
  })

  return Object.entries(mapaDias)
    .map(([dia, datos]) => ({
      periodo: dia,
      totalCobrado: datos.totalCobrado,
      honorariosGestoria: Math.max(0, datos.totalCobrado - datos.suats - datos.informe),
      costosSUATS: datos.suats,
      costosInformePersona: datos.informe,
      cantidad: datos.cantidad,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
}

/**
 * Agrupa ingresos por semana dentro de un mes/rango
 */
export function agruparPorSemana(
  tramites: TramiteFinanciero[],
  inicioMes: Date,
  finMes: Date,
): IngresosPorPeriodo[] {
  const mapaSemanasMap: Record<string, {
    totalCobrado: number
    suats: number
    informe: number
    cantidad: number
  }> = {}

  tramites.forEach(t => {
    if (!t.pagado || !t.fechaPago) return

    const fecha = t.fechaPago?.toDate?.() ?? new Date(t.fechaPago)
    if (fecha < inicioMes || fecha > finMes) return

    // Calcula número de semana del año
    const inicio = new Date(fecha.getFullYear(), 0, 1)
    const dias = Math.floor((fecha.getTime() - inicio.getTime()) / 86400000)
    const semana = Math.ceil((dias + inicio.getDay() + 1) / 7)
    const semanaKey = `${fecha.getFullYear()}-W${semana.toString().padStart(2, '0')}`

    if (!mapaSemanasMap[semanaKey]) {
      mapaSemanasMap[semanaKey] = { totalCobrado: 0, suats: 0, informe: 0, cantidad: 0 }
    }

    const total = calcularTotalCobrado(t)
    const suats = t.costosSUATS ?? 0
    const informe = t.costosInformePersona ?? 0

    mapaSemanasMap[semanaKey].totalCobrado += total
    mapaSemanasMap[semanaKey].suats += suats
    mapaSemanasMap[semanaKey].informe += informe
    mapaSemanasMap[semanaKey].cantidad++
  })

  return Object.entries(mapaSemanasMap)
    .map(([semana, datos]) => ({
      periodo: semana,
      totalCobrado: datos.totalCobrado,
      honorariosGestoria: Math.max(0, datos.totalCobrado - datos.suats - datos.informe),
      costosSUATS: datos.suats,
      costosInformePersona: datos.informe,
      cantidad: datos.cantidad,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
}

/**
 * Formato legible para gráficas
 */
export const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: '💵 Efectivo',
  transferencia: '🏦 Transferencia',
  mercadopago: '💳 Mercado Pago',
  cheque: '📋 Cheque',
  mixto: '⚡ Mixto',
  otro: '❓ Otro',
}

export const FORMA_PAGO_COLORS: Record<string, string> = {
  efectivo: '#10B981', // verde
  transferencia: '#3B82F6', // azul
  mercadopago: '#F59E0B', // ámbar
  cheque: '#8B5CF6', // púrpura
  mixto: '#6B7280', // gris
  otro: '#6B7280', // gris
}