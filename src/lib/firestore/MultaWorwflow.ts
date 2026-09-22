// src/lib/firestore/MultaWorwflow.ts  (nombre original preservado)
import {
  doc, setDoc, collection, addDoc, updateDoc, getDoc,
  serverTimestamp, Timestamp, arrayUnion, deleteField,
  onSnapshot, query, where, writeBatch,
  type CollectionReference,
} from 'firebase/firestore'
import { db }           from '@/lib/firebase'
import { crearNotificacion } from '@/lib/firestore/notificaciones'
import { cambiarEstadoTramite } from '@/lib/firestore/tramites'
import { tramitesCol, notificacionesCol } from '@/lib/firestore/collections'
import type {
  MultaWorkflow, MultaPaso1Data, MultaPaso2Data,
  MultaPaso3Data, MultaReboteResolucion,
  MultaPaso4Data, MultaPaso5Data, MultaPaso6Data, MultaPaso7Data,
  EstadoMultaWorkflow, RegistroPago, EstadoMulta, DocumentoAdicional,
  AlertaDocumentacion,
} from '@/types/multa_types'
import { crearRecibo, generarNumeroRecibo, getRecibosPorTramite, resumirCobros } from '@/lib/firestore/recibos'
import { notificarRecibo } from '@/lib/firestore/alertas'
 
// ─── REFS ─────────────────────────────────────────────────────────────────────
 
const workflowsCol = collection(db, 'multaWorkflow') as CollectionReference<MultaWorkflow>
const workflowDoc  = (id: string) => doc(workflowsCol, id)

// ─── LISTA DE MULTAS POR GESTORÍA (para "Revisión de Multas") ─────────────────
// Suscripción en tiempo real a todos los workflows de multa de la gestoría.
// El orden se resuelve en el cliente (por fecha de entrega) para no exigir un
// índice compuesto en Firestore.
export function subscribeMultaWorkflows(
  gestoriaId: string,
  cb: (rows: MultaWorkflow[]) => void,
): () => void {
  const q = query(workflowsCol, where('gestoriaId', '==', gestoriaId))
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }) as MultaWorkflow)),
    err => { console.warn('[subscribeMultaWorkflows]', err.code ?? err.message); cb([]) },
  )
}

// ─── IDS DE TRÁMITES DE MULTA PROPIOS (vista del secretario comercial) ────────
// Trámites de multa asignados a / creados por el usuario. Sin límite (a diferencia
// de subscribeTramites, que corta en 300). Equality-only → sin índice compuesto.
// Cada listener tiene handler de error: un permission-denied no deja loading infinito.
export function subscribeIdsTramitesMultaPropios(
  gestoriaId: string,
  uid:        string,
  cb:         (ids: Set<string>) => void,
): () => void {
  let asignados: string[] | null = null
  let creados:   string[] | null = null

  const emitir = () => {
    if (asignados === null || creados === null) return
    cb(new Set([...asignados, ...creados]))
  }
  const soloMultas = (docs: { id: string; data: () => { tipo?: string } }[]) =>
    docs.filter(d => d.data().tipo === 'descargo_multa').map(d => d.id)

  const unsubA = onSnapshot(
    query(tramitesCol, where('gestoriaId', '==', gestoriaId), where('asignadoA', '==', uid)),
    snap => { asignados = soloMultas(snap.docs as any); emitir() },
    err  => { console.warn('[multasPropias:asignados]', err.code ?? err.message); asignados = []; emitir() },
  )
  const unsubC = onSnapshot(
    query(tramitesCol, where('gestoriaId', '==', gestoriaId), where('creadoPor', '==', uid)),
    snap => { creados = soloMultas(snap.docs as any); emitir() },
    err  => { console.warn('[multasPropias:creados]', err.code ?? err.message); creados = []; emitir() },
  )
  return () => { unsubA(); unsubC() }
}

