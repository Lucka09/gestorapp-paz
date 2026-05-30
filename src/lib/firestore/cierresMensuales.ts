// src/lib/firestore/cierresMensuales.ts
// ─── CIERRES MENSUALES ─────────────────────────────────────────────────────────
// Cada documento representa el cierre contable + de premios de un mes.
// ID del documento: `${gestoriaId}_${YYYY}_${MM}` (ej: "paz_2025_06")
//
// El cierre:
//  1. Guarda un snapshot inmutable de los premios del asesor para ese mes
//  2. Define el rango exacto de fechas que aplica a ese período
//  3. El primer día del mes siguiente, usePremios parte desde 0 para el período nuevo
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc, getDoc, setDoc, getDocs, query,
  where, orderBy, serverTimestamp,
  collection, Timestamp, type CollectionReference,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface SnapshotPremiosAsesor {
  uid:                   string
  nombre:                string
  tramitesCalificantes:  number
  premiosA_ganados:      number
  premiosA_pesos:        number
  facturacionMultas:     number
  hitosAlcanzados:       number[]
  premiosB_pesos:        number
  totalTramitesCreados:  number
  totalMultasCreadas:    number
}

export interface CierreMensual {
  id:           string            // `${gestoriaId}_${anio}_${mes2dig}`
  gestoriaId:   string
  anio:         number
  mes:          number            // 0–11 (igual que Date.getMonth())
  mesLabel:     string            // "Junio 2025"
  periodoInicio: Timestamp        // 1er día del mes a las 00:00:00
  periodoFin:    Timestamp        // último día del mes a las 23:59:59
  cerradoPor:   string            // uid
  cerradoPorNombre: string
  cerradoEn:    Timestamp
  // Snapshots de premios al momento del cierre
  snapshotPremios: SnapshotPremiosAsesor[]
  // Métricas financieras del mes (para el reporte)
  totalTramites:   number
  totalHonorarios: number
  totalCobrado:    number
  notas?:          string
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export function buildCierreId(gestoriaId: string, anio: number, mes: number): string {
  const mm = String(mes + 1).padStart(2, '0')
  return `${gestoriaId}_${anio}_${mm}`
}

export function periodoDesde(anio: number, mes: number): { inicio: Date; fin: Date } {
  const inicio = new Date(anio, mes, 1, 0, 0, 0, 0)
  const fin    = new Date(anio, mes + 1, 0, 23, 59, 59, 999)
  return { inicio, fin }
}

// ─── REFS ─────────────────────────────────────────────────────────────────────

const cierresCol = collection(db, 'cierresMensuales') as CollectionReference<CierreMensual>
const cierreDoc  = (id: string) => doc(cierresCol, id)

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Obtiene el cierre de un mes específico. Retorna null si no existe. */
export async function getCierreMensual(
  gestoriaId: string,
  anio:       number,
  mes:        number,
): Promise<CierreMensual | null> {
  const id   = buildCierreId(gestoriaId, anio, mes)
  const snap = await getDoc(cierreDoc(id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id }
}

/** Lista todos los cierres de una gestoría, ordenados del más reciente al más antiguo. */
export async function getCierresGestoria(gestoriaId: string): Promise<CierreMensual[]> {
  const snap = await getDocs(
    query(cierresCol, where('gestoriaId', '==', gestoriaId), orderBy('periodoFin', 'desc'))
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export interface CrearCierreInput {
  gestoriaId:      string
  anio:            number
  mes:             number
  cerradoPor:      string
  cerradoPorNombre: string
  snapshotPremios: SnapshotPremiosAsesor[]
  totalTramites:   number
  totalHonorarios: number
  totalCobrado:    number
  notas?:          string
}

/**
 * Crea el documento de cierre mensual.
 * Es idempotente: si ya existe, no lo sobreescribe (lanza error).
 */
export async function crearCierreMensual(input: CrearCierreInput): Promise<string> {
  const id = buildCierreId(input.gestoriaId, input.anio, input.mes)

  // Verificar que no exista
  const existing = await getDoc(cierreDoc(id))
  if (existing.exists()) {
    throw new Error(`Ya existe un cierre para ${MESES_ES[input.mes]} ${input.anio}.`)
  }

  const { inicio, fin } = periodoDesde(input.anio, input.mes)

  const data: Omit<CierreMensual, 'id'> = {
    gestoriaId:       input.gestoriaId,
    anio:             input.anio,
    mes:              input.mes,
    mesLabel:         `${MESES_ES[input.mes]} ${input.anio}`,
    periodoInicio:    Timestamp.fromDate(inicio),
    periodoFin:       Timestamp.fromDate(fin),
    cerradoPor:       input.cerradoPor,
    cerradoPorNombre: input.cerradoPorNombre,
    cerradoEn:        serverTimestamp() as unknown as Timestamp,
    snapshotPremios:  input.snapshotPremios,
    totalTramites:    input.totalTramites,
    totalHonorarios:  input.totalHonorarios,
    totalCobrado:     input.totalCobrado,
    ...(input.notas ? { notas: input.notas } : {}),
  }

  await setDoc(cierreDoc(id), data as any)
  return id
}