/**
 * LEAD TYPES
 * ─────────────────────────────────────────────────────────────────
 * Entidad de captura inicial (pre-prospecto).
 *
 * Diferencias con Prospecto (src/lib/firestore/pipeline):
 *   • Lead: captura anónima/semi-anónima, datos mínimos, estado corto.
 *   • Prospecto: lead ya calificado y en negociación activa (Kanban).
 *
 * Ciclo de vida:
 *   nuevo → contactado → calificado → convertido (→ Prospecto o Cliente)
 *                                   → perdido / descartado
 */
import type { Timestamp } from 'firebase/firestore'
import type { OrigenCanal, TipoTramite } from '@/types'

// ─── ENUMS ──────────────────────────────────────────────────────────────────

export type EstadoLead =
  | 'nuevo'
  | 'contactado'
  | 'calificado'
  | 'en_negociacion'
  | 'convertido'
  | 'perdido'
  | 'descartado'

export type MotivoPerdida =
  | 'precio'
  | 'competencia'
  | 'no_responde'
  | 'ya_resolvio'
  | 'fuera_zona'
  | 'sin_documentacion'
  | 'otro'

export type PrioridadLead = 'baja' | 'normal' | 'alta' | 'urgente'

export type OrigenSistema =
  | 'web_form'
  | 'wa_api'
  | 'wa_manual'
  | 'campana'
  | 'referido'
  | 'import'
  | 'manual'

// ─── INTERFAZ PRINCIPAL ─────────────────────────────────────────────────────

export interface Lead {
  // Identificación
  id: string
  gestoriaId: string

  // Contacto (mínimo: nombre + uno de teléfono/email/documento)
  nombre: string
  apellido?: string
  telefono?: string          // formato E.164 preferido: 5491112345678
  email?: string
  documento?: string         // DNI / CUIT — se usa para deduplicación
  patente?: string
  localidad?: string

  // Consulta
  consulta?: string          // mensaje literal del lead
  tipoTramiteInteres?: TipoTramite | string

  // Origen (omnicanal)
  canal: OrigenCanal
  fuente?: string            // nombre de la campaña o página
  origenSistema: OrigenSistema
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  paginaUrl?: string         // URL exacta del formulario web
  ipOrigen?: string

  // Gestión
  estado: EstadoLead
  prioridad: PrioridadLead
  score?: number             // 0-100, calculado por IA o manualmente
  asignadoA?: string         // uid
  asignadoNombre?: string

  // Conversión / cierre
  convertidoA?: 'prospecto' | 'cliente'
  prospectoId?: string
  clienteId?: string
  motivoPerdida?: MotivoPerdida
  motivoPerdidaNota?: string

  // Auditoría
  creadoEn: Timestamp
  actualizadoEn: Timestamp
  ultimoContactoEn?: Timestamp
  creadoPor: string          // uid | 'system'
}

// ─── INPUTS ─────────────────────────────────────────────────────────────────

/** Campos mínimos para crear un lead desde web pública o WA */
export interface LeadInputPublico {
  nombre: string
  telefono?: string
  email?: string
  consulta?: string
  tipoTramiteInteres?: TipoTramite | string
  // Rellenado automáticamente por la Callable Function
}

/** Input completo para crear/editar desde el panel */
export interface LeadInput extends LeadInputPublico {
  apellido?: string
  documento?: string
  localidad?: string
  canal: OrigenCanal
  fuente?: string
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
  }
  paginaUrl?: string
  asignadoA?: string
  prioridad?: PrioridadLead
}
export interface LeadInput {
  // Contacto
  nombre: string
  apellido?: string
  telefono?: string      // formato libre, se normaliza
  email?: string
  documento?: string     // DNI/CUIT, se normaliza
  patente?: string       // se normaliza a mayúsculas

  // Consulta
  tipoTramite?: TipoTramite
  consulta?: string

  // Origen
  canal: OrigenCanal
  canalRespuesta?: 'whatsapp' | 'telefono' | 'email' | 'presencial'
  origenSistema?: OrigenSistema
  fuente?: string        // "Instagram DM", "Llamada telefónica", etc.

  // Gestión
  asignadoA?: string
  prioridad?: PrioridadLead

  // Metadata
  notas?: string
}
// ─── LABELS ─────────────────────────────────────────────────────────────────

export const ESTADO_LEAD_LABELS: Record<EstadoLead, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  en_negociacion: 'En Negociación',
  convertido: 'Convertido',
  perdido: 'Perdido',
  descartado: 'Descartado',
}

export const ESTADO_LEAD_COLORS: Record<EstadoLead, string> = {
  nuevo: 'bg-blue-100 text-blue-700 border-blue-200',
  contactado: 'bg-amber-100 text-amber-700 border-amber-200',
  calificado: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  en_negociacion: 'bg-purple-100 text-purple-700 border-purple-200',
  convertido: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  perdido: 'bg-red-100 text-red-700 border-red-200',
  descartado: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const ESTADO_LEAD_DOT: Record<EstadoLead, string> = {
  nuevo: 'bg-blue-400',
  contactado: 'bg-amber-400',
  calificado: 'bg-indigo-400',
  en_negociacion: 'bg-purple-400',
  convertido: 'bg-emerald-400',
  perdido: 'bg-red-400',
  descartado: 'bg-gray-300',
}

export const MOTIVO_PERDIDA_LABELS: Record<MotivoPerdida, string> = {
  precio: 'Precio',
  competencia: 'Competencia',
  no_responde: 'No responde',
  ya_resolvio: 'Ya lo resolvió',
  fuera_zona: 'Fuera de zona',
  sin_documentacion: 'Sin documentación',
  otro: 'Otro',
}

export const PRIORIDAD_LEAD_LABELS: Record<PrioridadLead, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const PRIORIDAD_LEAD_COLORS: Record<PrioridadLead, string> = {
  baja: 'bg-gray-100 text-gray-500',
  normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Estados considerados "activos" (aparecen en bandeja de entrada) */
export const ESTADOS_LEAD_ACTIVOS: EstadoLead[] = [
  'nuevo',
  'contactado',
  'calificado',
  'en_negociacion',
]

/** Estados finales — no deberían modificarse salvo reactivación explícita */
export const ESTADOS_LEAD_FINALES: EstadoLead[] = [
  'convertido',
  'perdido',
  'descartado',
]