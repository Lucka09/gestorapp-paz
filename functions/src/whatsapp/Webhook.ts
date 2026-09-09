import * as admin from 'firebase-admin'
import {
  normalizarTelefono, getVerifyToken,
  getGestoriaId, sendTextMessage,
} from '../utils/Utils'
import {
  esConsultaMulta, detectarTodosDatos, tipoDeValor,
  KEYWORDS_MULTA_DEFAULT, type DatoInfraccion,
} from './clasificador'
import { descargarYGuardarMedia } from './media'
import type {
  MetaWebhookPayload, MetaIncomingMessage, MetaMetadata,
  MetaReferral, MetaError, EstadoConversacion,
} from './types'

const db  = () => admin.firestore()
const now = () => admin.firestore.FieldValue.serverTimestamp()

// Limpia patente/DNI a solo A-Z0-9 en mayúsculas (mismo criterio que la web).
const limpiarValor = (v: string) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

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
        try { await registrarErrorMensaje(gestoriaId, error) }
        catch (e: any) { console.warn('[WA] fallo registrarErrorMensaje:', e?.message) }
      }

      for (const status of statuses) {
        try { await actualizarEstadoMensaje(gestoriaId, status.id, status.status) }
        catch (e: any) { console.warn('[WA] fallo actualizarEstadoMensaje:', e?.message) }
      }

      for (let i = 0; i < messages.length; i++) {
        const msg     = messages[i]
        const contact = contacts[i] ?? contacts[0]
        const nombre  = contact?.profile?.name ?? ''
        // Cada mensaje se procesa aislado: si uno falla, se loguea pero NO tira
        // toda la invocación (si no, Meta reintenta el payload entero y se
        // reprocesa/re-saluda). Meta siempre recibe 200 → no reintenta.
        try { await procesarMensaje(gestoriaId, msg, nombre, metadata) }
        catch (e: any) { console.error('[WA] fallo procesarMensaje:', e?.message, e?.stack) }
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
  bienvenidaActiva: boolean
  cfgRef:   admin.firestore.DocumentReference
}

