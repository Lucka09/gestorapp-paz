import * as admin from 'firebase-admin'
import {
  normalizarTelefono, getVerifyToken,
  getGestoriaId, markMessageRead, sendTextMessage,
} from '../utils/Utils'
import type {
  MetaWebhookPayload, MetaIncomingMessage,
  EstadoConversacion,
} from './types'

const db = () => admin.firestore()

// ─── VERIFICACIÓN DEL WEBHOOK (GET) ──────────────────────────────────────────
// Meta llama a GET cuando se configura el webhook por primera vez.
// Debe responder con hub.challenge si el token coincide.

export function handleVerification(
  query: Record<string, string>,
  res:   { status: (n: number) => { send: (s: string | number) => void } },
): void {
  const mode      = query['hub.mode']
  const token     = query['hub.verify_token']
  const challenge = query['hub.challenge']

  if (mode === 'subscribe' && token === getVerifyToken()) {
    console.log('[WA Webhook] Verificación OK')
    res.status(200).send(Number(challenge))
  } else {
    console.warn('[WA Webhook] Verificación FALLIDA — token incorrecto')
    res.status(403).send('Forbidden')
  }
}

// ─── PROCESAR WEBHOOK (POST) ──────────────────────────────────────────────────

export async function handleIncomingMessage(payload: MetaWebhookPayload): Promise<void> {
  const gestoriaId = getGestoriaId()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { messages = [], contacts = [], statuses = [] } = change.value

      // ── Actualizar estados de mensajes salientes (delivered/read) ──────────
      for (const status of statuses) {
        await actualizarEstadoMensaje(gestoriaId, status.id, status.status)
      }

      // ── Procesar mensajes entrantes ────────────────────────────────────────
      for (let i = 0; i < messages.length; i++) {
        const msg     = messages[i]
        const contact = contacts[i] ?? contacts[0]
        const nombre  = contact?.profile?.name ?? ''
        await procesarMensaje(gestoriaId, msg, nombre)
      }
    }
  }
}

// ─── PROCESAR UN MENSAJE INDIVIDUAL ──────────────────────────────────────────

async function procesarMensaje(
  gestoriaId: string,
  msg:        MetaIncomingMessage,
  nombre:     string,
): Promise<void> {
  const telefono    = normalizarTelefono(msg.from)
  const waMessageId = msg.id
  const texto       = extraerTexto(msg)
  const tipo        = mapTipo(msg.type)
  const ts          = admin.firestore.Timestamp.fromMillis(Number(msg.timestamp) * 1000)

  // ── 1. Deduplicación — ignorar si ya procesamos este waMessageId ───────────
  const existing = await db()
    .collectionGroup('mensajes')
    .where('waMessageId', '==', waMessageId)
    .limit(1)
    .get()
  if (!existing.empty) {
    console.log(`[WA] Mensaje duplicado ignorado: ${waMessageId}`)
    return
  }

  // ── 2. Upsert de la conversación ──────────────────────────────────────────
  const convRef  = db().collection('conversacionesWA').doc(telefono)
  const convSnap = await convRef.get()

  const batch = db().batch()

  if (!convSnap.exists) {
    // Conversación nueva — buscar si el teléfono existe como cliente/prospecto
    const clienteId   = await buscarClientePorTelefono(gestoriaId, telefono)
    const prospectoId = clienteId
      ? undefined
      : await buscarProspectoPorTelefono(gestoriaId, telefono)

    const convData: Record<string, unknown> = {
      gestoriaId,
      telefono,
      nombre:          nombre || telefono,
      ultimoMensaje:   texto,
      ultimaActividad: ts,
      estado:          'nueva' as EstadoConversacion,
      asignadoA:       '',
      noLeidos:        1,
      waPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      creadoEn:        ts,
    }
    if (clienteId)   convData.clienteId   = clienteId
    if (prospectoId) convData.prospectoId = prospectoId

    batch.set(convRef, convData)

    // Si es número nuevo sin prospecto → crear prospecto en Pipeline
    if (!clienteId && !prospectoId) {
      await crearProspectoDesdeWA(gestoriaId, telefono, nombre, texto, batch)
    }
  } else {
    // Conversación existente — actualizar preview + contador
    batch.update(convRef, {
      ultimoMensaje:   texto,
      ultimaActividad: ts,
      noLeidos:        admin.firestore.FieldValue.increment(1),
      // Si el nombre de Meta es mejor que el que tenemos, actualizarlo
      ...(nombre && convSnap.data()?.nombre === telefono ? { nombre } : {}),
    })
  }

  // ── 3. Guardar el mensaje en la subcolección ──────────────────────────────
  const msgRef = convRef.collection('mensajes').doc()
  batch.set(msgRef, {
    gestoriaId,
    waMessageId,
    direccion: 'entrante',
    tipo,
    texto,
    timestamp: ts,
  })

  await batch.commit()

  // ── 4. Marcar como leído en Meta (buenas prácticas UX) ───────────────────
  await markMessageRead(waMessageId).catch(() => {/* non-blocking */})

  // ── 5. Mensaje de bienvenida en primer contacto ───────────────────────────
  if (!convSnap.exists) {
    await enviarBienvenida(telefono).catch(err =>
      console.warn('[WA] No se pudo enviar bienvenida:', err)
    )
  }

  console.log(`[WA] Mensaje procesado: ${telefono} → "${texto.slice(0, 40)}"`)
}

