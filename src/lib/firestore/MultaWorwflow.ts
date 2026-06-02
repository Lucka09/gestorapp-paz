// src/lib/firestore/MultaWorwflow.ts  (nombre original preservado)
import {
  doc, setDoc, collection, addDoc, updateDoc, getDoc,
  serverTimestamp, Timestamp, arrayUnion,
  type CollectionReference,
} from 'firebase/firestore'
import { db }           from '@/lib/firebase'
import { crearNotificacion } from '@/lib/firestore/notificaciones'
import { cambiarEstadoTramite } from '@/lib/firestore/tramites'
import type {
  MultaWorkflow, MultaPaso1Data, MultaPaso2Data,
  MultaPaso3Data, MultaReboteResolucion,
  MultaPaso4Data, MultaPaso5Data, MultaPaso6Data, MultaPaso7Data,
  EstadoMultaWorkflow, RegistroPago,
} from '@/multa_types'
 
// ─── REFS ─────────────────────────────────────────────────────────────────────
 
const workflowsCol = collection(db, 'multaWorkflow') as CollectionReference<MultaWorkflow>
const workflowDoc  = (id: string) => doc(workflowsCol, id)
 
// ─── CREAR WORKFLOW ───────────────────────────────────────────────────────────
 
export async function crearMultaWorkflow(
  tramiteId:   string,
  gestoriaId:  string,
  iniciadoPor: string,
  iniciadoPorNombre: string,
): Promise<void> {
  const ref = workflowDoc(tramiteId)
  const snap = await getDoc(ref)
  if (snap.exists()) return  // idempotente
 
  await setDoc(workflowDoc(tramiteId), {
    id:                tramiteId,
    tramiteId,
    gestoriaId,
    pasoActual:        1,
    estadoWorkflow:    'recepcion',
    iniciadoPor,
    iniciadoPorNombre,
    creadoEn:          serverTimestamp() as unknown as Timestamp,
    actualizadoEn:     serverTimestamp() as unknown as Timestamp,
  } as any)
}
 
// ─── HELPERS DE FECHA ─────────────────────────────────────────────────────────

function calcularAlertasFechaTramite(fechaStr: string): {
  alertaFechaTramite48h: ReturnType<typeof Timestamp.fromDate>,
  alertaFechaTramite24h: ReturnType<typeof Timestamp.fromDate>,
} {
  // fechaStr: 'YYYY-MM-DD' — tomamos las 09:00 de ese día (hora Argentina)
  const fechaBase = new Date(fechaStr + 'T09:00:00-03:00')
  const alerta48h = new Date(fechaBase)
  alerta48h.setHours(alerta48h.getHours() - 48)
  const alerta24h = new Date(fechaBase)
  alerta24h.setHours(alerta24h.getHours() - 24)
  return {
    alertaFechaTramite48h: Timestamp.fromDate(alerta48h),
    alertaFechaTramite24h: Timestamp.fromDate(alerta24h),
  }
}

// ─── PASO 1: Recepción ────────────────────────────────────────────────────────
 
export async function confirmarPaso1Multa(
  tramiteId: string,
  data: Omit<MultaPaso1Data, 'completadoEn'>,
): Promise<void> {
  const extras: Record<string, unknown> = {
    fechaTramiteActual: data.fechaTramite,
  }
  if (data.fechaTramite) {
    const alertas = calcularAlertasFechaTramite(data.fechaTramite)
    extras['alertaFechaTramite48h'] = alertas.alertaFechaTramite48h
    extras['alertaFechaTramite24h'] = alertas.alertaFechaTramite24h
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso1:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     2,
    estadoWorkflow: 'recepcion',
    actualizadoEn:  serverTimestamp(),
    ...extras,
  })
}

// ─── EDITAR FECHA DEL TRÁMITE (con auditoría completa) ───────────────────────

