"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetaToken = getMetaToken;
exports.getPhoneNumberId = getPhoneNumberId;
exports.getVerifyToken = getVerifyToken;
exports.getGestoriaId = getGestoriaId;
exports.normalizarTelefono = normalizarTelefono;
exports.sendTextMessage = sendTextMessage;
exports.markMessageRead = markMessageRead;
const axios_1 = __importDefault(require("axios"));
const META_API_VERSION = 'v20.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getMetaToken() {
    const token = process.env.WHATSAPP_TOKEN;
    if (!token)
        throw new Error('[WA] WHATSAPP_TOKEN no configurado');
    return token;
}
// phone_number_id por defecto (fallback). Con multilínea, el emisor real se
// pasa por parámetro; este env queda como red de seguridad.
function getPhoneNumberId() {
    const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!id)
        throw new Error('[WA] WHATSAPP_PHONE_NUMBER_ID no configurado');
    return id;
}
function getVerifyToken() {
    const t = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!t)
        throw new Error('[WA] WHATSAPP_VERIFY_TOKEN no configurado');
    return t;
}
function getGestoriaId() {
    const g = process.env.GESTORIA_ID;
    if (!g)
        throw new Error('[WA] GESTORIA_ID no configurado');
    return g;
}
// Resuelve el número emisor: usa el que se pasa (el de la conversación) o cae
// al del env si no vino ninguno.
function resolverEmisor(phoneNumberId) {
    const id = (phoneNumberId && phoneNumberId.trim()) ? phoneNumberId.trim() : process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!id)
        throw new Error('[WA] Sin phone_number_id emisor (ni parámetro ni WHATSAPP_PHONE_NUMBER_ID)');
    return id;
}
// ─── NORMALIZAR TELÉFONO ─────────────────────────────────────────────────────
// Meta envía el número sin "+" ej: "5491155667788"
// Usamos ese mismo formato como ID de documento en Firestore
function normalizarTelefono(raw) {
    return raw.replace(/\D/g, '');
}
// ─── ENVIAR MENSAJE DE TEXTO ─────────────────────────────────────────────────
// phoneNumberId (opcional): número emisor. En multilínea se pasa el
// waPhoneNumberId de la conversación para responder DESDE el mismo número al
// que escribió el cliente.
async function sendTextMessage(to, // teléfono normalizado
text, phoneNumberId) {
    var _a, _b, _c;
    const emisor = resolverEmisor(phoneNumberId);
    const token = getMetaToken();
    const url = `${META_API_BASE}/${emisor}/messages`;
    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
    };
    const { data } = await axios_1.default.post(url, body, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    // data.messages[0].id es el WA message ID
    const waMessageId = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : `local_${Date.now()}`;
    return waMessageId;
}
// ─── MARCAR MENSAJE COMO LEÍDO ───────────────────────────────────────────────
// Debe usar el MISMO número que recibió el mensaje (el de la conversación).
async function markMessageRead(waMessageId, phoneNumberId) {
    const emisor = resolverEmisor(phoneNumberId);
    const token = getMetaToken();
    const url = `${META_API_BASE}/${emisor}/messages`;
    await axios_1.default.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
    }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).catch(() => { });
}
//# sourceMappingURL=Utils.js.map