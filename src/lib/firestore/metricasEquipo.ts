// src/lib/firestore/metricasEquipo.ts
// ─── MÉTRICAS POR SECRETARIO (scorecard del CEO) ─────────────────────────────
// Agrega, por asesor comercial y en un rango de fechas:
//   • Ingresos generados (Σ montoCierre de prospectos cerrados)
//   • Cierres ganados / perdidos → % cierre
//   • Leads asignados / convertidos → % conversión
//   • Consultas de infracciones procesadas (cotizada + enviada)
//   • Tiempo de primera respuesta (forward-only, desde conversacionesWA)
//
// IMPORTANTE (reglas de Firestore): toda query filtra por `gestoriaId` (igual que
// LeadsPage/PipelinePage/Bandeja). Filtrar solo por fecha hace que Firestore
// rechace la consulta con "Missing or insufficient permissions". Las fechas se
// filtran en memoria → sin índices compuestos.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface MetricaSecretario {
  uid:                 string
  leadsAsignados:      number
  leadsConvertidos:    number
  consultasProcesadas: number
  cierresGanados:      number
  cierresPerdidos:     number
  ingresos:            number
  respuestasMedidas:   number
  tiempoRespuestaSegs: number
}

function filaVacia(uid: string): MetricaSecretario {
  return {
    uid,
    leadsAsignados: 0, leadsConvertidos: 0, consultasProcesadas: 0,
    cierresGanados: 0, cierresPerdidos: 0, ingresos: 0,
    respuestasMedidas: 0, tiempoRespuestaSegs: 0,
  }
}

// Parse defensivo de fechaCierre (string 'YYYY-MM-DD' o similar).
function parseFecha(s: unknown): Date | null {
  if (!s) return null
  const d = new Date(String(s))
  return isNaN(d.getTime()) ? null : d
}

// ¿El Timestamp (o algo con toMillis/toDate) cae en [desde, hasta]?
function enRango(campo: any, desde: Date, hasta: Date): boolean {
  const ms = campo?.toMillis?.() ?? campo?.toDate?.()?.getTime?.()
  if (typeof ms !== 'number') return false
  return ms >= desde.getTime() && ms <= hasta.getTime()
}

export async function getMetricasPorSecretario(
  gestoriaId: string,
  desde:      Date,
  hasta:      Date,
): Promise<MetricaSecretario[]> {
  if (!gestoriaId) return []

  const acc: Record<string, MetricaSecretario> = {}
  const fila = (uid: string) => (acc[uid] ??= filaVacia(uid))
  const q = (col: string) => getDocs(query(collection(db, col), where('gestoriaId', '==', gestoriaId)))

  // ── LEADS ────────────────────────────────────────────────────────────────
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

  // ── CONSULTAS DE INFRACCIONES ──────────────────────────────────────────────
  const consSnap = await q('consultasInfracciones')
  consSnap.forEach(d => {
    const c = d.data() as any
    if (!enRango(c.creadaEn, desde, hasta)) return
    const uid = String(c.asignadoA ?? '')
    if (!uid) return
    if (c.estado === 'cotizada' || c.estado === 'enviada') fila(uid).consultasProcesadas++
  })

  // ── PROSPECTOS (cierres / ingresos) ────────────────────────────────────────
  const prosSnap = await q('prospectos')
  prosSnap.forEach(d => {
    const p = d.data() as any
    const uid = String(p.asignadoA ?? '')
    if (!uid) return

    if (p.etapa === 'cerrado') {
      const fc = parseFecha(p.fechaCierre) ?? (p.creadoEn?.toDate?.() ?? null)
      if (fc && fc >= desde && fc <= hasta) {
        const f = fila(uid)
        f.cierresGanados++
        f.ingresos += Number(p.montoCierre ?? 0)
      }
    } else if (p.etapa === 'perdido') {
      const fc = parseFecha(p.fechaCierre)
        ?? (p.actualizadoEn?.toDate?.() ?? p.creadoEn?.toDate?.() ?? null)
      if (fc && fc >= desde && fc <= hasta) fila(uid).cierresPerdidos++
    }
  })

  // ── TIEMPO DE PRIMERA RESPUESTA (conversacionesWA, forward-only) ────────────
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

  return Object.values(acc)
}