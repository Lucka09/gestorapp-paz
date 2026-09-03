/**
 * EVENTO TYPES
 * ─────────────────────────────────────────────────────────────────
 * Event stream append-only.
 *
 * Usos:
 *   1. Dashboard de actividad en tiempo real
 *   2. Feed "qué pasó hoy" para el propietario
 *   3. Contexto para IA (ej: "resumen semanal del CRM")
 *   4. Disparador del motor de automatizaciones
 *   5. Audit trail extendido (complementa audit_log)
 *
 * Diseño:
 *   • Nunca se actualiza ni se borra.
 *   • Cada evento tiene un `resumen` en lenguaje natural para IA.
 *   • El `payload` es libre por tipo — lo consume el motor de automatizaciones.
 */
import type { Timestamp } from 'firebase/firestore'
import type { Rol } from './index'

// ─── TIPOS DE EVENTO (por dominio) ──────────────────────────────────────────

export type TipoEventoLead =
  | 'lead.creado'
  | 'lead.contactado'
  | 'lead.calificado'
  | 'lead.asignado'
  | 'lead.convertido'
  | 'lead.perdido'
  | 'lead.descartado'

export type TipoEventoProspecto =
  | 'prospecto.creado'
  | 'prospecto.etapa_cambiada'
  | 'prospecto.cerrado_ganado'
  | 'prospecto.cerrado_perdido'

export type TipoEventoCliente =
  | 'cliente.creado'
  | 'cliente.actualizado'
  | 'cliente.archivado'
  | 'cliente.reactivado'

export type TipoEventoTramite =
  | 'tramite.creado'
  | 'tramite.estado_cambiado'
  | 'tramite.asignado'
  | 'tramite.documento_subido'
  | 'tramite.completado'

export type TipoEventoPago =
  | 'pago.registrado'
  | 'pago.anulado'
  | 'recibo.emitido'

export type TipoEventoComunicacion =
  | 'wa.mensaje_recibido'
  | 'wa.mensaje_enviado'
  | 'wa.conversacion_iniciada'
  | 'email.enviado'
  | 'email.abierto'
  | 'llamada.registrada'
  | 'nota.creada'

export type TipoEventoSistema =
  | 'automatizacion.disparada'
  | 'automatizacion.fallida'
  | 'usuario.login'
  | 'usuario.logout'
  | 'configuracion.actualizada'
  | 'campana.enviada'
  | 'backup.completado'
  | 'vencimiento.alertado'

export type TipoEventoOperativo =
  | 'presupuesto.enviado'
  | 'turno.confirmado'

export type TipoEvento =
  | TipoEventoLead
  | TipoEventoProspecto
  | TipoEventoCliente
  | TipoEventoTramite
  | TipoEventoPago
  | TipoEventoComunicacion
  | TipoEventoSistema
  | TipoEventoOperativo

// ─── ENTIDADES REFERENCIABLES ───────────────────────────────────────────────

export type EntidadEvento =
  | 'lead'
  | 'prospecto'
  | 'cliente'
  | 'tramite'
  | 'consulta'
  | 'turno'
  | 'vehiculo'
  | 'pago'
  | 'recibo'
  | 'conversacionWA'
  | 'campana'
  | 'usuario'
  | 'automatizacion'
  | 'sistema'

// ─── ACTOR ──────────────────────────────────────────────────────────────────

export type ActorId = string // uid del usuario, o uno de estos literales:
                             // 'system' | 'wa_api' | 'web_form' | 'scheduler'

export interface Actor {
  id: ActorId
  nombre?: string
  rol?: Rol
  tipo: 'usuario' | 'sistema' | 'integracion'
}

// ─── INTERFAZ PRINCIPAL ─────────────────────────────────────────────────────

export interface Evento {
  id: string
  gestoriaId: string

  tipo: TipoEvento
  entidad: EntidadEvento
  entidadId: string
  entidadLabel?: string // "García, Juan" — evita lookups en UI

  // Actor que ejecutó la acción
  actor: Actor

  // Payload específico — estructura libre por tipo de evento
  // Ejemplos:
  //   lead.creado:            { canal, fuente, telefono }
  //   tramite.estado_cambiado: { estadoAnterior, estadoNuevo, nota }
  //   pago.registrado:        { monto, formaPago, reciboId }
  payload?: Record<string, unknown>

  // Resumen en lenguaje natural — clave para IA
  // Ej: "Juan García convirtió el lead de Transferencia por $45.000"
  resumen?: string

  // Canal de origen (si aplica)
  canal?: 'whatsapp' | 'web' | 'email' | 'telefono' | 'manual' | 'sistema'

