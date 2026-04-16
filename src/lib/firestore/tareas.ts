import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import { registrarActividad } from './audit'
import type { Tarea, PrioridadTarea, EstadoTarea, Rol } from '@/types'

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

export const tareasCol = collection(db, 'tareas')
export const tareaDoc  = (id: string) => doc(db, 'tareas', id)

// ─── TIPOS DE INPUT ───────────────────────────────────────────────────────────

export interface NuevaTareaInput {
  gestoriaId:     string   // requerido — tenant scope
  titulo:         string
  descripcion?:   string
  prioridad:      PrioridadTarea
  asignadoA:      string
  asignadoNombre: string
  vencimiento?:   Date
  recordatorio?:  Date
  clienteId?:     string
  clienteNombre?: string
  tramiteId?:     string
  tramiteLabel?:  string
}

// ─── SUSCRIPCIONES ────────────────────────────────────────────────────────────

// Todas las tareas activas del tenant (admin/propietario)
export function subscribeTareas(
  gestoriaId: string,
  callback:   (tareas: Tarea[]) => void
): Unsubscribe {
  const q = query(
    tareasCol,
    where('gestoriaId', '==', gestoriaId),
    where('estado',     'in', ['pendiente', 'en_progreso']),
    orderBy('vencimiento', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tarea))
  )
}

// Tareas de un usuario específico dentro del tenant
export function subscribeTareasUsuario(
  uid:        string,
  gestoriaId: string,
  callback:   (tareas: Tarea[]) => void
): Unsubscribe {
  const q = query(
    tareasCol,
    where('gestoriaId', '==', gestoriaId),
    where('asignadoA',  '==', uid),
    where('estado',     'in', ['pendiente', 'en_progreso']),
    orderBy('vencimiento', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tarea))
  )
}

// Tareas de una entidad (cliente o trámite) dentro del tenant
export function subscribeTareasEntidad(
  campo:      'clienteId' | 'tramiteId',
  id:         string,
  gestoriaId: string,
  callback:   (tareas: Tarea[]) => void
): Unsubscribe {
  const q = query(
    tareasCol,
    where('gestoriaId', '==', gestoriaId),
    where(campo,        '==', id),
    orderBy('creadoEn', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tarea))
  )
}

// ─── CREAR ────────────────────────────────────────────────────────────────────

export async function crearTarea(
  input: NuevaTareaInput,
  ctx:   { uid: string; nombre: string; rol: Rol }
): Promise<string> {
  const { Timestamp } = await import('firebase/firestore')

  const ref = await addDoc(tareasCol, {
    gestoriaId:      input.gestoriaId,
    titulo:          input.titulo,
    descripcion:     input.descripcion    ?? '',
    prioridad:       input.prioridad,
    estado:          'pendiente' as EstadoTarea,
    asignadoA:       input.asignadoA,
    asignadoNombre:  input.asignadoNombre,
    creadoPor:       ctx.uid,
    creadoPorNombre: ctx.nombre,
    clienteId:       input.clienteId     ?? null,
    clienteNombre:   input.clienteNombre ?? null,
    tramiteId:       input.tramiteId     ?? null,
    tramiteLabel:    input.tramiteLabel   ?? null,
    vencimiento:     input.vencimiento
      ? Timestamp.fromDate(input.vencimiento) : null,
    recordatorio:    input.recordatorio
      ? Timestamp.fromDate(input.recordatorio) : null,
    completadaEn:    null,
    creadoEn:        serverTimestamp(),
    actualizadoEn:   serverTimestamp(),
  })

  await registrarActividad({
    accion:        'crear',
    entidad:       'tramite',
    entidadId:     ref.id,
    entidadLabel:  `Tarea: ${input.titulo}`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    gestoriaId:    input.gestoriaId,
  })

  return ref.id
}

// ─── ACTUALIZAR ───────────────────────────────────────────────────────────────

export async function actualizarTarea(
  id:   string,
  data: Partial<Omit<Tarea, 'id' | 'creadoEn' | 'creadoPor'>>
): Promise<void> {
  await updateDoc(tareaDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── COMPLETAR ────────────────────────────────────────────────────────────────

export async function completarTarea(
  id:  string,
  _ctx?: { uid: string; nombre: string }
): Promise<void> {
  await updateDoc(tareaDoc(id), {
    estado:        'completada' as EstadoTarea,
    completadaEn:  serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

// ─── CAMBIAR ESTADO ───────────────────────────────────────────────────────────

export async function cambiarEstadoTarea(
  id:     string,
  estado: EstadoTarea
): Promise<void> {
  await updateDoc(tareaDoc(id), {
    estado,
    completadaEn:  estado === 'completada' ? serverTimestamp() : null,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── ELIMINAR ─────────────────────────────────────────────────────────────────

export async function eliminarTarea(id: string): Promise<void> {
  await deleteDoc(tareaDoc(id))
}

// ─── METADATOS ────────────────────────────────────────────────────────────────

export const PRIORIDAD_DOT: Record<string, string> = {
  baja:    'bg-gray-400',
  normal:  'bg-blue-500',
  alta:    'bg-orange-500',
  urgente: 'bg-red-500',
}

export const PRIORIDAD_BORDER: Record<string, string> = {
  baja:    'border-l-gray-300',
  normal:  'border-l-blue-400',
  alta:    'border-l-orange-400',
  urgente: 'border-l-red-500',
}

export function estaVencida(tarea: Tarea): boolean {
  if (!tarea.vencimiento) return false
  const v = tarea.vencimiento?.toDate?.()
  return v ? v < new Date() : false
}

export function venceHoy(tarea: Tarea): boolean {
  if (!tarea.vencimiento) return false
  const v = tarea.vencimiento?.toDate?.()
  if (!v) return false
  return v.toDateString() === new Date().toDateString()
}

export function diasParaVencer(tarea: Tarea): number | null {
  if (!tarea.vencimiento) return null
  const v = tarea.vencimiento?.toDate?.()
  if (!v) return null
  return Math.floor((v.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}