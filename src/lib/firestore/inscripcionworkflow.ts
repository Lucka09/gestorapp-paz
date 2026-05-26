// src/lib/firestore/inscripcionWorkflow.ts
// ─── FIRESTORE — INSCRIPCIÓN WORKFLOW ─────────────────────────────────────────
// Colección: `inscripcionWorkflow`
// Un documento por trámite (id = tramiteId)
// Completamente independiente de la colección `tramites` existente.

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, Timestamp, query, where, collection,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { registrarActividad }   from '@/lib/firestore/audit'
import { cambiarEstadoTramite } from '@/lib/firestore/tramites'
import { tramitesCol }          from '@/lib/firestore/collections'
import type {
  InscripcionWorkflow, Paso1Data, Paso2Data, Paso3Data,
  Paso4Data, Paso5Data, Paso6Data, Paso7Data,
  IntentoRetiroChapa, AuditModificacion, AlertaChapaEnviada,
  GeoRegistro,
} from '@/torre_types'
import type { Rol } from '@/types'

// ─── COLLECTION REF ───────────────────────────────────────────────────────────

const workflowsCol = collection(db, 'inscripcionWorkflow')
const workflowDoc  = (tramiteId: string) => doc(workflowsCol, tramiteId)

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Suscripción en tiempo real a un workflow por tramiteId */
// Toca actualizadoEn del trámite para que la Torre de Control muestre actividad reciente
async function tocarTramite(tramiteId: string): Promise<void> {
  try {
    await updateDoc(doc(tramitesCol, tramiteId), { actualizadoEn: serverTimestamp() })
  } catch { /* no bloquear el flujo si falla */ }
}

export function subscribeWorkflow(
  tramiteId: string,
  callback:  (w: InscripcionWorkflow | null) => void,
): Unsubscribe {
  return onSnapshot(workflowDoc(tramiteId), snap => {
    callback(snap.exists() ? ({ ...snap.data(), id: snap.id } as InscripcionWorkflow) : null)
  })
}

/** Suscripción a todos los workflows de una gestoría */
export function subscribeWorkflowsGestoria(
  gestoriaId: string,
  callback:   (workflows: InscripcionWorkflow[]) => void,
): Unsubscribe {
  const q = query(workflowsCol, where('gestoriaId', '==', gestoriaId))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as InscripcionWorkflow))
  )
}

export async function getWorkflowsGestoria(
  gestoriaId: string,
): Promise<InscripcionWorkflow[]> {
  const { getDocs } = await import('firebase/firestore')
  const q = query(workflowsCol, where('gestoriaId', '==', gestoriaId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as InscripcionWorkflow))
}

/** Lectura única de un workflow */
export async function getWorkflow(tramiteId: string): Promise<InscripcionWorkflow | null> {
  const snap = await getDoc(workflowDoc(tramiteId))
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as InscripcionWorkflow) : null
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * Crea el documento de workflow cuando se asigna un trámite inscripcion_inicial.
 * Llamar desde la Torre de Control al asignar el trámite a un gestor.
 */
