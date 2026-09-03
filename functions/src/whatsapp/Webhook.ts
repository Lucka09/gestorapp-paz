import * as admin from 'firebase-admin'
import {
  normalizarTelefono, getVerifyToken,
  getGestoriaId, markMessageRead, sendTextMessage,
} from '../utils/Utils'
import {
  esConsultaMulta, detectarDatoInfraccion,
  KEYWORDS_MULTA_DEFAULT, type DatoInfraccion,
} from './clasificador'
import type {
  MetaWebhookPayload, MetaIncomingMessage, MetaMetadata,
  MetaReferral, MetaError, EstadoConversacion,
} from './types'

const db  = () => admin.firestore()
const now = () => admin.firestore.FieldValue.serverTimestamp()

// ─── VERIFICACIÓN DEL WEBHOOK (GET) ──────────────────────────────────────────

export function handleVerification(
  query: Record<string, string>,
  res:   { status: (n: number) => { send: (s: string) => void } },
): void {
  const mode      = query['hub.mode']
  const token     = query['hub.verify_token']
  const challenge = query['hub.challenge']

  if (mode === 'subscribe' && token === getVerifyToken()) {
    console.log('[WA Webhook] Verificación OK')
    // Meta espera el challenge como TEXTO en el body. Pasar un número hace que
    // Express lo interprete como status code y rompe (ERR_HTTP_INVALID_STATUS_CODE).
    res.status(200).send(String(challenge ?? ''))
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
      const { messages = [], contacts = [], statuses = [], metadata, errors = [] } = change.value

      for (const error of errors) {
        console.warn('[WA] Error de mensaje:', error)
        await registrarErrorMensaje(gestoriaId, error)
      }

      for (const status of statuses) {
        await actualizarEstadoMensaje(gestoriaId, status.id, status.status)
      }

      for (let i = 0; i < messages.length; i++) {
        const msg     = messages[i]
        const contact = contacts[i] ?? contacts[0]
        const nombre  = contact?.profile?.name ?? ''
        await procesarMensaje(gestoriaId, msg, nombre, metadata)
      }
    }
  }
}

// ─── CONFIG (ruteo + keywords), leída una sola vez por mensaje ────────────────

interface LineaRuteo {
  displayPhone:   string
  phoneNumberId?: string
  uid:            string
  nombre:         string
}

interface ConfigWA {
  lineas:   LineaRuteo[]
  keywords: string[]
  cfgRef:   admin.firestore.DocumentReference
}

async function cargarConfigWA(): Promise<ConfigWA> {
  const cfgRef = db().doc('configuracion/gestor')
  const data   = (await cfgRef.get()).data() ?? {}
  return {
    lineas:   (data.ruteoWhatsApp?.lineas ?? []) as LineaRuteo[],
    keywords: (data.clasificacionMultas?.keywords ?? KEYWORDS_MULTA_DEFAULT) as string[],
    cfgRef,
  }
}

// Resuelve el dueño de la línea y, si hace falta, auto-completa el phone_number_id.
async function resolverDueno(
  cfg:             ConfigWA,
  phoneNumberId:   string,
  displayPhoneRaw: string,
): Promise<LineaRuteo | null> {
  const { lineas, cfgRef } = cfg
  if (lineas.length === 0) {
    console.warn('[WA] Sin ruteoWhatsApp configurado en configuracion/gestor')
    return null
  }

  const porId = lineas.find(l => l.phoneNumberId && l.phoneNumberId === phoneNumberId)
  if (porId) return porId

  const dp  = normalizarTelefono(displayPhoneRaw)
  const idx = lineas.findIndex(l => normalizarTelefono(l.displayPhone) === dp)
  if (idx >= 0) {
    if (!lineas[idx].phoneNumberId && phoneNumberId) {
      lineas[idx].phoneNumberId = phoneNumberId
      await cfgRef.set({ ruteoWhatsApp: { lineas } }, { merge: true }).catch(() => {})
      console.log(`[WA] phone_number_id auto-completado → ${lineas[idx].nombre}: ${phoneNumberId}`)
    }
    return lineas[idx]
  }

  console.warn(`[WA] Número sin ruteo: pnid=${phoneNumberId} display=${dp}`)
  return null
}

// ─── PROCESAR UN MENSAJE INDIVIDUAL ──────────────────────────────────────────

