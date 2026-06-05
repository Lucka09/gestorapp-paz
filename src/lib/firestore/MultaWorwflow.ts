// src/lib/firestore/MultaWorwflow.ts  (nombre original preservado)
import {
  doc, setDoc, collection, addDoc, updateDoc, getDoc,
  serverTimestamp, Timestamp, arrayUnion,
  type CollectionReference,
} from 'firebase/firestore'
import { db }           from '@/lib/firebase'
import { crearNotificacion } from '@/lib/firestore/notificaciones'
import { cambiarEstadoTramite } from '@/lib/firestore/tramites'
import { tramitesCol } from '@/lib/firestore/collections'
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
  // No usamos getDoc previo porque:
  // 1) getDoc sobre un doc inexistente puede fallar con permission-denied si la
  //    regla de read usa resource.data (null cuando el doc no existe).
  // 2) setDoc con merge:false es idempotente para nuestro caso: si el doc ya
  //    existe en Firestore, el onSnapshot ya lo habrá cargado y useMultaWorkflow
  //    no llamará a esta función (guard: if (loading || workflow) return).
  //    Si por alguna race condition se llama dos veces, sobreescribe con los
  //    mismos datos de inicialización — inofensivo.
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

function calcularAlertasFechaTramite(fechaStr: string) {
  const fechaBase = new Date(fechaStr + 'T09:00:00-03:00')
  const alerta48h = new Date(fechaBase.getTime() - 48 * 60 * 60 * 1000)
  const alerta24h = new Date(fechaBase.getTime() - 24 * 60 * 60 * 1000)
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
    fechaTramiteActual: data.fechaTramite ?? null,
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

// ─── EDITAR FECHA DEL TRÁMITE (con auditoría) ─────────────────────────────────

export async function editarFechaTramiteMulta(
  tramiteId:           string,
  nuevaFecha:          string,
  modificadoPor:       string,
  modificadoPorNombre: string,
  nota?:               string,
): Promise<void> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (!snap.exists()) throw new Error('Workflow no encontrado')
  const wf = snap.data() as MultaWorkflow
  const valorAnterior = wf.paso1?.fechaTramite ?? wf.fechaTramiteActual ?? '—'

  const alertas = calcularAlertasFechaTramite(nuevaFecha)
  const entradaHistorial = {
    valorAnterior,
    valorNuevo:          nuevaFecha,
    modificadoPor,
    modificadoPorNombre,
    modificadoEn:        Timestamp.now(),
    ...(nota ? { nota } : {}),
  }

  await updateDoc(workflowDoc(tramiteId), {
    'paso1.fechaTramite':     nuevaFecha,
    fechaTramiteActual:       nuevaFecha,
    alertaFechaTramite48h:    alertas.alertaFechaTramite48h,
    alertaFechaTramite24h:    alertas.alertaFechaTramite24h,
    historialFechaTramite:    arrayUnion(entradaHistorial),
    actualizadoEn:            serverTimestamp(),
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

  // ── Calcular totales para el trámite principal ─────────────────────────────
  // El campo honorarios del trámite = total cobrado al cliente (honorarios gestoría)
  // Los costos adicionales (SUATS, informe persona) se guardan en paso7 para reportes
  const honorariosGestoria = data.pagoTotalRecibo
    - (data.suatsAbonado && data.montoSUATS ? data.montoSUATS : 0)
    - (data.informePersonaRealizado && data.montoInformePersona ? data.montoInformePersona : 0)

  // 1. Cerrar el workflow de multa
  await updateDoc(workflowDoc(tramiteId), {
    paso7:          paso7Clean,
    pasoActual:     8,
    estadoWorkflow: 'completado',
    actualizadoEn:  serverTimestamp(),
  })

  // 2. Actualizar el trámite principal con el desglose financiero completo
  //    - honorarios: lo que cobró la gestoría por sus servicios
  //    - pagado: true (se confirmó el pago del recibo)
  //    - campos extra de costos para reportes y cobranzas
  // Canal → formaPago: mapear el canal de entrega a una forma de pago legible
  // para que CobranzasPage y ReportesPage lo muestren correctamente.
  const formaPagoMap: Record<string, string> = {
    presencial: 'efectivo',
    whatsapp:   'transferencia',
    email:      'transferencia',
    otro:       'mixto',
  }
  const formaPago = formaPagoMap[data.canalEntrega] ?? 'efectivo'

  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:      honorariosGestoria > 0 ? honorariosGestoria : data.pagoTotalRecibo,
    pagado:          true,
    fechaPago:       serverTimestamp(),
    // [FIX] formaPago — necesario para que Cobranzas muestre el método de cobro
    formaPago,
    notasPago:       data.observacionFinal ?? '',
    // Desglose completo para reportes y usePremios
    costosSUATS:          data.suatsAbonado ? (data.montoSUATS ?? 0) : 0,
    costosInformePersona: data.informePersonaRealizado ? (data.montoInformePersona ?? 0) : 0,
    totalCobradoCliente:  data.pagoTotalRecibo,
    actualizadoEn:        serverTimestamp(),
  })

  // 3. Marcar como entregado — desaparece de Torre de Control
  await cambiarEstadoTramite(tramiteId, 'entregado', {
    completadoPor:       data.completadoPor,
    completadoPorNombre: data.completadoPorNombre,
  })
}
 
