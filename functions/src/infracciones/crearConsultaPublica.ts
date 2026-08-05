// functions/src/infracciones/crearConsultaPublica.ts
// ─── CAPTURA DE LEAD DESDE LA WEB PÚBLICA (gestoriapaz.com) ──────────────────
//
// Este endpoint es PÚBLICO: lo llama el navegador del visitante desde el sitio
// estático, SIN token de usuario. Por eso:
//   • el gestoriaId NO viene del cliente (sería un vector de spam) → está fijado
//     en el server vía env GESTORIA_ID_WEB.
//   • validamos y normalizamos el dato (patente o DNI) antes de escribir nada.
//   • es idempotente: mismo dato el mismo día ⇒ mismo documento (no duplica
//     consultas ni prospectos si el visitante manda dos veces).
//   • incluye honeypot anti-bots y CORS acotado a los orígenes del sitio.
//   • nunca devuelve datos internos: responde { ok:true } y listo.
//
// Qué hace en un solo movimiento (transacción):
//   1) crea/recupera la consulta en `consultasInfracciones` (estado 'pendiente')
//      → queda en la cola que consume la extensión.
//   2) crea/recupera un pre-prospecto en `prospectos` (etapa 'nuevo', naranja).
//
// El resto de la cadena ya existe: cola → captcha (humano) → guardarConsulta →
// cotización → PresupuestoMultas → envío.
//
// Despliegue: firebase deploy --only functions:crearConsultaPublica
// Env:        firebase functions:config no aplica en v2 → usar .env / secrets:
//             GESTORIA_ID_WEB=<id de Gestoría Paz>
//
// ⚠️ Endurecimiento para producción: activar App Check (attestation del sitio)
//    y/o rate-limit por IP. Ver nota al pie.

import * as admin    from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger }    from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// Fijado en el server. NO se acepta desde el cliente.
const GESTORIA_ID = process.env.GESTORIA_ID_WEB || 'gestoria-paz'

// Orígenes desde los que se permite la llamada (CORS).
const ORIGENES_OK = new Set<string>([
  'https://gestoriapaz.com',
  'https://www.gestoriapaz.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5500', // Live Server (VS Code) para pruebas locales
])

// ─── TIPOS DE ENTRADA ────────────────────────────────────────────────────────

type TipoConsulta = 'dominio' | 'dni'

interface Payload {
  tipoConsulta?: TipoConsulta
  valor?:        string          // patente o DNI
  patente?:      string          // compat con el hook viejo { patente, origen }
  dni?:          string
  contacto?:     { nombre?: string; whatsapp?: string; email?: string }
  genero?:       string          // solo DNI: Femenino | Masculino | No binario
  hp?:           string          // honeypot: si viene con algo, es un bot
}

// ─── VALIDACIÓN / NORMALIZACIÓN ──────────────────────────────────────────────

// Patentes AR: auto viejo (AAA123), auto Mercosur (AA123AA),
// moto vieja (123ABC), moto Mercosur (A123BCD).
const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/
const RE_DNI     = /^\d{7,8}$/

/** Deja solo A-Z0-9 y pasa a mayúsculas. */
function limpiar(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Bucket de día en horario Argentina (UTC-3) para la clave de idempotencia. */
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
  { cors: false }, // manejamos CORS a mano para acotar orígenes
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST')    { res.status(405).json({ ok: false }); return }

    try {
      const body = (req.body || {}) as Payload

      // 1) Honeypot: si un bot llenó el campo trampa, fingimos éxito y no escribimos.
      if (body.hp && body.hp.trim() !== '') { res.status(200).json({ ok: true }); return }

      // 2) Resolver el valor y el tipo (tolerante con el hook viejo).
      const bruto = body.valor ?? body.patente ?? body.dni ?? ''
      const valor = limpiar(bruto)
      if (!valor) { res.status(400).json({ ok: false, error: 'dato_invalido' }); return }

      let tipo: TipoConsulta
      if (body.tipoConsulta === 'dni' || body.tipoConsulta === 'dominio') {
        tipo = body.tipoConsulta
      } else {
        tipo = RE_DNI.test(valor) ? 'dni' : 'dominio' // inferencia
      }

      // 3) Validar según tipo.
      const valido = tipo === 'dni' ? RE_DNI.test(valor) : RE_DOMINIO.test(valor)
      if (!valido) { res.status(400).json({ ok: false, error: 'dato_invalido' }); return }

      // 4) Contacto opcional (saneado y acotado).
      const contacto = {
        nombre:   (body.contacto?.nombre   || '').toString().trim().slice(0, 80),
        whatsapp: limpiarTel(body.contacto?.whatsapp || ''),
        email:    (body.contacto?.email    || '').toString().trim().slice(0, 120),
      }

      // Género (solo relevante para DNI; el portal lo pide en el formulario).
      const genero = normalizarGenero(body.genero)

      const db  = admin.firestore()
      const now = admin.firestore.FieldValue.serverTimestamp()

      // 5) Clave de idempotencia: mismo dato + mismo día ⇒ mismo doc.
      const dedupeKey = `web_${GESTORIA_ID}_${tipo}_${valor}_${diaAR()}`.replace(/\//g, '_')
      const consultaRef  = db.collection('consultasInfracciones').doc(dedupeKey)
      const prospectoRef = db.collection('prospectos').doc() // id reservado por si hay que crear

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

          // Reflejar contacto en el prospecto ya vinculado.
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

        // Nuevo: creamos pre-prospecto + consulta enlazados.
        const descripcion = tipo === 'dni'
          ? `Consulta de infracciones por DNI ${valor} (web)`
          : `Consulta de infracciones por dominio ${valor} (web)`

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
          orden:        Date.now(),
          creadoEn:     now,
          actualizadoEn: now,
        })

        t.set(consultaRef, {
          gestoriaId:   GESTORIA_ID,
          tipoConsulta: tipo,
          ...(tipo === 'dominio' ? { dominio: valor } : { dni: valor, tipoDocumento: 'DNI' }),
          ...(tipo === 'dni' && genero ? { genero } : {}),
          contacto,
          origen:       'web',
          estado:       'pendiente',
          prospectoId:  prospectoRef.id,
          creadaEn:     now,
        })
      })

      logger.info('crearConsultaPublica', { gestoriaId: GESTORIA_ID, tipo, dedupeKey })
      res.status(200).json({ ok: true })
    } catch (err: any) {
      logger.error('crearConsultaPublica error', { message: err?.message })
      // No filtramos detalle al cliente público.
      res.status(500).json({ ok: false })
    }
  }
)

/** Deja solo dígitos y un + inicial opcional, acota longitud. */
function limpiarTel(v: string): string {
  const s = (v || '').toString().trim()
  const plus = s.startsWith('+') ? '+' : ''
  return (plus + s.replace(/[^0-9]/g, '')).slice(0, 20)
}

/** Normaliza el género al carácter de un char que espera el portal (M/F/X).
 *  El portal usa: genero=M, genero=F (No binario no está confirmado — usamos X). */
function normalizarGenero(v?: string): string {
  const s = (v || '').toString().trim().toUpperCase()
  if (!s) return ''
  if (s === 'M' || s.startsWith('MA')) return 'M'
  if (s === 'F' || s.startsWith('FE')) return 'F'
  if (s === 'X' || s.startsWith('NO') || s.startsWith('NB')) return 'X'
  return ''
}