async function procesarMensaje(
  gestoriaId: string,
  msg:        MetaIncomingMessage,
  nombre:     string,
  metadata:   MetaMetadata,
): Promise<void> {
  const telefono      = normalizarTelefono(msg.from)
  const waMessageId   = msg.id
  const texto         = extraerTexto(msg)
  const tipo          = mapTipo(msg.type)
  const ts            = admin.firestore.Timestamp.fromMillis(Number(msg.timestamp) * 1000)
  const phoneNumberId = metadata?.phone_number_id ?? ''
  const displayPhone  = metadata?.display_phone_number ?? ''
  const referral      = msg.referral ?? null

  // ── 1. Deduplicación ──────────────────────────────────────────────────────
  const existing = await db()
    .collectionGroup('mensajes')
    .where('waMessageId', '==', waMessageId)
    .limit(1)
    .get()
  if (!existing.empty) {
    console.log(`[WA] Mensaje duplicado ignorado: ${waMessageId}`)
    return
  }

  // ── 2. Config + clasificación del texto ───────────────────────────────────
  const cfg     = await cargarConfigWA()
  const esMulta = esConsultaMulta(texto, cfg.keywords)
  const dato    = detectarDatoInfraccion(texto)   // patente/DNI o null

  const convRef  = db().collection('conversacionesWA').doc(telefono)
  const convSnap = await convRef.get()
  const esNueva  = !convSnap.exists

  const owner = esNueva ? await resolverDueno(cfg, phoneNumberId, displayPhone) : null

  const batch = db().batch()

  if (esNueva) {
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
      asignadoA:       owner?.uid    ?? '',
      asignadoNombre:  owner?.nombre ?? '',
      noLeidos:        1,
      waPhoneNumberId: phoneNumberId,
      waDisplayPhone:  displayPhone,
      creadoEn:        ts,
      lineaOrigen:     owner?.nombre ?? 'sin ruteo',
    }
    if (clienteId)   convData.clienteId   = clienteId
    if (prospectoId) convData.prospectoId = prospectoId

    // Si es multa → dejamos una consulta SUGERIDA (la confirma la secretaria).
    // Prellenamos con la patente/DNI detectado; si no hubo, queda vacío.
    if (esMulta) {
      convData.consultaSugerida = construirSugerida(dato, ts)
    }

    if (!clienteId && !prospectoId) {
      const leadId = await crearLeadDesdeWA({
        gestoriaId, telefono, nombre, texto,
        owner, phoneNumberId, displayPhone, referral, esMulta, batch,
      })
      if (leadId) convData.leadId = leadId
    }

    batch.set(convRef, convData)
  } else {
    const prev = convSnap.data() ?? {}
    const update: Record<string, unknown> = {
      ultimoMensaje:   texto,
      ultimaActividad: ts,
      noLeidos:        admin.firestore.FieldValue.increment(1),
      ...(nombre && prev.nombre === telefono ? { nombre } : {}),
    }

    // La patente/multa puede llegar recién en un mensaje posterior. Si ya hay
    // una consulta CONFIRMADA, no la tocamos.
    const sugActual    = prev.consultaSugerida
    const yaConfirmada = sugActual?.estado === 'confirmada'
    if (!yaConfirmada && (esMulta || dato)) {
      update.consultaSugerida = construirSugerida(
        dato ?? (sugActual ? { tipo: sugActual.tipo, valor: sugActual.valor } : null),
        ts,
      )
      if (esMulta && prev.leadId) {
        await marcarLeadComoMulta(String(prev.leadId)).catch(() => {})
      }
    }

    // `update` es dinámico (Record<string, unknown>); batch.update usa UpdateData,
    // más estricto que set. Casteamos en el punto de uso.
    batch.update(convRef, update as unknown as admin.firestore.UpdateData<admin.firestore.DocumentData>)
  }

  // ── 3. Guardar el mensaje ─────────────────────────────────────────────────
  const msgRef = convRef.collection('mensajes').doc()
  batch.set(msgRef, {
    gestoriaId, waMessageId,
    direccion: 'entrante', tipo, texto, timestamp: ts,
  })

  await batch.commit()

  // ── 4. Marcar leído + bienvenida (desde el MISMO número que recibió) ──────
  await markMessageRead(waMessageId, phoneNumberId).catch(() => {})
  if (esNueva) {
    await enviarBienvenida(telefono, phoneNumberId).catch(err =>
      console.warn('[WA] No se pudo enviar bienvenida:', err))
  }

  console.log(`[WA] ${telefono} -> "${texto.slice(0, 40)}" | multa:${esMulta} dato:${dato?.valor ?? '-'} dueno:${owner?.nombre ?? 'sin ruteo'}`)
}

// Construye el objeto consultaSugerida (estado 'sugerida', pendiente de confirmar).
function construirSugerida(
  dato: DatoInfraccion | { tipo: 'dominio' | 'dni'; valor: string } | null,
  ts:   admin.firestore.Timestamp,
): Record<string, unknown> {
  return {
    tipo:        dato?.tipo  ?? 'dominio',
    valor:       dato?.valor ?? '',
    estado:      'sugerida',
    detectadoEn: ts,
  }
}

