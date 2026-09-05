import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, serverTimestamp,
  getDocs, limit, writeBatch,
  type Unsubscribe, type CollectionReference,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type {
  ConversacionWA, MensajeWA,
  EstadoConversacion, MetricasBandeja,
} from '@/wa_types'

// ─── COLECCIONES ──────────────────────────────────────────────────────────────

const conversacionesCol = collection(db, 'conversacionesWA') as CollectionReference<ConversacionWA>
const mensajesCol       = (convId: string) =>
  collection(db, 'conversacionesWA', convId, 'mensajes') as CollectionReference<MensajeWA>

const conversacionDoc   = (id: string) => doc(conversacionesCol, id)

// ─── SCOPE DE VISIBILIDAD ─────────────────────────────────────────────────────
// 'todas'        → roles de control (CEO / admin_gral / admin / superadmin)
// 'propiasYPool' → asesor_comercial / vendedor: ve lo suyo + lo sin asignar
export type ScopeBandeja =
  | { tipo: 'todas' }
  | { tipo: 'propiasYPool'; uid: string }

// ─── SUBSCRIBE CONVERSACIONES ─────────────────────────────────────────────────
// El scope decide la query. Para 'propiasYPool' se filtra por asignadoA en la
// query (requerido para que las reglas de Firestore no rechacen la suscripción)
// y el estado se filtra en cliente para no encadenar dos operadores 'in'.

export function subscribeConversaciones(
  gestoriaId: string,
  callback:   (items: ConversacionWA[]) => void,
  soloActivas = true,
  onError?:   (err: Error) => void,
  scope: ScopeBandeja = { tipo: 'todas' },
): Unsubscribe {
  const estados: EstadoConversacion[] = soloActivas
    ? ['nueva', 'en_atencion']
    : ['nueva', 'en_atencion', 'resuelta', 'archivada']

  const onErr = (err: any) => {
    console.error('[conversacionesWA] Error en subscription:', err.code, err.message)
    onError?.(err)
  }

  if (scope.tipo === 'propiasYPool') {
    const q = query(
      conversacionesCol,
      where('gestoriaId', '==', gestoriaId),
      where('asignadoA',  'in', [scope.uid, '']),   // lo propio + el pool
      orderBy('ultimaActividad', 'desc'),
    )
    return onSnapshot(
      q,
      snap => callback(
        snap.docs
          .map(d => ({ ...d.data(), id: d.id }))
          .filter(c => estados.includes(c.estado)),   // estado filtrado en cliente
      ),
      onErr,
    )
  }

  // scope 'todas'
  const q = query(
    conversacionesCol,
    where('gestoriaId',       '==', gestoriaId),
    where('estado',           'in', estados),
    orderBy('ultimaActividad','desc'),
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    onErr,
  )
}

// Mantengo esta variante por compatibilidad (algún consumidor puntual la usa).
export function subscribeConversacionesByAgente(
  gestoriaId: string,
  agenteUid:  string,
  callback:   (items: ConversacionWA[]) => void,
  onError?:   (err: Error) => void,
): Unsubscribe {
  const q = query(
    conversacionesCol,
    where('gestoriaId', '==', gestoriaId),
    where('asignadoA',  '==', agenteUid),
    where('estado',     'in', ['nueva', 'en_atencion']),
    orderBy('ultimaActividad', 'desc'),
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    err  => {
      console.error('[conversacionesWA] Error en subscription by agente:', err.code, err.message)
      onError?.(err)
    },
  )
}

// ─── SUBSCRIBE MENSAJES ───────────────────────────────────────────────────────

export function subscribeMensajes(
  conversacionId: string,
  callback:       (mensajes: MensajeWA[]) => void,
  onError?:       (err: Error) => void,
): Unsubscribe {
  const q = query(mensajesCol(conversacionId), orderBy('timestamp', 'asc'))
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    err  => {
      console.error('[mensajesWA] Error en subscription:', err.code, err.message)
      onError?.(err)
    },
  )
}

// ─── MARCAR LEÍDOS ────────────────────────────────────────────────────────────

export async function marcarConversacionLeida(conversacionId: string): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), {
    noLeidos: 0,
  })
}

// ─── CAMBIAR ESTADO ───────────────────────────────────────────────────────────

export async function cambiarEstadoConversacion(
  conversacionId: string,
  estado:         EstadoConversacion,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), { estado })
}

// ─── ASIGNAR AGENTE ───────────────────────────────────────────────────────────
// Sirve tanto para autoasignarse (uid propio) como para que un rol de control
// reasigne a otro. El aislamiento de quién puede hacer qué lo imponen las reglas.