export async function editarFechaTramiteMulta(
  tramiteId:      string,
  nuevaFecha:     string,    // YYYY-MM-DD
  modificadoPor:  string,
  modificadoPorNombre: string,
  nota?:          string,
): Promise<void> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (!snap.exists()) throw new Error('Workflow no encontrado')
  const wf = snap.data() as MultaWorkflow

  const valorAnterior = wf.paso1?.fechaTramite ?? wf.fechaTramiteActual ?? '—'
  const entradaHistorial = {
    valorAnterior,
    valorNuevo:       nuevaFecha,
    modificadoPor,
    modificadoPorNombre,
    modificadoEn:     Timestamp.now(),
    ...(nota ? { nota } : {}),
  }

  const alertas = calcularAlertasFechaTramite(nuevaFecha)

  await updateDoc(workflowDoc(tramiteId), {
    'paso1.fechaTramite':      nuevaFecha,
    fechaTramiteActual:        nuevaFecha,
    alertaFechaTramite48h:     alertas.alertaFechaTramite48h,
    alertaFechaTramite24h:     alertas.alertaFechaTramite24h,
    historialFechaTramite:     arrayUnion(entradaHistorial),
    actualizadoEn:             serverTimestamp(),
  })
}
 
// ─── PASO 2: Documentación + Honorarios ──────────────────────────────────────
 
export async function confirmarPaso2Multa(
  tramiteId: string,
  data: Omit<MultaPaso2Data, 'completadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso2:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     3,
    estadoWorkflow: 'en_revision',
    actualizadoEn:  serverTimestamp(),
  })
}
 
// ─── PASO 3: Pre-revisión Admin ───────────────────────────────────────────────
 
export async function confirmarPreRevision(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<MultaPaso3Data, 'completadoEn'>,
): Promise<void> {
  let estadoWorkflow: EstadoMultaWorkflow = 'en_gestion'
  const extra: Record<string, unknown>    = {}
 
  if (data.resultado === 'rebotado') {
    estadoWorkflow = 'rebotado'
    // Notificar al asesor que inició el trámite
    if (data.rebotadoAUid) {
      await crearNotificacion({
        destinatarioId: data.rebotadoAUid,
        gestoriaId,
        tipo:       'estado_tramite',
        titulo:     '⚠️ Trámite de multa rebotado',
        mensaje:    `El Admin rebotó el trámite de multa. Motivo: ${data.motivoRebote ?? 'Ver detalle'}`,
        tramiteId,
      })
    }
  } else if (data.resultado === 'mesa_ayuda') {
    estadoWorkflow = 'en_espera_mesa'
    // Calcular fecha límite según el plazo elegido
    if (data.plazoEspera) {
      const horas = data.plazoEspera === '24hs' ? 24 : data.plazoEspera === '48hs' ? 48 : 72
      const limite = new Date()
      limite.setHours(limite.getHours() + horas)
      extra['recordatorioMesaAyuda'] = Timestamp.fromDate(limite)
      extra['paso3.fechaLimiteEspera'] = Timestamp.fromDate(limite)
    }
  }
 
  // Eliminar campos undefined antes de guardar — Firestore no los acepta
  const paso3Clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...data, completadoEn: Timestamp.now() })) {
    if (v !== undefined) paso3Clean[k] = v
  }
 
  await updateDoc(workflowDoc(tramiteId), {
    paso3:         paso3Clean,
    pasoActual:    data.resultado === 'ok' ? 4 : 3,
    estadoWorkflow,
    ...extra,
    actualizadoEn: serverTimestamp(),
  })
}
 
// ─── REBOTE: Asesor resuelve y reenvía ───────────────────────────────────────
 
export async function resolverRebote(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<MultaReboteResolucion, 'resueltoEn'>,
  adminId?:   string,
  adminNombre?: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    reboteResolucion: { ...data, resueltoEn: Timestamp.now() },
    pasoActual:       3,
    estadoWorkflow:   'en_revision',
    actualizadoEn:    serverTimestamp(),
  })
 
  // Notificar al admin que el asesor resolvió el rebote
  if (adminId) {
    await crearNotificacion({
      destinatarioId: adminId,
      gestoriaId,
      tipo:       'estado_tramite',
      titulo:     '✅ Rebote resuelto por el asesor',
      mensaje:    `El asesor resolvió la documentación solicitada. El trámite está listo para re-revisión.`,
      tramiteId,
    })
  }
}
 
