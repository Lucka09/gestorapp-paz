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
  MetaReferral, MetaError, EstadoConversacion, MetaMessageEcho,
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
      const {
        messages = [], contacts = [], statuses = [], metadata, errors = [],
        message_echoes = [],      // field: smb_message_echoes
        history        = [],      // field: history
      } = (change.value ?? {}) as any
 
      const phoneNumberId = metadata?.phone_number_id ?? ''
 
      // ── DIAGNÓSTICO — dejalo unos días y después sacalo ──────────────────
      console.log('[WA][diag] field=%s keys=%s',
        change.field, Object.keys(change.value ?? {}).join(','))
 
      // ── HISTORIAL (field: history) ───────────────────────────────────────
      // Llega en tandas después del onboarding. Es un import masivo: NO crea
      // leads, NO clasifica multas, NO manda bienvenida, NO toca noLeidos.
      if (change.field === 'history' && history.length) {
        for (const chunk of history) {
          try {
            await procesarHistorial(gestoriaId, chunk, phoneNumberId)
          } catch (e: any) {
            console.error('[WA][hist] error en chunk', {
              orden: chunk?.metadata?.chunk_order, msg: e?.message,
            })
          }
        }
        continue
      }
 
      // ── ECOS (field: smb_message_echoes) ─────────────────────────────────
      // Mensajes que los secretarios mandan desde el celular.
      // OJO: acá `from` es el número de la gestoría y `to` el del cliente.
      if (message_echoes.length) {
        for (const eco of message_echoes) {
          try {
            await procesarEcoSaliente(gestoriaId, eco)
          } catch (e: any) {
            console.error('[WA][eco] error', { id: eco?.id, msg: e?.message })
          }
        }
        continue
      }
 
      // ── FLUJO NORMAL (sin cambios) ───────────────────────────────────────
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
        try { await procesarMensaje(gestoriaId, msg, nombre, metadata) }
        catch (e: any) { console.error('[WA] fallo procesarMensaje:', e?.message, e?.stack) }
      }
    }
  }
}

async function procesarEcoSaliente(
  gestoriaId: string,
  eco: MetaMessageEcho,
): Promise<void> {
  const telefonoCliente = normalizarTelefono(String(eco.to ?? ''))
  if (!telefonoCliente || !eco.id) return
 
  const convRef = db().collection('conversacionesWA').doc(telefonoCliente)
  const msgRef  = convRef.collection('mensajes').doc(idSeguro(eco.id))
 
  if ((await msgRef.get()).exists) return
 
  const convSnap = await convRef.get()
 
  const texto = eco.text?.body
    ?? eco.image?.caption
    ?? eco.document?.caption
    ?? eco.document?.filename
    ?? `[${eco.type}]`
 
  const tipo = mapTipo(eco.type)
 
  const segundos = Number(eco.timestamp ?? Date.now() / 1000)
  const ts = admin.firestore.Timestamp.fromMillis(
    Number.isFinite(segundos) ? segundos * 1000 : Date.now(),
  )
 
  const batch = db().batch()
 
  batch.set(msgRef, {
    gestoriaId,
    waMessageId: eco.id,
    direccion:   'saliente',
    tipo,
    texto,
    timestamp:   ts,
    estado:      'enviado',
    origenEnvio: 'celular',
    enviadoPor:  '',
  })
  // Si la conversación no existe, el secretario escribió primero desde el
  // celular a alguien que nunca nos había escrito. Se crea mínima.
  const datosConv: Record<string, unknown> = {
    ultimoMensaje:          texto.slice(0, 120),
    ultimaActividad:        ts,
    ultimoMensajeDireccion: 'saliente',
    noLeidos:               0,
    alertaSinRespuestaEn:   admin.firestore.FieldValue.delete(),
  }
  if (!convSnap.exists) {
    Object.assign(datosConv, {
      gestoriaId,
      telefono:  telefonoCliente,
      nombre:    telefonoCliente,
      estado:    'en_atencion' as EstadoConversacion,
      asignadoA: '',
      asignadoNombre: '',
      creadoEn:  ts,
    })
  }
 
  batch.set(convRef, datosConv, { merge: true })
  await batch.commit()
 
  console.log('[WA][eco] guardado', { conv: telefonoCliente, tipo })
}

// Estructura real del payload:
//   value.history[].threads[].messages[]
//   thread.id                    → teléfono del CLIENTE
//   message.from                 → quién mandó (gestoría o cliente)
//   message.history_context.from_me === true → lo mandó LA GESTORÍA
//
// Es la única forma de recuperar la dirección de los mensajes viejos. Sin
// mirar `from_me`, todo entra como entrante y las conversaciones quedan como
// las que estás viendo en la Bandeja: solo el lado del cliente.
//
// Fases (metadata.phase): 0 = día 0 a 1 · 1 = día 1 a 90 · 2 = día 90 a 180.
// Llega en chunks; `progress` va de 0 a 100.
 
interface HistoryMensaje {
  from:      string
  to?:       string
  id:        string
  timestamp: string
  type:      string
  text?:     { body: string }
  image?:    { caption?: string; id?: string }
  video?:    { caption?: string; id?: string }
  document?: { caption?: string; filename?: string; id?: string }
  audio?:    { id?: string }
  sticker?:  { id?: string }
  history_context?: {
    from_me?: boolean
    status?:  string
  }
}
 