// ─── ESTADO OPERATIVO MANUAL ──────────────────────────────────────────────────
// Override del estado visible de la multa. estado=null limpia el override y
// vuelve al estado derivado del workflow (ver estadoMultaEfectivo).
export async function setEstadoMultaManual(
  tramiteId: string,
  estado:    EstadoMulta | null,
  uid:       string,
  nombre:    string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    estadoMultaManual:       estado,
    estadoMultaManualPor:    estado ? uid : null,
    estadoMultaManualNombre: estado ? nombre : null,
    estadoMultaManualEn:     estado ? serverTimestamp() : null,
    actualizadoEn:           serverTimestamp(),
  } as any)
}

// ─── DOCUMENTACIÓN ADICIONAL (multi-DNI / cargas libres) ──────────────────────
// Append-only: agrega un documento SIN pisar los ya cargados. Se pasa el array
// existente (mismo patrón que agregarPagoMulta) para evitar problemas de
// igualdad exacta de arrayUnion con objetos que llevan timestamp.
export async function agregarDocumentoAdicional(
  tramiteId:  string,
  nuevo:      DocumentoAdicional,
  existentes: DocumentoAdicional[],
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    documentosAdicionales: [...existentes, nuevo],
    actualizadoEn:         serverTimestamp(),
  } as any)
}

export async function eliminarDocumentoAdicional(
  tramiteId:  string,
  docId:      string,
  existentes: DocumentoAdicional[],
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    documentosAdicionales: existentes.filter(d => d.id !== docId),
    actualizadoEn:         serverTimestamp(),
  } as any)
}
 
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
  // Merge con lo ya guardado: si se reconfirma (rebote), NO se pierden pagos
  // previos ni se duplican. Clave de un pago = registradoEn + monto.
  const snap    = await getDoc(workflowDoc(tramiteId))
  const previos = (snap.exists() ? (snap.data() as MultaWorkflow).paso2?.historialPagos : undefined) ?? []
  const claves  = new Set(previos.map(clavePago))
  const nuevos  = (data.historialPagos ?? []).filter(p => !claves.has(clavePago(p)))
  const historialPagos = [...previos, ...nuevos]
  const montoTotal     = historialPagos.reduce((s, p) => s + (p.monto ?? 0), 0)

  await updateDoc(workflowDoc(tramiteId), {
    paso2:          { ...data, historialPagos, montoTotal, completadoEn: Timestamp.now() },
    pasoActual:     3,
    estadoWorkflow: 'en_revision',
    actualizadoEn:  serverTimestamp(),
  })

  // Un recibo por cada pago NUEVO, fechado cuando se registró el pago.
  // (Los previos sin reciboId son históricos: los resuelve el script de
  //  reconciliación, no acá — podrían estar ya absorbidos en un cierre.)
  const marcas = new Map<string, { reciboId: string; numeroRecibo: string }>()
  let acumulado = previos.reduce((s, p) => s + (p.monto ?? 0), 0)
  for (const p of nuevos) {
    if (p.reciboId || !(p.monto > 0)) continue
    acumulado += p.monto
    try {
      marcas.set(clavePago(p), await emitirReciboPagoMulta(tramiteId, p, acumulado))
    } catch (e) {
      await alertarReciboFallido(tramiteId, p, e)
    }
  }
  if (marcas.size) {
    await marcarRecibosEnHistorial(tramiteId, marcas)
      .catch(e => console.error('[confirmarPaso2Multa] no se pudo marcar reciboId:', e))
  }
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
 
export interface ChequeoPaso7 {
  ok:          boolean
  errores:     string[]
  montoMinimo: number
}
 

