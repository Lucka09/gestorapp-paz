import {
  getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, doc,
  onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { clientesCol, clienteDoc } from './collections'
import type { Cliente } from '@/types'

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeClientes(
  callback: (clientes: Cliente[]) => void
): Unsubscribe {
  const q = query(clientesCol, orderBy('apellido'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  })
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const snap = await getDoc(clienteDoc(id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id }
}

export function subscribeCliente(
  id: string,
  callback: (c: Cliente | null) => void
): Unsubscribe {
  return onSnapshot(clienteDoc(id), (snap) => {
    callback(snap.exists() ? { ...snap.data(), id: snap.id } : null)
  })
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type ClienteInput = Omit<Cliente, 'id' | 'creadoEn' | 'creadoPor' | 'vehiculosIds'>

export async function crearCliente(
  data: ClienteInput,
  creadoPor: string
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
  id: string,
  data: Partial<ClienteInput>
): Promise<void> {
  await updateDoc(clienteDoc(id), { ...data })
}

export async function eliminarCliente(id: string): Promise<void> {
  await deleteDoc(clienteDoc(id))
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

export async function buscarClientePorDNI(dni: string): Promise<Cliente | null> {
  const q = query(clientesCol, where('dni', '==', dni.trim()))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id }
}