// ─── CREAR LEAD DESDE WHATSAPP ───────────────────────────────────────────────

async function crearLeadDesdeWA(p: {
  gestoriaId:    string
  telefono:      string
  nombre:        string
  texto:         string
  owner:         LineaRuteo | null
  phoneNumberId: string
  displayPhone:  string
  referral:      MetaReferral | null
  esMulta:       boolean
  batch:         admin.firestore.WriteBatch
}): Promise<string | null> {
  const { gestoriaId, telefono, nombre, texto, owner, phoneNumberId, displayPhone, referral, esMulta, batch } = p

  if (telefono) {
    const dup = await db().collection('leads')
      .where('gestoriaId', '==', gestoriaId)
      .where('telefono',   '==', telefono)
      .limit(1)
      .get()
    if (!dup.empty) return dup.docs[0].id
  }

  const [nom, ...resto] = (nombre || 'Contacto WA').split(' ')
  const apellido = resto.join(' ')

  const leadRef = db().collection('leads').doc()
  batch.set(leadRef, {
    gestoriaId,
    nombre: nom, apellido,
    telefono, email: '',
    documento: '', patente: '',
    canal: 'whatsapp', origenSistema: 'wa_api',
    estado: 'nuevo', prioridad: 'normal',
    tipoTramiteInteres: esMulta ? 'descargo_multa' : '',   // clasificacion
    consulta: texto || 'Consulta por WhatsApp',
    asignadoA:      owner?.uid    ?? '',
    asignadoNombre: owner?.nombre ?? '',
    waPhoneNumberId: phoneNumberId,
    waDisplayPhone:  displayPhone,
    referralWA: referral ?? null,
    creadoPor: 'whatsapp',
    creadoEn: now(), actualizadoEn: now(),
  })

  const evtRef = db().collection('eventos').doc()
  batch.set(evtRef, {
    gestoriaId,
    tipo: 'lead.creado', entidad: 'lead', entidadId: leadRef.id,
    entidadLabel: nombre || telefono,
    actor: { id: 'whatsapp', nombre: `WhatsApp - ${owner?.nombre ?? 'sin ruteo'}`, tipo: 'sistema' },
    payload: {
      canal: 'whatsapp', origenSistema: 'wa_api',
      waPhoneNumberId: phoneNumberId,
      asignadoA: owner?.uid ?? '',
      tipoTramiteInteres: esMulta ? 'descargo_multa' : '',
      referral: referral ?? null,
    },
    resumen: `Nuevo lead ${nombre || telefono} por WhatsApp${owner ? ` (${owner.nombre})` : ''}${esMulta ? ' - multa' : ''}`,
    timestamp: now(),
  })

  return leadRef.id
}

// Marca tipoTramiteInteres='descargo_multa' solo si el lead no tenia otro tipo.
async function marcarLeadComoMulta(leadId: string): Promise<void> {
  const ref  = db().collection('leads').doc(leadId)
  const snap = await ref.get()
  const t    = snap.data()?.tipoTramiteInteres
  if (!t) await ref.update({ tipoTramiteInteres: 'descargo_multa', actualizadoEn: now() })
}

// ─── ACTUALIZAR ESTADO DE MENSAJE SALIENTE ────────────────────────────────────

async function actualizarEstadoMensaje(
  gestoriaId: string, waMessageId: string, status: string,
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
      sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'error',
    }
    await snap.docs[0].ref.update({ estado: estadoMap[status] ?? status })
  }
}

// ─── REGISTRAR ERROR DE MENSAJE ──────────────────────────────────────────────

async function registrarErrorMensaje(
  gestoriaId: string,
  error: MetaError,
): Promise<void> {
  await db().collection('whatsappErrors').add({
    gestoriaId,
    codigo: error.code,
    titulo: error.title,
    detalles: error.error_data?.details ?? '',
    timestamp: now(),
  })
}

// ─── MENSAJE DE BIENVENIDA ────────────────────────────────────────────────────

async function enviarBienvenida(telefono: string, phoneNumberId?: string): Promise<void> {
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

  await sendTextMessage(telefono, texto, phoneNumberId)
}

// ─── HELPERS DE BÚSQUEDA ─────────────────────────────────────────────────────

async function buscarClientePorTelefono(
  gestoriaId: string, telefono: string,
): Promise<string | undefined> {
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
  gestoriaId: string, telefono: string,
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
    text: 'texto', image: 'imagen', audio: 'audio',
    document: 'documento', sticker: 'sticker',
  }
  return map[type] ?? 'texto'
}