export function chequearPaso7(
  wf:   MultaWorkflow,
  data: Partial<MultaPaso7Data>,
): ChequeoPaso7 {
  const errores: string[] = []
  const requiereSUATS = wf.paso1?.requiereSUATS === true
  const montoMinimo   = wf.paso2?.montoTotal ?? 0
 
  if (requiereSUATS && !wf.paso6?.suatsGenerado) {
    errores.push('La multa requiere SUATS pero el Paso 6 no lo generó. Volvé al Paso 6 y completalo.')
  }
  if (requiereSUATS && !data.suatsAbonado) {
    errores.push('La multa requiere SUATS: marcá que se abonó e indicá el monto.')
  }
  if (requiereSUATS && data.suatsAbonado && !(data.montoSUATS && data.montoSUATS > 0)) {
    errores.push('Indicá el monto del SUATS abonado.')
  }
  if (data.informePersonaRealizado &&
      !(data.montoInformePersona && data.montoInformePersona > 0)) {
    errores.push('Indicá el monto del informe de persona.')
  }
 
  const total = data.pagoTotalRecibo ?? 0
  const comision = data.comisionReferido ?? 0
  if (!Number.isFinite(comision) || comision < 0) {
    errores.push('La comisión del referido no puede ser negativa.')
  } else if (total > 0 && comision > total) {
    errores.push('La comisión del referido no puede superar el total cobrado.')
  }

  if (!(total > 0)) {
    errores.push('El total cobrado al cliente es obligatorio.')
  } else if (total < montoMinimo) {
    errores.push(
      `El total ($${total.toLocaleString('es-AR')}) no puede ser menor a lo ya ` +
      `cobrado en el Paso 2 ($${montoMinimo.toLocaleString('es-AR')}).`,
    )
  } else {
    const suats   = data.suatsAbonado ? (data.montoSUATS ?? 0) : 0
    const informe = data.informePersonaRealizado ? (data.montoInformePersona ?? 0) : 0
    if (suats + informe > total) {
      errores.push(
        `SUATS ($${suats.toLocaleString('es-AR')}) + informe ` +
        `($${informe.toLocaleString('es-AR')}) superan el total cobrado. Revisá los montos.`,
      )
    }
  }
 
  if (!data.canalEntrega) {
    errores.push('Indicá el canal de entrega.')
  }
 
  return { ok: errores.length === 0, errores, montoMinimo }
}
 
// ─── PASO 7: Cierre ──────────────────────────────────────────────────────────
 
