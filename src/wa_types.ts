import type { Timestamp } from 'firebase/firestore'

// ─── CONVERSACIÓN ─────────────────────────────────────────────────────────────
// Un documento por número de teléfono. ID del doc = teléfono normalizado.

export type EstadoConversacion =
  | 'nueva'        // sin atender — badge rojo
  | 'en_atencion'  // agente asignado respondiendo
  | 'resuelta'     // cerrada — sin pendientes
  | 'archivada'    // fuera de vista por defecto

// Consulta de infracciones detectada en la conversación, pendiente de que la
// secretaria la confirme desde la Bandeja antes de mandarla a la cola.
export interface ConsultaSugeridaWA {
  tipo:        'dominio' | 'dni'
  valor:       string                                  // detectado; editable
  estado:      'sugerida' | 'confirmada' | 'descartada'
  detectadoEn: Timestamp
  consultaId?: string                                  // set al confirmar
}

export interface ConversacionWA {
  id:              string          // = telefono normalizado "5491155667788"
  gestoriaId:      string
  telefono:        string          // con código país, sin "+"
  nombre:          string          // nombre del contacto (Meta o manual)
  avatarUrl?:      string
  ultimoMensaje:   string          // texto preview
  ultimaActividad: Timestamp
  estado:          EstadoConversacion
  asignadoA:       string          // uid del agente asignado ('' = sin asignar / pool)
  asignadoNombre?: string          // nombre del agente dueño (lo setea el webhook por ruteo)
  noLeidos:        number
  // Links a entidades del CRM
  clienteId?:      string
  prospectoId?:    string
  leadId?:         string          // lead creado por el webhook al abrir la conversación
  // Clasificación de multas
  consultaSugerida?: ConsultaSugeridaWA | null   // chip de "consultar infracciones"
  // Meta
  waPhoneNumberId: string          // ID de Meta del número que RECIBIÓ (clave de ruteo)
  waDisplayPhone?: string          // número visible de la gestoría que recibió
  creadoEn:        Timestamp
}

// ─── MENSAJE ──────────────────────────────────────────────────────────────────

export type DireccionMensaje = 'entrante' | 'saliente'
export type TipoMensaje      = 'texto' | 'imagen' | 'audio' | 'documento' | 'sticker' | 'template'
export type EstadoMensaje    = 'enviando' | 'enviado' | 'entregado' | 'leido' | 'error'

export interface MensajeWA {
  id:          string
  gestoriaId:  string
  waMessageId: string              // ID de Meta — para deduplicación
  direccion:   DireccionMensaje
  tipo:        TipoMensaje
  texto:       string
  mediaUrl?:   string
  mediaType?:  string
  timestamp:   Timestamp
  estado?:     EstadoMensaje       // solo para salientes
  enviadoPor?: string              // uid del agente (solo salientes)
}

// ─── PAYLOAD META (webhook) ────────────────────────────────────────────────────
// Subconjunto de lo que envía Meta en cada notificación

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account'
  entry: Array<{
    id: string                     // WABA ID
    changes: Array<{
      value: {
        messaging_product: 'whatsapp'
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: { name: string }
          wa_id:   string
        }>
        messages?: Array<{
          id:        string
          from:      string         // teléfono del cliente
          timestamp: string
          type:      TipoMensaje
          text?:     { body: string }
          image?:    { id: string; mime_type: string; sha256: string; caption?: string }
          audio?:    { id: string; mime_type: string }
          document?: { id: string; mime_type: string; filename?: string }
        }>
        statuses?: Array<{
          id:         string
          status:     'sent' | 'delivered' | 'read' | 'failed'
          timestamp:  string
          recipient_id: string
        }>
        errors?: Array<MetaError>
      }
      field: 'messages'
    }>
  }>
}

export interface MetaError {
  code: number
  title: string
  error_data?: {
    details: string
  }
}

// ─── TEMPLATE MESSAGE ───────────────────────────────────────────────────────

export interface TemplateMessage {
  nombre: string
  idioma: string
  parametros: string[]
}

export interface SendTemplateRequest {
  conversacionId: string
  template: TemplateMessage
  gestoriaId: string
}

export interface SendTemplateResponse {
  waMessageId: string
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

export interface MetricasBandeja {
  total:       number
  nuevas:      number
  enAtencion:  number
  resueltas:   number
  sinAsignar:  number
  noLeidosTotal: number
}