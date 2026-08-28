/**
 * AUTOMATIZACION TYPES
 * ─────────────────────────────────────────────────────────────────
 * Reglas configurables por tenant que conectan:
 *   Trigger (Evento) → Condiciones → Acciones
 *
 * Arquitectura:
 *   1. Cada write importante emite un Evento a /eventos
 *   2. Cloud Function onWrite evalúa las automatizaciones activas del tenant
 *   3. Las acciones se ejecutan desde un registro de ejecutores idempotentes
 *
 * Esto permite agregar nuevas automatizaciones sin tocar el motor:
 *   solo se añade un ejecutor al registro y se crean plantillas.
 */
import type { Timestamp } from 'firebase/firestore'
import type { TipoEvento } from './evento'

// ─── TRIGGERS ───────────────────────────────────────────────────────────────

/** Eventos que pueden disparar una automatización */
export type TriggerEvento = Extract<
  TipoEvento,
  | 'lead.creado'
  | 'lead.contactado'
  | 'lead.calificado'
  | 'lead.perdido'
  | 'prospecto.etapa_cambiada'
  | 'prospecto.cerrado_ganado'
  | 'tramite.estado_cambiado'
  | 'tramite.completado'
  | 'pago.registrado'
  | 'wa.mensaje_recibido'
  | 'vencimiento.alertado'
>

// ─── CONDICIONES ────────────────────────────────────────────────────────────

export type OperadorCondicion =
  | '=='
  | '!='
  | 'in'
  | 'not_in'
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'starts_with'
  | 'exists'
  | 'not_exists'

export interface Condicion {
  /** Path al campo dentro del payload del evento (ej: 'canal', 'estadoNuevo') */
  campo: string
  operador: OperadorCondicion
  valor: unknown
}

// ─── ACCIONES ───────────────────────────────────────────────────────────────

export type TipoAccion =
  | 'asignar_usuario'
  | 'asignar_rotativo'
  | 'cambiar_estado_lead'
  | 'cambiar_etapa_prospecto'
  | 'cambiar_estado_tramite'
  | 'enviar_wa'
  | 'enviar_email'
  | 'crear_tarea'
  | 'crear_notificacion'
  | 'crear_nota'
  | 'convertir_a_prospecto'
  | 'convertir_a_cliente'
  | 'llamar_webhook'
  | 'ejecutar_ia'           // ← prompts automáticos (clasificar, responder, resumir)
  | 'delay' 
  | 'convertir_a_cliente'
  | 'materializar_cliente'   // ← nuevo: crea cliente+vehículo al entrar el lead                // pausa antes de la siguiente acción

export interface Accion {
  tipo: TipoAccion
  /** Parámetros específicos de cada acción (ver documentación por tipo) */
  params: Record<string, unknown>
  /** Opcional: retraso en minutos antes de ejecutar esta acción */
  delayMinutos?: number
}

// ─── INTERFAZ PRINCIPAL ─────────────────────────────────────────────────────

export interface Automatizacion {
  id: string
  gestoriaId: string

  // Identificación
  nombre: string
  descripcion?: string
  activo: boolean
  plantillaId?: string       // si viene de una plantilla predefinida

  // Definición
  trigger: TriggerEvento
  condiciones: Condicion[]   // AND entre todas
  acciones: Accion[]         // en orden secuencial

  // Stats
  ejecucionesTotales: number
  ejecucionesExitosas: number
  ejecucionesFallidas: number
  ultimaEjecucion?: Timestamp

  // Auditoría
  creadoEn: Timestamp
  actualizadoEn: Timestamp
  creadoPor: string
  creadoPorNombre: string
}

// ─── LOG DE EJECUCIÓN ───────────────────────────────────────────────────────

export type EstadoEjecucion = 'ejecutada' | 'fallida' | 'omitida'

export interface EjecucionAutomatizacion {
  id: string
  gestoriaId: string
  automatizacionId: string
  automatizacionNombre: string
  eventoId: string
  eventoTipo: TipoEvento
  estado: EstadoEjecucion
  accionesEjecutadas: number
  accionesFallidas: number
  errores?: string[]
  duracionMs?: number
  timestamp: Timestamp
}

// ─── PLANTILLAS PREDEFINIDAS ────────────────────────────────────────────────

