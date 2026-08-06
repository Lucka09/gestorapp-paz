import {
  addDoc, updateDoc, deleteDoc, query,
  orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe, collection, doc,
  where, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { TipoTramite } from '@/types'
import { emitirEvento } from '@/lib/firestore/eventos'
import { crearEvento } from '@/types'

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

/**
 * Info del actor que realiza la acción.
 * Es opcional en todas las funciones para mantener compatibilidad con código
 * existente. Cuando se provee, el evento queda completo y alimentará mejor
 * los dashboards y la IA.
 */
export interface ActorInfo {
  id: string
  nombre?: string
  rol?: string
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

// ─── HELPER: EMISIÓN DE EVENTOS (fire-and-forget) ─────────────────────────────

/**
 * Emite un evento sin bloquear el flujo principal.
 * Si falla, loguea pero no lanza — el write del prospecto ya se hizo.
 * Esto evita que un fallo de analytics rompa la UX del usuario.
 */
function emitirSilencioso(
  gestoriaId: string,
  input: Parameters<typeof emitirEvento>[0]
): void {
  emitirEvento(input).catch(err => {
    console.warn('[pipeline] No se pudo emitir evento:', err)
  })
}

/**
 * Construye el input estándar de evento de pipeline.
 * El `gestoriaId` se obtiene leyendo el documento (fuente única de verdad).
 */
async function buildEventoBase(
  prospectoId: string,
  tipo: 'prospecto.creado' | 'prospecto.etapa_cambiada' | 'prospecto.cerrado_ganado' | 'prospecto.cerrado_perdido',
  actor?: ActorInfo,
  payload: Record<string, unknown> = {}
) {
  const snap = await getDoc(prospectoDoc(prospectoId))
  if (!snap.exists()) return null
  const data = snap.data() as Prospecto & { gestoriaId: string }
  return crearEvento({
    gestoriaId: data.gestoriaId,
    tipo,
    entidad: 'prospecto',
    entidadId: prospectoId,
    entidadLabel: `${data.apellido}, ${data.nombre}`,
    actorId: actor?.id ?? data.creadoPor ?? 'system',
    actorNombre: actor?.nombre,
    actorTipo: actor?.id ? 'usuario' : 'sistema',
    payload,
    resumen: buildResumen(tipo, data, payload),
  })
}

function buildResumen(
  tipo: string,
  p: Prospecto,
  payload: Record<string, unknown>
): string {
  const nombre = `${p.apellido}, ${p.nombre}`
  switch (tipo) {
    case 'prospecto.creado':
      return `Nuevo prospecto ${nombre} (${p.tipoTramite})`
    case 'prospecto.etapa_cambiada':
      return `${nombre} pasó de "${payload.etapaAnterior}" a "${payload.etapaNueva}"`
    case 'prospecto.cerrado_ganado':
      return `${nombre} cerró por $${payload.monto ?? p.montoCierre}`
    case 'prospecto.cerrado_perdido':
      return `${nombre} marcado como perdido`
    default:
      return nombre
  }
}

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeProspectos(
  gestoriaId: string,
  callback:   (items: Prospecto[]) => void
): Unsubscribe {
  // Filtrar por gestoriaId para cumplir con Security Rules (docDeMiGestoria).
  const q = query(
    prospectosCOL,
    where('gestoriaId', '==', gestoriaId),
    orderBy('orden'),
    orderBy('creadoEn', 'desc')
  )
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

/**
 * Crea un prospecto y emite evento `prospecto.creado`.
 * El parámetro `actor` es opcional: si se provee, el evento registra quién lo creó.
 */
export async function crearProspecto(
  data:      Omit<ProspectoInput, 'creadoPor' | 'orden' | 'tareas' | 'etiquetas'>,
  creadoPor: string,
  actor?: ActorInfo
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

  // Evento fire-and-forget
  void (async () => {
    const input = await buildEventoBase(
      ref.id,
      'prospecto.creado',
      actor,
      {
        tipoTramite: data.tipoTramite,
        etapa: data.etapa,
        telefono: data.telefono,
      }
    )
    if (input) emitirSilencioso(input.gestoriaId, input)
  })()

  return ref.id
}

/**
 * Mueve un prospecto a otra etapa y emite:
 *   • `prospecto.etapa_cambiada` (siempre)
 *   • `prospecto.cerrado_ganado` si va a 'cerrado'
 *   • `prospecto.cerrado_perdido` si va a 'perdido'
 *
 * Lee la etapa anterior desde Firestore para garantizar consistencia.
 */
export async function moverEtapa(
  id:        string,
  etapa:     EtapaPipeline,
  actor?: ActorInfo
): Promise<void> {
  // 1. Leer el estado actual (fuente única de verdad)
  const snap = await getDoc(prospectoDoc(id))
  if (!snap.exists()) throw new Error(`Prospecto ${id} no existe`)
  const actual = snap.data() as Prospecto & { gestoriaId: string }
  const etapaAnterior = actual.etapa

  // 2. Write
  await updateDoc(prospectoDoc(id), {
    etapa,
    actualizadoEn: serverTimestamp(),
  })

  // 3. Eventos (no bloqueantes)
  void (async () => {
    // Etapa cambió
    const evEtapa = await buildEventoBase(id, 'prospecto.etapa_cambiada', actor, {
      etapaAnterior,
      etapaNueva: etapa,
    })
    if (evEtapa) emitirSilencioso(evEtapa.gestoriaId, evEtapa)

    // Cierre ganado
    if (etapa === 'cerrado' && etapaAnterior !== 'cerrado') {
      const evGanado = await buildEventoBase(id, 'prospecto.cerrado_ganado', actor, {
        monto: actual.montoCierre,
        formaPago: actual.formaPago,
        fechaCierre: actual.fechaCierre,
      })
      if (evGanado) emitirSilencioso(evGanado.gestoriaId, evGanado)
    }

    // Cierre perdido
    if (etapa === 'perdido' && etapaAnterior !== 'perdido') {
      const evPerdido = await buildEventoBase(id, 'prospecto.cerrado_perdido', actor)
      if (evPerdido) emitirSilencioso(evPerdido.gestoriaId, evPerdido)
    }
  })()
}

/**
 * Actualiza campos arbitrarios de un prospecto.
 * Detecta cambios a 'cerrado' o 'perdido' para emitir el evento correspondiente.
 */
export async function actualizarProspecto(
  id:   string,
  data: Partial<Omit<Prospecto, 'id' | 'creadoEn' | 'creadoPor'>>,
  actor?: ActorInfo
): Promise<void> {
  // Leer estado previo para detectar cierres
  const snap = await getDoc(prospectoDoc(id))
  const prev = snap.exists() ? (snap.data() as Prospecto & { gestoriaId: string }) : null

  await updateDoc(prospectoDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })

  // Solo emitir si hubo cambio real de etapa a estado final
  void (async () => {
    if (!prev || !data.etapa) return

    if (data.etapa === 'cerrado' && prev.etapa !== 'cerrado') {
      const ev = await buildEventoBase(id, 'prospecto.cerrado_ganado', actor, {
        monto: data.montoCierre ?? prev.montoCierre,
        formaPago: data.formaPago ?? prev.formaPago,
      })
      if (ev) emitirSilencioso(ev.gestoriaId, ev)
    } else if (data.etapa === 'perdido' && prev.etapa !== 'perdido') {
      const ev = await buildEventoBase(id, 'prospecto.cerrado_perdido', actor)
      if (ev) emitirSilencioso(ev.gestoriaId, ev)
    }
  })()
}

export async function eliminarProspecto(id: string): Promise<void> {
  await deleteDoc(prospectoDoc(id))
  // No se emite evento: la eliminación ya queda en audit_log.
  // Si querés un evento `prospecto.eliminado` en /eventos, agregarlo acá.
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