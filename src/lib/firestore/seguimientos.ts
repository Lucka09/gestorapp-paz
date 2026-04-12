import {
  addDoc, updateDoc, deleteDoc, query,
  where, orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe, Timestamp, getDocs, limit,
} from 'firebase/firestore'
import { collection, doc } from 'firebase/firestore'
import { db } from '../firebase'
import type { Cliente } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type TipoContacto = 'llamada' | 'whatsapp' | 'visita' | 'email'
export type EstadoSeguimiento = 'pendiente' | 'realizado' | 'reprogramado'

export interface Seguimiento {
  id:           string
  clienteId:    string
  fechaContacto: Timestamp
  tipo:         TipoContacto
  estado:       EstadoSeguimiento
  nota:         string
  resultado:    string
  creadoPor:    string
  creadoEn:     Timestamp
}

export interface ProximoContacto {
  clienteId:     string
  fecha:         Timestamp
  tipo:          TipoContacto
  motivo:        string
  actualizadoEn: Timestamp
}

export const TIPO_CONTACTO_LABELS: Record<TipoContacto, string> = {
  llamada:  'Llamada',
  whatsapp: 'WhatsApp',
  visita:   'Visita',
  email:    'Email',
}

export const TIPO_CONTACTO_ICONS: Record<TipoContacto, string> = {
  llamada:  '📞',
  whatsapp: '💬',
  visita:   '🤝',
  email:    '✉️',
}

// ─── COLECCIONES ──────────────────────────────────────────────────────────────

const seguimientosCol = (clienteId: string) =>
  collection(db, 'clientes', clienteId, 'seguimientos')

const seguimientoDoc = (clienteId: string, id: string) =>
  doc(db, 'clientes', clienteId, 'seguimientos', id)

const proximoContactoDoc = (clienteId: string) =>
  doc(db, 'clientes', clienteId, 'config', 'proximoContacto')

// ─── SEGUIMIENTOS (HISTORIAL) ─────────────────────────────────────────────────

export function subscribeSeguimientos(
  clienteId: string,
  callback:  (items: Seguimiento[]) => void
): Unsubscribe {
  const q = query(
    seguimientosCol(clienteId),
    orderBy('fechaContacto', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })) as Seguimiento[])
  )
}

export async function crearSeguimiento(
  clienteId: string,
  data: Omit<Seguimiento, 'id' | 'creadoEn'>,
): Promise<string> {
  const ref = await addDoc(seguimientosCol(clienteId), {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarSeguimiento(
  clienteId: string,
  id:        string,
  data:      Partial<Pick<Seguimiento, 'estado' | 'resultado' | 'nota'>>
): Promise<void> {
  await updateDoc(seguimientoDoc(clienteId, id), data)
}

export async function eliminarSeguimiento(
  clienteId: string,
  id:        string
): Promise<void> {
  await deleteDoc(seguimientoDoc(clienteId, id))
}

// ─── PRÓXIMO CONTACTO ─────────────────────────────────────────────────────────

export async function setProximoContacto(
  clienteId: string,
  data: Omit<ProximoContacto, 'clienteId' | 'actualizadoEn'>
): Promise<void> {
  const { setDoc } = await import('firebase/firestore')
  await setDoc(proximoContactoDoc(clienteId), {
    ...data,
    clienteId,
    actualizadoEn: serverTimestamp(),
  })
}

export async function getProximoContacto(
  clienteId: string
): Promise<ProximoContacto | null> {
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(proximoContactoDoc(clienteId))
  return snap.exists() ? snap.data() as ProximoContacto : null
}

export function subscribeProximoContacto(
  clienteId: string,
  callback:  (pc: ProximoContacto | null) => void
): Unsubscribe {
  return onSnapshot(proximoContactoDoc(clienteId), snap =>
    callback(snap.exists() ? snap.data() as ProximoContacto : null)
  )
}

// ─── QUERIES PARA DASHBOARD ───────────────────────────────────────────────────

// Clientes sin trámites activos — se resuelve client-side cruzando datos
export async function getClientesSinActividad(
  clientes: Cliente[],
  diasSinActividad = 30
): Promise<Cliente[]> {
  const { tramitesCol } = await import('./collections')
  const limite = new Date()
  limite.setDate(limite.getDate() - diasSinActividad)

  const resultado: Cliente[] = []

  for (const cliente of clientes) {
    const q = query(
      tramitesCol,
      where('clienteId', '==', cliente.id),
      where('actualizadoEn', '>=', Timestamp.fromDate(limite)),
      limit(1)
    )
    const snap = await getDocs(q)
    if (snap.empty) resultado.push(cliente)
  }

  return resultado
}

// Seguimientos vencidos o para hoy
export async function getContactosHoy(
  clienteIds: string[]
): Promise<Array<{ clienteId: string; pc: ProximoContacto }>> {
  const hoyFin = new Date()
  hoyFin.setHours(23, 59, 59, 999)
  const resultado: Array<{ clienteId: string; pc: ProximoContacto }> = []

  for (const clienteId of clienteIds) {
    const pc = await getProximoContacto(clienteId)
    if (pc && pc.fecha?.toDate?.() <= hoyFin) {
      resultado.push({ clienteId, pc })
    }
  }

  return resultado
}
