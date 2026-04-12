import {
  addDoc, updateDoc, query, where,
  orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { notificacionesCol, notificacionDoc } from './collections'
import type { Notificacion, TipoNotificacion, EstadoTramite, TipoTramite } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS } from '@/types'

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeNotificaciones(
  uid: string,
  callback: (notifs: Notificacion[]) => void,
  maxItems = 30
): Unsubscribe {
  const q = query(
    notificacionesCol,
    where('destinatarioId', '==', uid),
    orderBy('creadoEn', 'desc'),
    limit(maxItems)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export function subscribeNoLeidas(
  uid: string,
  callback: (count: number) => void
): Unsubscribe {
  const q = query(
    notificacionesCol,
    where('destinatarioId', '==', uid),
    where('leida', '==', false)
  )
  return onSnapshot(q, snap => callback(snap.size))
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export async function crearNotificacion(data: {
  destinatarioId: string
  titulo:         string
  mensaje:        string
  tipo:           TipoNotificacion
  tramiteId?:     string | null
  turnoId?:       string | null
}): Promise<void> {
  await addDoc(notificacionesCol, {
    ...data,
    tramiteId: data.tramiteId ?? null,
    turnoId:   data.turnoId   ?? null,
    leida:     false,
    creadoEn:  serverTimestamp(),
  } as any)
}

export async function marcarLeida(id: string): Promise<void> {
  await updateDoc(notificacionDoc(id), { leida: true })
}

export async function marcarTodasLeidas(uid: string): Promise<void> {
  const q = query(
    notificacionesCol,
    where('destinatarioId', '==', uid),
    where('leida', '==', false)
  )
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { leida: true })))
}

// ─── NOTIFICACIONES AUTOMÁTICAS ───────────────────────────────────────────────
// Estas funciones se llaman desde los módulos de trámites y turnos

export async function notificarCambioEstado(params: {
  destinatarioId: string
  tramiteId:      string
  numero:         string
  tipo:           TipoTramite
  patente:        string
  estadoNuevo:    EstadoTramite
  nota?:          string
}): Promise<void> {
  const { destinatarioId, tramiteId, numero, tipo, patente, estadoNuevo, nota } = params

  const mensajes: Partial<Record<EstadoTramite, string>> = {
    en_proceso:              `Tu trámite está siendo procesado.`,
    documentacion_requerida: `Se requiere documentación adicional. Contactá a Gestoría Paz.`,
    en_organismo:            `Tu trámite está siendo gestionado en el organismo correspondiente.`,
    listo_para_retirar:      `¡Tu trámite está listo! Ya podés pasar a retirarlo.`,
    entregado:               `Trámite entregado correctamente. ¡Gracias por confiar en nosotros!`,
    cancelado:               `Tu trámite fue cancelado. Contactá a Gestoría Paz para más información.`,
  }

  const mensaje = mensajes[estadoNuevo]
  if (!mensaje) return   // No notificar todos los cambios (ej: 'pendiente' al crear)

  await crearNotificacion({
    destinatarioId,
    titulo:    `${TIPO_TRAMITE_LABELS[tipo]} · ${patente}`,
    mensaje:   nota ? `${mensaje} Nota: "${nota}"` : mensaje,
    tipo:      'estado_tramite',
    tramiteId,
  })
}

export async function notificarTurnoConfirmado(params: {
  destinatarioId: string
  turnoId:        string
  fecha:          string
  hora:           string
  tipoTramite:    TipoTramite
}): Promise<void> {
  await crearNotificacion({
    destinatarioId: params.destinatarioId,
    titulo:  '✅ Turno confirmado',
    mensaje: `Tu turno del ${params.fecha} a las ${params.hora} hs para ${TIPO_TRAMITE_LABELS[params.tipoTramite]} fue confirmado.`,
    tipo:    'turno',
    turnoId: params.turnoId,
  })
}

export async function notificarTurnoCancelado(params: {
  destinatarioId: string
  turnoId:        string
  fecha:          string
  motivo?:        string
}): Promise<void> {
  await crearNotificacion({
    destinatarioId: params.destinatarioId,
    titulo:  '❌ Turno cancelado',
    mensaje: params.motivo
      ? `Tu turno del ${params.fecha} fue cancelado. Motivo: ${params.motivo}`
      : `Tu turno del ${params.fecha} fue cancelado. Podés reservar uno nuevo desde el portal.`,
    tipo:    'turno',
    turnoId: params.turnoId,
  })
}

export async function notificarRecordatorioTurno(params: {
  destinatarioId: string
  turnoId:        string
  fecha:          string
  hora:           string
}): Promise<void> {
  await crearNotificacion({
    destinatarioId: params.destinatarioId,
    titulo:  '🔔 Recordatorio de turno',
    mensaje: `Mañana tenés turno a las ${params.hora} hs en Gestoría Paz. ¡No te olvides traer la documentación!`,
    tipo:    'turno',
    turnoId: params.turnoId,
  })
}

export async function notificarDocumentacionFaltante(params: {
  destinatarioId: string
  tramiteId:      string
  tipo:           TipoTramite
  patente:        string
  detalle?:       string
}): Promise<void> {
  await crearNotificacion({
    destinatarioId: params.destinatarioId,
    titulo:  `⚠️ Documentación requerida`,
    mensaje: params.detalle
      ? `Para continuar con tu ${TIPO_TRAMITE_LABELS[params.tipo]} (${params.patente}) necesitamos: ${params.detalle}`
      : `Necesitamos documentación adicional para continuar con tu ${TIPO_TRAMITE_LABELS[params.tipo]} (${params.patente}). Contactá a Gestoría Paz.`,
    tipo:      'documentacion',
    tramiteId: params.tramiteId,
  })
}
