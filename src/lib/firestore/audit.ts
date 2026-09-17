import {
  collection, addDoc, query, where,
  orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db }   from '../firebase'
import type {
  EntradaAudit, AccionAudit, EntidadAudit, Rol,
} from '@/types'
 
// ─── COLECCIÓN ────────────────────────────────────────────────────────────────
 
export const auditCol = collection(db, 'audit_log')
 
const noop: Unsubscribe = () => {}
 
// ─── REGISTRAR EVENTO ─────────────────────────────────────────────────────────
 
export async function registrarActividad(
  entrada: Omit<EntradaAudit, 'id' | 'timestamp'>,
): Promise<void> {
  // gestoriaId dejó de ser opcional en la práctica: la regla de create exige
  // `request.resource.data.gestoriaId == miPerfil().gestoriaId`. Sin él, el
  // addDoc se rechaza en silencio (el catch de abajo lo traga).
  if (!entrada.gestoriaId) {
    console.warn(
      '[Audit] Entrada sin gestoriaId — no se registra:',
      entrada.accion, entrada.entidad, entrada.entidadId,
    )
    return
  }
  try {
    await addDoc(auditCol, {
      ...entrada,
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    // El audit nunca debe romper el flujo principal
    console.warn('[Audit] Error al registrar actividad:', err)
  }
}
 
// ─── LEER — FEED GENERAL ──────────────────────────────────────────────────────
 
export function subscribeActividad(
  gestoriaId: string,
  callback: (entradas: EntradaAudit[]) => void,
  opts: {
    limite?:    number
    entidad?:   EntidadAudit
    entidadId?: string
    usuarioId?: string
  } = {},
): Unsubscribe {
  if (!gestoriaId) {
    callback([])
    return noop
  }
 
  const { limite = 50, entidad, entidadId, usuarioId } = opts
 
  // gestoriaId va SIEMPRE primero. Los demás filtros se suman encima.
  const filtros = [where('gestoriaId', '==', gestoriaId)]
  if (entidadId)      filtros.push(where('entidadId', '==', entidadId))
  else if (entidad)   filtros.push(where('entidad',   '==', entidad))
  else if (usuarioId) filtros.push(where('usuarioId', '==', usuarioId))
 
  const q = query(auditCol, ...filtros, orderBy('timestamp', 'desc'), limit(limite))
 
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as EntradaAudit)),
    err  => {
      console.error('[Audit] snapshot error:', err.code, err.message)
      callback([])   // resuelve el loading en vez de colgar la página
    },
  )
}
 
// ─── LEER — UNA VEZ (para reportes / export) ─────────────────────────────────
 
export async function getActividad(
  gestoriaId: string,
  opts: {
    limite?:    number
    entidad?:   EntidadAudit
    entidadId?: string
    usuarioId?: string
  } = {},
): Promise<EntradaAudit[]> {
  if (!gestoriaId) return []
 
  const { limite = 200, entidad, entidadId, usuarioId } = opts
  const filtros = [where('gestoriaId', '==', gestoriaId)]
  if (entidadId)      filtros.push(where('entidadId', '==', entidadId))
  else if (entidad)   filtros.push(where('entidad',   '==', entidad))
  else if (usuarioId) filtros.push(where('usuarioId', '==', usuarioId))
 
  const snap = await getDocs(
    query(auditCol, ...filtros, orderBy('timestamp', 'desc'), limit(limite)),
  )
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as EntradaAudit)
}
 
// ─── METADATOS DE DISPLAY ─────────────────────────────────────────────────────
// (sin cambios — se mantienen ACCION_CONFIG y ENTIDAD_CONFIG tal cual están)
  
export const ACCION_CONFIG: Record<AccionAudit, {
  label: string; emoji: string; color: string; bg: string
}> = {
  crear:              { label: 'Creó',            emoji: '✨', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  editar:             { label: 'Editó',           emoji: '✏️', color: 'text-blue-700',    bg: 'bg-blue-50' },
  eliminar:           { label: 'Eliminó',         emoji: '🗑️', color: 'text-red-700',     bg: 'bg-red-50' },
  cambiar_estado:     { label: 'Cambió el estado',emoji: '🔄', color: 'text-orange-700',  bg: 'bg-orange-50' },
  registrar_pago:     { label: 'Registró un pago',emoji: '💰', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  desmarcar_pago:     { label: 'Desmarcó el pago',emoji: '↩️', color: 'text-amber-700',   bg: 'bg-amber-50' },
  crear_acceso:       { label: 'Dio acceso',      emoji: '🔑', color: 'text-violet-700',  bg: 'bg-violet-50' },
  confirmar_turno:    { label: 'Confirmó turno',  emoji: '✅', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  cancelar_turno:     { label: 'Canceló turno',   emoji: '❌', color: 'text-red-700',     bg: 'bg-red-50' },
  importar:           { label: 'Importó',         emoji: '📥', color: 'text-cyan-700',    bg: 'bg-cyan-50' },
  login:              { label: 'Ingresó',         emoji: '🔓', color: 'text-gray-600',    bg: 'bg-gray-50' },
  acceso_denegado:    { label: 'Acceso denegado', emoji: '🚫', color: 'text-red-700',     bg: 'bg-red-50' },
  autoasignar_gestion_transferencia:
                      { label: 'Se autoasignó',   emoji: '🙋', color: 'text-cyan-700',    bg: 'bg-cyan-50' },
  asignar_gestor_transferencia:
                      { label: 'Asignó gestor',   emoji: '👥', color: 'text-cyan-700',    bg: 'bg-cyan-50' },
}
 
export const ENTIDAD_CONFIG: Record<EntidadAudit, {
  label: string; emoji: string
}> = {
  cliente:       { label: 'Cliente',       emoji: '👤' },
  vehiculo:      { label: 'Vehículo',      emoji: '🚗' },
  tramite:       { label: 'Trámite',       emoji: '📋' },
  turno:         { label: 'Turno',         emoji: '📅' },
  usuario:       { label: 'Usuario',       emoji: '👥' },
  configuracion: { label: 'Configuración', emoji: '⚙️' },
  presupuesto:   { label: 'Presupuesto',   emoji: '🧾' },
  sistema:       { label: 'Sistema',       emoji: '🖥️' },
}
// ─── HELPERS PARA CONSTRUIR ENTRADAS ─────────────────────────────────────────
 
interface ContextoUsuario {
  uid:        string
  nombre:     string
  rol:        Rol
  gestoriaId: string        // ← ahora obligatorio
}
 
export function buildAudit(
  ctx:     ContextoUsuario,
  accion:  AccionAudit,
  entidad: EntidadAudit,
  entidadId:    string,
  entidadLabel: string,
  extra: {
    antes?:   Record<string, any>
    despues?: Record<string, any>
    nota?:    string
  } = {},
): Omit<EntradaAudit, 'id' | 'timestamp'> {
  return {
    gestoriaId:    ctx.gestoriaId,       // ← se deja de olvidar
    accion,
    entidad,
    entidadId,
    entidadLabel,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    ...extra,
  }
}