// ─── ACTUALIZAR ESTADO DE MENSAJE SALIENTE ────────────────────────────────────

async function actualizarEstadoMensaje(
  gestoriaId: string,
  waMessageId: string,
  status: string,
): Promise<void> {
  const snap = await db()
    .collectionGroup('mensajes')
    .where('gestoriaId',  '==', gestoriaId)
    .where('waMessageId', '==', waMessageId)
    .where('direccion',   '==', 'saliente')
    .limit(1)
    .get()

  if (!snap.empty) {
    const estadoMap: Record<string, string> = {
      sent:      'enviado',
      delivered: 'entregado',
      read:      'leido',
      failed:    'error',
    }
    await snap.docs[0].ref.update({ estado: estadoMap[status] ?? status })
  }
}

// ─── CREAR PROSPECTO EN PIPELINE ─────────────────────────────────────────────

async function crearProspectoDesdeWA(
  gestoriaId: string,
  telefono:   string,
  nombre:     string,
  texto:      string,
  batch:      admin.firestore.WriteBatch,
): Promise<void> {
  const prospectoRef = db().collection('prospectos').doc()
  batch.set(prospectoRef, {
    gestoriaId,
    nombre:      nombre || 'Contacto WA',
    apellido:    '',
    telefono,
    email:       '',
    localidad:   '',
    etapa:       'nuevo',
    color:       'azul',
    tipoTramite: 'transferencia',   // default — el agente lo actualiza
    patente:     '',
    descripcion: `Primer mensaje: "${texto.slice(0, 120)}"`,
    montoCierre: 0,
    formaPago:   '',
    fechaCierre: '',
    tareas:      [],
    etiquetas:   ['whatsapp'],
    asignadoA:   '',
    creadoPor:   'whatsapp_bot',
    orden:       Date.now(),
    origenWA:    true,              // campo extra para filtrar en Pipeline
    creadoEn:    admin.firestore.FieldValue.serverTimestamp(),
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  })
  // Actualizar la conversación con el prospectoId
  const convRef = db().collection('conversacionesWA').doc(telefono)
  batch.update(convRef, { prospectoId: prospectoRef.id })
}

// ─── MENSAJE DE BIENVENIDA ────────────────────────────────────────────────────

async function enviarBienvenida(telefono: string): Promise<void> {
  const numeroLlamadas = process.env.NUMERO_LLAMADAS ?? ''
  const textoLlamadas  = numeroLlamadas
    ? `\n\nPara llamadas de WhatsApp escribinos al:\n📞 ${numeroLlamadas}`
    : ''

  const texto =
    `¡Hola! 👋 Gracias por escribir a *Gestoría Paz*.` +
    `\n\nSomos tu gestoría de confianza para trámites del automotor. ` +
    `Un asesor te responde en breve. 🟠` +
    textoLlamadas +
    `\n\n_Gestoría Paz · Trámites sin vueltas._`

  await sendTextMessage(telefono, texto)
}

// ─── HELPERS DE BÚSQUEDA ─────────────────────────────────────────────────────

async function buscarClientePorTelefono(
  gestoriaId: string,
  telefono:   string,
): Promise<string | undefined> {
  // Buscar con y sin código de país
  const variantes = [telefono, telefono.replace(/^549/, '0'), telefono.slice(-10)]
  for (const tel of variantes) {
    const snap = await db().collection('clientes')
      .where('gestoriaId', '==', gestoriaId)
      .where('telefono',   '==', tel)
      .limit(1)
      .get()
    if (!snap.empty) return snap.docs[0].id
  }
  return undefined
}

async function buscarProspectoPorTelefono(
  gestoriaId: string,
  telefono:   string,
): Promise<string | undefined> {
  const variantes = [telefono, telefono.slice(-10)]
  for (const tel of variantes) {
    const snap = await db().collection('prospectos')
      .where('gestoriaId', '==', gestoriaId)
      .where('telefono',   '==', tel)
      .limit(1)
      .get()
    if (!snap.empty) return snap.docs[0].id
  }
  return undefined
}

// ─── UTIL: EXTRAER TEXTO ─────────────────────────────────────────────────────

function extraerTexto(msg: MetaIncomingMessage): string {
  if (msg.text)     return msg.text.body
  if (msg.image)    return msg.image.caption ?? '📷 Imagen'
  if (msg.audio)    return '🎵 Audio'
  if (msg.document) return `📄 ${msg.document.filename ?? 'Documento'}`
  if (msg.sticker)  return '🎭 Sticker'
  return `[${msg.type}]`
}

function mapTipo(type: string): string {
  const map: Record<string, string> = {
    text:     'texto',
    image:    'imagen',
    audio:    'audio',
    document: 'documento',
    sticker:  'sticker',
  }
  return map[type] ?? 'texto'
}