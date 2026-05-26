import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, writeBatch,
  getDocs, limit, setDoc, increment,
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
const mensajeDoc        = (convId: string, id: string) => doc(mensajesCol(convId), id)

// ─── SUBSCRIBE CONVERSACIONES ─────────────────────────────────────────────────

export function subscribeConversaciones(
  gestoriaId: string,
  callback:   (items: ConversacionWA[]) => void,
  soloActivas = true,
  onError?:   (err: Error) => void,
): Unsubscribe {
  const estados: EstadoConversacion[] = soloActivas
    ? ['nueva', 'en_atencion']
    : ['nueva', 'en_atencion', 'resuelta', 'archivada']

  const q = query(
    conversacionesCol,
    where('gestoriaId',       '==', gestoriaId),
    where('estado',           'in', estados),
    orderBy('ultimaActividad','desc'),
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    err  => {
      console.error('[conversacionesWA] Error en subscription:', err.code, err.message)
      onError?.(err)
    },
  )
}

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
// La Cloud Function escribe el mensaje entrante; el frontend escribe el saliente
// directamente y luego la CF confirma el estado vía status webhook.

export async function guardarMensajeSaliente(
  conversacionId: string,
  gestoriaId:     string,
  texto:          string,
  enviadoPor:     string,
  waMessageId:    string,       // lo devuelve la CF tras llamar a Meta
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
  // Actualizar preview de la conversación
  await updateDoc(conversacionDoc(conversacionId), {
    ultimoMensaje:   texto,
    ultimaActividad: serverTimestamp(),
  })
  return ref.id
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