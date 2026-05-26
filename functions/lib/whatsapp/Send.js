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
exports.handleSendMessage = handleSendMessage;
const admin = __importStar(require("firebase-admin"));
const Utils_1 = require("../utils/Utils");
// ─── ENVIAR MENSAJE (Callable Function) ──────────────────────────────────────
// Llamada desde el frontend con httpsCallable('whatsappSend', {...})
// Requiere que el usuario esté autenticado — Firebase lo verifica automáticamente.
async function handleSendMessage(data, context) {
    var _a, _b;
    // ── Auth guard ─────────────────────────────────────────────────────────────
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new Error('unauthenticated');
    }
    const { conversacionId, texto, gestoriaId } = data;
    if (!conversacionId || !(texto === null || texto === void 0 ? void 0 : texto.trim()) || !gestoriaId) {
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
    if (((_b = convSnap.data()) === null || _b === void 0 ? void 0 : _b.gestoriaId) !== gestoriaId) {
        throw new Error('permission-denied: conversación de otra gestoría');
    }
    // ── Enviar via Meta API ────────────────────────────────────────────────────
    // conversacionId = teléfono normalizado
    const waMessageId = await (0, Utils_1.sendTextMessage)(conversacionId, texto.trim());
    console.log(`[WA Send] ${gestoriaId} → ${conversacionId}: "${texto.slice(0, 40)}" [${waMessageId}]`);
    return { waMessageId };
}
//# sourceMappingURL=Send.js.map