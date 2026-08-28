import axios from 'axios'

const META_API_VERSION = 'v20.0'
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function getMetaToken(): string {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('[WA] WHATSAPP_TOKEN no configurado')
  return token
}

// phone_number_id por defecto (fallback). Con multilínea, el emisor real se
// pasa por parámetro; este env queda como red de seguridad.
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

// Resuelve el número emisor: usa el que se pasa (el de la conversación) o cae
// al del env si no vino ninguno.
function resolverEmisor(phoneNumberId?: string): string {
  const id = (phoneNumberId && phoneNumberId.trim()) ? phoneNumberId.trim() : process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new Error('[WA] Sin phone_number_id emisor (ni parámetro ni WHATSAPP_PHONE_NUMBER_ID)')
  return id
}

// ─── NORMALIZAR TELÉFONO ─────────────────────────────────────────────────────
// Meta envía el número sin "+" ej: "5491155667788"
// Usamos ese mismo formato como ID de documento en Firestore

export function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, '')
}

// ─── ENVIAR MENSAJE DE TEXTO ─────────────────────────────────────────────────
// phoneNumberId (opcional): número emisor. En multilínea se pasa el
// waPhoneNumberId de la conversación para responder DESDE el mismo número al
// que escribió el cliente.

export async function sendTextMessage(
  to:             string,    // teléfono normalizado
  text:           string,
  phoneNumberId?: string,    // ← número emisor (opcional; cae al env)
): Promise<string> {
  const emisor = resolverEmisor(phoneNumberId)
  const token  = getMetaToken()

  const url = `${META_API_BASE}/${emisor}/messages`
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
// Debe usar el MISMO número que recibió el mensaje (el de la conversación).

export async function markMessageRead(
  waMessageId:    string,
  phoneNumberId?: string,    // ← número receptor (opcional; cae al env)
): Promise<void> {
  const emisor = resolverEmisor(phoneNumberId)
  const token  = getMetaToken()
  const url    = `${META_API_BASE}/${emisor}/messages`

  await axios.post(url, {
    messaging_product: 'whatsapp',
    status:  'read',
    message_id: waMessageId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => {/* ignorar errores de mark-read */})
}