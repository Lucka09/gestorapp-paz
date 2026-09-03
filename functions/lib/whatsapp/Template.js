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
exports.handleSendTemplate = handleSendTemplate;
// functions/src/whatsapp/Template.ts
// ─── ENVIAR TEMPLATE APROBADO (Cloud API) ────────────────────────────────────
// Los templates deben estar pre-aprobados en Meta Business Manager.
// Se usan para mensajes fuera de la ventana de 24hs (ej: recordatorios,
// confirmaciones de turno, presupuestos enviados).
const admin = __importStar(require("firebase-admin"));
const Utils_1 = require("../utils/Utils");
// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
async function handleSendTemplate(data, context) {
    var _a, _b, _c, _d;
    // ── Auth guard ─────────────────────────────────────────────────────────────
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new Error('unauthenticated');
    }
    const { conversacionId, template, gestoriaId } = data;
    if (!conversacionId || !(template === null || template === void 0 ? void 0 : template.nombre) || !gestoriaId) {
        throw new Error('invalid-argument: faltan campos requeridos');
    }
    // ── Verificar que la conversación pertenece a la gestoría ─────────────────
    const convSnap = await admin.firestore()
        .collection('conversacionesWA')
        .doc(conversacionId)
        .get();
    if (!convSnap.exists) {
        throw new Error('not-found: conversación no encontrada');
    }
    const conv = (_b = convSnap.data()) !== null && _b !== void 0 ? _b : {};
    if (conv.gestoriaId !== gestoriaId) {
        throw new Error('permission-denied: conversación de otra gestoría');
    }
    // ── Enviar template via Meta API ────────────────────────────────────────────
    const emisor = conv.waPhoneNumberId;
    const waMessageId = await (0, Utils_1.sendTemplateMessage)(conversacionId, template.nombre, (_c = template.idioma) !== null && _c !== void 0 ? _c : 'es_AR', (_d = template.parametros) !== null && _d !== void 0 ? _d : [], emisor);
    console.log(`[WA Template] ${gestoriaId} → ${conversacionId}: template="${template.nombre}" [${waMessageId}]`);
    // Guardar el mensaje en la subcolección
    const msgRef = admin.firestore()
        .collection('conversacionesWA')
        .doc(conversacionId)
        .collection('mensajes')
        .doc();
    await msgRef.set({
        gestoriaId,
        waMessageId,
        direccion: 'saliente',
        tipo: 'template',
        texto: `[Template: ${template.nombre}]`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        estado: 'enviando',
    });
    return { waMessageId };
}
//# sourceMappingURL=Template.js.map