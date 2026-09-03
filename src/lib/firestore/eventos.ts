/**
 * EVENTOS — Capa de acceso a datos
 * ─────────────────────────────────────────────────────────────
 * Colección append-only. Nunca se actualiza ni se borra desde el cliente.
 * Cada write importante del sistema llama a emitirEvento().
 */
import {
  addDoc, collection, limit, onSnapshot, orderBy, query,
  serverTimestamp, where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EntidadEvento, Evento, EventoInput, TipoEvento } from '@/types'

const COL = 'eventos'

/**
 * Emite un evento al stream. Usa serverTimestamp() para garantizar
 * orden consistente aunque varios clientes escriban en paralelo.
 *
 * Uso:
 *   await emitirEvento(crearEvento({
 *     gestoriaId, tipo: 'lead.creado', entidad: 'lead', entidadId: lead.id,
 *     actorId: user.uid, actorNombre: user.nombre,
 *     payload: { canal: 'web' },
 *     resumen: `Nuevo lead de ${lead.nombre} vía web`,
 *   }))
 *
 * @returns id del documento creado
 */
/** Firestore no acepta `undefined`. Lo sacamos recursivo sin romper Timestamps. */
function clean(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) return value.map(clean)
  if (typeof value === 'object') {
    const ctor = Object.getPrototypeOf(value)?.constructor
    if (ctor !== Object) return value // Timestamp, FieldValue, GeoPoint…
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v)
      if (c !== undefined) out[k] = c
    }
    return out
  }
  return value
}

export async function emitirEvento(input: EventoInput): Promise<string> {
  const ref = await addDoc(
    collection(db, COL),
    clean({ ...input, timestamp: serverTimestamp() }) as Record<string, unknown>
  )
  return ref.id
}
/**
 * Info del actor que realiza la acción.
 * Se comparte entre todos los services para enriquecer eventos.
 */
export interface ActorInfo {
  id: string
  nombre?: string
  rol?: string
}

/**
 * Emite un evento sin bloquear el flujo y sin lanzar errores.
 * Si falla, loguea un warning pero no interrumpe la operación principal.
 *
 * Uso: emitirEventoSilencioso(crearEvento({ ... }))
 */
export function emitirEventoSilencioso(input: EventoInput): void {
  emitirEvento(input).catch(err => {
    console.warn('[eventos] No se pudo emitir evento:', err)
  })
}

export async function emitirPresupuestoEnviado(params: {
  gestoriaId: string
  consultaId: string
  clienteId?: string
  leadId?: string
  prospectoId?: string
  dominio: string
  montoTotal: number
  enviadoPor: { uid: string; nombre: string }
}): Promise<void> {
  emitirEventoSilencioso({
    gestoriaId: params.gestoriaId,
    tipo: 'presupuesto.enviado',
    entidad: 'consulta',
    entidadId: params.consultaId,
    entidadLabel: `Presupuesto ${params.dominio}`,
    actor: { id: params.enviadoPor.uid, nombre: params.enviadoPor.nombre, tipo: 'usuario' },
    payload: {
      clienteId: params.clienteId,
      leadId: params.leadId,
      prospectoId: params.prospectoId,
      dominio: params.dominio,
      montoTotal: params.montoTotal,
      canal: 'whatsapp',
    },
    resumen: `Presupuesto de multas enviado para ${params.dominio} ($${params.montoTotal.toLocaleString('es-AR')})`,
  })
}

export async function emitirTurnoConfirmado(params: {
  gestoriaId: string
  turnoId: string
  clienteId: string
  fecha: string
  hora: string
  tipoTramite: string
  confirmadoPor: { uid: string; nombre: string }
}): Promise<void> {
  emitirEventoSilencioso({
    gestoriaId: params.gestoriaId,
    tipo: 'turno.confirmado',
    entidad: 'turno',
    entidadId: params.turnoId,
    entidadLabel: `Turno ${params.fecha} ${params.hora}`,
    actor: { id: params.confirmadoPor.uid, nombre: params.confirmadoPor.nombre, tipo: 'usuario' },
    payload: {
      clienteId: params.clienteId,
      fecha: params.fecha,
      hora: params.hora,
      tipoTramite: params.tipoTramite,
    },
    resumen: `Turno confirmado para ${params.fecha} a las ${params.hora} hs`,
  })
}

export function subscribeEventos(
  gestoriaId: string,
  callback: (eventos: Evento[]) => void,
  limite = 100,
): Unsubscribe {
  const eventosQuery = query(
    collection(db, COL),
    where('gestoriaId', '==', gestoriaId),
    orderBy('timestamp', 'desc'),
    limit(limite),
  )
  return onSnapshot(eventosQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Evento))
  })
}

export function subscribeEventosEntidad(
  entidad: EntidadEvento,
  entidadId: string,
  callback: (eventos: Evento[]) => void,
  limite = 50,
): Unsubscribe {
  const eventosQuery = query(
    collection(db, COL),
    where('entidad', '==', entidad),
    where('entidadId', '==', entidadId),
    orderBy('timestamp', 'desc'),
    limit(limite),
  )
  return onSnapshot(eventosQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Evento))
  })
}

export function subscribeEventosPorTipo(
  gestoriaId: string,
  tipo: TipoEvento,
  callback: (eventos: Evento[]) => void,
  limite = 50,
): Unsubscribe {
  const eventosQuery = query(
    collection(db, COL),
    where('gestoriaId', '==', gestoriaId),
    where('tipo', '==', tipo),
    orderBy('timestamp', 'desc'),
    limit(limite),
  )
  return onSnapshot(eventosQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Evento))
  })
}