export async function crearWorkflow(
  tramiteId:  string,
  gestoriaId: string,
  creadoPor:  string,
): Promise<void> {
  const ref  = workflowDoc(tramiteId)
  const snap = await getDoc(ref)
  if (snap.exists()) return  // idempotente: ya existe, no sobreescribir

  await setDoc(ref, {
    tramiteId,
    gestoriaId,
    pasoActual:    1,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  await registrarActividad({
    accion:        'crear',
    entidad:       'tramite',
    entidadId:     tramiteId,
    entidadLabel:  `Workflow inscripción — ${tramiteId}`,
    usuarioId:     creadoPor,
    usuarioNombre: creadoPor,
    usuarioRol:    'propietario',
    nota:          'Workflow de inscripción inicial creado',
  })
}

// ─── AVANZAR PASOS ────────────────────────────────────────────────────────────

/** Paso 1: Gestor confirma recepción */
export async function confirmarPaso1(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
): Promise<void> {
  const paso1: Paso1Data = {
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso1,
    pasoActual:    2,
    actualizadoEn: serverTimestamp(),
  })
  // Marcar trámite como en proceso al arrancar el workflow
  await cambiarEstadoTramite(tramiteId, 'en_proceso')
}

/** Paso 2: Documentación del titular + fotos */
export async function confirmarPaso2(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: { nombreTitular: string; nroDni: string },
  fotos: Paso2Data['fotos'],
): Promise<void> {
  const paso2: Paso2Data = {
    ...datos,
    fotos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso2,
    pasoActual:    3,
    actualizadoEn: serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/** Paso 3: Captura de precarga */
export async function confirmarPaso3(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  fotos:        Paso3Data['fotos'],
): Promise<void> {
  const paso3: Paso3Data = {
    fotos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso3,
    pasoActual:    4,
    actualizadoEn: serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/** Paso 4: Turno obtenido + datos + fotos */
export async function confirmarPaso4(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  datos: {
    fechaTurno:        string
    horaTurno:         string
    registroUbicacion: string
    montoGestor:       number
  },
  fotos: Paso4Data['fotos'],
): Promise<void> {
  const paso4: Paso4Data = {
    ...datos,
    fotos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso4,
    pasoActual:    5,
    actualizadoEn: serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/** Paso 5: Recibo de presentación — NO avanza a paso 7 directamente */
export async function confirmarPaso5(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  fotos:        Paso5Data['fotos'],
  ubicacion?:   GeoRegistro,   // geo al presentarse en el registro (opcional)
): Promise<void> {
  const paso5: Paso5Data = {
    fotos,
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
    ...(ubicacion ? { ubicacion } : {}),
  }
  await updateDoc(workflowDoc(tramiteId), {
    paso5,
    pasoActual:    6,
    actualizadoEn: serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/**
 * Paso 6 - Inicio: El gestor indica cuántos días hasta la chapa.
 * Se llama inmediatamente después de confirmar el paso 5.
 * El registroUbicacion se obtiene automáticamente del paso 4.
 */
export async function iniciarPaso6(
  tramiteId:         string,
  gestorId:          string,
  gestorNombre:      string,
  diasIndicados:     number,
  registroUbicacion: string,
): Promise<void> {
  const ahora = new Date()
  ahora.setDate(ahora.getDate() + diasIndicados)
  ahora.setHours(9, 0, 0, 0)
  const fechaEstimadaRetiro = Timestamp.fromDate(ahora)

  const paso6: Paso6Data = {
    diasIndicados,
    fechaEstimadaRetiro,
    registroUbicacion,
    estado:            'pendiente',
    intentos:          [],
    alertasEnviadas:   [],
    iniciadoPor:       gestorId,
    iniciadoPorNombre: gestorNombre,
    iniciadoEn:        Timestamp.now(),
  }

  await updateDoc(workflowDoc(tramiteId), {
    paso6,
    actualizadoEn: serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/**
 * Paso 6 - El gestor confirma que SÍ retiró la chapa.
 * Requiere foto. Avanza a paso 7.
 */
export async function confirmarRetiroChapa(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  fotoChapaUrl: string,
  workflow:     InscripcionWorkflow,
  ubicacion?:   GeoRegistro,   // geo al retirar la chapa (opcional, pero recomendado)
): Promise<void> {
  const intento: IntentoRetiroChapa = {
    numero:              (workflow.paso6?.intentos.length ?? 0) + 1,
    fechaEstimada:       workflow.paso6!.fechaEstimadaRetiro,
    diasIndicados:       workflow.paso6!.diasIndicados,
    resultado:           'retirado',
    respondidoPor:       gestorId,
    respondidoPorNombre: gestorNombre,
    respondidoEn:        Timestamp.now(),
    fotoChapaUrl,
    ...(ubicacion ? { ubicacion } : {}),
  }

  const paso7: Paso7Data = {
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
    completadoEn:        Timestamp.now(),
  }

  await updateDoc(workflowDoc(tramiteId), {
    'paso6.estado':           'retirada',
    'paso6.fotoChapaUrl':     fotoChapaUrl,
    'paso6.cerradoPor':       gestorId,
    'paso6.cerradoPorNombre': gestorNombre,
    'paso6.cerradoEn':        Timestamp.now(),
    'paso6.intentos':         [...(workflow.paso6?.intentos ?? []), intento],
    paso7,
    pasoActual:               7,
    actualizadoEn:            serverTimestamp(),
  })
  // Cerrar el trámite en la colección tramites
  await cambiarEstadoTramite(tramiteId, 'completado', {
    completadoPor:       gestorId,
    completadoPorNombre: gestorNombre,
  })
}

/**
 * Paso 6 - El gestor confirma que NO pudo retirar la chapa.
 * Asigna una nueva fecha. El ciclo de alertas se reinicia.
 */
export async function postergarRetiroChapa(
  tramiteId:    string,
  gestorId:     string,
  gestorNombre: string,
  nuevosDias:   number,
  nota:         string | undefined,
  workflow:     InscripcionWorkflow,
  ubicacion?:   GeoRegistro,   // geo al presentarse (aunque no esté la chapa)
): Promise<void> {
  const nuevaFecha = new Date()
  nuevaFecha.setDate(nuevaFecha.getDate() + nuevosDias)
  nuevaFecha.setHours(9, 0, 0, 0)
  const nuevaFechaEstimada = Timestamp.fromDate(nuevaFecha)

  const intento: IntentoRetiroChapa = {
    numero:              (workflow.paso6?.intentos.length ?? 0) + 1,
    fechaEstimada:       workflow.paso6!.fechaEstimadaRetiro,
    diasIndicados:       workflow.paso6!.diasIndicados,
    resultado:           'postergado',
    respondidoPor:       gestorId,
    respondidoPorNombre: gestorNombre,
    respondidoEn:        Timestamp.now(),
    nota,
    nuevosDias,
    nuevaFechaEstimada,
    ...(ubicacion ? { ubicacion } : {}),
  }

  await updateDoc(workflowDoc(tramiteId), {
    'paso6.estado':               'postergada',
    'paso6.fechaEstimadaRetiro':  nuevaFechaEstimada,
    'paso6.diasIndicados':        nuevosDias,
    'paso6.alertasEnviadas':      [],
    'paso6.intentos':             [...(workflow.paso6?.intentos ?? []), intento],
    actualizadoEn:                serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/**
 * Admin/Propietario reasigna la fecha de retiro manualmente.
 * Deja trazabilidad de auditoría obligatoria.
 */
export async function reasignarFechaChapa(
  tramiteId:     string,
  adminId:       string,
  adminNombre:   string,
  adminRol:      Rol,           // ← tipado como Rol, no string
  nuevosDias:    number,
  nota:          string,
  workflow:      InscripcionWorkflow,
): Promise<void> {
  const nuevaFecha = new Date()
  nuevaFecha.setDate(nuevaFecha.getDate() + nuevosDias)
  nuevaFecha.setHours(9, 0, 0, 0)
  const nuevaFechaEstimada = Timestamp.fromDate(nuevaFecha)

  const modificacion: AuditModificacion = {
    campo:               'fechaEstimadaRetiro',
    valorAnterior:       workflow.paso6?.fechaEstimadaRetiro,
    valorNuevo:          nuevaFechaEstimada,
    modificadoPor:       adminId,
    modificadoPorNombre: adminNombre,
    modificadoPorRol:    adminRol,
    modificadoEn:        Timestamp.now(),
    nota,
  }

  const intentos = [...(workflow.paso6?.intentos ?? [])]
  if (intentos.length > 0) {
    const ultimo = { ...intentos[intentos.length - 1] }
    ultimo.modificaciones = [...(ultimo.modificaciones ?? []), modificacion]
    intentos[intentos.length - 1] = ultimo
  }

  await updateDoc(workflowDoc(tramiteId), {
    'paso6.fechaEstimadaRetiro': nuevaFechaEstimada,
    'paso6.diasIndicados':       nuevosDias,
    'paso6.estado':              'pendiente',
    'paso6.alertasEnviadas':     [],
    'paso6.intentos':            intentos,
    actualizadoEn:               serverTimestamp(),
  })

  await registrarActividad({
    accion:        'editar',
    entidad:       'tramite',
    entidadId:     tramiteId,
    entidadLabel:  `Reasignación fecha chapa — ${tramiteId}`,
    usuarioId:     adminId,
    usuarioNombre: adminNombre,
    usuarioRol:    adminRol,    // ← valor, no tipo
    nota:          `Admin reasignó fecha retiro chapa: ${nuevosDias} días. Nota: ${nota}`,
  })
}

/** Registrar que se envió una alerta de chapa (para no repetir) */
export async function registrarAlertaChapaEnviada(
  tramiteId: string,
  alerta:    AlertaChapaEnviada,
): Promise<void> {
  const wf = await getWorkflow(tramiteId)
  if (!wf?.paso6) return
  const alertasEnviadas = [...(wf.paso6.alertasEnviadas ?? []), alerta]
  await updateDoc(workflowDoc(tramiteId), {
    'paso6.alertasEnviadas': alertasEnviadas,
    actualizadoEn:           serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

/** Marcar paso 6 como atrasado (sin confirmación del gestor en la fecha) */
export async function marcarChapaAtrasada(tramiteId: string): Promise<void> {
  await updateDoc(workflowDoc(tramiteId), {
    'paso6.estado': 'atrasada',
    actualizadoEn:  serverTimestamp(),
  })
  void tocarTramite(tramiteId)
}

// ─── ADMIN: SOLICITAR RESUBIDA DE FOTO ───────────────────────────────────────

/**
 * El admin solicita que el gestor resubba una foto de un paso.
 * Actualiza el flag en la foto específica dentro del paso.
 */
export async function solicitarResubidaFoto(
  tramiteId:   string,
  pasoNumero:  2 | 3 | 4 | 5,
  fotoIndex:   number,
  adminId:     string,
  adminNombre: string,
  nota:        string,
): Promise<void> {
  const wf = await getWorkflow(tramiteId)
  if (!wf) return

  const pasoKey = `paso${pasoNumero}` as 'paso2' | 'paso3' | 'paso4' | 'paso5'
  const paso = wf[pasoKey] as {
    fotos: {
      adminFlag?:       boolean
      adminFlagPor?:    string
      adminFlagNombre?: string
      adminFlagEn?:     Timestamp
      adminFlagNota?:   string
    }[]
  } | undefined
  if (!paso?.fotos?.[fotoIndex]) return

  const fotos = [...paso.fotos]
  fotos[fotoIndex] = {
    ...fotos[fotoIndex],
    adminFlag:       true,
    adminFlagPor:    adminId,
    adminFlagNombre: adminNombre,
    adminFlagEn:     Timestamp.now(),
    adminFlagNota:   nota,
  }

  await updateDoc(workflowDoc(tramiteId), {
    [`${pasoKey}.fotos`]: fotos,
    actualizadoEn:        serverTimestamp(),
  })
}

/** El admin quita el flag de resubida de una foto */
export async function quitarFlagFoto(
  tramiteId:  string,
  pasoNumero: 2 | 3 | 4 | 5,
  fotoIndex:  number,
): Promise<void> {
  const wf = await getWorkflow(tramiteId)
  if (!wf) return

  const pasoKey = `paso${pasoNumero}` as 'paso2' | 'paso3' | 'paso4' | 'paso5'
  const paso = wf[pasoKey] as { fotos: Record<string, unknown>[] } | undefined
  if (!paso?.fotos?.[fotoIndex]) return

  const fotos = [...paso.fotos]
  const rest = { ...(fotos[fotoIndex] as Record<string, unknown>) }
  delete rest.adminFlag
  delete rest.adminFlagPor
  delete rest.adminFlagNombre
  delete rest.adminFlagEn
  delete rest.adminFlagNota
  fotos[fotoIndex] = rest

  await updateDoc(workflowDoc(tramiteId), {
    [`${pasoKey}.fotos`]: fotos,
    actualizadoEn:        serverTimestamp(),
  })
}