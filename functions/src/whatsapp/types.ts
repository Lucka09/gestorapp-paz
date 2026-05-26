// Tipos compartidos dentro de las Cloud Functions
// Espejo del frontend wa_types.ts — sin imports de Firebase/React

export type EstadoConversacion = 'nueva' | 'en_atencion' | 'resuelta' | 'archivada'
export type DireccionMensaje   = 'entrante' | 'saliente'
export type TipoMensaje        = 'texto' | 'imagen' | 'audio' | 'documento' | 'sticker' | 'template'
export type EstadoMensaje      = 'enviando' | 'enviado' | 'entregado' | 'leido' | 'error'

// ─── META WEBHOOK PAYLOAD ────────────────────────────────────────────────────

export interface MetaWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id:      string
        }
        contacts?: Array<{
          profile: { name: string }
          wa_id:   string
        }>
        messages?: Array<MetaIncomingMessage>
        statuses?: Array<MetaStatusUpdate>
      }
      field: string
    }>
  }>
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
}

export interface MetaStatusUpdate {
  id:           string          // WA message ID
  status:       'sent' | 'delivered' | 'read' | 'failed'
  timestamp:    string
  recipient_id: string
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