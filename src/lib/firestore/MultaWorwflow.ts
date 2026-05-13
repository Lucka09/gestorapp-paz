// src/lib/firestore/multaWorkflow.ts
// ─── FIRESTORE — MULTA WORKFLOW ───────────────────────────────────────────────
// Colección: `multaWorkflow`
// Un documento por trámite (id = tramiteId)
// Sigue el mismo patrón que inscripcionWorkflow.ts

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, Timestamp, query, where, collection,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { registrarActividad } from '@/lib/firestore/audit'
import type {
  MultaWorkflow,
  MultaPaso1Data,
  MultaPaso2Data,
  MultaPaso3Data,
  MultaPaso4Data,
  MultaPaso5Data,
  RegistroPago,
} from '@/types/multa.types'
import { calcularMontoTotal } from '@/types/multa.types'

// ─── COLLECTION REF ───────────────────────────────────────────────────────────

const multaWorkflowsCol = collection(db, 'multaWorkflow')
const workflowDoc       = (tramiteId: string) => doc(multaWorkflowsCol, tramiteId)

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Suscripción en tiempo real a un workflow de multa */
export function subscribeMultaWorkflow(
  tramiteId: string,
  callback:  (w: MultaWorkflow | null) => void,
): Unsubscribe {
  return onSnapshot(workflowDoc(tramiteId), snap => {
    callback(snap.exists() ? ({ ...snap.data(), id: snap.id } as MultaWorkflow) : null)
  })
}

/** Suscripción a todos los workflows de multas de una gestoría */
export function subscribeMultaWorkflowsGestoria(
  gestoriaId: string,
  callback:   (workflows: MultaWorkflow[]) => void,
): Unsubscribe {
  const q = query(multaWorkflowsCol, where('gestoriaId', '==', gestoriaId))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as MultaWorkflow))
  )
}

/** Lectura única */
export async function getMultaWorkflow(tramiteId: string): Promise<MultaWorkflow | null> {
  const snap = await getDoc(workflowDoc(tramiteId))
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as MultaWorkflow) : null
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * Crea el documento de workflow al iniciar un trámite de multa.
 * Idempotente: si ya existe, no sobreescribe.
 */
export async function crearMultaWorkflow(
  tramiteId:       string,
  gestoriaId:      string,
  creadoPor:       string,
  creadoPorNombre: string = creadoPor,  // default al UID si no se pasa (retrocompatible)
): Promise<void> {
  const ref  = workflowDoc(tramiteId)
  const snap = await getDoc(ref)
  if (snap.exists()) return

  await setDoc(ref, {
    tramiteId,
    gestoriaId,
    pasoActual:    1,
    creadoPor,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  await registrarActividad({
    accion:        'crear',
    entidad:       'tramite',
    entidadId:     tramiteId,
    entidadLabel:  `Workflow multa — ${tramiteId}`,
    usuarioId:     creadoPor,
    usuarioNombre: creadoPorNombre,
    usuarioRol:    'propietario',
    nota:          'Workflow de multa/infracción creado',
  })
}

// ─── PASO 1: INGRESO LIT ──────────────────────────────────────────────────────

export async function confirmarMultaPaso1(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  numeroLIT:    string,
  observacionInicial?: string,
): Promise<void> {
  const paso1: MultaPaso1Data = {
    numeroLIT,
    observacionInicial,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso1,
    pasoActual:    2,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── PASO 2: PRESUPUESTO Y COBRO ─────────────────────────────────────────────

/**
 * Registra un pago en el historial.
 * Se puede llamar múltiples veces (anticipo + saldo, por ejemplo).
 * No avanza de paso automáticamente — se avanza con confirmarMultaPaso2.
 */
export async function agregarPagoMulta(
  tramiteId:   string,
  gestorId:    string,
  gestorNombre: string,
  pago: Pick<RegistroPago, 'monto' | 'metodoPago' | 'nota'>,
  historialActual: RegistroPago[],
): Promise<void> {
  const nuevoPago: RegistroPago = {
    ...pago,
    registradoPor:       gestorId,
    registradoPorNombre: gestorNombre,
    registradoEn:        Timestamp.now(),
  }
  const historialNuevo = [...historialActual, nuevoPago]
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': historialNuevo,
    'paso2.montoTotal':     calcularMontoTotal(historialNuevo),
    actualizadoEn:          serverTimestamp(),
  })
}

export async function confirmarMultaPaso2(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: {
    presupuestoEnviado: boolean
    pagoConfirmado:     boolean
    historialPagos:     RegistroPago[]
  },
): Promise<void> {
  const paso2: MultaPaso2Data = {
    ...datos,
    montoTotal:          calcularMontoTotal(datos.historialPagos),
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso2,
    pasoActual:    3,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── PASO 3: DATOS DEL TITULAR + DOCUMENTACIÓN ───────────────────────────────

export async function confirmarMultaPaso3(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: Omit<MultaPaso3Data, keyof import('@/types/torre.types').PasoWorkflowBase>,
): Promise<void> {
  const paso3: MultaPaso3Data = {
    ...datos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso3,
    pasoActual:    4,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── PASO 4: DESCARGO Y SUATS ─────────────────────────────────────────────────

export async function confirmarMultaPaso4(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: Pick<MultaPaso4Data, 'descargoPreparado' | 'suatsObtenido' | 'fotosSuats' | 'notaDescargo'>,
): Promise<void> {
  const paso4: MultaPaso4Data = {
    ...datos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso4,
    pasoActual:    5,
    actualizadoEn: serverTimestamp(),
  })
}

// ─── PASO 5: ENTREGA Y CIERRE ─────────────────────────────────────────────────

export async function confirmarMultaPaso5(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: Pick<MultaPaso5Data, 'suatsEntregado' | 'fechaEntrega' | 'canalEntrega' | 'observacionFinal'>,
): Promise<void> {
  const paso5: MultaPaso5Data = {
    ...datos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  // pasoActual = 6 → FINALIZADO
  await updateDoc(workflowDoc(tramiteId), {
    paso5,
    pasoActual:    6,
    actualizadoEn: serverTimestamp(),
  })

  await registrarActividad({
    accion:        'editar',
    entidad:       'tramite',
    entidadId:     tramiteId,
    entidadLabel:  `Workflow multa — ${tramiteId}`,
    usuarioId:     gestorId,
    usuarioNombre: gestorNombre,
    usuarioRol:    'gestor',
    nota:          'Trámite de multa/infracción finalizado y archivado',
  })
}

// ─── ADMIN: RETROCEDER PASO ───────────────────────────────────────────────────

/**
 * Permite a un admin/propietario retroceder el workflow a un paso anterior
 * con trazabilidad de auditoría.
 */
export async function retrocederPasoMulta(
  tramiteId:    string,
  adminId:      string,
  adminNombre:  string,
  pasoObjetivo: 1 | 2 | 3 | 4 | 5,
  motivo:       string,
  workflow:     MultaWorkflow,
): Promise<void> {
  const entrada = {
    campo:             'pasoActual',
    valorAnterior:     workflow.pasoActual,
    valorNuevo:        pasoObjetivo,
    modificadoPor:     adminId,
    modificadoPorNombre: adminNombre,
    modificadoEn:      Timestamp.now(),
    nota:              motivo,
  }
  await updateDoc(workflowDoc(tramiteId), {
    pasoActual:    pasoObjetivo,
    auditoria:     [...(workflow.auditoria ?? []), entrada],
    actualizadoEn: serverTimestamp(),
  })
}