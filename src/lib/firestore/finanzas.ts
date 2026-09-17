// src/lib/firestore/finanzas.ts
// ═══════════════════════════════════════════════════════════════════════════
// FUENTE ÚNICA DE VERDAD FINANCIERA
// ═══════════════════════════════════════════════════════════════════════════
//
// EL PROBLEMA QUE RESUELVE
//   Hoy hay tres pantallas mostrando tres totales distintos del mismo mes:
//     Reportes ............. $52.517.526   (suma tramites.totalCobradoCliente)
//     Panel de Mando ....... $50.151.526   (otra suma sobre tramites)
//     Métricas secretario .. $37.433.328   (suma cierres ganados de prospectos)
//   Ninguna coincide porque cada una suma de una colección distinta.
//
//   Y el SUATS da $0 en todas. No es un error de suma: `costosSUATS` se escribe
//   recién al cerrar el paso 7, y los 72 trámites de multas están en Pendiente.
//   Se cobraron $52M pero la deducción no existe en ningún lado.
//
// LA REGLA
//   El RECIBO es el único hecho económico. Se emite cuando entra la plata, con
//   su desglose. Todo lo demás —reportes, panel, premios, cierre mensual— suma
//   recibos y nada más. Un trámite abierto con seña cobrada ya aporta su neto.
//
// LAS DEVOLUCIONES son recibos negativos (tipo: 'devolucion'). Así restan solas
// de cada total, del premio del secretario y del cierre mensual, sin que ningún
// consumidor tenga que saber que existen.

import {
  collection, query, where, getDocs, orderBy, limit as fbLimit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── CÁLCULO DEL NETO ─────────────────────────────────────────────────────────

export interface PartesRecibo {
  monto:                number   // lo que pagó el cliente (va en el comprobante)
  montoSUATS?:          number   // pass-through DNRPA
  montoInformePersona?: number   // pass-through
  comisionReferido?:    number   // entregado al referido / encargado
  montoAcreditado?:     number   // tarjeta: lo que realmente entra
}

export interface NetoCalculado {
  netoGestoria:    number
  costoFinanciero: number
  deducciones:     number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Único lugar donde se calcula el neto. Si esta fórmula cambia, cambia en
 * todos lados a la vez.
 */
export function calcularNetoGestoria(r: PartesRecibo): NetoCalculado {
  const monto = num(r.monto)

  // Tarjeta: la diferencia entre lo que paga el cliente y lo que acredita el
  // procesador. Solo si se cargó el acreditado.
  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado))
    : 0

  const deducciones =
    num(r.montoSUATS) +
    num(r.montoInformePersona) +
    num(r.comisionReferido) +
    costoFinanciero

  // En una devolución el monto es negativo: el neto también, y la resta se
  // propaga sola. Por eso NO se hace Math.max(0, ...) sobre el resultado.
  const neto = monto >= 0
    ? Math.max(0, monto - deducciones)
    : monto + deducciones

  return { netoGestoria: neto, costoFinanciero, deducciones }
}

/**
 * Neto de un recibo ya guardado. Cascada defensiva para que los tres consumidores
 * den lo mismo aunque haya recibos viejos sin desglose:
 *   1. si trae netoGestoria persistido, se usa
 *   2. si no, se recalcula desde las partes
 *   3. si no hay partes, el bruto (es como se contaba antes de la migración)
 */
export function netoDeRecibo(r: any): number {
  if (typeof r?.netoGestoria === 'number' && Number.isFinite(r.netoGestoria)) {
    return r.netoGestoria
  }
  return calcularNetoGestoria({
    monto:               num(r?.monto),
    montoSUATS:          num(r?.montoSUATS),
    montoInformePersona: num(r?.montoInformePersona),
    comisionReferido:    num(r?.comisionReferido),
    montoAcreditado:     r?.montoAcreditado,
  }).netoGestoria
}

/** Quién se lleva el crédito del ingreso. */
export function uidAtribuido(r: any): string {
  return String(r?.atribuidoA || r?.emitidoPor || '')
}

// ─── DESGLOSE ─────────────────────────────────────────────────────────────────

export interface DesgloseFinanciero {
  // Entradas
  cobradoBruto:    number   // Σ monto de recibos positivos
  devoluciones:    number   // Σ |monto| de recibos de devolución (positivo)
  cobradoNeto:     number   // cobradoBruto − devoluciones
  // Deducciones (no son plata de la gestoría)
  deducSUATS:      number
  deducInforme:    number
  deducComision:   number
  deducFinanciero: number
  deduccionesTotal: number
  // Resultado
  netoGestoria:    number   // lo que realmente queda
  // Volumen
  recibos:         number
  recibosDevolucion: number
  clientesUnicos:  number
  // Formas de pago
  porFormaPago:    Record<string, number>
}