export async function confirmarPaso7Multa(
  tramiteId:  string,
  gestoriaId: string,
  data: Omit<MultaPaso7Data, 'completadoEn'>,
): Promise<string | null> {
  let reciboCierreId: string | null = null
 
  // ─── VALIDACIÓN DURA ──────────────────────────────────────────────────────
  // Se lee el workflow para cruzar paso1 / paso2 / paso6 contra lo que llega.
  // Si algo no cierra, se corta ACÁ: no se escribe el workflow, no se toca el
  // trámite, no se emite recibo. Todo o nada.
  const wfSnap = await getDoc(workflowDoc(tramiteId))
  if (!wfSnap.exists()) {
    throw new Error('No se encontró el workflow de esta multa.')
  }
  const wf = wfSnap.data() as MultaWorkflow
 
  if (wf.estadoWorkflow === 'completado') {
    throw new Error('Esta multa ya fue cerrada.')
  }
  if ((wf.pasoActual ?? 0) < 7) {
    throw new Error(
      `No se puede cerrar: el workflow está en el paso ${wf.pasoActual}. ` +
      'Completá los pasos anteriores.',
    )
  }
 
  const chequeo = chequearPaso7(wf, data)
  if (!chequeo.ok) {
    throw new Error(chequeo.errores.join('\n'))
  }
  // ─── FIN VALIDACIÓN ───────────────────────────────────────────────────────
 
  // Limpiar campos undefined — Firestore rechaza undefined
  const paso7Clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...data, completadoEn: Timestamp.now() })) {
    if (v !== undefined) paso7Clean[k] = v
  }
 
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
  const formaPagoMap: Record<string, string> = {
    presencial: 'efectivo',
    whatsapp:   'transferencia',
    email:      'transferencia',
    otro:       'mixto',
  }
  const formaPago = data.metodoPago ?? formaPagoMap[data.canalEntrega] ?? 'efectivo'
 
  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:      honorariosGestoria > 0 ? honorariosGestoria : data.pagoTotalRecibo,
    pagado:          true,
    fechaPago:       serverTimestamp(),
    formaPago,
    notasPago:       data.observacionFinal ?? '',
    costosSUATS:          data.suatsAbonado ? (data.montoSUATS ?? 0) : 0,
    costoSUATS:           data.suatsAbonado ? (data.costoSUATS ?? 0) : 0,
    costosInformePersona: data.informePersonaRealizado ? (data.montoInformePersona ?? 0) : 0,
    totalCobradoCliente:  data.pagoTotalRecibo,
    actualizadoEn:        serverTimestamp(),
  })
 
  // 3. Recibo de CIERRE por el saldo + deducciones que falten imputar (best-effort).
  //    La suma de recibos del trámite = total cobrado, y cada deducción
  //    (SUATS / informe / comisión) queda imputada UNA sola vez.
  try {
    const tramiteSnap = await getDoc(doc(tramitesCol, tramiteId))
    if (tramiteSnap.exists()) {
      const tramite = tramiteSnap.data() as any
      const previos = resumirCobros(await getRecibosPorTramite(tramiteId))
      const montoCierre = Math.max(0, data.pagoTotalRecibo - previos.neto)

      const suatsTotal      = data.suatsAbonado ? (data.montoSUATS ?? 0) : 0
      const costoSuatsTotal = data.suatsAbonado ? (data.costoSUATS ?? 0) : 0
      const informeTotal    = data.informePersonaRealizado ? (data.montoInformePersona ?? 0) : 0
      const comisionTotal   = data.comisionReferido ?? 0

      const faltaSuats    = Math.max(0, suatsTotal      - previos.montoSUATS)
      const faltaCosto    = Math.max(0, costoSuatsTotal - previos.costoSUATS)
      const faltaInforme  = Math.max(0, informeTotal    - previos.montoInformePersona)
      const faltaComision = Math.max(0, comisionTotal   - previos.comisionReferido)

      let suatsImp = 0, informeImp = 0, comisionImp = 0

      if (montoCierre > 0) {
        suatsImp    = Math.min(faltaSuats,    montoCierre)
        informeImp  = Math.min(faltaInforme,  montoCierre - suatsImp)
        comisionImp = Math.min(faltaComision, montoCierre - suatsImp - informeImp)

        const numeroRecibo = await generarNumeroRecibo(gestoriaId)
        const reciboId = await crearRecibo({
          numeroRecibo,
          tramiteId,
          clienteId:    tramite.clienteId,
          gestoriaId,
          tipo:         'total',
          monto:        montoCierre,
          montoCobradoAcumulado: data.pagoTotalRecibo,
          honorariosTotales:     data.pagoTotalRecibo,
          formaPago,
          notas:        data.observacionFinal ?? '',
          patente:      tramite.patente,
          numeroTramite: tramite.numero,
          tipoTramite:  tramite.tipo,
          emitidoPor:       data.completadoPor,
          emitidoPorNombre: data.completadoPorNombre,
          atribuidoA:       tramite.atribuidoA       ?? data.completadoPor,
          atribuidoANombre: tramite.atribuidoANombre ?? data.completadoPorNombre,
          montoSUATS:          suatsImp,
          costoSUATS:          suatsImp > 0 ? faltaCosto : 0,
          montoInformePersona: informeImp,
          comisionReferido:    comisionImp,
          comisionDestino:     tramite.origenNombre ?? '',
          montoAcreditado:     data.montoAcreditado,
          cuotasTarjeta:       data.cuotasTarjeta,
          encargadoId:         tramite.encargadoId,
          encargadoNombre:     tramite.encargadoNombre,
          fechaCobro:          Timestamp.now(),
        })
        reciboCierreId = reciboId
        await notificarRecibo({
          gestoriaId, tramiteId, reciboId, numeroRecibo,
          monto: montoCierre, tipo: 'total', patente: tramite.patente,
        })
      }

      // Deducción sin saldo donde imputarla (ej: todo se cobró en parciales y
      // el SUATS recién se declara al cierre) → no se inventa un recibo en $0:
      // queda una alerta para ajustarlo a mano. Así el neto no queda inflado
      // en silencio.
      const sinImputar = (faltaSuats - suatsImp) + (faltaInforme - informeImp) + (faltaComision - comisionImp)
      if (sinImputar > 0) {
        await addDoc(collection(db, 'alertas_sistema'), {
          gestoriaId,
          tipo:        'deducciones_sin_recibo',
          titulo:      'Deducciones del cierre sin imputar',
          descripcion: `${tramite.numero ?? tramiteId} (${tramite.patente ?? 's/patente'}): quedaron ` +
                       `$${sinImputar.toLocaleString('es-AR')} de SUATS/informe/comisión sin recibo ` +
                       `porque todo el cobro ya estaba en recibos parciales.`,
          tramiteId,
          monto:       sinImputar,
          detalle: {
            suats:    faltaSuats - suatsImp,
            informe:  faltaInforme - informeImp,
            comision: faltaComision - comisionImp,
          },
          estado:      'pendiente',
          prioridad:   'media',
          creadoEn:    serverTimestamp(),
        }).catch(e => console.error('[confirmarPaso7Multa] alerta deducciones:', e))
      }
    }
  } catch (e) {
    console.error('[confirmarPaso7Multa] No se pudo generar el recibo/alerta de cierre:', e)
  }

  // 4. Marcar como entregado — desaparece de Torre de Control
  await cambiarEstadoTramite(tramiteId, 'entregado', {
    completadoPor:       data.completadoPor,
    completadoPorNombre: data.completadoPorNombre,
  })
  return reciboCierreId
}
 
