// functions/src/automatizaciones/ejecutores.ts
// Registro de ejecutores idempotentes: uno por TipoAccion.
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { rellenarPlantilla } from './condiciones'
import { sendTextMessage, normalizarTelefono } from '../utils/Utils'

const db = admin.firestore()
const FV = admin.firestore.FieldValue

export const COLECCION_POR_ENTIDAD: Record<string, string> = {
  lead: 'leads', prospecto: 'prospectos', cliente: 'clientes', tramite: 'tramites',
}

export interface CtxAutomatizacion {
  evento: any
  gestoriaId: string
  entidadDoc: any | null
  automatizacion: any
}

type Ejecutor = (accion: any, ctx: CtxAutomatizacion) => Promise<void>

function contextoPlantilla(ctx: CtxAutomatizacion): any {
  return { ...ctx.evento, ...(ctx.evento.payload ?? {}), ...(ctx.entidadDoc ?? {}) }
}

async function actualizarAsignado(ctx: CtxAutomatizacion, uid: string, nombre: string) {
  const col = COLECCION_POR_ENTIDAD[ctx.evento.entidad]
  if (!col || !ctx.evento.entidadId) return
  await db.collection(col).doc(ctx.evento.entidadId).update({
    asignadoA: uid, asignadoNombre: nombre, actualizadoEn: FV.serverTimestamp(),
  })
}

// ── ASIGNACIÓN ROTATIVA (round-robin estable) ────────────────────────────────
const ROLES_DEFAULT = ['asesor_comercial', 'vendedor', 'operador']

const ejecutarAsignarRotativo: Ejecutor = async (accion, ctx) => {
  const roles: string[] = accion.params?.roles
    ?? (accion.params?.rol ? [accion.params.rol] : ROLES_DEFAULT)

  const snap = await db.collection('users')
    .where('gestoriaId', '==', ctx.gestoriaId)
    .where('activo', '==', true)
    .get()
  const miembros = snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as any))
    .filter(m => roles.includes(m.rol))
    .sort((a, b) => a.uid.localeCompare(b.uid))   // orden estable entre ejecuciones

  if (miembros.length === 0) {
    logger.warn('[motor] sin miembros para rotativo', { roles })
    return
  }

  const metaRef  = db.collection('automatizaciones_meta').doc(ctx.gestoriaId)
  const metaSnap = await metaRef.get()
  const ultimo   = metaSnap.exists ? (metaSnap.data()?.ultimoIndiceRotativo ?? -1) : -1
  const indice   = (ultimo + 1) % miembros.length
  const elegido  = miembros[indice]
  await metaRef.set({ ultimoIndiceRotativo: indice, actualizadoEn: Date.now() }, { merge: true })

  const nombre = `${elegido.nombre ?? ''} ${elegido.apellido ?? ''}`.trim()
  await actualizarAsignado(ctx, elegido.uid, nombre)
}

// ── ASIGNAR A USUARIO ESPECÍFICO ─────────────────────────────────────────────
const ejecutarAsignarUsuario: Ejecutor = async (accion, ctx) => {
  const uid = accion.params?.uid
  if (!uid) return
  const u = await db.doc(`users/${uid}`).get()
  if (!u.exists) return
  const d = u.data() as any
  await actualizarAsignado(ctx, uid, `${d.nombre ?? ''} ${d.apellido ?? ''}`.trim())
}

