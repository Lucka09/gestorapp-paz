// src/lib/firestore/metricasEquipo.ts
// ─── MÉTRICAS POR SECRETARIO (scorecard del CEO) ─────────────────────────────
// Agrega, por asesor comercial y en un rango de fechas:
//   • Ingresos generados (Σ montoCierre de prospectos cerrados)
//   • Cierres ganados / perdidos → % cierre
//   • Leads asignados / convertidos → % conversión
//   • Consultas de infracciones procesadas (cotizada + enviada)
//
// Todo se calcula desde colecciones top-level (leads, consultasInfracciones,
// prospectos) — sin leer subcolecciones. leads/consultas se acotan server-side
// por su fecha (índice de un solo campo); prospectos se traen por gestoría y se
// filtran por fechaCierre en memoria (el pipeline es acotado).
//
// NOTA: el "tiempo de primera respuesta" NO está acá — no se guarda hoy en
// ningún lado. Requiere stampearlo en el envío (Send.ts, forward-only) y se
// suma en un paso aparte.

import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface MetricaSecretario {
  uid:                 string
  leadsAsignados:      number
  leadsConvertidos:    number
  consultasProcesadas: number
  cierresGanados:      number
  cierresPerdidos:     number
  ingresos:            number
  respuestasMedidas:   number   // cuántas primeras respuestas se midieron
  tiempoRespuestaSegs: number   // suma de segundos (para promediar en la UI)
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

export async function getMetricasPorSecretario(
  gestoriaId: string,
  desde:      Date,
  hasta:      Date,
): Promise<MetricaSecretario[]> {
  if (!gestoriaId) return []

  const tsDesde = Timestamp.fromDate(desde)
  const tsHasta = Timestamp.fromDate(hasta)
  const acc: Record<string, MetricaSecretario> = {}
  const fila = (uid: string) => (acc[uid] ??= filaVacia(uid))

  // ── LEADS (rango sobre creadoEn) ────────────────────────────────────────
  const leadsSnap = await getDocs(query(
    collection(db, 'leads'),
    where('creadoEn', '>=', tsDesde),
    where('creadoEn', '<=', tsHasta),
  ))
  leadsSnap.forEach(d => {
    const l = d.data() as any
    if (l.gestoriaId !== gestoriaId) return
    const uid = String(l.asignadoA ?? '')
    if (!uid) return
    const f = fila(uid)
    f.leadsAsignados++
    if (l.estado === 'convertido' || l.convertidoA) f.leadsConvertidos++
  })

  // ── CONSULTAS DE INFRACCIONES (rango sobre creadaEn) ────────────────────
  const consSnap = await getDocs(query(
    collection(db, 'consultasInfracciones'),
    where('creadaEn', '>=', tsDesde),
    where('creadaEn', '<=', tsHasta),
  ))
  consSnap.forEach(d => {
    const c = d.data() as any
    if (c.gestoriaId !== gestoriaId) return
    const uid = String(c.asignadoA ?? '')
    if (!uid) return
    if (c.estado === 'cotizada' || c.estado === 'enviada') fila(uid).consultasProcesadas++
  })

  // ── PROSPECTOS (por gestoría; cierre/fecha en memoria) ──────────────────
  // Sin filtro server-side de fecha porque fechaCierre es string. Es acotado.
  const prosSnap = await getDocs(query(
    collection(db, 'prospectos'),
    where('gestoriaId', '==', gestoriaId),
  ))
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

  // ── TIEMPO DE PRIMERA RESPUESTA (conversacionesWA, forward-only) ────────
  // Se atribuye a quien respondió primero (primeraRespuestaPor).
  const convSnap = await getDocs(query(
    collection(db, 'conversacionesWA'),
    where('primeraRespuestaEn', '>=', tsDesde),
    where('primeraRespuestaEn', '<=', tsHasta),
  ))
  convSnap.forEach(d => {
    const c = d.data() as any
    if (c.gestoriaId !== gestoriaId) return
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