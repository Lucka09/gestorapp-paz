"use strict";
// functions/src/whatsapp/media.ts
// ─── MEDIA ENTRANTE: descargar de Meta → guardar en Storage ──────────────────
// Meta manda solo un media_id; el archivo se baja en 2 pasos (media_id → URL
// temporal → binario, ambos con el token de Meta) y se sube a Firebase Storage
// con un download token permanente, para que la Bandeja lo muestre.
//
// La URL devuelta funciona sin reglas (acceso por token), y la escritura la hace
// el Admin SDK (que saltea las reglas de Storage).
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.descargarYGuardarMedia = descargarYGuardarMedia;
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const Utils_1 = require("../utils/Utils");
const META_API_BASE = 'https://graph.facebook.com/v20.0';
const BUCKET = process.env.STORAGE_BUCKET || 'gestorapp-paz.firebasestorage.app';
const EXT_POR_MIME = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
    'video/mp4': 'mp4', 'application/pdf': 'pdf',
};
function extDeMime(m) {
    var _a;
    return (_a = EXT_POR_MIME[(m || '').split(';')[0].trim()]) !== null && _a !== void 0 ? _a : 'bin';
}
async function descargarYGuardarMedia(p) {
    var _a;
    try {
        const token = (0, Utils_1.getMetaToken)();
        // 1) media_id → URL temporal de Meta
        const meta = await axios_1.default.get(`${META_API_BASE}/${p.mediaId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const url = (_a = meta.data) === null || _a === void 0 ? void 0 : _a.url;
        if (!url)
            return null;
        // 2) descargar el binario (requiere el mismo token)
        const bin = await axios_1.default.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'arraybuffer',
        });
        const buffer = Buffer.from(bin.data);
        // 3) subir a Storage con download token permanente
        const ext = extDeMime(p.mime);
        const path = `${p.gestoriaId}/whatsapp/${p.telefono}/${p.waMessageId}.${ext}`;
        const bucket = admin.storage().bucket(BUCKET);
        const file = bucket.file(path);
        const downloadToken = (0, crypto_1.randomUUID)();
        await file.save(buffer, {
            resumable: false,
            metadata: {
                contentType: p.mime,
                metadata: { firebaseStorageDownloadTokens: downloadToken },
            },
        });
        return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
    }
    catch (e) {
        console.warn('[WA media] no se pudo descargar/guardar:', e === null || e === void 0 ? void 0 : e.message);
        return null;
    }
}
//# sourceMappingURL=media.js.map