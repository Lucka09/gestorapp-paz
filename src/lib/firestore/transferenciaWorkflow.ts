// src/lib/firestore/transferenciaWorkflow.ts
import {
  doc, setDoc, collection, addDoc, updateDoc, getDoc,
  onSnapshot, serverTimestamp, Timestamp,
  type CollectionReference, type Unsubscribe,
} from 'firebase/firestore'
import { db }                   from '@/lib/firebase'
import { crearNotificacion }    from '@/lib/firestore/notificaciones'
import { cambiarEstadoTramite } from '@/lib/firestore/tramites'
import type {
  TransferenciaWorkflow,
  TrfPaso1Data, TrfPaso2Data, TrfPaso3Data,
  TrfPaso4Data, TrfPaso5Data, TrfPaso6Data, TrfPaso7Data,
  EstadoTransferenciaWorkflow, SeguimientoEntrada,
} from '@/transferencia_types'
import { getConfigPlazos } from '@/transferencia_types'

// ─── REFS ─────────────────────────────────────────────────────────────────────

const workflowsCol = collection(db, 'transferenciaWorkflow') as CollectionReference<TransferenciaWorkflow>
const workflowDoc  = (id: string) => doc(workflowsCol, id)

export { workflowDoc as transferenciaWorkflowDoc }

// ─── CREAR ────────────────────────────────────────────────────────────────────

export async function crearTransferenciaWorkflow(
  tramiteId:         string,
  gestoriaId:        string,
  iniciadoPor:       string,
  iniciadoPorNombre: string,
): Promise<void> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (snap.exists()) return  // idempotente

  await setDoc(workflowDoc(tramiteId), {
    id:                tramiteId,
    tramiteId,
    gestoriaId,
    pasoActual:        1,
    estadoWorkflow:    'carga_datos',
    iniciadoPor,
    iniciadoPorNombre,
    creadoEn:          serverTimestamp() as unknown as Timestamp,
    actualizadoEn:     serverTimestamp() as unknown as Timestamp,
  } as any)
}

// ─── SUBSCRIBE ────────────────────────────────────────────────────────────────

export function subscribeTransferenciaWorkflow(
  tramiteId: string,
  onData:    (wf: TransferenciaWorkflow | null) => void,
  onError?:  (err: any) => void,
): Unsubscribe {
  return onSnapshot(
    workflowDoc(tramiteId),
    snap => onData(snap.exists() ? { ...snap.data(), id: snap.id } as TransferenciaWorkflow : null),
    onError,
  )
}

// ─── PASO 1 ───────────────────────────────────────────────────────────────────

export async function confirmarTrfPaso1(
  tramiteId: string,
  data: Omit<TrfPaso1Data, 'creadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso1:          { ...data, creadoEn: Timestamp.now() },
    pasoActual:     2,
    estadoWorkflow: 'carga_documentos',
    actualizadoEn:  serverTimestamp(),
  })
  await cambiarEstadoTramite(tramiteId, 'en_proceso')
}

// ─── PASO 2 ───────────────────────────────────────────────────────────────────

export async function confirmarTrfPaso2(
  tramiteId: string,
  gestoriaId: string,
  data: Omit<TrfPaso2Data, 'completadoEn'>,
  gestorId?:    string,
  gestorNombre?: string,
): Promise<void> {
  const extra: Record<string, unknown> = {}
  if (gestorId) {
    extra.gestorId     = gestorId
    extra.gestorNombre = gestorNombre
    // Notificar al gestor que tiene un nuevo trámite para gestionar
    await crearNotificacion({
      destinatarioId: gestorId,
      gestoriaId,
      tipo:       'estado_tramite',
      titulo:     '📋 Nueva transferencia asignada',
      mensaje:    `Tenés una transferencia lista para gestionar en el registro.`,
      tramiteId,
    })
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso2:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     3,
    estadoWorkflow: 'en_registro',
    ...extra,
    actualizadoEn:  serverTimestamp(),
  })
}

// ─── PASO 3 ───────────────────────────────────────────────────────────────────

export async function confirmarTrfPaso3(
  tramiteId:       string,
  gestoriaId:      string,
  data:            Omit<TrfPaso3Data, 'completadoEn'>,
  futuraRadicacion: boolean,
): Promise<void> {
  const config   = getConfigPlazos(futuraRadicacion)
  const proxAlerta = new Date()
  proxAlerta.setDate(proxAlerta.getDate() + config.frecuenciaAlertaDias)

  await updateDoc(workflowDoc(tramiteId), {
    paso3:                    { ...data, completadoEn: Timestamp.now() },
    pasoActual:               4,
    estadoWorkflow:           'seguimiento',
    recordatorioSeguimiento:  Timestamp.fromDate(proxAlerta),
    actualizadoEn:            serverTimestamp(),
  })
}

