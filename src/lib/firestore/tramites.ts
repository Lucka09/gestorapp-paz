import {
  getDoc, addDoc, updateDoc, query, where,
  orderBy, serverTimestamp, onSnapshot,
  type Unsubscribe, arrayUnion, limit,
} from 'firebase/firestore'
import { tramitesCol, tramiteDoc, vehiculoDoc, clienteDoc, userDoc } from './collections'
import { generarNumeroTramite } from '@/utils'
import { notificarCambioEstado } from './notificaciones'
import type { Tramite, EstadoTramite, TipoTramite } from '@/types'

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeTramites(
  callback: (tramites: Tramite[]) => void
): Unsubscribe {
  const q = query(tramitesCol, orderBy('creadoEn', 'desc'))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export function subscribeTramitesPorCliente(
  clienteId: string,
  callback:  (tramites: Tramite[]) => void
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

export function subscribeTramite(
  id:       string,
  callback: (t: Tramite | null) => void
): Unsubscribe {
  return onSnapshot(tramiteDoc(id), snap =>
    callback(snap.exists() ? { ...snap.data(), id: snap.id } : null)
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type TramiteInput = {
  tipo:                  TipoTramite
  clienteId:             string
  vehiculoId:            string
  patente:               string
  descripcion:           string
  observacionesInternas: string
  honorarios:            number
  asignadoA:             string | null
}

export async function crearTramite(
  data:      TramiteInput,
  creadoPor: string
): Promise<string> {
  const numero = generarNumeroTramite()
  const ref = await addDoc(tramitesCol, {
    ...data,
    numero,
    estado:           'pendiente',
    documentos:       [],
    historialEstados: [],
    pagado:           false,
    fechaPago:        null,
    turnoId:          null,
    creadoPor,
    creadoEn:         serverTimestamp(),
    actualizadoEn:    serverTimestamp(),
  } as any)

  // Vincular al vehículo
  const vRef  = vehiculoDoc(data.vehiculoId)
  const vSnap = await getDoc(vRef)
  if (vSnap.exists()) {
    const ids: string[] = vSnap.data().tramitesIds ?? []
    await updateDoc(vRef, { tramitesIds: [...ids, ref.id] })
  }

  return ref.id
}

export async function cambiarEstado(
  id:              string,
  nuevoEstado:     EstadoTramite,
  nota:            string,
  cambiadoPor:     string,
  estadoAnterior:  EstadoTramite
): Promise<void> {
  // 1. Actualizar el trámite
  await updateDoc(tramiteDoc(id), {
    estado:        nuevoEstado,
    actualizadoEn: serverTimestamp(),
    historialEstados: arrayUnion({
      estadoAnterior,
      estadoNuevo:   nuevoEstado,
      cambiadoPor,
      fecha:         new Date(),
      nota,
    }),
  })

  // 2. Obtener el trámite para saber a quién notificar
  const tSnap = await getDoc(tramiteDoc(id))
  if (!tSnap.exists()) return
  const tramite = tSnap.data() as Tramite

  // 3. Buscar el userId del cliente
  const cSnap = await getDoc(clienteDoc(tramite.clienteId))
  if (!cSnap.exists()) return
  const clienteData = cSnap.data()
  const destinatarioId = clienteData.userId

  if (!destinatarioId) return   // cliente sin acceso al portal, no notificar

  // 4. Crear notificación automática
  await notificarCambioEstado({
    destinatarioId,
    tramiteId: id,
    numero:    tramite.numero,
    tipo:      tramite.tipo,
    patente:   tramite.patente,
    estadoNuevo: nuevoEstado,
    nota,
  })
}

export async function actualizarTramite(
  id:   string,
  data: Partial<Pick<Tramite,
    'descripcion' | 'observacionesInternas' |
    'honorarios'  | 'pagado' | 'asignadoA'
  >>
): Promise<void> {
  await updateDoc(tramiteDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

export async function marcarPagado(
  id:     string,
  pagado: boolean
): Promise<void> {
  await updateDoc(tramiteDoc(id), {
    pagado,
    fechaPago:     pagado ? serverTimestamp() : null,
    actualizadoEn: serverTimestamp(),
  })
}
