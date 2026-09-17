// src/lib/firestore/metricasEquipo.ts
// ─── MÉTRICAS POR SECRETARIO (scorecard del CEO) ─────────────────────────────
// CAMBIO: los ingresos se atribuyen POR RECIBO (campo `atribuidoA`), no por
// trámite. Cada recibo trae su propio desglose de deducciones y su neto, así
// que el total por secretario se obtiene sumando recibos del período.
//
// Por qué sumar recibos ya NO duplica: el recibo de cierre del paso 7 registra
// solo el saldo (MultaWorwflow.ts:391-395 descuenta los parciales previos).
// Σ recibos de un trámite == totalCobradoCliente.
//
// IMPORTANTE (reglas de Firestore): toda query filtra por `gestoriaId`.
// Filtrar solo por fecha hace que Firestore rechace la consulta con
// "Missing or insufficient permissions". Las fechas se filtran en memoria.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface MetricaSecretario {
  uid:                 string
  // — actividad comercial —
  leadsAsignados:      number
  leadsConvertidos:    number
  consultasProcesadas: number
  cierresGanados:      number
  cierresPerdidos:     number
  respuestasMedidas:   number
  tiempoRespuestaSegs: number
  // — plata —
  recibosEmitidos:     number
  cobradoBruto:        number   // Σ monto — lo que pagó el cliente
  deducSUATS:          number
  deducInforme:        number
  deducComision:       number
  deducFinanciero:     number
  netoGestoria:        number   // base comisionable para premios
  /** @deprecated alias de netoGestoria — mantener hasta migrar los consumidores */
  ingresos:            number
}