// ─── PASO 4 — Agregar entrada de seguimiento ──────────────────────────────────

export async function agregarSeguimientoTrf(
  tramiteId:       string,
  entrada:         Omit<SeguimientoEntrada, 'fecha'>,
  futuraRadicacion: boolean,
): Promise<void> {
  const wfSnap = await getDoc(workflowDoc(tramiteId))
  if (!wfSnap.exists()) return
  const wf = wfSnap.data() as TransferenciaWorkflow
  const seguimientos = [...(wf.paso4?.seguimientos ?? []), {
    ...entrada,
    fecha: Timestamp.now(),
  }]

  // Calcular próxima alerta
  const config     = getConfigPlazos(futuraRadicacion)
  const proxAlerta = new Date()
  proxAlerta.setDate(proxAlerta.getDate() + config.frecuenciaAlertaDias)

  await updateDoc(workflowDoc(tramiteId), {
    'paso4.seguimientos':        seguimientos,
    recordatorioSeguimiento:     Timestamp.fromDate(proxAlerta),
    actualizadoEn:               serverTimestamp(),
  })
}

// ─── PASO 4 — Confirmar recibo listo (avanzar a paso 5) ───────────────────────

export async function confirmarTrfPaso4(
  tramiteId: string,
  data: Omit<TrfPaso4Data, 'completadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso4:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     5,
    estadoWorkflow: 'recibo_listo',
    actualizadoEn:  serverTimestamp(),
  })
}

// ─── PASO 5 — Turno de retiro ─────────────────────────────────────────────────

export async function confirmarTrfPaso5(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<TrfPaso5Data, 'completadoEn' | 'alerta24hs' | 'alertaDiaTurno'>,
): Promise<void> {
  // Calcular timestamps de alerta
  const fechaTurno = new Date(data.fechaTurnoRetiro + 'T' + (data.horaTurnoRetiro ?? '08:00'))
  const alerta24hs = new Date(fechaTurno)
  alerta24hs.setDate(alerta24hs.getDate() - 1)
  const alertaDiaTurno = new Date(data.fechaTurnoRetiro + 'T08:00:00')

  await updateDoc(workflowDoc(tramiteId), {
    paso5: {
      ...data,
      alerta24hs:      Timestamp.fromDate(alerta24hs),
      alertaDiaTurno:  Timestamp.fromDate(alertaDiaTurno),
      completadoEn:    Timestamp.now(),
    },
    recordatorio24hs:     Timestamp.fromDate(alerta24hs),
    recordatorioDiaTurno: Timestamp.fromDate(alertaDiaTurno),
    actualizadoEn:        serverTimestamp(),
  })

  // Notificar al gestor de inmediato con el detalle del turno
  if ((await getDoc(workflowDoc(tramiteId))).data()?.gestorId) {
    const gestorId = (await getDoc(workflowDoc(tramiteId))).data()!.gestorId!
    await crearNotificacion({
      destinatarioId: gestorId,
      gestoriaId,
      tipo:       'estado_tramite',
      titulo:     '📅 Turno de retiro agendado',
      mensaje:    `Turno el ${data.fechaTurnoRetiro}${data.horaTurnoRetiro ? ' a las ' + data.horaTurnoRetiro : ''} en ${data.registroNombre}. Recibirás un recordatorio 24hs antes.`,
      tramiteId,
    })
  }
}

// ─── PASO 6 — Confirmación de retiro con geo ──────────────────────────────────

export async function confirmarTrfPaso6(
  tramiteId: string,
  data: Omit<TrfPaso6Data, 'completadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso6:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     7,
    estadoWorkflow: 'retiro_confirmado',
    actualizadoEn:  serverTimestamp(),
  })
}

// ─── PASO 7 — Entrega al cliente y cierre ─────────────────────────────────────

export async function confirmarTrfPaso7(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<TrfPaso7Data, 'completadoEn'>,
  iniciadoPor: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso7:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     8,
    estadoWorkflow: 'completado',
    actualizadoEn:  serverTimestamp(),
  })
  await cambiarEstadoTramite(tramiteId, 'completado', {
    completadoPor:       data.completadoPor,
    completadoPorNombre: data.completadoPorNombre,
  })
  // Notificar al que inició el trámite que está completado
  await crearNotificacion({
    destinatarioId: iniciadoPor,
    gestoriaId,
    tipo:       'estado_tramite',
    titulo:     '✅ Transferencia completada',
    mensaje:    'El trámite fue entregado al cliente y archivado exitosamente.',
    tramiteId,
  })
}

// ─── ASIGNAR GESTOR ───────────────────────────────────────────────────────────

export async function asignarGestorTransferencia(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    gestorId,
    gestorNombre,
    actualizadoEn: serverTimestamp(),
  })
}