// ─── HELPERS DE COBRO DE MULTAS ──────────────────────────────────────────────

const FORMA_PAGO_METODO: Record<string, string> = {
  efectivo:      'efectivo',
  transferencia: 'transferencia',
  mercadopago:   'mercadopago',
  tarjeta:       'tarjeta',
  cheque:        'cheque',
  mixto:         'mixto',
}

// Identidad de un pago dentro de historialPagos (registradoEn es Timestamp.now()
// al momento de cargarlo → único en la práctica).
function clavePago(p: RegistroPago): string {
  const ms = (p.registradoEn as any)?.toMillis?.() ?? 0
  return `${ms}_${p.monto}`
}

// Emite el recibo PARCIAL de un pago de multa con TODO su desglose.
async function emitirReciboPagoMulta(
  tramiteId: string,
  pago:      RegistroPago,
  acumulado: number,
): Promise<{ reciboId: string; numeroRecibo: string }> {
  const snap = await getDoc(doc(tramitesCol, tramiteId))
  if (!snap.exists()) throw new Error('Trámite no encontrado')
  const t = snap.data() as any
  const gestoriaId = t.gestoriaId as string

  const mismoEncargado = !pago.encargadoId || pago.encargadoId === t.encargadoId
  const numeroRecibo = await generarNumeroRecibo(gestoriaId)
  const reciboId = await crearRecibo({
    numeroRecibo,
    tramiteId,
    clienteId:    t.clienteId,
    gestoriaId,
    tipo:         'parcial',
    monto:        pago.monto,
    montoSUATS:          pago.montoSUATS,
    costoSUATS:          pago.costoSUATS,
    montoInformePersona: pago.montoInformePersona,
    costoInformePersona: pago.costoInformePersona,
    comisionReferido:    pago.comisionReferido,
    comisionDestino:     pago.comisionDestino,
    montoAcreditado:     pago.montoAcreditado,
    cuotasTarjeta:       pago.cuotasTarjeta,
    encargadoId:         pago.encargadoId ?? t.encargadoId,
    encargadoNombre:     mismoEncargado ? t.encargadoNombre : pago.comisionDestino,
    montoCobradoAcumulado: acumulado,
    honorariosTotales:     acumulado,
    formaPago:    FORMA_PAGO_METODO[pago.metodoPago] ?? 'mixto',
    notas:        pago.nota ?? '',
    patente:      t.patente,
    numeroTramite: t.numero,
    tipoTramite:  t.tipo,
    emitidoPor:       pago.registradoPor,
    emitidoPorNombre: pago.registradoPorNombre,
    atribuidoA:       pago.registradoPor,
    atribuidoANombre: pago.registradoPorNombre,
    fechaCobro:       pago.registradoEn ?? Timestamp.now(),
  })
  await notificarRecibo({
    gestoriaId, tramiteId, reciboId, numeroRecibo,
    monto: pago.monto, tipo: 'parcial', patente: t.patente,
  }).catch(e => console.error('[emitirReciboPagoMulta] alerta:', e))
  return { reciboId, numeroRecibo }
}

