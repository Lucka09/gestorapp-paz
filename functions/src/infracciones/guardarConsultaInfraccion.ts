// functions/src/infracciones/guardarConsultaInfraccion.ts
// ─── RECIBE LAS ACTAS CRUDAS DE LA EXTENSIÓN Y HACE TODO EL TRABAJO ──────────
//
// La extensión (content.js) hace POST con { consultaId, dominio, raw }.
// Acá: verificamos el ID token, parseamos/clasificamos/cotizamos, guardamos en
// `consultasInfracciones`, actualizamos/creamos el prospecto y armamos el mensaje
// de WhatsApp. El PDF y el auto-envío se enganchan después reusando jsPDF y
// whatsappSend del frontend.
//
// Es onRequest (no onCall) porque la extensión llama por fetch con Bearer token.
// Despliegue: firebase deploy --only functions:guardarConsultaInfraccion

import * as admin      from 'firebase-admin'
import { onRequest }   from 'firebase-functions/v2/https'
import { logger }      from 'firebase-functions'
import {
  parseRespuestaPortal,
  cotizar,
  DEFAULT_CONFIG_COTIZACION,
  type ConfigCotizacionMultas,
} from './parseInfracciones'
import type { RawRespuestaPortal, Acta, CotizacionMultas } from '../infraccion_types'

const CONFIG_DOC = 'configuracion/gestor'

// Orígenes permitidos (token-gated igual; CORS solo evita el bloqueo del browser)
const ORIGENES_OK = new Set([
  'https://infraccionesba.gba.gob.ar',
])

