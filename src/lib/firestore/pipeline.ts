import {
  addDoc, updateDoc, deleteDoc, query,
  orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe, collection, doc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { TipoTramite } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type EtapaPipeline =
  | 'nuevo'
  | 'contactado'
  | 'interesado'
  | 'presupuestado'
  | 'cerrado'
  | 'perdido'

export type ColorProspecto =
  | 'naranja'   // caliente — alta probabilidad
  | 'verde'     // confirmado / muy interesado
  | 'azul'      // en seguimiento
  | 'gris'      // frío / sin respuesta
  | 'rojo'      // en riesgo / problema

export type FormasPago = 'efectivo' | 'transferencia' | 'cheque' | 'mixto'

export interface Tarea {
  id:          string
  descripcion: string
  fechaAlerta: string   // ISO date string
  completada:  boolean
  creadaEn:    string
}

export interface Prospecto {
  id:           string
  // Datos personales
  nombre:       string
  apellido:     string
  telefono:     string
  email:        string
  localidad:    string
  // Pipeline
  etapa:        EtapaPipeline
  color:        ColorProspecto
  tipoTramite:  TipoTramite
  patente:      string
  descripcion:  string
  // Cierre (solo cuando etapa === 'cerrado')
  montoCierre:  number
  formaPago:    FormasPago | ''
  fechaCierre:  string
  // Tareas
  tareas:       Tarea[]
  // Difusión
  etiquetas:    string[]
  // Meta
  asignadoA:    string
  creadoPor:    string
  creadoEn:     any
  actualizadoEn: any
  orden:        number
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

export const ETAPAS: { key: EtapaPipeline; label: string; color: string; bg: string; border: string }[] = [
  { key: 'nuevo',        label: 'Nuevo',        color: 'text-gray-600',   bg: 'bg-gray-50',    border: 'border-gray-200'   },
  { key: 'contactado',   label: 'Contactado',   color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  { key: 'interesado',   label: 'Interesado',   color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
  { key: 'presupuestado',label: 'Presupuestado',color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  { key: 'cerrado',      label: 'Cerrado ✅',   color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  { key: 'perdido',      label: 'Perdido',      color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
]

export const COLOR_PROSPECTO: Record<ColorProspecto, { dot: string; label: string }> = {
  naranja: { dot: 'bg-orange-400', label: '🔥 Caliente'      },
  verde:   { dot: 'bg-green-400',  label: '✅ Muy interesado' },
  azul:    { dot: 'bg-blue-400',   label: '💬 En seguimiento' },
  gris:    { dot: 'bg-gray-400',   label: '❄️ Frío'           },
  rojo:    { dot: 'bg-red-500',    label: '⚠️ En riesgo'      },
}

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

const prospectosCOL = collection(db, 'prospectos')
const prospectoDoc  = (id: string) => doc(db, 'prospectos', id)

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeProspectos(
  callback: (items: Prospecto[]) => void
): Unsubscribe {
  const q = query(prospectosCOL, orderBy('orden'), orderBy('creadoEn', 'desc'))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Prospecto))
  )
}

export function subscribeProspectosPorEtapa(
  etapa:    EtapaPipeline,
  callback: (items: Prospecto[]) => void
): Unsubscribe {
  const q = query(prospectosCOL, where('etapa', '==', etapa), orderBy('orden'))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Prospecto))
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type ProspectoInput = Omit<Prospecto, 'id' | 'creadoEn' | 'actualizadoEn'>

export async function crearProspecto(
  data:      Omit<ProspectoInput, 'creadoPor' | 'orden' | 'tareas' | 'etiquetas'>,
  creadoPor: string
): Promise<string> {
  const ref = await addDoc(prospectosCOL, {
    ...data,
    tareas:       [],
    etiquetas:    [],
    creadoPor,
    orden:        Date.now(),
    creadoEn:     serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function moverEtapa(
  id:        string,
  etapa:     EtapaPipeline
): Promise<void> {
  await updateDoc(prospectoDoc(id), {
    etapa,
    actualizadoEn: serverTimestamp(),
  })
}

export async function actualizarProspecto(
  id:   string,
  data: Partial<Omit<Prospecto, 'id' | 'creadoEn' | 'creadoPor'>>
): Promise<void> {
  await updateDoc(prospectoDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarProspecto(id: string): Promise<void> {
  await deleteDoc(prospectoDoc(id))
}

// ─── TAREAS ───────────────────────────────────────────────────────────────────

export async function agregarTarea(
  prospectoId: string,
  tareas:      Tarea[],
  descripcion: string,
  fechaAlerta: string
): Promise<void> {
  const nueva: Tarea = {
    id:          crypto.randomUUID(),
    descripcion,
    fechaAlerta,
    completada:  false,
    creadaEn:    new Date().toISOString(),
  }
  await updateDoc(prospectoDoc(prospectoId), {
    tareas:       [...tareas, nueva],
    actualizadoEn: serverTimestamp(),
  })
}

export async function completarTarea(
  prospectoId: string,
  tareas:      Tarea[],
  tareaId:     string
): Promise<void> {
  const updated = tareas.map(t =>
    t.id === tareaId ? { ...t, completada: true } : t
  )
  await updateDoc(prospectoDoc(prospectoId), {
    tareas: updated,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarTarea(
  prospectoId: string,
  tareas:      Tarea[],
  tareaId:     string
): Promise<void> {
  await updateDoc(prospectoDoc(prospectoId), {
    tareas: tareas.filter(t => t.id !== tareaId),
    actualizadoEn: serverTimestamp(),
  })
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

export function calcularMetricasPipeline(prospectos: Prospecto[]) {
  const total      = prospectos.length
  const cerrados   = prospectos.filter(p => p.etapa === 'cerrado')
  const activos    = prospectos.filter(p => !['cerrado','perdido'].includes(p.etapa))
  const perdidos   = prospectos.filter(p => p.etapa === 'perdido')
  const ingresos   = cerrados.reduce((a, p) => a + (p.montoCierre || 0), 0)
  const conversion = total > 0 ? Math.round((cerrados.length / total) * 100) : 0

  // Tareas vencidas hoy
  const hoy = new Date().toISOString().split('T')[0]
  const tareasVencidas = prospectos.flatMap(p =>
    p.tareas.filter(t => !t.completada && t.fechaAlerta <= hoy)
  ).length

  return { total, cerrados: cerrados.length, activos: activos.length,
           perdidos: perdidos.length, ingresos, conversion, tareasVencidas }
}
