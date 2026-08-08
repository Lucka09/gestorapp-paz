"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.motorAlertasDiario = exports.colaProximaConsulta = exports.guardarConsultaInfraccion = exports.crearConsultaPublica = exports.whatsappSend = exports.whatsappWebhook = exports.claudeProxy = void 0;
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
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const https_1 = require("firebase-functions/v2/https");
const Webhook_1 = require("./whatsapp/Webhook");
const Send_1 = require("./whatsapp/Send");
const https_2 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const https = __importStar(require("https"));
// ─── INICIALIZAR ADMIN SDK ────────────────────────────────────────────────────
if (!admin.apps.length)
    admin.initializeApp();
// ─── SECRET: API KEY DE ANTHROPIC ────────────────────────────────────────────
// Se guarda en Firebase Secret Manager, nunca en el código.
// Comando para setearlo: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
// ─── HELPER: llamada HTTPS a Anthropic ───────────────────────────────────────
// Usamos el módulo nativo `https` de Node.js para evitar dependencias.
function callAnthropic(apiKey, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'x-api-key': apiKey,
                'Content-Length': Buffer.byteLength(body),
            },
        }, res => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`Anthropic ${res.statusCode}: ${raw}`));
                    }
                    else {
                        resolve(parsed);
                    }
                }
                catch (_a) {
                    reject(new Error(`JSON inválido de Anthropic: ${raw}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
exports.claudeProxy = (0, https_2.onCall)({
    // La función lee el secret en runtime — no en build time
    secrets: [ANTHROPIC_API_KEY],
    // Región cercana a Argentina
    region: 'us-central1',
    // Límites razonables para una gestoría pequeña
    timeoutSeconds: 60,
    memory: '256MiB',
    // Máximo 1 request concurrente por instancia (evita cold start abrupto)
    maxInstances: 5,
    // CORS: solo aceptar requests del dominio de GestorApp
    cors: [
        'https://gestorapp-paz.web.app',
        'https://gestorapp-paz.firebaseapp.com',
        'http://localhost:5173',
        'http://localhost:5174',
    ],
}, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    // ── 1. Verificar autenticación ──────────────────────────────────────────
    if (!request.auth) {
        throw new https_2.HttpsError('unauthenticated', 'Se requiere autenticación para usar el asistente IA.');
    }
    const uid = request.auth.uid;
    // ── 2. Verificar que el usuario existe en Firestore y está activo ───────
    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    if (!userSnap.exists) {
        throw new https_2.HttpsError('permission-denied', 'Usuario no encontrado.');
    }
    const userData = userSnap.data();
    if (userData.activo === false) {
        throw new https_2.HttpsError('permission-denied', 'Usuario inactivo.');
    }
    // ── 3. Validar payload ──────────────────────────────────────────────────
    const { messages, systemPrompt, gestoriaId } = request.data;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new https_2.HttpsError('invalid-argument', 'Se requiere al menos un mensaje.');
    }
    if (!systemPrompt || typeof systemPrompt !== 'string') {
        throw new https_2.HttpsError('invalid-argument', 'Se requiere systemPrompt.');
    }
    // Verificar que el gestoriaId del request coincide con el del usuario
    if (gestoriaId && userData.gestoriaId && gestoriaId !== userData.gestoriaId) {
        throw new https_2.HttpsError('permission-denied', 'GestoriaId inválido.');
    }
    // Límite de mensajes para evitar prompts inflados
    const mensajesLimitados = messages.slice(-20);
    // ── 4. Llamar a la API de Claude ────────────────────────────────────────
    const apiKey = ANTHROPIC_API_KEY.value();
    const respuesta = await callAnthropic(apiKey, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: mensajesLimitados,
    });
    // ── 5. Extraer texto y devolver ─────────────────────────────────────────
    const texto = (_b = (_a = respuesta.content) === null || _a === void 0 ? void 0 : _a.filter(b => b.type === 'text').map(b => b.text).join('\n')) !== null && _b !== void 0 ? _b : '';
    // Log de uso (para monitoreo, sin datos sensibles)
    console.info(JSON.stringify({
        uid,
        gestoriaId: (_c = userData.gestoriaId) !== null && _c !== void 0 ? _c : gestoriaId,
        rol: userData.rol,
        input_tokens: (_e = (_d = respuesta.usage) === null || _d === void 0 ? void 0 : _d.input_tokens) !== null && _e !== void 0 ? _e : 0,
        output_tokens: (_g = (_f = respuesta.usage) === null || _f === void 0 ? void 0 : _f.output_tokens) !== null && _g !== void 0 ? _g : 0,
        mensajes: mensajesLimitados.length,
    }));
    return { texto };
});
// ─── WHATSAPP WEBHOOK (HTTP) ──────────────────────────────────────────────────
// GET  → verificación de Meta (setup inicial)
// POST → mensajes y actualizaciones de estado entrantes
exports.whatsappWebhook = (0, https_1.onRequest)({
    region: 'us-central1',
    secrets: [
        'WHATSAPP_TOKEN',
        'WHATSAPP_VERIFY_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'GESTORIA_ID',
        'NUMERO_LLAMADAS',
    ],
}, async (req, res) => {
    if (req.method === 'GET') {
        // Meta verifica el webhook en el setup — responder con el challenge
        (0, Webhook_1.handleVerification)(req.query, res);
        return;
    }
    if (req.method === 'POST') {
        // Responder 200 inmediatamente para que Meta no reintente
        res.status(200).send('EVENT_RECEIVED');
        try {
            const payload = req.body;
            if ((payload === null || payload === void 0 ? void 0 : payload.object) === 'whatsapp_business_account') {
                await (0, Webhook_1.handleIncomingMessage)(payload);
            }
        }
        catch (err) {
            // Log pero no fallar — Meta ya recibió el 200
            functions.logger.error('[WA Webhook] Error procesando mensaje:', err);
        }
        return;
    }
    res.status(405).send('Method Not Allowed');
});
// ─── WHATSAPP SEND (Callable) ─────────────────────────────────────────────────
// Llamada desde el frontend con httpsCallable('whatsappSend', {...})
exports.whatsappSend = (0, https_2.onCall)({
    region: 'us-central1',
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'GESTORIA_ID'],
    enforceAppCheck: false, // activar en producción si se usa App Check
}, async (request) => {
    return (0, Send_1.handleSendMessage)(request.data, request.auth
        ? { auth: { uid: request.auth.uid, token: request.auth.token } }
        : {});
});
// ─── INFRACCIONES / MULTAS ───────────────────────────────────────────────────
var crearConsultaPublica_1 = require("./infracciones/crearConsultaPublica");
Object.defineProperty(exports, "crearConsultaPublica", { enumerable: true, get: function () { return crearConsultaPublica_1.crearConsultaPublica; } });
var guardarConsultaInfraccion_1 = require("./infracciones/guardarConsultaInfraccion");
Object.defineProperty(exports, "guardarConsultaInfraccion", { enumerable: true, get: function () { return guardarConsultaInfraccion_1.guardarConsultaInfraccion; } });
var colaProximaConsulta_1 = require("./infracciones/colaProximaConsulta");
Object.defineProperty(exports, "colaProximaConsulta", { enumerable: true, get: function () { return colaProximaConsulta_1.colaProximaConsulta; } });
var MotorAlertas_1 = require("./MotorAlertas");
Object.defineProperty(exports, "motorAlertasDiario", { enumerable: true, get: function () { return MotorAlertas_1.motorAlertasDiario; } });
//# sourceMappingURL=index.js.map