export function desgloseVacio(): DesgloseFinanciero {
  return {
    cobradoBruto: 0, devoluciones: 0, cobradoNeto: 0,
    deducSUATS: 0, deducInforme: 0, deducComision: 0, deducFinanciero: 0,
    deduccionesTotal: 0, netoGestoria: 0,
    recibos: 0, recibosDevolucion: 0, clientesUnicos: 0,
    porFormaPago: {},
  }
}

function acumular(acc: DesgloseFinanciero, r: any, clientes: Set<string>): void {
  const monto = num(r.monto)
  const esDevolucion = r.tipo === 'devolucion' || monto < 0

  if (esDevolucion) {
    acc.recibosDevolucion++
    acc.devoluciones += Math.abs(monto)
  } else {
    acc.recibos++
    acc.cobradoBruto += monto
    acc.deducSUATS      += num(r.montoSUATS)
    acc.deducInforme    += num(r.montoInformePersona)
    acc.deducComision   += num(r.comisionReferido)
    acc.deducFinanciero += num(r.costoFinanciero)
    const fp = String(r.formaPago ?? 'otro')
    acc.porFormaPago[fp] = (acc.porFormaPago[fp] ?? 0) + monto
  }

  acc.netoGestoria += netoDeRecibo(r)
  if (r.clienteId) clientes.add(String(r.clienteId))
}

function cerrar(acc: DesgloseFinanciero, clientes: Set<string>): DesgloseFinanciero {
  acc.cobradoNeto      = acc.cobradoBruto - acc.devoluciones
  acc.deduccionesTotal = acc.deducSUATS + acc.deducInforme
                       + acc.deducComision + acc.deducFinanciero
  acc.clientesUnicos   = clientes.size
  return acc
}

// ─── CARGA DE RECIBOS ─────────────────────────────────────────────────────────

const enRango = (campo: any, desde: Date, hasta: Date): boolean => {
  const ms = campo?.toMillis?.() ?? campo?.toDate?.()?.getTime?.()
  return typeof ms === 'number' && ms >= desde.getTime() && ms <= hasta.getTime()
}

/**
 * Todos los recibos de la gestoría. Se filtra por fecha en memoria para no
 * depender de un índice compuesto (las reglas exigen gestoriaId en el where,
 * y sumar orderBy pide índice).
 */
export async function cargarRecibos(
  gestoriaId: string,
  limite = 5000,
): Promise<any[]> {
  if (!gestoriaId) return []
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    fbLimit(limite),
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────

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

/** Desglose de la gestoría en un período. Lo usan Reportes y Panel de Mando. */
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
    if (!enRango(r.creadoEn, desde, hasta)) continue
    acumular(acc, r, clientes)
  }
  return cerrar(acc, clientes)
}

/** Desglose por secretario. Lo usan Métricas y Premios. */
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
    if (!enRango(r.creadoEn, desde, hasta)) continue
    const uid = uidAtribuido(r)
    if (!uid) continue

    porUid[uid]         ??= desgloseVacio()
    clientesPorUid[uid] ??= new Set()
    acumular(porUid[uid], r, clientesPorUid[uid])
  }

  for (const uid of Object.keys(porUid)) {
    cerrar(porUid[uid], clientesPorUid[uid])
  }
  return porUid
}

/**
 * Base comisionable para premios. Es el neto, con las devoluciones ya restadas:
 * si se le devolvió plata a un cliente, el secretario no cobra premio por eso.
 */
export function baseComisionable(d: DesgloseFinanciero): number {
  return d.netoGestoria
}

// ─── PROYECCIÓN (run-rate simple) ────────────────────────────────────────────

export interface Proyeccion {
  netoALaFecha:      number
  diasTranscurridos: number
  diasDelMes:        number
  proyeccionNeta:    number
  /** Ritmo diario, para mostrar junto a la proyección. */
  promedioDiario:    number
}

export function proyectarMes(netoALaFecha: number, ref = new Date()): Proyeccion {
  const diasDelMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  const diasTranscurridos = Math.max(1, ref.getDate())
  const promedioDiario = netoALaFecha / diasTranscurridos
  return {
    netoALaFecha,
    diasTranscurridos,
    diasDelMes,
    promedioDiario: Math.round(promedioDiario),
    proyeccionNeta: Math.round(promedioDiario * diasDelMes),
  }
}

