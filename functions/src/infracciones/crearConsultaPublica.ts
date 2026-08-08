// functions/src/infracciones/crearConsultaPublica.ts
// ─── CAPTURA DE LEAD DESDE LA WEB PÚBLICA (gestoriapaz.com) ──────────────────
//
// [v2] Ahora además del pre-prospecto + la consulta en cola, crea un LEAD en
//      la capa omnicanal (/leads) y emite el evento lead.creado, alimentando
//      el stream de eventos (automatizaciones + IA).
//
// Este endpoint es PÚBLICO: lo llama el navegador del visitante SIN token.
//   • el gestoriaId NO viene del cliente → fijado server-side (env).
//   • validamos y normalizamos patente/DNI antes de escribir.
//   • idempotente: mismo dato el mismo día ⇒ mismo documento.
//   • honeypot anti-bots + CORS acotado.
//
// En una sola transacción crea/recupera:
//   1) consulta en `consultasInfracciones` (estado 'pendiente') → cola extensión
//   2) LEAD en `leads` (canal 'web', convertido a prospecto)
//   3) pre-prospecto en `prospectos` (etapa 'nuevo', naranja)
//   Y emite `lead.creado` (fuera de la transacción, fire-and-forget).
//
// Despliegue: firebase deploy --only functions:crearConsultaPublica
import * as admin    from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger }    from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Fijado server-side. NUNCA lo manda el cliente.
const GESTORIA_ID = process.env.GESTORIA_ID_WEB || 'gestoria-paz'

const ORIGENES_OK = new Set<string>([
  'https://gestoriapaz.com',
  'https://www.gestoriapaz.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
])

// ─── TIPOS DE ENTRADA ────────────────────────────────────────────────────────
type TipoConsulta = 'dominio' | 'dni'
interface Payload {
  tipoConsulta?: TipoConsulta
  valor?:        string
  patente?:      string
  dni?:          string
  contacto?:     { nombre?: string; whatsapp?: string; email?: string }
  genero?:       string
  hp?:           string
}

// ─── VALIDACIÓN / NORMALIZACIÓN ──────────────────────────────────────────────
const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/
const RE_DNI     = /^\d{7,8}$/

