import * as admin          from 'firebase-admin'
import { sendTextMessage } from '../utils/Utils'
import type { SendMessageRequest, SendMessageResponse } from './types'

// ─── ENVIAR MENSAJE (Callable Function) ──────────────────────────────────────
// Llamada desde el frontend con httpsCallable('whatsappSend', {...})
// Requiere que el usuario esté autenticado — Firebase lo verifica automáticamente.

export async function handleSendMessage(
  data:    SendMessageRequest,
  context: { auth?: { uid: string; token: { gestoriaId?: string } } },
): Promise<SendMessageResponse> {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!context.auth?.uid) {
    throw new Error('unauthenticated')
  }

  const { conversacionId, texto, gestoriaId } = data

  if (!conversacionId || !texto?.trim() || !gestoriaId) {
    throw new Error('invalid-argument: faltan campos requeridos')
  }

  // ── Verificar que la conversación pertenece a la gestoría ─────────────────
  const convSnap = await admin.firestore()
    .collection('conversacionesWA')
    .doc(conversacionId)
    .get()

  if (!convSnap.exists) {
    throw new Error('not-found: conversación no encontrada')
  }
  if (convSnap.data()?.gestoriaId !== gestoriaId) {
    throw new Error('permission-denied: conversación de otra gestoría')
  }

  // ── Enviar via Meta API ────────────────────────────────────────────────────
  // conversacionId = teléfono normalizado
  const waMessageId = await sendTextMessage(conversacionId, texto.trim())

  console.log(`[WA Send] ${gestoriaId} → ${conversacionId}: "${texto.slice(0, 40)}" [${waMessageId}]`)

  return { waMessageId }
}