// ─── MESA DE AYUDA: Resolver espera y continuar ───────────────────────────────
 
export async function resolverEsperaMesaAyuda(
  tramiteId: string,
  observacion?: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    'paso3.observacion': observacion,
    pasoActual:          4,
    estadoWorkflow:      'en_gestion',
    recordatorioMesaAyuda: null,
    actualizadoEn:       serverTimestamp(),
  })
}
 
// ─── PASO 4: Revisión profunda ────────────────────────────────────────────────
 
export async function confirmarPaso4Multa(
  tramiteId: string,
  data: Omit<MultaPaso4Data, 'completadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso4:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     5,
    estadoWorkflow: 'borradores_listos',
    actualizadoEn:  serverTimestamp(),
  })
}
 
// ─── PASO 5: Carga del descargo ───────────────────────────────────────────────
 
export async function confirmarPaso5Multa(
  tramiteId: string,
  data: Omit<MultaPaso5Data, 'completadoEn'>,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    paso5:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     6,
    estadoWorkflow: 'descargo_subido',
    actualizadoEn:  serverTimestamp(),
  })
}
 
// ─── PASO 6: SUATS / Resolución ───────────────────────────────────────────────
 
export async function confirmarPaso6Multa(
  tramiteId: string,
  data: Omit<MultaPaso6Data, 'completadoEn'>,
): Promise<void> {
  const estadoWorkflow: EstadoMultaWorkflow = data.suatsGenerado
    ? 'suats_generado'
    : 'resuelto_sin_suats'
 
  await updateDoc(workflowDoc(tramiteId), {
    paso6:          { ...data, completadoEn: Timestamp.now() },
    pasoActual:     7,
    estadoWorkflow,
    actualizadoEn:  serverTimestamp(),
  })
}
 
// ─── PASO 7: Cierre ───────────────────────────────────────────────────────────
 
export async function confirmarPaso7Multa(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<MultaPaso7Data, 'completadoEn'>,
): Promise<void> {
  // Limpiar campos undefined — Firestore rechaza undefined
  const paso7Clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...data, completadoEn: Timestamp.now() })) {
    if (v !== undefined) paso7Clean[k] = v
  }

  // 1. Cerrar el workflow de multa
  await updateDoc(workflowDoc(tramiteId), {
    paso7:          paso7Clean,
    pasoActual:     8,
    estadoWorkflow: 'completado',
    actualizadoEn:  serverTimestamp(),
  })

  // 2. Marcar el trámite principal como entregado — desaparece de Torre de Control
  //    y no genera más alertas de demora ni "sin movimiento".
  await cambiarEstadoTramite(tramiteId, 'entregado', {
    completadoPor:       data.completadoPor,
    completadoPorNombre: data.completadoPorNombre,
  })
}
 
// ─── AGREGAR PAGO POST-PASO2 ─────────────────────────────────────────────────
// Permite registrar pagos en cualquier momento del workflow sin rehacer el paso 2.
 
export async function agregarPagoMulta(
  tramiteId:  string,
  pago:       RegistroPago,
  pagosPrevios: RegistroPago[],
): Promise<void> {
  const nuevoTotal = [...pagosPrevios, pago].reduce((s, p) => s + p.monto, 0)
 
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': arrayUnion(pago),
    'paso2.montoTotal':     nuevoTotal,
    'paso2.pagoConfirmado': true,
    actualizadoEn:          serverTimestamp(),
  })
}
 
// ─── ASIGNAR ADMIN ────────────────────────────────────────────────────────────
 
export async function asignarAdminMulta(
  tramiteId:          string,
  asignadoAdminId:    string,
  asignadoAdminNombre: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    asignadoAdminId,
    asignadoAdminNombre,
    actualizadoEn: serverTimestamp(),
  })
}
 
// ─── SUBSCRIBE ────────────────────────────────────────────────────────────────
 
export { workflowDoc as multaWorkflowDoc }