  // Metadatos técnicos
  ip?: string
  userAgent?: string

  // Timestamp
  timestamp: Timestamp
}

// ─── INPUT PARA CREAR EVENTOS ───────────────────────────────────────────────

export type EventoInput = Omit<Evento, 'id' | 'timestamp'>

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Builder para construir eventos de forma consistente.
 * Uso: crearEvento({ gestoriaId, tipo: 'lead.creado', ... })
 */
export function crearEvento(
  params: Omit<EventoInput, 'actor'> & {
    actorId: ActorId
    actorNombre?: string
    actorRol?: Rol
    actorTipo?: Actor['tipo']
  }
): EventoInput {
  const { actorId, actorNombre, actorRol, actorTipo = 'usuario', ...rest } = params
  const actor: Actor = { id: actorId, tipo: actorTipo }
  if (actorNombre !== undefined) actor.nombre = actorNombre
  if (actorRol   !== undefined) actor.rol   = actorRol
  return { ...rest, actor }
}

/**
 * Agrupa tipos de evento por dominio — útil para filtros en UI y permisos.
 */
export const DOMINIOS_EVENTO = {
  leads: [
    'lead.creado', 'lead.contactado', 'lead.calificado',
    'lead.asignado', 'lead.convertido', 'lead.perdido', 'lead.descartado',
  ] as const,
  prospectos: [
    'prospecto.creado', 'prospecto.etapa_cambiada',
    'prospecto.cerrado_ganado', 'prospecto.cerrado_perdido',
  ] as const,
  clientes: [
    'cliente.creado', 'cliente.actualizado',
    'cliente.archivado', 'cliente.reactivado',
  ] as const,
  tramites: [
    'tramite.creado', 'tramite.estado_cambiado', 'tramite.asignado',
    'tramite.documento_subido', 'tramite.completado',
  ] as const,
  pagos: ['pago.registrado', 'pago.anulado', 'recibo.emitido'] as const,
  comunicacion: [
    'wa.mensaje_recibido', 'wa.mensaje_enviado', 'wa.conversacion_iniciada',
    'email.enviado', 'email.abierto', 'llamada.registrada', 'nota.creada',
  ] as const,
  sistema: [
    'automatizacion.disparada', 'automatizacion.fallida',
    'usuario.login', 'usuario.logout', 'configuracion.actualizada',
    'campana.enviada', 'backup.completado', 'vencimiento.alertado',
  ] as const,
} as const

// ─── LABELS PARA UI ─────────────────────────────────────────────────────────

export const TIPO_EVENTO_LABELS: Partial<Record<TipoEvento, string>> = {
  'lead.creado': 'Lead creado',
  'lead.contactado': 'Lead contactado',
  'lead.calificado': 'Lead calificado',
  'lead.asignado': 'Lead asignado',
  'lead.convertido': 'Lead convertido',
  'lead.perdido': 'Lead perdido',
  'lead.descartado': 'Lead descartado',
  'prospecto.creado': 'Prospecto creado',
  'prospecto.etapa_cambiada': 'Etapa cambiada',
  'prospecto.cerrado_ganado': 'Cerrado ganado',
  'prospecto.cerrado_perdido': 'Cerrado perdido',
  'cliente.creado': 'Cliente creado',
  'cliente.actualizado': 'Cliente actualizado',
  'tramite.creado': 'Trámite creado',
  'tramite.estado_cambiado': 'Estado de trámite',
  'tramite.completado': 'Trámite completado',
  'pago.registrado': 'Pago registrado',
  'recibo.emitido': 'Recibo emitido',
  'wa.mensaje_recibido': 'Mensaje WA recibido',
  'wa.mensaje_enviado': 'Mensaje WA enviado',
  'automatizacion.disparada': 'Automatización ejecutada',
  'automatizacion.fallida': 'Automatización falló',
  'presupuesto.enviado': 'Presupuesto enviado',
  'turno.confirmado': 'Turno confirmado',
}

export const TIPO_EVENTO_EMOJI: Partial<Record<TipoEvento, string>> = {
  'lead.creado': '🎯',
  'lead.convertido': '🏆',
  'lead.perdido': '❌',
  'prospecto.cerrado_ganado': '💰',
  'tramite.creado': '📋',
  'tramite.completado': '✅',
  'pago.registrado': '💵',
  'recibo.emitido': '🧾',
  'wa.mensaje_recibido': '💬',
  'wa.mensaje_enviado': '📤',
  'automatizacion.disparada': '⚙️',
  'automatizacion.fallida': '⚠️',
  'usuario.login': '🔑',
  'presupuesto.enviado': '📨',
  'turno.confirmado': '📅',
}