// ─── AGREGAR PAGO POST-PASO2 ─────────────────────────────────────────────────
// Permite registrar pagos en cualquier momento del workflow sin rehacer el paso 2.
 
export async function agregarPagoMulta(
  tramiteId:   string,
  pago:        RegistroPago,
  pagosPrevios: RegistroPago[],
): Promise<void> {
  const nuevoTotal = [...pagosPrevios, pago].reduce((s, p) => s + p.monto, 0)

  // 1. Escribir el pago en el workflow
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': arrayUnion(pago),
    'paso2.montoTotal':     nuevoTotal,
    'paso2.pagoConfirmado': true,
    actualizadoEn:          serverTimestamp(),
  })

  // 2. Propagar el monto al trámite principal para que aparezca en
  //    Cobranzas y Reportes sin esperar al cierre (paso 7).
  //    formaPago se mapea desde el metodoPago del último pago registrado.
  const formaPagoMap: Record<string, string> = {
    efectivo:     'efectivo',
    transferencia: 'transferencia',
    mixto:        'mixto',
  }
  const formaPago = formaPagoMap[pago.metodoPago] ?? 'mixto'

  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:          nuevoTotal,
    totalCobradoCliente: nuevoTotal,
    formaPago,
    // pagado=false mientras no se complete el workflow — solo se marca true en paso7
    actualizadoEn: serverTimestamp(),
  })
}

// ─── SINCRONIZAR PAGO AL TRÁMITE ─────────────────────────────────────────────
// Usado cuando el workflow completó pero confirmarPaso7Multa falló antes de
// escribir pagado/honorarios/fechaPago en el documento del trámite.
// Lee los datos del workflow y los aplica al trámite manualmente.

export async function sincronizarPagoMultaAlTramite(
  tramiteId:  string,
  gestoriaId: string,
): Promise<{
  honorarios:          number
  totalCobradoCliente: number
  costosSUATS:         number
  costosInformePersona: number
}> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (!snap.exists()) throw new Error('Workflow no encontrado')

  const wf = snap.data() as any

  // Leer totales: si existe paso7 usarlo, si no usar historialPagos del paso2
  const paso7 = wf.paso7
  const paso2 = wf.paso2

  let pagoTotalRecibo   = 0
  let costosSUATS       = 0
  let costosInforme     = 0

  if (paso7?.pagoTotalRecibo) {
    // Workflow completado normalmente — usar datos del paso7
    pagoTotalRecibo = Number(paso7.pagoTotalRecibo ?? 0)
    costosSUATS     = paso7.suatsAbonado ? Number(paso7.montoSUATS ?? 0) : 0
    costosInforme   = paso7.informePersonaRealizado ? Number(paso7.montoInformePersona ?? 0) : 0
  } else if (paso2?.montoTotal) {
    // Workflow sin paso7 — usar el total del historial de pagos
    pagoTotalRecibo = Number(paso2.montoTotal ?? 0)
  }

  const honorariosGestoria = pagoTotalRecibo - costosSUATS - costosInforme

  // Mapear canal de entrega → formaPago
  const formaPagoMap: Record<string, string> = {
    presencial: 'efectivo',
    whatsapp:   'transferencia',
    email:      'transferencia',
    otro:       'mixto',
  }
  const canalEntrega = paso7?.canalEntrega ?? 'otro'
  const formaPago    = formaPagoMap[canalEntrega] ?? 'efectivo'

  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:           honorariosGestoria > 0 ? honorariosGestoria : pagoTotalRecibo,
    pagado:               pagoTotalRecibo > 0,
    fechaPago:            serverTimestamp(),
    formaPago,
    notasPago:            paso7?.observacionFinal ?? '',
    costosSUATS,
    costosInformePersona: costosInforme,
    totalCobradoCliente:  pagoTotalRecibo,
    actualizadoEn:        serverTimestamp(),
  })

  return {
    honorarios:           honorariosGestoria > 0 ? honorariosGestoria : pagoTotalRecibo,
    totalCobradoCliente:  pagoTotalRecibo,
    costosSUATS,
    costosInformePersona: costosInforme,
  }
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