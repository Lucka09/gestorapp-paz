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
import type { Cliente, OrigenCanal } from '@/types'
import { registrarActividad } from './audit'
import { emitirEventoSilencioso, type ActorInfo } from './eventos'
import { crearEvento } from '@/types'

export const PAGE_SIZE_CLIENTES = 25

// ─── READ (realtime) ──────────────────────────────────────────────────────────

export function subscribeClientes(
  gestoriaId: string,
  callback:   (clientes: Cliente[]) => void
): Unsubscribe {
  const q = query(
    clientesCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('apellido'),
    limit(500),
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

export async function getClientesCount(gestoriaId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(clientesCol, where('gestoriaId', '==', gestoriaId))
  )
  return snap.data().count
}

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

export async function getClientesTodos(gestoriaId: string): Promise<Cliente[]> {
  const snap = await getDocs(
    query(clientesCol, where('gestoriaId', '==', gestoriaId), orderBy('apellido'))
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

// ─── READ por canal — para métricas de referidos (M7) ─────────────────────────

/**
 * Todos los clientes que llegaron por un canal comercial específico.
 * Usado por useReferidosMetricas para agrupar por concesionaria/agencia/etc.
 */
export async function getClientesPorCanal(
  gestoriaId: string,
  canal:      OrigenCanal,
): Promise<Cliente[]> {
  const snap = await getDocs(
    query(
      clientesCol,
      where('gestoriaId',  '==', gestoriaId),
      where('origenCanal', '==', canal),
      orderBy('apellido'),
    )
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

/**
 * Todos los clientes con origenCanal definido — para el módulo de métricas.
 */
export async function getClientesConOrigen(gestoriaId: string): Promise<Cliente[]> {
  const snap = await getDocs(
    query(
      clientesCol,
      where('gestoriaId', '==', gestoriaId),
      orderBy('apellido'),
    )
  )
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter(c => !!(c as any).origenCanal)
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type ClienteInput = Omit<Cliente, 'id' | 'creadoEn' | 'creadoPor' | 'vehiculosIds'>

export async function crearCliente(
  data:      ClienteInput,
  creadoPor: string,
): Promise<string> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v
  }
  const ref = await addDoc(clientesCol, {
    ...clean,
    vehiculosIds: [],
    creadoPor,
    creadoEn: serverTimestamp(),
  } as any)

  // Evento fire-and-forget — los datos ya están en memoria
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   data.gestoriaId,
    tipo:         'cliente.creado',
    entidad:      'cliente',
    entidadId:    ref.id,
    entidadLabel: `${data.apellido}, ${data.nombre}`,
    actorId:      creadoPor,
    actorTipo:    'usuario',
    payload:      { telefono: data.telefono, origenCanal: data.origenCanal },
    resumen:      `Nuevo cliente ${data.apellido}, ${data.nombre}`,
  }))

  return ref.id
}

export async function actualizarCliente(
  id:    string,
  data:  Partial<ClienteInput>,
  actor?: ActorInfo,
): Promise<void> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v
  }
  await updateDoc(clienteDoc(id), clean)

  // Evento fire-and-forget — necesita leer el doc para gestoriaId y label
  void (async () => {
    try {
      const snap = await getDoc(clienteDoc(id))
      if (!snap.exists()) return
      const c = { ...snap.data(), id: snap.id } as Cliente
      emitirEventoSilencioso(crearEvento({
        gestoriaId:   c.gestoriaId,
        tipo:         'cliente.actualizado',
        entidad:      'cliente',
        entidadId:    id,
        entidadLabel: `${c.apellido}, ${c.nombre}`,
        actorId:      actor?.id ?? 'system',
        actorNombre:  actor?.nombre,
        actorTipo:    actor?.id ? 'usuario' : 'sistema',
        payload:      { campos: Object.keys(clean) },
        resumen:      `Cliente ${c.apellido}, ${c.nombre} actualizado`,
      }))
    } catch (e) {
      console.warn('[clientes] No se pudo emitir evento:', e)
    }
  })()
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

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
export async function eliminarCliente(id: string): Promise<void> {
  await deleteDoc(clienteDoc(id))
}