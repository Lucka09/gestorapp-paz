import {
  getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, limit,
  startAfter, getCountFromServer,
  onSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { clientesCol, clienteDoc } from './collections'
import type { Cliente } from '@/types'
import { registrarActividad } from './audit'

export const PAGE_SIZE_CLIENTES = 25

// ─── READ (realtime) ──────────────────────────────────────────────────────────
// Mantener para formularios/selects que necesitan la lista completa
// (TramiteForm, VehiculoForm, etc.)

export function subscribeClientes(
  gestoriaId: string,
  callback:   (clientes: Cliente[]) => void
): Unsubscribe {
  const q = query(
    clientesCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('apellido'),
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export function subscribeCliente(
  id:       string,
  callback: (c: Cliente | null) => void
): Unsubscribe {
  return onSnapshot(clienteDoc(id), snap =>
    callback(snap.exists() ? { ...snap.data(), id: snap.id } : null)
  )
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const snap = await getDoc(clienteDoc(id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id }
}

// ─── READ (paginado — para ClientesPage) ─────────────────────────────────────
// 1 read por página en lugar de todos los documentos al montar.

/** Total de clientes del tenant — usa agregación (costo: 1 lectura). */
export async function getClientesCount(gestoriaId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(clientesCol, where('gestoriaId', '==', gestoriaId))
  )
  return snap.data().count
}

/**
 * Una página de clientes ordenada por apellido.
 * `cursor` es el último DocumentSnapshot de la página anterior (null = página 1).
 *
 * Requiere índice compuesto en Firestore: gestoriaId ASC, apellido ASC
 * (Firebase lo sugiere automáticamente en la consola al ejecutar la query.)
 */
export async function getClientesPagina(
  gestoriaId: string,
  cursor:     QueryDocumentSnapshot<Cliente> | null,
  pageSize =  PAGE_SIZE_CLIENTES,
): Promise<{
  clientes: Cliente[]
  lastDoc:  QueryDocumentSnapshot<Cliente> | null
}> {
  const constraints: QueryConstraint[] = [
    where('gestoriaId', '==', gestoriaId),
    orderBy('apellido'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ]
  const snap = await getDocs(query(clientesCol, ...constraints))
  return {
    clientes: snap.docs.map(d => ({ ...d.data(), id: d.id })),
    lastDoc:  (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot<Cliente> | null,
  }
}

/**
 * Todos los clientes del tenant — sin límite.
 * Usarlo solo para:
 *   - Búsqueda de texto (carga bajo demanda al escribir)
 *   - Exportación a Excel (carga bajo demanda al hacer click)
 */
export async function getClientesTodos(gestoriaId: string): Promise<Cliente[]> {
  const snap = await getDocs(
    query(clientesCol, where('gestoriaId', '==', gestoriaId), orderBy('apellido'))
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type ClienteInput = Omit<Cliente, 'id' | 'creadoEn' | 'creadoPor' | 'vehiculosIds'>

export async function crearCliente(
  data:      ClienteInput,
  creadoPor: string,
): Promise<string> {
  const ref = await addDoc(clientesCol, {
    ...data,
    vehiculosIds: [],
    creadoPor,
    creadoEn: serverTimestamp(),
  } as any)
  return ref.id
}

export async function actualizarCliente(
  id:   string,
  data: Partial<ClienteInput>,
): Promise<void> {
  await updateDoc(clienteDoc(id), { ...data })
}

export async function eliminarCliente(id: string): Promise<void> {
  await deleteDoc(clienteDoc(id))
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

/** Busca un cliente por DNI dentro del tenant. Usado en validación Zod del form. */
export async function buscarClientePorDNI(
  dni:        string,
  gestoriaId: string,
): Promise<Cliente | null> {
  const q    = query(clientesCol, where('gestoriaId', '==', gestoriaId), where('dni', '==', dni.trim()))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id }
}