export interface ResumenSecretario {
  uid:            string
  // brutos
  brutoSemana:    number
  brutoMes:       number
  // netos (los que importan)
  netoSemana:     number
  netoMes:        number
  deduccionesMes: number
  recibosMes:     number
  cierresMes:     number
  leadsMes:       number
  consultasMes:   number
  /** @deprecated alias de netoMes */
  ingresosMes:    number
  /** @deprecated alias de netoSemana */
  ingresosSemana: number
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function filaVacia(uid: string): MetricaSecretario {
  return {
    uid,
    leadsAsignados: 0, leadsConvertidos: 0, consultasProcesadas: 0,
    cierresGanados: 0, cierresPerdidos: 0,
    respuestasMedidas: 0, tiempoRespuestaSegs: 0,
    recibosEmitidos: 0, cobradoBruto: 0,
    deducSUATS: 0, deducInforme: 0, deducComision: 0, deducFinanciero: 0,
    netoGestoria: 0, ingresos: 0,
  }
}

function parseFecha(s: unknown): Date | null {
  if (!s) return null
  const d = new Date(String(s))
  return isNaN(d.getTime()) ? null : d
}

function enRango(campo: any, desde: Date, hasta: Date): boolean {
  const ms = campo?.toMillis?.() ?? campo?.toDate?.()?.getTime?.()
  if (typeof ms !== 'number') return false
  return ms >= desde.getTime() && ms <= hasta.getTime()
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Neto de un recibo. Si el recibo ya trae `netoGestoria` persistido, se usa.
 * Si no (recibos anteriores a la migración), se recalcula desde las partes.
 * Fallback final: el monto bruto — un recibo viejo sin desglose se considera
 * todo ingreso, que es como se contaba hasta ahora.
 */
function netoDeRecibo(r: any): number {
  if (typeof r.netoGestoria === 'number' && Number.isFinite(r.netoGestoria)) {
    return r.netoGestoria
  }
  const monto = num(r.monto)
  const deducciones =
    num(r.montoSUATS) +
    num(r.montoInformePersona) +
    num(r.comisionReferido) +
    num(r.costoFinanciero)
  return Math.max(0, monto - deducciones)
}

/** Quién se lleva el crédito del ingreso. */
function uidAtribuido(r: any): string {
  return String(r.atribuidoA || r.emitidoPor || '')
}

// ─── SCORECARD COMPLETO (rango libre) ────────────────────────────────────────

export async function getMetricasPorSecretario(
  gestoriaId: string,
  desde:      Date,
  hasta:      Date,
): Promise<MetricaSecretario[]> {
  if (!gestoriaId) return []

  const acc: Record<string, MetricaSecretario> = {}
  const fila = (uid: string) => (acc[uid] ??= filaVacia(uid))
  const q = (col: string) =>
    getDocs(query(collection(db, col), where('gestoriaId', '==', gestoriaId)))

  // ── INGRESOS POR RECIBO ───────────────────────────────────────────────────
  const recibosSnap = await q('recibos')
  recibosSnap.forEach(d => {
    const r = d.data() as any
    if (!enRango(r.creadoEn, desde, hasta)) return
    const uid = uidAtribuido(r)
    if (!uid) return

    const f = fila(uid)
    f.recibosEmitidos++
    f.cobradoBruto    += num(r.monto)
    f.deducSUATS      += num(r.montoSUATS)
    f.deducInforme    += num(r.montoInformePersona)
    f.deducComision   += num(r.comisionReferido)
    f.deducFinanciero += num(r.costoFinanciero)
    f.netoGestoria    += netoDeRecibo(r)
  })

  // ── LEADS ─────────────────────────────────────────────────────────────────
  const leadsSnap = await q('leads')
  leadsSnap.forEach(d => {
    const l = d.data() as any
    if (!enRango(l.creadoEn, desde, hasta)) return
    const uid = String(l.asignadoA ?? '')
    if (!uid) return
    const f = fila(uid)
    f.leadsAsignados++
    if (l.estado === 'convertido' || l.convertidoA) f.leadsConvertidos++
  })

  // ── CONSULTAS DE INFRACCIONES ─────────────────────────────────────────────
  const consSnap = await q('consultasInfracciones')
  consSnap.forEach(d => {
    const c = d.data() as any
    if (!enRango(c.creadaEn, desde, hasta)) return
    const uid = String(c.asignadoA ?? '')
    if (!uid) return
    if (c.estado === 'cotizada' || c.estado === 'enviada') {
      fila(uid).consultasProcesadas++
    }
  })

  // ── PROSPECTOS (cierres ganados / perdidos) ───────────────────────────────
  const prosSnap = await q('prospectos')
  prosSnap.forEach(d => {
    const p = d.data() as any
    const uid = String(p.asignadoA ?? '')
    if (!uid) return

    if (p.etapa === 'ganado' || p.etapa === 'cerrado') {
      const fc = parseFecha(p.fechaCierre) ?? (p.creadoEn?.toDate?.() ?? null)
      if (fc && fc >= desde && fc <= hasta) fila(uid).cierresGanados++
    } else if (p.etapa === 'perdido') {
      const fc = parseFecha(p.fechaCierre)
        ?? (p.actualizadoEn?.toDate?.() ?? p.creadoEn?.toDate?.() ?? null)
      if (fc && fc >= desde && fc <= hasta) fila(uid).cierresPerdidos++
    }
  })

  // ── TIEMPO DE PRIMERA RESPUESTA (forward-only) ────────────────────────────
  const convSnap = await q('conversacionesWA')
  convSnap.forEach(d => {
    const c = d.data() as any
    if (!enRango(c.primeraRespuestaEn, desde, hasta)) return
    const uid = String(c.primeraRespuestaPor ?? c.asignadoA ?? '')
    if (!uid) return
    const segs = Number(c.primeraRespuestaSegs)
    if (!Number.isFinite(segs) || segs < 0) return
    const f = fila(uid)
    f.respuestasMedidas++
    f.tiempoRespuestaSegs += segs
  })

  // Alias de compatibilidad
  return Object.values(acc).map(f => ({ ...f, ingresos: f.netoGestoria }))
}

// ─── RESUMEN PARA EL PANEL DE MANDO ──────────────────────────────────────────

function inicioSemanaLunes(): Date {
  const d = new Date()
  const day  = d.getDay()                  // 0=domingo … 6=sábado
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function inicioMesActual(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1)
}

export async function getResumenSecretarios(
  gestoriaId: string,
): Promise<ResumenSecretario[]> {
  if (!gestoriaId) return []

  const desdeMes    = inicioMesActual()
  const desdeSemana = inicioSemanaLunes()
  const ahora       = new Date()

  const acc: Record<string, ResumenSecretario> = {}
  const fila = (uid: string) => (acc[uid] ??= {
    uid,
    brutoSemana: 0, brutoMes: 0,
    netoSemana: 0,  netoMes: 0,
    deduccionesMes: 0, recibosMes: 0,
    cierresMes: 0, leadsMes: 0, consultasMes: 0,
    ingresosMes: 0, ingresosSemana: 0,
  })
  const q = (col: string) =>
    getDocs(query(collection(db, col), where('gestoriaId', '==', gestoriaId)))

  // ── PLATA: recibos del mes, atribuidos por `atribuidoA` ───────────────────
  const recibos = await q('recibos')
  recibos.forEach(d => {
    const r = d.data() as any
    const fecha = r.creadoEn?.toDate?.() as Date | undefined
    if (!fecha) return
    const uid = uidAtribuido(r)
    if (!uid) return

    const bruto = num(r.monto)
    const neto  = netoDeRecibo(r)
    const dedu  = Math.max(0, bruto - neto)

    if (fecha >= desdeMes && fecha <= ahora) {
      const f = fila(uid)
      f.recibosMes++
      f.brutoMes       += bruto
      f.netoMes        += neto
      f.deduccionesMes += dedu
    }
    if (fecha >= desdeSemana && fecha <= ahora) {
      const f = fila(uid)
      f.brutoSemana += bruto
      f.netoSemana  += neto
    }
  })

  // ── Cierres del mes ───────────────────────────────────────────────────────
  const pros = await q('prospectos')
  pros.forEach(d => {
    const p = d.data() as any
    if (p.etapa !== 'ganado' && p.etapa !== 'cerrado') return
    const uid = String(p.asignadoA ?? '')
    if (!uid) return
    const fc = parseFecha(p.fechaCierre) ?? (p.creadoEn?.toDate?.() ?? null)
    if (fc && fc >= desdeMes && fc <= ahora) fila(uid).cierresMes++
  })

  // ── Leads del mes ─────────────────────────────────────────────────────────
  const leads = await q('leads')
  leads.forEach(d => {
    const l = d.data() as any
    if (!enRango(l.creadoEn, desdeMes, ahora)) return
    const uid = String(l.asignadoA ?? '')
    if (uid) fila(uid).leadsMes++
  })

  // ── Consultas procesadas del mes ──────────────────────────────────────────
  const cons = await q('consultasInfracciones')
  cons.forEach(d => {
    const c = d.data() as any
    if (!enRango(c.creadaEn, desdeMes, ahora)) return
    const uid = String(c.asignadoA ?? '')
    if (uid && (c.estado === 'cotizada' || c.estado === 'enviada')) {
      fila(uid).consultasMes++
    }
  })

  // Alias de compatibilidad
  return Object.values(acc).map(f => ({
    ...f,
    ingresosMes:    f.netoMes,
    ingresosSemana: f.netoSemana,
  }))
}

// ─── TOTALES DE LA GESTORÍA (bloque 1 del Panel de Mando) ────────────────────

export interface TotalesGestoria {
  cobradoBruto:    number
  deducSUATS:      number
  deducInforme:    number
  deducComision:   number
  deducFinanciero: number
  netoGestoria:    number
  recibos:         number
  // Proyección run-rate simple
  diasTranscurridos: number
  diasDelMes:        number
  proyeccionNeta:    number
}

export async function getTotalesGestoria(
  gestoriaId: string,
  desde: Date = inicioMesActual(),
  hasta: Date = new Date(),
): Promise<TotalesGestoria> {
  const vacio: TotalesGestoria = {
    cobradoBruto: 0, deducSUATS: 0, deducInforme: 0,
    deducComision: 0, deducFinanciero: 0, netoGestoria: 0, recibos: 0,
    diasTranscurridos: 0, diasDelMes: 0, proyeccionNeta: 0,
  }
  if (!gestoriaId) return vacio

  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
  ))

  const t = { ...vacio }
  snap.forEach(d => {
    const r = d.data() as any
    if (!enRango(r.creadoEn, desde, hasta)) return
    t.recibos++
    t.cobradoBruto    += num(r.monto)
    t.deducSUATS      += num(r.montoSUATS)
    t.deducInforme    += num(r.montoInformePersona)
    t.deducComision   += num(r.comisionReferido)
    t.deducFinanciero += num(r.costoFinanciero)
    t.netoGestoria    += netoDeRecibo(r)
  })

  // Run-rate simple: neto a la fecha / días transcurridos × días del mes.
  const ahora   = new Date()
  const finMes  = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
  t.diasDelMes        = finMes.getDate()
  t.diasTranscurridos = Math.max(1, ahora.getDate())
  t.proyeccionNeta    = Math.round(
    (t.netoGestoria / t.diasTranscurridos) * t.diasDelMes,
  )

  return t
}