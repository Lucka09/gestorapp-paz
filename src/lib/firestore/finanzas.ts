// src/lib/firestore/finanzas.ts
// ═══════════════════════════════════════════════════════════════════════════
// FUENTE ÚNICA DE VERDAD FINANCIERA
// ═══════════════════════════════════════════════════════════════════════════
//
// CAMBIO IMPORTANTE: el neto de la gestoría y la base de premios dejan de ser
// el mismo número.
//
// El SUATS se le cobra al cliente a $25.000, pero producirlo le cuesta a la
// gestoría $7.600. Esos $17.400 de diferencia SON ingreso de la gestoría.
// Al mismo tiempo, NO cuentan para el premio del secretario: es plata del
// trámite, no de su gestión comercial.
//
//   Cliente paga           $125.000   (honorarios 100.000 + SUATS 25.000)
//   (−) costo real SUATS     −$7.600
//   ─────────────────────────────────
//   INGRESO GESTORÍA        $117.400  ← reportes, panel de mando, contabilidad
//
//   Cliente paga           $125.000
//   (−) SUATS completo      −$25.000
//   ─────────────────────────────────
//   BASE COMISIONABLE       $100.000  ← premios del secretario
//
// Mismo criterio para el informe de persona: si tiene costo de producción, se
// carga en `costoInformePersona`. Si no se configura, se asume pass-through
// puro (costo = precio) y no genera margen.

import {
  collection, query, where, getDocs, limit as fbLimit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── COSTOS POR DEFECTO ───────────────────────────────────────────────────────
// Sobrescribibles desde configuracion/gestor → costosMulta

export const SUATS_PRECIO_DEFAULT = 25_000   // lo que paga el cliente
export const SUATS_COSTO_DEFAULT  =  7_600   // lo que le cuesta a la gestoría
export const INFORME_PRECIO_DEFAULT = 45_000

// ─── CÁLCULO ──────────────────────────────────────────────────────────────────

export interface PartesRecibo {
  monto:                number   // lo que paga el cliente (va en el comprobante)
  montoSUATS?:          number   // precio del SUATS cobrado al cliente
  costoSUATS?:          number   // lo que le cuesta producirlo a la gestoría
  montoInformePersona?: number
  costoInformePersona?: number   // si no viene, se asume igual al precio
  comisionReferido?:    number
  montoAcreditado?:     number   // tarjeta: lo que realmente entra
}

export interface NetoCalculado {
  /** Lo que realmente queda en la gestoría. Descuenta el COSTO del SUATS. */
  netoGestoria:    number
  /** Base de premios. Descuenta el PRECIO completo del SUATS. */
  baseComisionable: number
  /** Ganancia del SUATS: precio − costo. */
  margenSUATS:     number
  costoFinanciero: number
  /** Total descontado para llegar al neto. */
  deducciones:     number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Único lugar donde se calcula. Si esta fórmula cambia, cambia en todos lados.
 */
export function calcularNetoGestoria(r: PartesRecibo): NetoCalculado {
  const monto = num(r.monto)

  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado))
    : 0

  const precioSUATS = num(r.montoSUATS)
  // Si hay SUATS cobrado pero no se registró su costo, se usa el default.
  // Sin esto, los recibos viejos mostrarían un margen inflado.
  const costoSUATS = precioSUATS > 0
    ? (r.costoSUATS != null ? num(r.costoSUATS) : SUATS_COSTO_DEFAULT)
    : 0
  const margenSUATS = Math.max(0, precioSUATS - costoSUATS)

  const precioInforme = num(r.montoInformePersona)
  // Sin costo configurado se asume pass-through puro: no genera margen.
  const costoInforme = precioInforme > 0
    ? (r.costoInformePersona != null ? num(r.costoInformePersona) : precioInforme)
    : 0

  const comision = num(r.comisionReferido)

  // Neto real: solo salen de la gestoría los COSTOS, no los precios.
  const deducciones = costoSUATS + costoInforme + comision + costoFinanciero
  const neto = monto >= 0
    ? Math.max(0, monto - deducciones)
    : monto + deducciones

  // Base de premios: sale el PRECIO completo de los pass-through.
  const deduccionesPremio = precioSUATS + precioInforme + comision + costoFinanciero
  const base = monto >= 0
    ? Math.max(0, monto - deduccionesPremio)
    : monto + deduccionesPremio

  return {
    netoGestoria:     neto,
    baseComisionable: base,
    margenSUATS,
    costoFinanciero,
    deducciones,
  }
}

