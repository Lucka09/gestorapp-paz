// functions/src/index.ts
// ─── PROXY SEGURO PARA LA API DE CLAUDE ──────────────────────────────────────
// La API key de Anthropic NUNCA llega al cliente.
// Solo usuarios autenticados de GestorApp pueden invocar esta función.
//
// Despliegue:
//   1. firebase functions:secrets:set ANTHROPIC_API_KEY
//   2. firebase deploy --only functions
//
// La función queda disponible en:
//   https://us-central1-gestorapp-paz.cloudfunctions.net/claudeProxy
import * as admin           from 'firebase-admin'
import * as functions        from 'firebase-functions'
import { onRequest }         from 'firebase-functions/v2/https'
import { handleVerification, handleIncomingMessage } from './whatsapp/Webhook'
import { handleSendMessage }  from './whatsapp/Send'
import type { MetaWebhookPayload, SendMessageRequest } from './whatsapp/types'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret }       from 'firebase-functions/params'
import * as https             from 'https'
import { kommoRecibirLead } from './kommo/kommoRecibirLead'
import { CORS_ORIGINS } from './cors'
// ─── INICIALIZAR ADMIN SDK ────────────────────────────────────────────────────
if (!admin.apps.length) admin.initializeApp()

// ─── SECRET: API KEY DE ANTHROPIC ────────────────────────────────────────────
// Se guarda en Firebase Secret Manager, nunca en el código.
// Comando para setearlo: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface MensajeIA {
  role:    'user' | 'assistant'
  content: string
}

interface RequestData {
  messages:     MensajeIA[]
  systemPrompt: string
  gestoriaId:   string   // para logging y auditoría futura
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage?:  { input_tokens: number; output_tokens: number }
}

// ─── HELPER: llamada HTTPS a Anthropic ───────────────────────────────────────
// Usamos el módulo nativo `https` de Node.js para evitar dependencias.

function callAnthropic(
  apiKey:  string,
  payload: object,
): Promise<AnthropicResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers:  {
          'Content-Type':      'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key':         apiKey,
          'Content-Length':    Buffer.byteLength(body),
        },
      },
      res => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw) as AnthropicResponse
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Anthropic ${res.statusCode}: ${raw}`))
            } else {
              resolve(parsed)
            }
          } catch {
            reject(new Error(`JSON inválido de Anthropic: ${raw}`))
          }
        })
      },
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export const claudeProxy = onCall(
  {
    // La función lee el secret en runtime — no en build time
    secrets:        [ANTHROPIC_API_KEY],
    // Región cercana a Argentina
    region:         'us-central1',
    // Límites razonables para una gestoría pequeña
    timeoutSeconds: 60,
    memory:         '256MiB',
    // Máximo 1 request concurrente por instancia (evita cold start abrupto)
    maxInstances:   5,
    // CORS: solo aceptar requests del dominio de GestorApp
         cors: CORS_ORIGINS,
  },
  async (request) => {
    // ── 1. Verificar autenticación ──────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Se requiere autenticación para usar el asistente IA.',
      )
    }

    const uid = request.auth.uid

    // ── 2. Verificar que el usuario existe en Firestore y está activo ───────
    const userSnap = await admin.firestore().doc(`users/${uid}`).get()
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'Usuario no encontrado.')
    }

    const userData = userSnap.data() as { activo?: boolean; rol?: string; gestoriaId?: string }

    if (userData.activo === false) {
      throw new HttpsError('permission-denied', 'Usuario inactivo.')
    }

    // ── 3. Validar payload ──────────────────────────────────────────────────
    const { messages, systemPrompt, gestoriaId } = request.data as RequestData

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError('invalid-argument', 'Se requiere al menos un mensaje.')
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      throw new HttpsError('invalid-argument', 'Se requiere systemPrompt.')
    }

    // Verificar que el gestoriaId del request coincide con el del usuario
    if (gestoriaId && userData.gestoriaId && gestoriaId !== userData.gestoriaId) {
      throw new HttpsError('permission-denied', 'GestoriaId inválido.')
    }

    // Límite de mensajes para evitar prompts inflados
    const mensajesLimitados = messages.slice(-20)

    // ── 4. Llamar a la API de Claude ────────────────────────────────────────
    const apiKey = ANTHROPIC_API_KEY.value()

    const respuesta = await callAnthropic(apiKey, {
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:     systemPrompt,
      messages:   mensajesLimitados,
    })

    // ── 5. Extraer texto y devolver ─────────────────────────────────────────
    const texto = respuesta.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') ?? ''

    // Log de uso (para monitoreo, sin datos sensibles)
    console.info(JSON.stringify({
      uid,
      gestoriaId:    userData.gestoriaId ?? gestoriaId,
      rol:           userData.rol,
      input_tokens:  respuesta.usage?.input_tokens  ?? 0,
      output_tokens: respuesta.usage?.output_tokens ?? 0,
      mensajes:      mensajesLimitados.length,
    }))

    return { texto }
  },
)
// ─── WHATSAPP WEBHOOK (HTTP) ──────────────────────────────────────────────────
// GET  → verificación de Meta (setup inicial)
// POST → mensajes y actualizaciones de estado entrantes
 
export const whatsappWebhook = onRequest(
  {
    region:  'us-central1',
    secrets: [
      'WHATSAPP_TOKEN',
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'GESTORIA_ID',
      'NUMERO_LLAMADAS',
    ],
  },
  async (req, res) => {
    if (req.method === 'GET') {
      // Meta verifica el webhook en el setup — responder con el challenge
      handleVerification(
        req.query as Record<string, string>,
        res as any,
      )
      return
    }
 
    if (req.method === 'POST') {
      // Responder 200 inmediatamente para que Meta no reintente
      res.status(200).send('EVENT_RECEIVED')
 
      try {
        const payload = req.body as MetaWebhookPayload
        if (payload?.object === 'whatsapp_business_account') {
          await handleIncomingMessage(payload)
        }
      } catch (err) {
        // Log pero no fallar — Meta ya recibió el 200
        functions.logger.error('[WA Webhook] Error procesando mensaje:', err)
      }
      return
    }
 
    res.status(405).send('Method Not Allowed')
  }
)
 
// ─── WHATSAPP SEND (Callable) ─────────────────────────────────────────────────
// Llamada desde el frontend con httpsCallable('whatsappSend', {...})
 
export const whatsappSend = onCall(
  {
    region:  'us-central1',
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'GESTORIA_ID'],
    enforceAppCheck: false,   // activar en producción si se usa App Check
  },
  async (request) => {
    return handleSendMessage(
      request.data    as SendMessageRequest,
      request.auth
        ? { auth: { uid: request.auth.uid, token: request.auth.token as any } }
        : {},
    )
  }
)
// ─── INFRACCIONES / MULTAS ───────────────────────────────────────────────────
export { crearConsultaPublica }      from './infracciones/crearConsultaPublica'
export { guardarConsultaInfraccion } from './infracciones/guardarConsultaInfraccion'
export { colaProximaConsulta }       from './infracciones/colaProximaConsulta'
export { motorAlertasDiario } from './MotorAlertas'
export { motorAutomatizaciones, seedAutomatizaciones } from './automatizaciones/motor'
export { subirCuponInfraccion } from './cupones/subirCuponInfraccion'
export { iniciarDescargaCupones } from './cupones/iniciarDescargaCupones'
export { kommoRecibirLead }
export { gestionarEquipo } from './equipo/gestionarEquipo'