// Escribe reciboId/numeroRecibo en los pagos del historial (reescritura del
// array — arrayUnion no puede modificar un elemento existente).
async function marcarRecibosEnHistorial(
  tramiteId: string,
  marcas:    Map<string, { reciboId: string; numeroRecibo: string }>,
): Promise<void> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (!snap.exists()) return
  const hist = (snap.data() as MultaWorkflow).paso2?.historialPagos ?? []
  const nuevo = hist.map(p => {
    const m = marcas.get(clavePago(p))
    return m && !p.reciboId ? { ...p, ...m } : p
  })
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': nuevo,
    actualizadoEn:          serverTimestamp(),
  } as any)
}

// El pago YA quedó registrado: no se revierte. El fallo se hace visible.
// Un pago sin reciboId en el historial = pendiente para el script de reconciliación.
async function alertarReciboFallido(tramiteId: string, pago: RegistroPago, e: unknown): Promise<void> {
  console.error('[cobro multa] recibo NO emitido:', e)
  try {
    const snap = await getDoc(doc(tramitesCol, tramiteId))
    const t = snap.exists() ? (snap.data() as any) : {}
    await addDoc(collection(db, 'alertas_sistema'), {
      gestoriaId:  t.gestoriaId ?? '',
      tipo:        'recibo_fallido',
      titulo:      'Pago sin comprobante',
      descripcion: `Se cobró $${pago.monto.toLocaleString('es-AR')} en ` +
                   `${t.numero ?? tramiteId} (${t.patente ?? 's/patente'}) ` +
                   `y no se pudo emitir el recibo.`,
      tramiteId,
      monto:        pago.monto,
      registradoPor: pago.registradoPor ?? '',
      registradoPorNombre: pago.registradoPorNombre ?? '',
      error:       String((e as Error)?.message ?? e),
      estado:      'pendiente',
      prioridad:   'alta',
      creadoEn:    serverTimestamp(),
    })
  } catch (e2) {
    console.error('[cobro multa] tampoco se pudo crear la alerta:', e2)
  }
}

// ─── AGREGAR PAGO POST-PASO2 ─────────────────────────────────────────────────

