import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, getDocs,
  serverTimestamp, Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Vencimiento, TipoVencimiento, EstadoVencimiento } from '@/types'

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

export const vencimientosCol = collection(db, 'vencimientos')
export const vencimientoDoc  = (id: string) => doc(db, 'vencimientos', id)

// ─── ESTADO CALCULADO ─────────────────────────────────────────────────────────

export function calcularEstado(v: Vencimiento): EstadoVencimiento {
  if (!v.fechaVencimiento) return 'sin_datos'
  const fecha = v.fechaVencimiento?.toDate?.() ?? new Date(v.fechaVencimiento)
  const diff  = Math.floor((fecha.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0)   return 'vencido'
  if (diff <= 30) return 'por_vencer'
  return 'vigente'
}

export function diasRestantes(v: Vencimiento): number {
  if (!v.fechaVencimiento) return Infinity
  const fecha = v.fechaVencimiento?.toDate?.() ?? new Date(v.fechaVencimiento)
  return Math.floor((fecha.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ─── SUSCRIPCIONES ────────────────────────────────────────────────────────────

// Todos los vencimientos del tenant (para alertas globales del admin)
export function subscribeVencimientos(
  gestoriaId: string,
  callback:   (data: Vencimiento[]) => void
): Unsubscribe {
  const q = query(
    vencimientosCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('fechaVencimiento', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vencimiento))
  )
}

// Vencimientos de un vehículo
export function subscribeVencimientosVehiculo(
  vehiculoId: string,
  gestoriaId: string,
  callback:   (data: Vencimiento[]) => void
): Unsubscribe {
  const q = query(
    vencimientosCol,
    where('gestoriaId', '==', gestoriaId),
    where('vehiculoId', '==', vehiculoId),
    orderBy('fechaVencimiento', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vencimiento))
  )
}

// Vencimientos de un cliente (todos sus vehículos)
export function subscribeVencimientosCliente(
  clienteId:  string,
  gestoriaId: string,
  callback:   (data: Vencimiento[]) => void
): Unsubscribe {
  const q = query(
    vencimientosCol,
    where('gestoriaId', '==', gestoriaId),
    where('clienteId',  '==', clienteId),
    orderBy('fechaVencimiento', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vencimiento))
  )
}

// ─── VENCIMIENTOS PRÓXIMOS (para panel de alertas) ────────────────────────────

export async function getVencimientosProximos(
  gestoriaId: string,
  dias = 60
): Promise<Vencimiento[]> {
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0)
  const hasta = new Date(hoy); hasta.setDate(hoy.getDate() + dias)

  const snap = await getDocs(
    query(
      vencimientosCol,
      where('gestoriaId',        '==', gestoriaId),
      where('fechaVencimiento',  '<=', Timestamp.fromDate(hasta)),
      orderBy('fechaVencimiento', 'asc')
    )
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vencimiento)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface NuevoVencimientoInput {
  gestoriaId:       string   // requerido — tenant scope
  vehiculoId:       string
  clienteId:        string
  patente:          string
  tipo:             TipoVencimiento
  fechaVencimiento: Date
  compania?:        string
  nroPóliza?:       string
  notas?:           string
}

export async function crearVencimiento(input: NuevoVencimientoInput): Promise<string> {
  const ref = await addDoc(vencimientosCol, {
    ...input,
    fechaVencimiento: Timestamp.fromDate(input.fechaVencimiento),
    alertado:         false,
    creadoEn:         serverTimestamp(),
    actualizadoEn:    serverTimestamp(),
  })
  return ref.id
}

export async function actualizarVencimiento(
  id:   string,
  data: Partial<Omit<Vencimiento, 'id' | 'creadoEn'>>
): Promise<void> {
  const update: Record<string, unknown> = { ...data, actualizadoEn: serverTimestamp() }
  if (data.fechaVencimiento instanceof Date) {
    update.fechaVencimiento = Timestamp.fromDate(data.fechaVencimiento)
  }
  await updateDoc(vencimientoDoc(id), update)
}

export async function eliminarVencimiento(id: string): Promise<void> {
  await deleteDoc(vencimientoDoc(id))
}

// ─── METADATOS DE ESTADO ──────────────────────────────────────────────────────

export const ESTADO_VENC_CONFIG: Record<EstadoVencimiento, {
  label:  string
  color:  string
  bg:     string
  border: string
  dot:    string
}> = {
  vigente:    { label: 'Vigente',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  por_vencer: { label: 'Por vencer', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400'   },
  vencido:    { label: 'Vencido',    color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500'     },
  sin_datos:  { label: 'Sin datos',  color: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-400'    },
}