/** Neto de un recibo guardado, con cascada defensiva para los viejos. */
export function netoDeRecibo(r: any): number {
  if (typeof r?.netoGestoria === 'number' && Number.isFinite(r.netoGestoria)) {
    return r.netoGestoria
  }
  return calcularNetoGestoria(r ?? { monto: 0 }).netoGestoria
}

/** Base comisionable de un recibo guardado. */
export function baseDeRecibo(r: any): number {
  if (typeof r?.baseComisionable === 'number' && Number.isFinite(r.baseComisionable)) {
    return r.baseComisionable
  }
  return calcularNetoGestoria(r ?? { monto: 0 }).baseComisionable
}

export function uidAtribuido(r: any): string {
  return String(r?.atribuidoA || r?.emitidoPor || '')
}

// ─── DESGLOSE ─────────────────────────────────────────────────────────────────

export interface DesgloseFinanciero {
  // Entradas
  cobradoBruto:    number
  devoluciones:    number
  cobradoNeto:     number
  // Pass-through: lo que se le cobra al cliente por cuenta de terceros
  suatsCobrado:    number   // precio cobrado al cliente
  suatsCosto:      number   // lo que pagó la gestoría por producirlo
  suatsMargen:     number   // la diferencia — SÍ es ingreso
  informeCobrado:  number
  informeCosto:    number
  // Otras deducciones
  deducComision:   number
  deducFinanciero: number
  // Resultados
  netoGestoria:    number   // ingreso real
  baseComisionable: number  // base de premios
  // Volumen
  recibos:         number
  recibosDevolucion: number
  clientesUnicos:  number
  porFormaPago:    Record<string, number>
}

export function desgloseVacio(): DesgloseFinanciero {
  return {
    cobradoBruto: 0, devoluciones: 0, cobradoNeto: 0,
    suatsCobrado: 0, suatsCosto: 0, suatsMargen: 0,
    informeCobrado: 0, informeCosto: 0,
    deducComision: 0, deducFinanciero: 0,
    netoGestoria: 0, baseComisionable: 0,
    recibos: 0, recibosDevolucion: 0, clientesUnicos: 0,
    porFormaPago: {},
  }
}

function acumular(acc: DesgloseFinanciero, r: any, clientes: Set<string>): void {
  const monto = num(r.monto)
  const esDevolucion = r.tipo === 'devolucion' || monto < 0
  const calc = calcularNetoGestoria(r)

  if (esDevolucion) {
    acc.recibosDevolucion++
    acc.devoluciones += Math.abs(monto)
  } else {
    acc.recibos++
    acc.cobradoBruto += monto

    const precioSUATS = num(r.montoSUATS)
    acc.suatsCobrado += precioSUATS
    acc.suatsCosto   += precioSUATS > 0
      ? (r.costoSUATS != null ? num(r.costoSUATS) : SUATS_COSTO_DEFAULT)
      : 0
    acc.suatsMargen  += calc.margenSUATS

    const precioInf = num(r.montoInformePersona)
    acc.informeCobrado += precioInf
    acc.informeCosto   += precioInf > 0
      ? (r.costoInformePersona != null ? num(r.costoInformePersona) : precioInf)
      : 0

    acc.deducComision   += num(r.comisionReferido)
    acc.deducFinanciero += calc.costoFinanciero

    const fp = String(r.formaPago ?? 'otro')
    acc.porFormaPago[fp] = (acc.porFormaPago[fp] ?? 0) + monto
  }

  acc.netoGestoria     += netoDeRecibo(r)
  acc.baseComisionable += baseDeRecibo(r)
  if (r.clienteId) clientes.add(String(r.clienteId))
}