// ── CREAR TAREA ──────────────────────────────────────────────────────────────
const ejecutarCrearTarea: Ejecutor = async (accion, ctx) => {
  const titulo = rellenarPlantilla(accion.params?.titulo ?? 'Seguimiento: {nombre}', contextoPlantilla(ctx))
  const horas  = Number(accion.params?.vencimientoHoras ?? 24)
  await db.collection('tareas').add({
    gestoriaId: ctx.gestoriaId,
    titulo,
    descripcion: ctx.evento.resumen ?? '',
    prioridad: accion.params?.prioridad ?? 'normal',
    estado: 'pendiente',
    clienteId:   ctx.evento.entidad === 'cliente'   ? ctx.evento.entidadId : null,
    clienteNombre: ctx.evento.entidad === 'cliente' ? ctx.evento.entidadLabel : null,
    tramiteId:   ctx.evento.entidad === 'tramite'   ? ctx.evento.entidadId : null,
    tramiteLabel: ctx.evento.entidad === 'tramite'  ? ctx.evento.entidadLabel : null,
    leadId:      ctx.evento.entidad === 'lead'      ? ctx.evento.entidadId : null,
    prospectoId: ctx.evento.entidad === 'prospecto' ? ctx.evento.entidadId : null,
    asignadoA:      ctx.entidadDoc?.asignadoA ?? '',
    asignadoNombre: ctx.entidadDoc?.asignadoNombre ?? '',
    creadoPor: 'automatizacion',
    creadoPorNombre: `Automatización · ${ctx.automatizacion?.nombre ?? ''}`,
    vencimiento: admin.firestore.Timestamp.fromMillis(Date.now() + horas * 3600 * 1000),
    creadoEn: FV.serverTimestamp(),
    actualizadoEn: FV.serverTimestamp(),
  })
}

// ── CREAR NOTIFICACIÓN (al asignado, o al propietario si no hay) ─────────────
const ejecutarCrearNotificacion: Ejecutor = async (accion, ctx) => {
  let destinatario = ctx.entidadDoc?.asignadoA || null
  if (!destinatario) {
    const prop = await db.collection('users')
      .where('gestoriaId', '==', ctx.gestoriaId)
      .where('rol', '==', 'propietario')
      .limit(1).get()
    destinatario = prop.empty ? null : prop.docs[0].id
  }
  if (!destinatario) return
  await db.collection('notificaciones').add({
    gestoriaId: ctx.gestoriaId,
    destinatarioId: destinatario,
    titulo:  rellenarPlantilla(accion.params?.titulo ?? 'Novedad: {nombre}', contextoPlantilla(ctx)),
    mensaje: rellenarPlantilla(accion.params?.mensaje ?? (ctx.evento.resumen ?? ''), contextoPlantilla(ctx)),
    tipo: accion.params?.tipo ?? 'general',
    entidadTipo: ctx.evento.entidad ?? null,
    entidadId:   ctx.evento.entidadId ?? null,
    leida: false,
    creadoEn: FV.serverTimestamp(),
  })
}

// ── ENVIAR WHATSAPP (requiere secrets de Meta; falla visible si faltan) ──────
const ejecutarEnviarWA: Ejecutor = async (accion, ctx) => {
  const telefono = normalizarTelefono(ctx.entidadDoc?.telefono ?? '')
  if (!telefono) { logger.warn('[motor] enviar_wa sin teléfono'); return }
  const texto = rellenarPlantilla(
    accion.params?.texto ?? 'Hola {nombre}! Gracias por contactarte con Gestoría Paz. Ya estamos revisando tu consulta y te respondemos a la brevedad.',
    contextoPlantilla(ctx),
  )
  await sendTextMessage(telefono, texto)
}

// ── CAMBIAR ESTADO DE LEAD ───────────────────────────────────────────────────
const ejecutarCambiarEstadoLead: Ejecutor = async (accion, ctx) => {
  if (ctx.evento.entidad !== 'lead' || !ctx.evento.entidadId) return
  await db.collection('leads').doc(ctx.evento.entidadId).update({
    estado: accion.params?.estado ?? 'contactado',
    actualizadoEn: FV.serverTimestamp(),
  })
}

// ── REGISTRO ─────────────────────────────────────────────────────────────────
export const EJECUTORES: Record<string, Ejecutor> = {
  asignar_rotativo:    ejecutarAsignarRotativo,
  asignar_usuario:     ejecutarAsignarUsuario,
  crear_tarea:         ejecutarCrearTarea,
  crear_notificacion:  ejecutarCrearNotificacion,
  enviar_wa:           ejecutarEnviarWA,
  cambiar_estado_lead: ejecutarCambiarEstadoLead,
}