interface HistoryChunk {
  metadata?: { phase?: number; chunk_order?: number; progress?: number }
  threads?:  { id: string; messages?: HistoryMensaje[] }[]
}
 
async function procesarHistorial(
  gestoriaId:    string,
  chunk:         HistoryChunk,
  phoneNumberId: string,
): Promise<void> {
  const { phase, chunk_order, progress } = chunk.metadata ?? {}
  const threads = chunk.threads ?? []
 
  console.log('[WA][hist] chunk', {
    fase: phase, orden: chunk_order, progreso: progress, hilos: threads.length,
  })
 
  let importados = 0, saltados = 0
 
  for (const thread of threads) {
    const telefono = normalizarTelefono(String(thread.id ?? ''))
    const mensajes = thread.messages ?? []
    if (!telefono || mensajes.length === 0) continue
 
    const convRef = db().collection('conversacionesWA').doc(telefono)
    const convSnap = await convSnapSeguro(convRef)
 
    // Firestore: máximo 500 operaciones por batch. Dejamos margen para el
    // update de la conversación.
    const LOTE = 400
    let ultimo: { ts: admin.firestore.Timestamp; texto: string; saliente: boolean } | null = null
 
    for (let i = 0; i < mensajes.length; i += LOTE) {
      const batch = db().batch()
      let enBatch = 0
 
      for (const m of mensajes.slice(i, i + LOTE)) {
        if (!m.id) { saltados++; continue }
 
        const msgRef = convRef.collection('mensajes').doc(idSeguro(m.id))
 
        // La dirección sale de history_context.from_me. Si no viene, se
        // deduce comparando `from` con el teléfono del hilo.
        const saliente = m.history_context?.from_me === true
          || (!!m.from && normalizarTelefono(m.from) !== telefono)
 
        const texto = m.text?.body
          ?? m.image?.caption
          ?? m.video?.caption
          ?? m.document?.caption
          ?? m.document?.filename
          ?? `[${m.type}]`
 
        const segundos = Number(m.timestamp)
        const ts = admin.firestore.Timestamp.fromMillis(
          Number.isFinite(segundos) ? segundos * 1000 : Date.now(),
        )
 
        // set() sin merge sobre un doc id determinístico: si el chunk se
        // reenvía, se pisa con lo mismo. Idempotente y sin lectura previa
        // (leer 20.000 mensajes uno por uno sería carísimo).
        batch.set(msgRef, {
          gestoriaId,
          waMessageId: m.id,
          direccion:   saliente ? 'saliente' : 'entrante',
          tipo:        mapTipo(m.type),
          texto,
          timestamp:   ts,
          ...(saliente ? {
            estado:      m.history_context?.status === 'read' ? 'leido' : 'enviado',
            origenEnvio: 'celular',
            enviadoPor:  '',
          } : {}),
          importadoDeHistorial: true,
        })
 
        enBatch++
        importados++
 
        if (!ultimo || ts.toMillis() > ultimo.ts.toMillis()) {
          ultimo = { ts, texto, saliente }
        }
      }
 
      if (enBatch > 0) await batch.commit()
    }
 
    // ── Cabecera de la conversación ────────────────────────────────────────
    // Solo se pisa si el historial trae algo MÁS NUEVO que lo que ya hay.
    // Sin este guard, un chunk viejo retrocedería la conversación y la
    // mandaría al fondo de la Bandeja.
    if (!ultimo) continue
 
    const actualMs = convSnap?.get('ultimaActividad')?.toMillis?.() ?? 0
    const esMasNuevo = ultimo.ts.toMillis() > actualMs
 
    const datos: Record<string, unknown> = {
      gestoriaId,
      telefono,
      historialImportadoEn: now(),
      ...(convSnap?.exists ? {} : {
        nombre:          telefono,
        estado:          'en_atencion' as EstadoConversacion,
        asignadoA:       '',
        asignadoNombre:  '',
        noLeidos:        0,          // el historial NUNCA suma pendientes
        waPhoneNumberId: phoneNumberId,
        creadoEn:        ultimo.ts,
      }),
      ...(esMasNuevo ? {
        ultimoMensaje:          ultimo.texto.slice(0, 120),
        ultimaActividad:        ultimo.ts,
        ultimoMensajeDireccion: ultimo.saliente ? 'saliente' : 'entrante',
      } : {}),
    }
 
    await convRef.set(datos, { merge: true })
  }
 
  console.log('[WA][hist] fin chunk', { importados, saltados, progreso: progress })
}
 
// getDoc que no tira si la conversación no existe
async function convSnapSeguro(
  ref: admin.firestore.DocumentReference,
): Promise<admin.firestore.DocumentSnapshot | null> {
  try { return await ref.get() } catch { return null }
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
      ultimoMensajeDireccion: 'entrante',
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
      ultimoMensajeDireccion: 'entrante',
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
function idSeguro(wamid: string): string {
  return String(wamid).replace(/[/\\]/g, '_').slice(0, 300)
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
    video: 'video', document: 'documento', sticker: 'sticker',
  }
  return map[type] ?? 'texto'
}