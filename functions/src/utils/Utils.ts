import axios from 'axios'

const META_API_VERSION = 'v20.0'
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function getMetaToken(): string {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('[WA] WHATSAPP_TOKEN no configurado')
  return token
}

export function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new Error('[WA] WHATSAPP_PHONE_NUMBER_ID no configurado')
  return id
}

export function getVerifyToken(): string {
  const t = process.env.WHATSAPP_VERIFY_TOKEN
  if (!t) throw new Error('[WA] WHATSAPP_VERIFY_TOKEN no configurado')
  return t
}

export function getGestoriaId(): string {
  const g = process.env.GESTORIA_ID
  if (!g) throw new Error('[WA] GESTORIA_ID no configurado')
  return g
}

// ─── NORMALIZAR TELÉFONO ─────────────────────────────────────────────────────
// Meta envía el número sin "+" ej: "5491155667788"
// Usamos ese mismo formato como ID de documento en Firestore

export function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, '')
}

// ─── ENVIAR MENSAJE DE TEXTO ─────────────────────────────────────────────────

export async function sendTextMessage(
  to:    string,    // teléfono normalizado
  text:  string,
): Promise<string> {
  const phoneNumberId = getPhoneNumberId()
  const token         = getMetaToken()

  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type:  'text',
    text:  { preview_url: false, body: text },
  }

  const { data } = await axios.post(url, body, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  // data.messages[0].id es el WA message ID
  const waMessageId: string = data?.messages?.[0]?.id ?? `local_${Date.now()}`
  return waMessageId
}

// ─── MARCAR MENSAJE COMO LEÍDO ───────────────────────────────────────────────

export async function markMessageRead(waMessageId: string): Promise<void> {
  const phoneNumberId = getPhoneNumberId()
  const token         = getMetaToken()
  const url           = `${META_API_BASE}/${phoneNumberId}/messages`

  await axios.post(url, {
    messaging_product: 'whatsapp',
    status:  'read',
    message_id: waMessageId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => {/* ignorar errores de mark-read */})
}