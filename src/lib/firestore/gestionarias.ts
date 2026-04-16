// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TENANCY — GestorApp
// Todas las colecciones filtran por gestoriaId automáticamente
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, doc, addDoc, updateDoc, setDoc,
  getDocs, getDoc, query, where, orderBy,
  onSnapshot, serverTimestamp,
  CollectionReference, DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Gestoria, PlanGestoria, BrandingGestoria } from '@/types'

// ─── COLECCIÓN RAÍZ DE GESTORÍAS (solo JAH-NISSI accede) ─────────────────────

export const gestoriasCol = collection(db, 'gestionarias') as CollectionReference<Gestoria>
export const gestoriaDoc  = (id: string) => doc(db, 'gestionarias', id) as DocumentReference<Gestoria>

// ─── COLECCIONES TENANT-AWARE ─────────────────────────────────────────────────
// Todas las queries incluyen gestoriaId automáticamente

export function colTenant(colName: string, gestoriaId: string) {
  return collection(db, colName) as CollectionReference<any>
}

export function queryTenant(
  colName:    string,
  gestoriaId: string,
  ...constraints: any[]
) {
  const col = collection(db, colName)
  return query(col, where('gestoriaId', '==', gestoriaId), ...constraints)
}

// ─── CRUD GESTORÍAS ───────────────────────────────────────────────────────────

export interface NuevaGestoriaInput {
  nombre:          string
  nombreLegal:     string
  cuit:            string
  responsable:     string
  email:           string
  telefono1:       string
  telefono2?:      string
  direccion:       string
  localidad:       string
  provincia:       string
  plan:            PlanGestoria
  branding: {
    colorPrimario:  string
    colorSecundario: string
    nombreComercial: string
    slogan?:        string
  }
}

export async function crearGestoria(
  input: NuevaGestoriaInput
): Promise<string> {
  const planCfg = { starter: { maxU: 2, maxC: 100 }, profesional: { maxU: 5, maxC: 500 }, enterprise: { maxU: 20, maxC: 9999 } }
  const limits  = planCfg[input.plan]

  const ref = await addDoc(gestoriasCol, {
    ...input,
    branding: {
      ...input.branding,
      logoUrl:    null,
      logoBase64: null,
    },
    estado:      'trial',
    maxUsuarios: limits.maxU,
    maxClientes: limits.maxC,
    creadoEn:    serverTimestamp(),
    vencePlan:   null,
    notas:       '',
  } as any)

  return ref.id
}

export async function actualizarGestoria(
  id:   string,
  data: Partial<Gestoria>
): Promise<void> {
  await updateDoc(gestoriaDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  } as any)
}

export async function getGestoria(id: string): Promise<Gestoria | null> {
  const snap = await getDoc(gestoriaDoc(id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id } as Gestoria
}

// ─── SUSCRIPCIONES ────────────────────────────────────────────────────────────

// Todas las gestorías (solo super-admin JAH-NISSI)
export function subscribeGestorias(
  callback: (gs: Gestoria[]) => void
): Unsubscribe {
  return onSnapshot(
    query(gestoriasCol, orderBy('creadoEn', 'desc')),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Gestoria))
  )
}

// Una gestoría específica (para el branding del tenant)
export function subscribeGestoria(
  id:       string,
  callback: (g: Gestoria | null) => void
): Unsubscribe {
  return onSnapshot(gestoriaDoc(id), snap => {
    if (!snap.exists()) callback(null)
    else callback({ ...snap.data(), id: snap.id } as Gestoria)
  })
}

// ─── MIGRACIÓN: agregar gestoriaId a documentos existentes ───────────────────
// Ejecutar UNA SOLA VEZ para Gestoría Paz

export async function migrarGestoriaId(
  gestoriaId:  string,
  colecciones: string[]
): Promise<Record<string, number>> {
  const resultados: Record<string, number> = {}

  for (const col of colecciones) {
    const snap = await getDocs(collection(db, col))
    const sinTenant = snap.docs.filter(d => !d.data().gestoriaId)

    // Batch en grupos de 400 (límite Firestore)
    const grupos: typeof sinTenant[] = []
    for (let i = 0; i < sinTenant.length; i += 400) {
      grupos.push(sinTenant.slice(i, i + 400))
    }

    let total = 0
    for (const grupo of grupos) {
      const { writeBatch } = await import('firebase/firestore')
      const batch = writeBatch(db)
      grupo.forEach(d => batch.update(d.ref, { gestoriaId }))
      await batch.commit()
      total += grupo.length
    }

    resultados[col] = total
    console.log(`[Migración] ${col}: ${total} documentos actualizados`)
  }

  return resultados
}

export const COLECCIONES_TENANT = [
  'clientes', 'vehiculos', 'tramites', 'turnos',
  'notificaciones', 'prospectos', 'notas_internas',
  'tareas', 'vencimientos', 'alertas_sistema', 'audit_log',
]