function cerrar(acc: DesgloseFinanciero, clientes: Set<string>): DesgloseFinanciero {
  acc.cobradoNeto    = acc.cobradoBruto - acc.devoluciones
  acc.clientesUnicos = clientes.size
  return acc
}

// ─── CARGA ────────────────────────────────────────────────────────────────────

const enRango = (campo: any, desde: Date, hasta: Date): boolean => {
  const ms = campo?.toMillis?.() ?? campo?.toDate?.()?.getTime?.()
  return typeof ms === 'number' && ms >= desde.getTime() && ms <= hasta.getTime()
}

/**
 * Fecha contable de un recibo: cuándo ENTRÓ la plata. Los recibos anteriores a
 * la fase 1 no tienen fechaCobro → se usa creadoEn (antes se contaba así).
 */
export function fechaDeRecibo(r: any): any {
  return r?.fechaCobro ?? r?.creadoEn
}

export async function cargarRecibos(gestoriaId: string, limite = 5000): Promise<any[]> {
  if (!gestoriaId) return []
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    fbLimit(limite),
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export function inicioMes(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function inicioSemanaLunes(d = new Date()): Date {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  x.setHours(0, 0, 0, 0)
  return x
}

export async function getDesglose(
  gestoriaId: string,
  desde: Date = inicioMes(),
  hasta: Date = new Date(),
  recibosPrecargados?: any[],
): Promise<DesgloseFinanciero> {
  const recibos = recibosPrecargados ?? await cargarRecibos(gestoriaId)
  const acc = desgloseVacio()
  const clientes = new Set<string>()
  for (const r of recibos) {
    if (!enRango(fechaDeRecibo(r), desde, hasta)) continue
    acumular(acc, r, clientes)
  }
  return cerrar(acc, clientes)
}

export async function getDesglosePorSecretario(
  gestoriaId: string,
  desde: Date = inicioMes(),
  hasta: Date = new Date(),
  recibosPrecargados?: any[],
): Promise<Record<string, DesgloseFinanciero>> {
  const recibos = recibosPrecargados ?? await cargarRecibos(gestoriaId)
  const porUid: Record<string, DesgloseFinanciero> = {}
  const clientesPorUid: Record<string, Set<string>> = {}

  for (const r of recibos) {
    if (!enRango(fechaDeRecibo(r), desde, hasta)) continue
    const uid = uidAtribuido(r)
    if (!uid) continue
    porUid[uid]         ??= desgloseVacio()
    clientesPorUid[uid] ??= new Set()
    acumular(porUid[uid], r, clientesPorUid[uid])
  }
  for (const uid of Object.keys(porUid)) cerrar(porUid[uid], clientesPorUid[uid])
  return porUid
}

/**
 * Base de premios. Ahora es distinta del neto: descuenta el PRECIO completo
 * del SUATS y del informe, no su costo.
 */
export function baseComisionable(d: DesgloseFinanciero): number {
  return d.baseComisionable
}

// ─── PROYECCIÓN ───────────────────────────────────────────────────────────────

export interface Proyeccion {
  netoALaFecha:      number
  diasTranscurridos: number
  diasDelMes:        number
  proyeccionNeta:    number
  promedioDiario:    number
}

export function proyectarMes(netoALaFecha: number, ref = new Date()): Proyeccion {
  const diasDelMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const diasTranscurridos = Math.max(1, ref.getDate())
  const promedioDiario = netoALaFecha / diasTranscurridos
  return {
    netoALaFecha, diasTranscurridos, diasDelMes,
    promedioDiario: Math.round(promedioDiario),
    proyeccionNeta: Math.round(promedioDiario * diasDelMes),
  }
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// En configuracion/gestor, ampliar costosMulta:
/*
  costosMulta: {
    suats:               25000,   // precio al cliente
    costoSuats:           7600,   // costo de producción  ← NUEVO
    informePersona:      45000,
    costoInformePersona: 45000,   // pass-through puro por ahora  ← NUEVO
  }
*/
// Y en `Configuracion` (src/types/index.ts):
/*
  costosMulta?: {
    suats?: number
    costoSuats?: number
    informePersona?: number
    costoInformePersona?: number
  }
*/