async function cargarConfigWA(): Promise<ConfigWA> {
  const cfgRef = db().doc('configuracion/gestor')
  const data   = (await cfgRef.get()).data() ?? {}
  return {
    lineas:   (data.ruteoWhatsApp?.lineas ?? []) as LineaRuteo[],
    keywords: (data.clasificacionMultas?.keywords ?? KEYWORDS_MULTA_DEFAULT) as string[],
    // Bienvenida ON por defecto; se apaga con configuracion/gestor.bienvenidaWA.activo = false
    bienvenidaActiva: (data.bienvenidaWA?.activo ?? true) as boolean,
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
  const datos   = detectarTodosDatos(texto)   // TODAS las patentes/DNI del mensaje

  const convRef  = db().collection('conversacionesWA').doc(telefono)
  const convSnap = await convRef.get()
  const esNueva  = !convSnap.exists
  const prev: any = esNueva ? {} : (convSnap.data() ?? {})

  // Dueño de la línea (solo al abrir) + GUARD: si el secretario está inactivo,
  // la conversación cae al pool en vez de asignarse a un fantasma.
  const ownerLinea = esNueva ? await resolverDueno(cfg, phoneNumberId, displayPhone) : null
  const owner = ownerLinea && (await estaActivo(ownerLinea.uid)) ? ownerLinea : null
  if (ownerLinea && !owner) {
    console.warn(`[WA] Dueño de línea inactivo (${ownerLinea.nombre}) → al pool`)
  }

  // Responsable efectivo (nuevo: dueño activo; existente: asignado activo).
  let asigneeUid    = ''
  let asigneeNombre = ''
  if (esNueva) {
    asigneeUid    = owner?.uid    ?? ''
    asigneeNombre = owner?.nombre ?? ''
  } else {
    const pu = String(prev.asignadoA ?? '')
    if (pu && await estaActivo(pu)) {
      asigneeUid    = pu
      asigneeNombre = String(prev.asignadoNombre ?? '')
    }
  }

  // ── UMBRAL + MÚLTIPLES PATENTES + DATO SUELTO ─────────────────────────────
  // 1) Contexto de multa (keyword ahora o marcada antes) + patente/DNI válido →
  //    AUTO-ENCOLA todas las patentes/DNI del mensaje (agencia con varios autos).
  // 2) Patente/DNI SIN contexto de multa (cliente que manda solo la patente) →
  //    NO encola (evita basura): la deja como SUGERENCIA en el chip y AVISA al
  //    secretario para que confirme o descarte.
  // 3) Keyword sin dato válido → chip sugerido vacío (a completar a mano).
  const convEsMulta =
    esMulta || (!esNueva && (prev.esConsultaMulta === true || !!prev.consultaSugerida))

  const mkKey = (valor: string, tipoC: 'dominio' | 'dni') =>
    `wa_${gestoriaId}_${tipoC}_${valor}_${diaAR()}`.replace(/\//g, '_')

  let consultaSugeridaConv: Record<string, unknown> | null = null
  let encolarLista: { tipo: 'dominio' | 'dni'; valor: string; dedupeKey: string }[] = []
  // Aviso "llegó una patente/DNI, confirmá o descartá" (caso dato suelto sin keyword)
  let avisoSugerencia: { tipo: 'dominio' | 'dni'; valor: string } | null = null

  if (datos.length > 0 && convEsMulta) {
    // Encolar TODAS las patentes/DNI detectadas
    encolarLista = datos.map(d => {
      const valor = limpiarValor(d.valor)
      const tipoC = tipoDeValor(valor)
      return { tipo: tipoC, valor, dedupeKey: mkKey(valor, tipoC) }
    })
    const ult = encolarLista[encolarLista.length - 1]
    consultaSugeridaConv = {
      tipo: ult.tipo, valor: ult.valor, estado: 'confirmada', consultaId: ult.dedupeKey, detectadoEn: ts,
    }
  } else if (datos.length > 0 && !convEsMulta) {
    // Dato(s) suelto(s) SIN contexto → sugerencia + aviso para confirmar/descartar.
    const valores = datos.map(d => limpiarValor(d.valor))
    const d0      = datos[0]
    const tipo0   = tipoDeValor(limpiarValor(d0.valor))
    consultaSugeridaConv = {
      tipo: tipo0, valor: valores[0], estado: 'sugerida', detectadoEn: ts,
      ...(valores.length > 1 ? { valores } : {}),   // lista completa si hay varias
    }
    avisoSugerencia = { tipo: tipo0, valor: valores[0] }
  } else if (esMulta && prev.consultaSugerida?.estado !== 'confirmada') {
    consultaSugeridaConv = construirSugerida(null, ts)
  }

  const batch = db().batch()
  let leadIdConv: string | undefined = esNueva
    ? undefined
    : (prev.leadId ? String(prev.leadId) : undefined)

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
      lineaOrigen:     owner?.nombre ?? (ownerLinea ? `${ownerLinea.nombre} (inactivo)` : 'sin ruteo'),
    }
    if (clienteId)   convData.clienteId   = clienteId
    if (prospectoId) convData.prospectoId = prospectoId
    if (consultaSugeridaConv) convData.consultaSugerida = consultaSugeridaConv
    if (convEsMulta) convData.esConsultaMulta = true

    if (!clienteId && !prospectoId) {
      const leadId = await crearLeadDesdeWA({
        gestoriaId, telefono, nombre, texto,
        owner, phoneNumberId, displayPhone, referral, esMulta, batch,
      })
      if (leadId) { convData.leadId = leadId; leadIdConv = leadId }
    }

    batch.set(convRef, convData)
  } else {
    const update: Record<string, unknown> = {
      ultimoMensaje:   texto,
      ultimaActividad: ts,
      noLeidos:        admin.firestore.FieldValue.increment(1),
      ...(nombre && prev.nombre === telefono ? { nombre } : {}),
    }
    if (consultaSugeridaConv) update.consultaSugerida = consultaSugeridaConv
    if (convEsMulta && !prev.esConsultaMulta) update.esConsultaMulta = true
    if (esMulta && prev.leadId) {
      await marcarLeadComoMulta(String(prev.leadId)).catch(() => {})
    }

    batch.update(convRef, update as unknown as admin.firestore.UpdateData<admin.firestore.DocumentData>)
  }

  // ── 3. Guardar el mensaje ─────────────────────────────────────────────────
  const msgRef = convRef.collection('mensajes').doc()
  batch.set(msgRef, {
    gestoriaId, waMessageId,
    direccion: 'entrante', tipo, texto, timestamp: ts,
  })

  await batch.commit()

  // ── 3b. AUTO-ENCOLADO / AVISO DE SUGERENCIA (post-commit) ──────────────────
  const nombreContacto = String(esNueva ? (nombre || telefono) : (prev.nombre ?? telefono))

  // (1) Contexto de multa → encolar TODAS las patentes/DNI. Idempotente por dato.
  let encoladasNuevas = 0
  for (const e of encolarLista) {
    const creada = await crearConsultaEnCola({
      gestoriaId, tipo: e.tipo, valor: e.valor, dedupeKey: e.dedupeKey,
      contactoNombre: nombreContacto, telefono,
      asigneeUid, asigneeNombre, leadId: leadIdConv,
    })
    if (creada) {
      encoladasNuevas++
      if (asigneeUid) {
        await crearAvisoConsulta({
          gestoriaId, destinatarioId: asigneeUid,
          tipo: e.tipo, valor: e.valor,
          contactoNombre: nombreContacto, dedupeKey: e.dedupeKey,
        })
      }
    }
  }
  if (encoladasNuevas > 0) {
    await convRef.update({
      consultasEncoladas: admin.firestore.FieldValue.increment(encoladasNuevas),
    }).catch(() => {})
  }

  // (2) Dato suelto sin contexto → avisar al secretario para confirmar/descartar.
  if (avisoSugerencia && asigneeUid) {
    const etiqueta = avisoSugerencia.tipo === 'dominio' ? 'patente' : 'DNI'
    await db().collection('notificaciones').add({
      gestoriaId,
      destinatarioId: asigneeUid,
      titulo:  'Revisar dato recibido',
      mensaje: `${nombreContacto} envió ${etiqueta} ${avisoSugerencia.valor} sin más contexto. Confirmá si es consulta de multa o descartalo desde la Bandeja.`,
      tipo:        'general',
      entidadTipo: 'conversacionWA',
      entidadId:   telefono,
      leida:       false,
      creadoEn:    now(),
    }).catch(err => console.warn('[WA] no se pudo avisar sugerencia:', err?.message))
  }

  // ── 3c. MEDIA ENTRANTE (foto del acta, audios, PDF) ────────────────────────
  // Bajamos el archivo de Meta y lo guardamos en Storage; la URL queda en el
  // mensaje para que la Bandeja lo muestre. Si falla, queda el placeholder.
  const media =
    msg.image    ? { id: msg.image.id,    mime: msg.image.mime_type } :
    msg.audio    ? { id: msg.audio.id,    mime: msg.audio.mime_type } :
    msg.document ? { id: msg.document.id, mime: msg.document.mime_type } :
    msg.sticker  ? { id: msg.sticker.id,  mime: msg.sticker.mime_type } :
    null
  if (media?.id) {
    const mediaUrl = await descargarYGuardarMedia({
      mediaId: media.id, mime: media.mime, gestoriaId, telefono, waMessageId,
    })
    if (mediaUrl) {
      await msgRef.update({ mediaUrl, mediaType: media.mime }).catch(() => {})
    }
  }

  // ── 4. Bienvenida (NO marcamos leído para no confundir la app del celular) ─
  if (esNueva && cfg.bienvenidaActiva) {
    await enviarBienvenida(telefono, phoneNumberId).catch(err =>
      console.warn('[WA] No se pudo enviar bienvenida:', err))
    await convRef.update({ bienvenidaEnviada: true }).catch(() => {})
  }

  console.log(`[WA] ${telefono} -> "${texto.slice(0, 40)}" | multa:${esMulta} datos:${datos.length} encoladas:${encoladasNuevas} sugerencia:${avisoSugerencia?.valor ?? '-'} dueno:${owner?.nombre ?? (esNueva ? 'sin ruteo' : 'existente')}`)
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

// ─── AUTO-ENCOLADO: HELPERS ──────────────────────────────────────────────────

// Día AR (UTC-3) en formato YYYYMMDD. DEBE coincidir con diaAR() del frontend
// para compartir el mismo dedupeKey (auto-encolada y confirmada a mano = 1 doc).
function diaAR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

// ¿El usuario existe y no está desactivado? (guard de secretario inactivo)
async function estaActivo(uid: string): Promise<boolean> {
  if (!uid) return false
  try {
    const s = await db().doc(`users/${uid}`).get()
    return s.exists && (s.data() as any)?.activo !== false
  } catch {
    return false
  }
}

// Crea la consulta en la cola con ID determinístico. create() rechaza si ya
// existe → idempotente (no reabre una consulta ya cotizada ni re-notifica).
async function crearConsultaEnCola(p: {
  gestoriaId: string; tipo: 'dominio' | 'dni'; valor: string; dedupeKey: string
  contactoNombre: string; telefono: string
  asigneeUid: string; asigneeNombre: string; leadId?: string
}): Promise<boolean> {
  const ref = db().collection('consultasInfracciones').doc(p.dedupeKey)
  const data: Record<string, unknown> = {
    gestoriaId:   p.gestoriaId,
    tipoConsulta: p.tipo,
    ...(p.tipo === 'dominio' ? { dominio: p.valor } : { dni: p.valor, tipoDocumento: 'DNI' }),
    contacto: { nombre: p.contactoNombre, whatsapp: p.telefono, email: '' },
    origen: 'whatsapp',
    estado: 'pendiente',
    ...(p.leadId ? { leadId: p.leadId } : {}),
    asignadoA:       p.asigneeUid    || '',
    asignadoANombre: p.asigneeNombre || '',
    creadoPor:       p.asigneeUid    || 'whatsapp',
    creadoPorNombre: p.asigneeNombre || 'WhatsApp (auto)',
    creadaEn:        now(),
  }
  try {
    await ref.create(data)
    return true
  } catch (e: any) {
    console.log(`[WA] consulta no creada (${p.dedupeKey}): ${e?.message ?? 'ya existe'}`)
    return false
  }
}

// Aviso in-app (dispara push por el trigger de notificaciones) al secretario.
async function crearAvisoConsulta(p: {
  gestoriaId: string; destinatarioId: string; tipo: 'dominio' | 'dni'
  valor: string; contactoNombre: string; dedupeKey: string
}): Promise<void> {
  const etiqueta = p.tipo === 'dominio' ? 'patente' : 'DNI'
  await db().collection('notificaciones').add({
    gestoriaId:     p.gestoriaId,
    destinatarioId: p.destinatarioId,
    titulo:  'Consulta de multas lista',
    mensaje: `Consulta de ${etiqueta} ${p.valor} (${p.contactoNombre}) lista para procesar. Abrí la extensión para resolver el captcha.`,
    tipo:        'general',
    entidadTipo: 'consultaInfraccion',
    entidadId:   p.dedupeKey,
    leida:       false,
    creadoEn:    now(),
  }).catch(err => console.warn('[WA] no se pudo crear aviso:', err?.message))
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
  // Query por UN solo campo (waMessageId) → usa el índice de collection-group
  // que ya existe (el mismo del dedupe). Evita el índice compuesto de 3 campos
  // (direccion+gestoriaId+waMessageId) que hacía fallar el webhook. El resto se
  // filtra en memoria (waMessageId es único, así que son 1-2 docs a lo sumo).
  const snap = await db()
    .collectionGroup('mensajes')
    .where('waMessageId', '==', waMessageId)
    .limit(5)
    .get()

  const doc = snap.docs.find(d => {
    const m = d.data() as any
    return m.direccion === 'saliente' && m.gestoriaId === gestoriaId
  })
  if (!doc) return

  const estadoMap: Record<string, string> = {
    sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'error',
  }
  await doc.ref.update({ estado: estadoMap[status] ?? status })
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