export async function asignarAgente(
  conversacionId: string,
  agenteUid:      string,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), {
    asignadoA: agenteUid,
    estado:    'en_atencion' as EstadoConversacion,
  })
}

// ─── VINCULAR CLIENTE / PROSPECTO ────────────────────────────────────────────

export async function vincularCliente(
  conversacionId: string,
  clienteId:      string,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), { clienteId })
}

export async function vincularProspecto(
  conversacionId: string,
  prospectoId:    string,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), { prospectoId })
}

export async function desvincularEntidad(conversacionId: string): Promise<void> {
  const { deleteField } = await import('firebase/firestore')
  await updateDoc(conversacionDoc(conversacionId), {
    clienteId:   deleteField(),
    prospectoId: deleteField(),
  })
}

// ─── CONSULTA SUGERIDA (clasificación de multas) ─────────────────────────────
// Marca la sugerencia como confirmada (con el id de la consulta creada) o
// descartada. El objeto consultaSugerida lo escribe el webhook al detectar
// keyword/patente; acá solo cambiamos su estado desde la Bandeja.

export async function actualizarConsultaSugerida(
  conversacionId: string,
  estado:         'confirmada' | 'descartada',
  consultaId?:    string,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), {
    'consultaSugerida.estado': estado,
    ...(consultaId ? { 'consultaSugerida.consultaId': consultaId } : {}),
  })
}

// ─── EDITAR NOMBRE DEL CONTACTO ──────────────────────────────────────────────

export async function actualizarNombreContacto(
  conversacionId: string,
  nombre:         string,
): Promise<void> {
  await updateDoc(conversacionDoc(conversacionId), { nombre })
}

// ─── BUSCAR CONVERSACION POR TELÉFONO ────────────────────────────────────────

export async function getConversacionByTelefono(
  gestoriaId: string,
  telefono:   string,
): Promise<ConversacionWA | null> {
  const q = query(
    conversacionesCol,
    where('gestoriaId', '==', gestoriaId),
    where('telefono',   '==', telefono),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id }
}

// ─── GUARDAR MENSAJE SALIENTE (optimista desde el frontend) ──────────────────

export async function guardarMensajeSaliente(
  conversacionId: string,
  gestoriaId:     string,
  texto:          string,
  enviadoPor:     string,
  waMessageId:    string,
): Promise<string> {
  const ref = await addDoc(mensajesCol(conversacionId), { id: '' as string,
    gestoriaId,
    waMessageId,
    direccion:  'saliente' as const,
    tipo:       'texto'    as const,
    texto,
    timestamp:  serverTimestamp(),
    estado:     'enviado'  as const,
    enviadoPor,
  })
  await updateDoc(conversacionDoc(conversacionId), {
    ultimoMensaje:   texto,
    ultimaActividad: serverTimestamp(),
  })
  return ref.id
}

// ─── REASIGNACIÓN MASIVA ──────────────────────────────────────────────────────
// "Pasar todos los chats de X a Y" — para cuando un secretario se va, cambia o
// es reemplazado. Client-side, mismas reglas que la reasignación individual.
// Dos where de igualdad (gestoriaId + asignadoA) → sin índice compuesto.
// Chunkea de a 400 (writeBatch admite hasta 500). Devuelve cuántos chats movió.
export async function reasignarChatsMasivo(
  gestoriaId: string,
  deUid:      string,
  aUid:       string,
  aNombre:    string,
): Promise<number> {
  if (!gestoriaId || !deUid || deUid === aUid) return 0

  const q = query(
    conversacionesCol,
    where('gestoriaId', '==', gestoriaId),
    where('asignadoA',  '==', deUid),
  )
  const snap = await getDocs(q)
  if (snap.empty) return 0

  const docs  = snap.docs
  const CHUNK = 400
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + CHUNK)) {
      batch.update(d.ref, {
        asignadoA:      aUid,
        asignadoNombre: aNombre,
        actualizadoEn:  serverTimestamp(),
      })
    }
    await batch.commit()
  }
  return docs.length
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

export function calcularMetricasBandeja(convs: ConversacionWA[]): MetricasBandeja {
  return {
    total:         convs.length,
    nuevas:        convs.filter(c => c.estado === 'nueva').length,
    enAtencion:    convs.filter(c => c.estado === 'en_atencion').length,
    resueltas:     convs.filter(c => c.estado === 'resuelta').length,
    sinAsignar:    convs.filter(c => !c.asignadoA).length,
    noLeidosTotal: convs.reduce((acc, c) => acc + (c.noLeidos ?? 0), 0),
  }
}