// functions/src/whatsapp/Template.ts
// ─── ENVIAR TEMPLATE APROBADO (Cloud API) ────────────────────────────────────
// Los templates deben estar pre-aprobados en Meta Business Manager.
// Se usan para mensajes fuera de la ventana de 24hs (ej: recordatorios,
// confirmaciones de turno, presupuestos enviados).
import * as admin from 'firebase-admin'
import { sendTemplateMessage } from '../utils/Utils'
import type { SendTemplateRequest, SendTemplateResponse } from './types'
// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
export async function handleSendTemplate(
data: SendTemplateRequest,
context: { auth?: { uid: string; token: { gestoriaId?: string } } },
): Promise<SendTemplateResponse> {
// ── Auth guard ─────────────────────────────────────────────────────────────
if (!context.auth?.uid) {
throw new Error('unauthenticated')
}
const { conversacionId, template, gestoriaId } = data
if (!conversacionId || !template?.nombre || !gestoriaId) {
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
const conv = convSnap.data() ?? {}
if (conv.gestoriaId !== gestoriaId) {
throw new Error('permission-denied: conversación de otra gestoría')
}
// ── Enviar template via Meta API ────────────────────────────────────────────
const emisor = conv.waPhoneNumberId as string | undefined
const waMessageId = await sendTemplateMessage(
conversacionId,
template.nombre,
template.idioma ?? 'es_AR',
template.parametros ?? [],
emisor,
)
console.log(`[WA Template] ${gestoriaId} → ${conversacionId}: template="${template.nombre}" [${waMessageId}]`)
// Guardar el mensaje en la subcolección
const msgRef = admin.firestore()
.collection('conversacionesWA')
.doc(conversacionId)
.collection('mensajes')
.doc()
await msgRef.set({
gestoriaId,
waMessageId,
direccion: 'saliente',
tipo: 'template',
texto: `[Template: ${template.nombre}]`,
timestamp: admin.firestore.FieldValue.serverTimestamp(),
estado: 'enviando',
})
return { waMessageId }
}