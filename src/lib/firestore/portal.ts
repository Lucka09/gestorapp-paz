import {
  query, where, orderBy, limit,
  onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { tramitesCol, turnosCol, notificacionesCol, notificacionDoc } from './collections'
import { updateDoc, serverTimestamp } from 'firebase/firestore'
import type { Tramite, Turno, Notificacion } from '@/types'

// ─── TRÁMITES DEL CLIENTE ─────────────────────────────────────────────────────

export function subscribeTramitesCliente(
  clienteId: string,
  callback: (tramites: Tramite[]) => void
): Unsubscribe {
  const q = query(
    tramitesCol,
    where('clienteId', '==', clienteId),
    orderBy('creadoEn', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// ─── TURNOS DEL CLIENTE ───────────────────────────────────────────────────────

export function subscribeTurnosCliente(
  clienteId: string,
  callback: (turnos: Turno[]) => void
): Unsubscribe {
  const q = query(
    turnosCol,
    where('clienteId', '==', clienteId),
    orderBy('fecha', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// ─── NOTIFICACIONES DEL CLIENTE ───────────────────────────────────────────────

export function subscribeNotificacionesCliente(
  uid: string,
  callback: (notifs: Notificacion[]) => void
): Unsubscribe {
  const q = query(
    notificacionesCol,
    where('destinatarioId', '==', uid),
    orderBy('creadoEn', 'desc'),
    limit(20)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  await updateDoc(notificacionDoc(id), { leida: true })
}

export async function marcarTodasLeidas(notifs: Notificacion[]): Promise<void> {
  await Promise.all(
    notifs.filter(n => !n.leida).map(n => marcarNotificacionLeida(n.id))
  )
}
