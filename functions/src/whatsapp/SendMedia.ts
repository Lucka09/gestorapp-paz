// functions/src/whatsapp/SendMedia.ts
// ─── ENVIAR MEDIA (Callable) ─────────────────────────────────────────────────
// El frontend sube el archivo a Storage, obtiene la URL y llama a esta función
// con la URL. Acá se envía por Meta (por link) y se guarda el mensaje saliente
// (con mediaUrl para que la Bandeja lo muestre). Responde DESDE el mismo número
// de la conversación (waPhoneNumberId).
import * as admin from 'firebase-admin'
import { sendMediaMessage } from '../utils/Utils'

interface SendMediaRequest {
  conversacionId: string
  gestoriaId:     string
  tipo:           'image' | 'audio' | 'document'
  mediaUrl:       string
  caption?:       string
  filename?:      string
  mimeType?:      string
}
interface SendMediaResponse { waMessageId: string }

export async function handleSendMedia(
  data:    SendMediaRequest,
  context: { auth?: { uid: string; token: { gestoriaId?: string } } },
): Promise<SendMediaResponse> {
  if (!context.auth?.uid) throw new Error('unauthenticated')

  const { conversacionId, gestoriaId, tipo, mediaUrl, caption, filename, mimeType } = data
  if (!conversacionId || !gestoriaId || !tipo || !mediaUrl) {
    throw new Error('invalid-argument: faltan campos requeridos')
  }

  const convRef  = admin.firestore().collection('conversacionesWA').doc(conversacionId)
  const convSnap = await convRef.get()
  if (!convSnap.exists) throw new Error('not-found: conversación no encontrada')
  const conv = convSnap.data() ?? {}
  if (conv.gestoriaId !== gestoriaId) {
    throw new Error('permission-denied: conversación de otra gestoría')
  }

  const emisor = conv.waPhoneNumberId as string | undefined
  // conversacionId = teléfono normalizado
  const waMessageId = await sendMediaMessage(conversacionId, tipo, mediaUrl, caption, emisor, filename)

  const tipoMsg = tipo === 'image' ? 'imagen' : tipo === 'audio' ? 'audio' : 'documento'
  const preview = tipoMsg === 'imagen' ? '📷 Imagen' : tipoMsg === 'audio' ? '🎵 Audio' : `📄 ${filename ?? 'Documento'}`
  const now = admin.firestore.FieldValue.serverTimestamp()

  // Guardar el mensaje saliente con la URL del media
  await convRef.collection('mensajes').doc().set({
    gestoriaId,
    waMessageId,
    direccion: 'saliente',
    tipo:      tipoMsg,
    texto:     caption || preview,
    mediaUrl,
    mediaType: mimeType ?? '',
    timestamp: now,
    estado:    'enviado',
    enviadoPor: context.auth.uid,
  })

  await convRef.update({ ultimoMensaje: preview, ultimaActividad: now })

  console.log(`[WA SendMedia] ${gestoriaId} → ${conversacionId}: ${tipoMsg} [${waMessageId}]`)
  return { waMessageId }
}