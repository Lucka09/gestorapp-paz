/**
 * EVENTOS — Capa de acceso a datos
 * ─────────────────────────────────────────────────────────────
 * Colección append-only. Nunca se actualiza ni se borra desde el cliente.
 * Cada write importante del sistema llama a emitirEvento().
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EventoInput } from '@/types'

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
function clean<T>(value: T): any {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) return value.map(clean)
  if (typeof value === 'object') {
    const ctor = (value as any).constructor
    if (ctor !== Object) return value // Timestamp, FieldValue, GeoPoint…
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
    clean({ ...input, timestamp: serverTimestamp() })   // ← clean()
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