/**
 * Las plantillas se ofrecen al usuario como "automatizaciones sugeridas"
 * en la UI de configuración. Al activar una, se crea una copia en
 * /automatizaciones del tenant.
 */
export interface PlantillaAutomatizacion {
  id: string
  nombre: string
  descripcion: string
  categoria: 'leads' | 'tramites' | 'cobranzas' | 'comunicacion'
  trigger: TriggerEvento
  condiciones: Condicion[]
  acciones: Omit<Accion, 'delayMinutos'>[]
  /** true si requiere plan Profesional o superior */
  requierePlanPro?: boolean
}

export const PLANTILLAS_AUTOMATIZACION: PlantillaAutomatizacion[] = [
  {
    id: 'tpl_lead_web_asignar',
    nombre: 'Lead web → asignar a vendedor',
    descripcion: 'Cuando llega un lead desde el sitio web, se asigna a un asesor comercial de forma rotativa.',
    categoria: 'leads',
    trigger: 'lead.creado',
    condiciones: [{ campo: 'canal', operador: '==', valor: 'web' }],
    acciones: [
      { tipo: 'asignar_rotativo', params: { rol: 'asesor_comercial' } },
      { tipo: 'enviar_wa', params: { plantilla: 'bienvenida_lead', delayMinutos: 2 } },
      { tipo: 'crear_tarea', params: { titulo: 'Contactar lead {lead.nombre}', vencimientoHoras: 4 } },
    ],
  },
  {
    id: 'tpl_lead_sin_contacto_3d',
    nombre: 'Lead sin contactar 3 días → alerta al responsable',
    descripcion: 'Si un lead nuevo no es contactado en 3 días, notifica al asesor asignado y al gerente.',
    categoria: 'leads',
    trigger: 'lead.creado',
    condiciones: [{ campo: 'estado', operador: '==', valor: 'nuevo' }],
    acciones: [
      { tipo: 'crear_notificacion', params: {
          titulo: 'Lead sin contactar hace 3 días',
          prioridad: 'alta',
          destinatarios: ['asignado', 'gerente'],
          delayMinutos: 60 * 24 * 3,
        } },
    ],
  },
  {
    id: 'tpl_tramite_listo_notificar',
    nombre: 'Trámite listo → notificar al cliente por WA',
    descripcion: 'Cuando un trámite pasa a "listo_para_retirar", envía un WhatsApp al cliente con indicaciones.',
    categoria: 'tramites',
    trigger: 'tramite.estado_cambiado',
    condiciones: [{ campo: 'estadoNuevo', operador: '==', valor: 'listo_para_retirar' }],
    acciones: [
      { tipo: 'enviar_wa', params: { plantilla: 'listo_retirar', destinatario: 'cliente' } },
      { tipo: 'crear_tarea', params: { titulo: 'Confirmar retiro con {cliente.nombre}', vencimientoHoras: 72 } },
    ],
  },
  {
    id: 'tpl_tramite_cerrado_encuesta',
    nombre: 'Trámite entregado → encuesta de satisfacción',
    descripcion: '24hs después de entregar un trámite, pide al cliente que califique el servicio.',
    categoria: 'tramites',
    trigger: 'tramite.completado',
    condiciones: [],
    acciones: [
      { tipo: 'enviar_wa', params: {
          plantilla: 'encuesta_satisfaccion',
          destinatario: 'cliente',
          delayMinutos: 60 * 24,
        } },
    ],
  },
  {
    id: 'tpl_pago_registrado_recibo',
    nombre: 'Pago registrado → emitir recibo automáticamente',
    descripcion: 'Cuando se registra un pago, emite el recibo y lo envía al cliente por WA y email.',
    categoria: 'cobranzas',
    trigger: 'pago.registrado',
    condiciones: [{ campo: 'monto', operador: '>', valor: 0 }],
    acciones: [
      { tipo: 'enviar_wa', params: { plantilla: 'recibo_pago', destinatario: 'cliente' } },
      { tipo: 'enviar_email', params: { plantilla: 'recibo_pago', destinatario: 'cliente' } },
    ],
  },
  {
    id: 'tpl_wa_entrante_lead',
    nombre: 'WA entrante de número desconocido → crear lead',
    descripcion: 'Si llega un WhatsApp de un número que no es cliente ni prospecto, crea un lead automáticamente.',
    categoria: 'comunicacion',
    trigger: 'wa.mensaje_recibido',
    condiciones: [
      { campo: 'esCliente', operador: '==', valor: false },
      { campo: 'esProspecto', operador: '==', valor: false },
    ],
    acciones: [
      { tipo: 'ejecutar_ia', params: {
          prompt: 'clasificar_consulta',
          objetivo: 'Identificar trámite de interés y urgencia del mensaje',
        } },
      { tipo: 'crear_tarea', params: { titulo: 'Responder WA de {telefono}', vencimientoHoras: 2 } },
    ],
    requierePlanPro: true,
  },
  {
    id: 'tpl_prospecto_ganado_convertir',
    nombre: 'Prospecto cerrado ganado → convertir a cliente',
    descripcion: 'Cuando un prospecto se marca como cerrado-ganado, crea automáticamente el Cliente.',
    categoria: 'leads',
    trigger: 'prospecto.cerrado_ganado',
    condiciones: [],
    acciones: [
      { tipo: 'convertir_a_cliente', params: { copiarDatos: true } },
    ],
  },
  {
    id: 'tpl_lead_materializar_cliente',
    nombre: 'Lead nuevo → crear registro de cliente',
    descripcion: 'Apenas entra un lead deja un registro en Clientes (y vehículo si hay patente) para campañas y repesca, aunque el lead nunca convierta.',
    categoria: 'leads',
    trigger: 'lead.creado',
    condiciones: [],
    acciones: [
      { tipo: 'materializar_cliente', params: {} },
    ],
  },
]