function limpiar(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function diaAR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

function setCors(req: any, res: any): void {
  const origin = req.headers.origin as string | undefined
  if (origin && ORIGENES_OK.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
  }
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Max-Age', '3600')
}

// ─── FUNCIÓN ─────────────────────────────────────────────────────────────────
export const crearConsultaPublica = onRequest(
  { cors: false },
  async (req, res) => {
    setCors(req, res)

    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST')    { res.status(405).json({ ok: false }); return }

    try {
      const body = (req.body || {}) as Payload

      // 1) Honeypot: bot llenó el campo trampa → fingimos éxito, no escribimos.
      if (body.hp && body.hp.trim() !== '') { res.status(200).json({ ok: true }); return }

      // 2) Resolver valor y tipo (tolerante con el hook viejo).
      const bruto = body.valor ?? body.patente ?? body.dni ?? ''
      const valor = limpiar(bruto)
      if (!valor) { res.status(400).json({ ok: false, error: 'dato_invalido' }); return }

      let tipo: TipoConsulta
      if (body.tipoConsulta === 'dni' || body.tipoConsulta === 'dominio') {
        tipo = body.tipoConsulta
      } else {
        tipo = RE_DNI.test(valor) ? 'dni' : 'dominio'
      }

      // 3) Validar según tipo.
      const valido = tipo === 'dni' ? RE_DNI.test(valor) : RE_DOMINIO.test(valor)
      if (!valido) { res.status(400).json({ ok: false, error: 'dato_invalido' }); return }

      // 4) Contacto opcional (saneado) + género.
      const contacto = {
        nombre:   (body.contacto?.nombre   || '').toString().trim().slice(0, 80),
        whatsapp: limpiarTel(body.contacto?.whatsapp || ''),
        email:    (body.contacto?.email    || '').toString().trim().slice(0, 120),
      }
      const genero = normalizarGenero(body.genero)

      const db  = admin.firestore()
      const now = admin.firestore.FieldValue.serverTimestamp()

      // Descripción legible (la usan el lead, el prospecto y el evento).
      const descripcion = tipo === 'dni'
        ? `Consulta de infracciones por DNI ${valor} (web)`
        : `Consulta de infracciones por dominio ${valor} (web)`

      // 5) Clave de idempotencia: mismo dato + mismo día ⇒ mismo doc.
      const dedupeKey    = `web_${GESTORIA_ID}_${tipo}_${valor}_${diaAR()}`.replace(/\//g, '_')
      const consultaRef  = db.collection('consultasInfracciones').doc(dedupeKey)
      const prospectoRef = db.collection('prospectos').doc()
      const leadRef      = db.collection('leads').doc()   // ← NUEVO: id reservado para el lead

      let creoNuevoLead = false

      await db.runTransaction(async (t) => {
        const snap = await t.get(consultaRef)
        if (snap.exists) {
          // Ya existe hoy: solo completamos contacto si ahora lo mandaron.
          const prev = snap.data() as any
          const patch: any = {}
          if (contacto.nombre   && !prev?.contacto?.nombre)   patch['contacto.nombre']   = contacto.nombre
          if (contacto.whatsapp && !prev?.contacto?.whatsapp) patch['contacto.whatsapp'] = contacto.whatsapp
          if (contacto.email    && !prev?.contacto?.email)    patch['contacto.email']    = contacto.email
          if (Object.keys(patch).length) t.update(consultaRef, patch)

          if (prev?.prospectoId && (contacto.whatsapp || contacto.nombre || contacto.email)) {
            const pRef = db.collection('prospectos').doc(prev.prospectoId)
            const pPatch: any = { actualizadoEn: now }
            if (contacto.nombre)   pPatch.nombre   = contacto.nombre
            if (contacto.whatsapp) pPatch.telefono = contacto.whatsapp
            if (contacto.email)    pPatch.email    = contacto.email
            t.set(pRef, pPatch, { merge: true })
          }
          return
        }

        // ── NUEVO: creamos LEAD + pre-prospecto + consulta, todo enlazado ──
        creoNuevoLead = true

        // 1) LEAD — alimenta la capa omnicanal + el motor de automatizaciones
        const leadData: Record<string, unknown> = {
          gestoriaId:         GESTORIA_ID,
          nombre:             contacto.nombre || 'Consulta web',
          telefono:           contacto.whatsapp || null,
          email:              contacto.email || null,
          documento:          tipo === 'dni' ? valor : null,
          consulta:           descripcion,
          tipoTramiteInteres: 'descargo_multa',
          canal:              'web',
          fuente:             'gestoriapaz-web',
          origenSistema:      'web_form',
          estado:             'convertido',   // se convierte en prospecto en esta misma transacción
          prioridad:          'normal',
          convertidoA:        'prospecto',
          prospectoId:        prospectoRef.id,
          utm_source:         null,
          utm_medium:         null,
          utm_campaign:       null,
          utm_content:        null,
          paginaUrl:          req.headers.referer || req.headers.origin || null,
          ipOrigen:           req.ip || null,
          creadoPor:          'system',
          creadoEn:           now,
          actualizadoEn:      now,
          // Metadatos de la consulta de multas (los necesita el equipo para procesarla)
          consultaTipo:       tipo,
          consultaValor:      valor,
          genero:             genero || null,
        }
        t.set(leadRef, leadData)

        // 2) PRE-PROSPECTO (como antes) + vínculo al lead
        t.set(prospectoRef, {
          gestoriaId:   GESTORIA_ID,
          nombre:       contacto.nombre || 'Lead web',
          apellido:     '',
          telefono:     contacto.whatsapp || '',
          email:        contacto.email || '',
          localidad:    '',
          etapa:        'nuevo',
          color:        'naranja',
          tipoTramite:  'descargo_multa',
          patente:      tipo === 'dominio' ? valor : '',
          descripcion,
          montoCierre:  0,
          formaPago:    '',
          fechaCierre:  '',
          tareas:       [],
          etiquetas:    ['consulta-multas', 'origen-web'],
          asignadoA:    '',
          creadoPor:    'web',
          leadId:       leadRef.id,   // ← NUEVO: trazabilidad lead → prospecto
          orden:        Date.now(),
          creadoEn:     now,
          actualizadoEn: now,
        })

        // 3) CONSULTA EN COLA (como antes) + vínculo al lead
        t.set(consultaRef, {
          gestoriaId:   GESTORIA_ID,
          tipoConsulta: tipo,
          ...(tipo === 'dominio' ? { dominio: valor } : { dni: valor, tipoDocumento: 'DNI' }),
          ...(tipo === 'dni' && genero ? { genero } : {}),
          contacto,
          origen:       'web',
          estado:       'pendiente',
          prospectoId:  prospectoRef.id,
          leadId:       leadRef.id,   // ← NUEVO: trazabilidad lead → consulta
          creadaEn:     now,
        })
      })

      // ── Evento lead.creado (fuera de la transacción, fire-and-forget) ─────
      if (creoNuevoLead) {
        try {
          await db.collection('eventos').add({
            gestoriaId:   GESTORIA_ID,
            tipo:         'lead.creado',
            entidad:      'lead',
            entidadId:    leadRef.id,
            entidadLabel: contacto.nombre || 'Consulta web',
            actor:        { id: 'system', tipo: 'sistema' },
            payload:      { canal: 'web', tipoConsulta: tipo, valor },
            resumen:      `Nuevo lead web: ${descripcion}`,
            timestamp:    admin.firestore.FieldValue.serverTimestamp(),
          })
        } catch (e: any) {
          logger.warn('No se pudo emitir evento lead.creado', { message: e?.message })
        }
      }

      logger.info('crearConsultaPublica', { gestoriaId: GESTORIA_ID, tipo, dedupeKey, lead: creoNuevoLead })
      res.status(200).json({ ok: true })

    } catch (err: any) {
      logger.error('crearConsultaPublica error', { message: err?.message })
      res.status(500).json({ ok: false })
    }
  }
)

function limpiarTel(v: string): string {
  const s = (v || '').toString().trim()
  const plus = s.startsWith('+') ? '+' : ''
  return (plus + s.replace(/[^0-9]/g, '')).slice(0, 20)
}

function normalizarGenero(v?: string): string {
  const s = (v || '').toString().trim().toUpperCase()
  if (!s) return ''
  if (s === 'M' || s.startsWith('MA')) return 'M'
  if (s === 'F' || s.startsWith('FE')) return 'F'
  if (s === 'X' || s.startsWith('NO') || s.startsWith('NB')) return 'X'
  return ''
}