function setCors(req: { headers?: Record<string, string | string[] | undefined> }, res: { set(name: string, value: string): void }): void {
  const origin = Array.isArray(req.headers?.origin) ? req.headers?.origin[0] : req.headers?.origin
  // La extensión (content script) hereda el origin del portal; los chrome-extension:// también.
  if (origin && (ORIGENES_OK.has(origin) || origin.startsWith('chrome-extension://'))) {
    res.set('Access-Control-Allow-Origin', origin)
  } else {
    res.set('Access-Control-Allow-Origin', '*')
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Max-Age', '3600')
}

// ─── HELPER: leer la config de cotización (o default) ────────────────────────

async function leerConfigCotizacion(): Promise<ConfigCotizacionMultas> {
  try {
    const snap = await admin.firestore().doc(CONFIG_DOC).get()
    const data = snap.data() as { cotizacionMultas?: ConfigCotizacionMultas } | undefined
    if (data?.cotizacionMultas) {
      // Merge superficial: lo que Matías configuró pisa el default.
      return { ...DEFAULT_CONFIG_COTIZACION, ...data.cotizacionMultas }
    }
  } catch (e) {
    logger.warn('[guardarConsulta] No se pudo leer config, usando default', e)
  }
  return DEFAULT_CONFIG_COTIZACION
}

// ─── HELPER: mensaje de WhatsApp listo para copiar/enviar ────────────────────

function armarMensajeWhatsapp(params: {
  nombre:     string
  dominio:    string
  cotizacion: CotizacionMultas
  nombreComercial: string
}): string {
  const { nombre, dominio, cotizacion, nombreComercial } = params
  const money = (n: number) => `$${n.toLocaleString('es-AR')}`

  if (cotizacion.cantidadTrabajable === 0) {
    return (
      `Hola ${nombre}! Consultamos el dominio ${dominio} y por el momento no ` +
      `encontramos infracciones que podamos gestionar. Cualquier cosa, quedamos a disposición.\n\n${nombreComercial}`
    )
  }

  const lineas = cotizacion.actasTrabajables.map((a: Acta) => {
    const detalle = a.detalles[0]?.descripcion ?? 'Infracción'
    return `• Acta ${a.nroActa} — ${detalle} — ${money(a.importeTotal)}`
  })

  let msg =
    `Hola ${nombre}! Consultamos las infracciones del dominio ${dominio}.\n\n` +
    `Infracciones que podemos gestionar (${cotizacion.cantidadTrabajable}):\n` +
    lineas.join('\n') +
    `\n\nHonorarios del trámite: ${money(cotizacion.honorariosGestoria)} (${cotizacion.detalleHonorarios}).`

  if (cotizacion.cantidadExcluida > 0) {
    msg +=
      `\n\nDetectamos además ${cotizacion.cantidadExcluida} acta(s) que no corresponde ` +
      `gestionar (sentencia firme, descargo ya presentado o sin deber de informar). ` +
      `El detalle completo va en el presupuesto.`
  }

  msg += `\n\n¿Avanzamos? Respondé este mensaje y lo dejamos en marcha.\n\n${nombreComercial}`
  return msg
}

// ─── HELPER: upsert del prospecto en el pipeline ─────────────────────────────

async function upsertProspecto(params: {
  db:          admin.firestore.Firestore
  gestoriaId:  string
  uid:         string
  prospectoId: string | undefined
  contacto:    { nombre: string; whatsapp: string; email?: string }
  dominio:     string
  cotizacion:  CotizacionMultas
}): Promise<string> {
  const { db, gestoriaId, uid, prospectoId, contacto, dominio, cotizacion } = params
  const now = admin.firestore.FieldValue.serverTimestamp()

  const descripcion =
    cotizacion.cantidadTrabajable > 0
      ? `${cotizacion.cantidadTrabajable} multa(s) gestionable(s) · honorarios $${cotizacion.honorariosGestoria.toLocaleString('es-AR')}`
      : `Consulta sin deuda gestionable`

  // Si ya existe (pre-prospecto de la web), lo actualizamos a "presupuestado".
  if (prospectoId) {
    await db.doc(`prospectos/${prospectoId}`).set(
      {
        etapa:         cotizacion.cantidadTrabajable > 0 ? 'presupuestado' : 'contactado',
        color:         'naranja',
        patente:       dominio,
        descripcion,
        actualizadoEn: now,
      },
      { merge: true },
    )
    return prospectoId
  }

  // Si no existe (carga manual), lo creamos.
  const [nombre, ...resto] = (contacto.nombre || 'Sin nombre').trim().split(' ')
  const ref = await db.collection('prospectos').add({
    gestoriaId,
    nombre,
    apellido:     resto.join(' '),
    telefono:     contacto.whatsapp || '',
    email:        contacto.email || '',
    localidad:    '',
    etapa:        cotizacion.cantidadTrabajable > 0 ? 'presupuestado' : 'contactado',
    color:        'naranja',
    tipoTramite:  'descargo_multa',
    patente:      dominio,
    descripcion,
    montoCierre:  0,
    formaPago:    '',
    fechaCierre:  '',
    tareas:       [],
    etiquetas:    ['consulta-multas'],
    asignadoA:    uid,
    creadoPor:    uid,
    orden:        Date.now(),
    creadoEn:     now,
    actualizadoEn: now,
  })
  return ref.id
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export const guardarConsultaInfraccion = onRequest(
  { region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST')   { res.status(405).json({ ok: false, error: 'Método no permitido' }); return }

    // ── 1. Verificar ID token ───────────────────────────────────────────────
    const authHeader = (req.headers.authorization as string) || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) { res.status(401).json({ ok: false, error: 'Falta token' }); return }

    let uid: string
    try {
      const decoded = await admin.auth().verifyIdToken(token)
      uid = decoded.uid
    } catch {
      res.status(401).json({ ok: false, error: 'Token inválido' }); return
    }

    const db = admin.firestore()

    // ── 2. Validar usuario ──────────────────────────────────────────────────
    const userSnap = await db.doc(`users/${uid}`).get()
    if (!userSnap.exists) { res.status(403).json({ ok: false, error: 'Usuario no encontrado' }); return }
    const userData = userSnap.data() as { activo?: boolean; gestoriaId?: string }
    if (userData.activo === false) { res.status(403).json({ ok: false, error: 'Usuario inactivo' }); return }
    const gestoriaId = userData.gestoriaId
    if (!gestoriaId) { res.status(403).json({ ok: false, error: 'Usuario sin gestoría' }); return }

    // ── 3. Validar payload ──────────────────────────────────────────────────
    const { consultaId, dominio, raw } = (req.body ?? {}) as {
      consultaId?: string
      dominio?:    string
      raw?:        RawRespuestaPortal
    }
    if (!consultaId || !raw) {
      res.status(400).json({ ok: false, error: 'Falta consultaId o raw' }); return
    }

    // ── 4. Verificar que la consulta pertenece a la gestoría del usuario ─────
    const consultaRef  = db.doc(`consultasInfracciones/${consultaId}`)
    const consultaSnap = await consultaRef.get()
    if (!consultaSnap.exists) {
      res.status(404).json({ ok: false, error: 'Consulta no encontrada' }); return
    }
    const consulta = consultaSnap.data() as {
      gestoriaId:  string
      tipoConsulta?: 'dominio' | 'dni'
      dominio?:    string
      dni?:        string
      contacto?:   { nombre: string; whatsapp: string; email?: string }
      prospectoId?: string
    }
    if (consulta.gestoriaId !== gestoriaId) {
      res.status(403).json({ ok: false, error: 'Consulta de otra gestoría' }); return
    }

    // Rótulo para el mensaje: por DNI no hay un dominio único (las actas pueden
    // abarcar varios vehículos), así que usamos un rótulo neutro.
    const esDni = consulta.tipoConsulta === 'dni'
    const dominioEfectivo = dominio || consulta.dominio || ''
    const rotuloBusqueda = esDni
      ? (consulta.dni ? `DNI ${consulta.dni}` : 'tu documento')
      : dominioEfectivo

    // ── 5. Parsear + clasificar + cotizar ───────────────────────────────────
    const config: ConfigCotizacionMultas = await leerConfigCotizacion()
    const actas: Acta[] = parseRespuestaPortal(raw, config)
    const cotizacion: CotizacionMultas = cotizar(actas, config)

    const contacto = consulta.contacto ?? { nombre: 'Sin nombre', whatsapp: '' }

    // ── 6. Armar mensaje de WhatsApp ────────────────────────────────────────
    // nombreComercial: leído de config (fallback a "Gestoría Paz")
    let nombreComercial = 'Gestoría Paz'
    try {
      const cfgSnap = await db.doc(CONFIG_DOC).get()
      const cfgData = cfgSnap.data() as { nombreComercial?: string } | undefined
      nombreComercial = cfgData?.nombreComercial ?? nombreComercial
    } catch { /* usa el fallback */ }

    const mensajeWhatsapp = armarMensajeWhatsapp({
      nombre:  contacto.nombre?.split(' ')[0] || 'Hola',
      dominio: rotuloBusqueda,
      cotizacion,
      nombreComercial,
    })

    // ── 7. Upsert del prospecto ─────────────────────────────────────────────
    const prospectoId = await upsertProspecto({
      db, gestoriaId, uid,
      prospectoId: consulta.prospectoId,
      contacto,
      dominio: esDni ? '' : dominioEfectivo,
      cotizacion,
    })

    // ── 8. Guardar todo en la consulta ──────────────────────────────────────
    const sinDeuda = cotizacion.cantidadTrabajable === 0 && cotizacion.cantidadExcluida === 0
    await consultaRef.set(
      {
        estado:         sinDeuda ? 'sin_deuda' : 'cotizada',
        actas,
        cotizacion,
        mensajeWhatsapp,
        prospectoId,
        consultadaPor:  uid,
        consultadaEn:   admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    logger.info(JSON.stringify({
      fn: 'guardarConsultaInfraccion', gestoriaId, uid, consultaId,
      dominio, actas: actas.length,
      trabajables: cotizacion.cantidadTrabajable,
      excluidas: cotizacion.cantidadExcluida,
      honorarios: cotizacion.honorariosGestoria,
    }))

    // ── 9. Responder ────────────────────────────────────────────────────────
    res.status(200).json({
      ok: true,
      estado:      sinDeuda ? 'sin_deuda' : 'cotizada',
      prospectoId,
      resumen: {
        trabajables:  cotizacion.cantidadTrabajable,
        excluidas:    cotizacion.cantidadExcluida,
        deuda:        cotizacion.importeTotalDeuda,
        honorarios:   cotizacion.honorariosGestoria,
      },
      mensajeWhatsapp,
    })
  },
)