// ─── LABELS ─────────────────────────────────────────────────────────────────

export const TIPO_ACCION_LABELS: Record<TipoAccion, string> = {
  asignar_usuario: 'Asignar a usuario',
  asignar_rotativo: 'Asignar rotativamente',
  cambiar_estado_lead: 'Cambiar estado del lead',
  cambiar_etapa_prospecto: 'Cambiar etapa del prospecto',
  cambiar_estado_tramite: 'Cambiar estado del trámite',
  enviar_wa: 'Enviar mensaje de WhatsApp',
  enviar_email: 'Enviar email',
  crear_tarea: 'Crear tarea',
  crear_notificacion: 'Crear notificación',
  crear_nota: 'Crear nota interna',
  convertir_a_prospecto: 'Convertir a prospecto',
  convertir_a_cliente: 'Convertir a cliente',
  materializar_cliente: 'Materializar cliente desde lead',
  llamar_webhook: 'Llamar webhook externo',
  ejecutar_ia: 'Ejecutar IA',
  delay: 'Esperar',
}

export const TIPO_ACCION_EMOJI: Record<TipoAccion, string> = {
  asignar_usuario: '👤',
  asignar_rotativo: '🔀',
  cambiar_estado_lead: '🔄',
  cambiar_etapa_prospecto: '📊',
  cambiar_estado_tramite: '📋',
  enviar_wa: '💬',
  enviar_email: '📧',
  crear_tarea: '✅',
  crear_notificacion: '🔔',
  crear_nota: '📝',
  convertir_a_prospecto: '🎯',
  convertir_a_cliente: '🤝',
  materializar_cliente: '🗂️',
  llamar_webhook: '🔗',
  ejecutar_ia: '🤖',
  delay: '⏱️',
}

export const OPERADOR_LABELS: Record<OperadorCondicion, string> = {
  '==': 'es igual a',
  '!=': 'es distinto de',
  'in': 'está en',
  'not_in': 'no está en',
  '>': 'es mayor que',
  '<': 'es menor que',
  '>=': 'es mayor o igual que',
  '<=': 'es menor o igual que',
  'contains': 'contiene',
  'starts_with': 'empieza con',
  'exists': 'existe',
  'not_exists': 'no existe',
}

export const CATEGORIA_AUTOMATIZACION_LABELS: Record<
  PlantillaAutomatizacion['categoria'],
  string
> = {
  leads: 'Leads y ventas',
  tramites: 'Trámites',
  cobranzas: 'Cobranzas',
  comunicacion: 'Comunicación',
} 
 