export async function agregarPagoMulta(
  tramiteId:   string,
  pago:        RegistroPago,
  pagosPrevios: RegistroPago[],
): Promise<string | null> {
  const nuevoTotal = [...pagosPrevios, pago].reduce((s, p) => s + p.monto, 0)

  // 1. Escribir el pago en el workflow
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': arrayUnion(pago),
    'paso2.montoTotal':     nuevoTotal,
    'paso2.pagoConfirmado': true,
    actualizadoEn:          serverTimestamp(),
  })

  // 2. Propagar el monto al trámite principal (caché; la verdad son los recibos)
  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:          nuevoTotal,
    totalCobradoCliente: nuevoTotal,
    formaPago:           FORMA_PAGO_METODO[pago.metodoPago] ?? 'mixto',
    // pagado=false mientras no se complete el workflow — solo se marca true en paso7
    actualizadoEn: serverTimestamp(),
  })

  // 3. Recibo PARCIAL con todo el desglose + marcar el pago con su reciboId
  try {
    const r = await emitirReciboPagoMulta(tramiteId, pago, nuevoTotal)
    await marcarRecibosEnHistorial(tramiteId, new Map([[clavePago(pago), r]]))
      .catch(e => console.error('[agregarPagoMulta] no se pudo marcar reciboId:', e))
    return r.reciboId
  } catch (e) {
    await alertarReciboFallido(tramiteId, pago, e)
    return null
  }
}

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
  honorarios:            honorariosGestoria > 0 ? honorariosGestoria : pagoTotalRecibo,
  pagado:                true,
  fechaPago:             serverTimestamp(),
  formaPago,
  notasPago:             paso7?.observacionFinal ?? '',
  costosSUATS:           paso7?.suatsAbonado ? (paso7?.montoSUATS ?? 0) : 0,
  costosInformePersona:  paso7?.informePersonaRealizado ? (paso7?.montoInformePersona ?? 0) : 0,
  totalCobradoCliente:   pagoTotalRecibo,
  actualizadoEn:         serverTimestamp(),
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

// ─── REPORTE DE CONTROL (pestaña "A Controlar") ──────────────────────────────
export async function reportarMultaControl(
  tramiteId:   string,
  motivo:      string,
  autorId:     string,
  autorNombre: string,
): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    reporteControl: { motivo, autorId, autorNombre, creadoEn: Timestamp.now() },
    actualizadoEn:  serverTimestamp(),
  })
}

export async function resolverReporteControlMulta(tramiteId: string): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    reporteControl: deleteField(),
    actualizadoEn:  serverTimestamp(),
  })
}

// ─── ALERTA DE DOCUMENTACIÓN AL SECRETARIO (estado Docs. Requerida) ──────────
// Control / asistente de multas avisa al secretario a cargo que falta o está mal
// un documento. Escritura ATÓMICA (batch):
//   1. notificaciones/{id} → campanita in-app + push (trigger enviarPushNotificacion)
//   2. multaWorkflow/{id}  → alertaDocs (última) + historialAlertasDocs (append)
export async function enviarAlertaDocumentacion(params: {
  tramiteId:          string
  gestoriaId:         string
  destinatarioId:     string
  destinatarioNombre: string
  motivo:             string
  autorId:            string
  autorNombre:        string
  patente?:           string
  cliente?:           string
}): Promise<void> {
  const alerta: AlertaDocumentacion = {
    motivo:             params.motivo,
    destinatarioId:     params.destinatarioId,
    destinatarioNombre: params.destinatarioNombre,
    autorId:            params.autorId,
    autorNombre:        params.autorNombre,
    creadoEn:           Timestamp.now(),
  }

  const ref   = [params.patente, params.cliente].filter(Boolean).join(' · ') || 'Revisión de multa'
  const batch = writeBatch(db)

  const notifRef = doc(notificacionesCol)
  batch.set(notifRef, {
    id:             notifRef.id,
    gestoriaId:     params.gestoriaId,
    destinatarioId: params.destinatarioId,
    tipo:           'documentacion',
    titulo:         `📄 Falta documentación — ${ref}`,
    mensaje:        `${params.autorNombre}: ${params.motivo}`,
    tramiteId:      params.tramiteId,
    turnoId:        null,
    leida:          false,
    creadoEn:       serverTimestamp(),
  } as any)

  batch.update(workflowDoc(params.tramiteId), {
    alertaDocs:           alerta,
    historialAlertasDocs: arrayUnion(alerta),
    actualizadoEn:        serverTimestamp(),
  } as any)

  await batch.commit()
}
