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
exports.handleSendMedia = handleSendMedia;
// functions/src/whatsapp/SendMedia.ts
// ─── ENVIAR MEDIA (Callable) ─────────────────────────────────────────────────
// El frontend sube el archivo a Storage, obtiene la URL y llama a esta función
// con la URL. Acá se envía por Meta (por link) y se guarda el mensaje saliente
// (con mediaUrl para que la Bandeja lo muestre). Responde DESDE el mismo número
// de la conversación (waPhoneNumberId).
const admin = __importStar(require("firebase-admin"));
const Utils_1 = require("../utils/Utils");
async function handleSendMedia(data, context) {
    var _a, _b;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new Error('unauthenticated');
    const { conversacionId, gestoriaId, tipo, mediaUrl, caption, filename, mimeType } = data;
    if (!conversacionId || !gestoriaId || !tipo || !mediaUrl) {
        throw new Error('invalid-argument: faltan campos requeridos');
    }
    const convRef = admin.firestore().collection('conversacionesWA').doc(conversacionId);
    const convSnap = await convRef.get();
    if (!convSnap.exists)
        throw new Error('not-found: conversación no encontrada');
    const conv = (_b = convSnap.data()) !== null && _b !== void 0 ? _b : {};
    if (conv.gestoriaId !== gestoriaId) {
        throw new Error('permission-denied: conversación de otra gestoría');
    }
    const emisor = conv.waPhoneNumberId;
    // conversacionId = teléfono normalizado
    const waMessageId = await (0, Utils_1.sendMediaMessage)(conversacionId, tipo, mediaUrl, caption, emisor, filename);
    const tipoMsg = tipo === 'image' ? 'imagen' : tipo === 'audio' ? 'audio' : 'documento';
    const preview = tipoMsg === 'imagen' ? '📷 Imagen' : tipoMsg === 'audio' ? '🎵 Audio' : `📄 ${filename !== null && filename !== void 0 ? filename : 'Documento'}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    // Guardar el mensaje saliente con la URL del media
    await convRef.collection('mensajes').doc().set({
        gestoriaId,
        waMessageId,
        direccion: 'saliente',
        tipo: tipoMsg,
        texto: caption || preview,
        mediaUrl,
        mediaType: mimeType !== null && mimeType !== void 0 ? mimeType : '',
        timestamp: now,
        estado: 'enviado',
        enviadoPor: context.auth.uid,
    });
    await convRef.update({ ultimoMensaje: preview, ultimaActividad: now });
    console.log(`[WA SendMedia] ${gestoriaId} → ${conversacionId}: ${tipoMsg} [${waMessageId}]`);
    return { waMessageId };
}
//# sourceMappingURL=SendMedia.js.map