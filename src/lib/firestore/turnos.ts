import {
  addDoc, updateDoc, query, where,
  orderBy, serverTimestamp, onSnapshot,
  type Unsubscribe, Timestamp, getDoc,
} from 'firebase/firestore'
import { turnosCol, turnoDoc, clienteDoc } from './collections'
import {
  notificarTurnoConfirmado,
  notificarTurnoCancelado,
} from './notificaciones'
import type { Turno, EstadoTurno, TipoTramite } from '@/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeTurnos(callback: (turnos: Turno[]) => void): Unsubscribe {
  const q = query(turnosCol, orderBy('fecha', 'desc'))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export function subscribeTurnosPorFecha(
  fecha:    Date,
  callback: (turnos: Turno[]) => void
): Unsubscribe {
  const inicio = new Date(fecha); inicio.setHours(0, 0, 0, 0)
  const fin    = new Date(fecha); fin.setHours(23, 59, 59, 999)
  const q = query(
    turnosCol,
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export function subscribeTurnosPorCliente(
  clienteId: string,
  callback:  (turnos: Turno[]) => void
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

export function subscribeTurnosProximos(callback: (turnos: Turno[]) => void): Unsubscribe {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const q = query(
    turnosCol,
    where('fecha', '>=', Timestamp.fromDate(hoy)),
    where('estado', 'in', ['reservado', 'confirmado']),
    orderBy('fecha')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type TurnoInput = {
  clienteId:   string
  tramiteId:   string | null
  tipoTramite: TipoTramite
  fecha:       Date
  horaInicio:  string
  horaFin:     string
  notas:       string
}

export async function crearTurno(data: TurnoInput): Promise<string> {
  const ref = await addDoc(turnosCol, {
    ...data,
    fecha:             Timestamp.fromDate(data.fecha),
    estado:            'reservado',
    motivoCancelacion: '',
    creadoEn:          serverTimestamp(),
  } as any)
  return ref.id
}

// Helper para obtener userId del cliente
async function getDestinatario(clienteId: string): Promise<string | null> {
  const snap = await getDoc(clienteDoc(clienteId))
  return snap.exists() ? (snap.data().userId ?? null) : null
}

export async function confirmarTurno(id: string): Promise<void> {
  await updateDoc(turnoDoc(id), { estado: 'confirmado' })

  // Notificar al cliente
  const tSnap = await getDoc(turnoDoc(id))
  if (!tSnap.exists()) return
  const turno = tSnap.data() as Turno
  const destinatarioId = await getDestinatario(turno.clienteId)
  if (!destinatarioId) return

  const fechaStr = turno.fecha?.toDate
    ? format(turno.fecha.toDate(), "d 'de' MMMM", { locale: es })
    : ''

  await notificarTurnoConfirmado({
    destinatarioId,
    turnoId:     id,
    fecha:       fechaStr,
    hora:        turno.horaInicio,
    tipoTramite: turno.tipoTramite,
  })
}

export async function cancelarTurno(id: string, motivo: string): Promise<void> {
  await updateDoc(turnoDoc(id), {
    estado:            'cancelado',
    motivoCancelacion: motivo,
  })

  // Notificar al cliente
  const tSnap = await getDoc(turnoDoc(id))
  if (!tSnap.exists()) return
  const turno = tSnap.data() as Turno
  const destinatarioId = await getDestinatario(turno.clienteId)
  if (!destinatarioId) return

  const fechaStr = turno.fecha?.toDate
    ? format(turno.fecha.toDate(), "d 'de' MMMM", { locale: es })
    : ''

  await notificarTurnoCancelado({
    destinatarioId,
    turnoId: id,
    fecha:   fechaStr,
    motivo,
  })
}

export async function cumplirTurno(id: string): Promise<void> {
  await updateDoc(turnoDoc(id), { estado: 'cumplido' })
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function generarFranjas(
  horaInicio:  string,
  horaFin:     string,
  duracionMin = 30
): string[] {
  const franjas: string[] = []
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFin.split(':').map(Number)
  let total = hI * 60 + mI
  const fin = hF * 60 + mF
  while (total + duracionMin <= fin) {
    const h = String(Math.floor(total / 60)).padStart(2, '0')
    const m = String(total % 60).padStart(2, '0')
    franjas.push(`${h}:${m}`)
    total += duracionMin
  }
  return franjas
}

export function franjasOcupadas(turnos: Turno[]): string[] {
  return turnos.filter(t => t.estado !== 'cancelado').map(t => t.horaInicio)
}
