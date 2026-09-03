// Tipos compartidos dentro de las Cloud Functions
// Espejo del frontend wa_types.ts — sin imports de Firebase/React

export type EstadoConversacion = 'nueva' | 'en_atencion' | 'resuelta' | 'archivada'
export type DireccionMensaje   = 'entrante' | 'saliente'
export type TipoMensaje        = 'texto' | 'imagen' | 'audio' | 'documento' | 'sticker' | 'template'
export type EstadoMensaje      = 'enviando' | 'enviado' | 'entregado' | 'leido' | 'error'

// ─── META WEBHOOK PAYLOAD ────────────────────────────────────────────────────

export interface MetaMetadata {
  display_phone_number: string   // número de la gestoría (formato visible)
  phone_number_id:      string   // ID de Meta del número que RECIBIÓ — clave de ruteo
}

export interface MetaWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: MetaMetadata
        contacts?: Array<{
          profile: { name: string }
          wa_id:   string
        }>
        messages?: Array<MetaIncomingMessage>
        statuses?: Array<MetaStatusUpdate>
        errors?: Array<MetaError>
      }
      field: string
    }>
  }>
}

// ─── REFERRAL (Click-to-WhatsApp) ─────────────────────────────────────────────
// Presente SOLO en el primer mensaje que llega desde un anuncio CTWA.
// Es la atribución de campaña: qué anuncio originó el lead.

export interface MetaReferral {
  source_url?:  string
  source_type?: string   // 'ad' | 'post'
  source_id?:   string   // ID del anuncio
  headline?:    string
  body?:        string
  media_type?:  string
  image_url?:   string
  video_url?:   string
  ctwa_clid?:   string   // click id — para casar con la pauta de Meta
}

export interface MetaIncomingMessage {
  id:        string
  from:      string         // teléfono del cliente (sin +)
  timestamp: string
  type:      string
  text?:     { body: string }
  image?:    { id: string; mime_type: string; caption?: string }
  audio?:    { id: string; mime_type: string }
  document?: { id: string; mime_type: string; filename?: string }
  sticker?:  { id: string; mime_type: string }
  referral?: MetaReferral
}

export interface MetaStatusUpdate {
  id:           string          // WA message ID
  status:       'sent' | 'delivered' | 'read' | 'failed'
  timestamp:    string
  recipient_id: string
}

export interface MetaError {
  code: number
  title: string
  error_data?: { details: string }
}

// ─── SEND MESSAGE REQUEST/RESPONSE ───────────────────────────────────────────

export interface SendMessageRequest {
  conversacionId: string
  texto:          string
  gestoriaId:     string
}

export interface SendMessageResponse {
  waMessageId: string
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