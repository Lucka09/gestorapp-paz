"use strict";
// functions/src/notificaciones/pushNotificacion.ts
// ─── PUSH AL CELULAR AL CREARSE UNA NOTIFICACIÓN ─────────────────────────────
// Trigger onCreate sobre `notificaciones/{id}`: lee los tokens FCM del
// destinatario (users/{uid}.fcmTokens, que guarda el cliente vía push.ts) y
// manda un push web. Así CUALQUIER notificación in-app (auto-encolado de multas,
// tareas, avisos del motor de automatizaciones, etc.) llega también al teléfono
// sin tocar cada emisor: el que crea la notificación no cambia.
//
// Limpia tokens inválidos/expirados para no acumular basura.
//
// Requisitos de entorno (ya del lado cliente):
//   • VITE_FIREBASE_VAPID_KEY seteado (push.ts obtiene el token con esa VAPID).
//   • public/firebase-messaging-sw.js presente (service worker de background).
//   • El usuario aceptó notificaciones y guardó su token (obtenerYGuardarToken).
//
// Despliegue: firebase deploy --only functions:enviarPushNotificacion
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
exports.enviarPushNotificacion = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
exports.enviarPushNotificacion = (0, firestore_1.onDocumentCreated)({
    document: 'notificaciones/{notifId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const notif = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(notif === null || notif === void 0 ? void 0 : notif.destinatarioId))
        return;
    const db = admin.firestore();
    const uid = String(notif.destinatarioId);
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists)
        return;
    const tokens = ((_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.fcmTokens) !== null && _c !== void 0 ? _c : [])
        .filter((t) => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0)
        return;
    const titulo = String((_d = notif.titulo) !== null && _d !== void 0 ? _d : 'Gestoría Paz');
    const cuerpo = String((_e = notif.mensaje) !== null && _e !== void 0 ? _e : '');
    let resp;
    try {
        resp = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: titulo, body: cuerpo },
            webpush: {
                notification: {
                    icon: '/android-chrome-192x192.png',
                    badge: '/favicon-32x32.png',
                    tag: String((_g = (_f = notif.entidadId) !== null && _f !== void 0 ? _f : notif.tipo) !== null && _g !== void 0 ? _g : 'gp-notif'),
                },
                fcmOptions: { link: '/' }, // TODO: deep-link según entidadTipo/entidadId
            },
            data: {
                tipo: String((_h = notif.tipo) !== null && _h !== void 0 ? _h : 'general'),
                entidadTipo: String((_j = notif.entidadTipo) !== null && _j !== void 0 ? _j : ''),
                entidadId: String((_k = notif.entidadId) !== null && _k !== void 0 ? _k : ''),
            },
        });
    }
    catch (e) {
        firebase_functions_1.logger.error('[push] error enviando', { uid, message: e === null || e === void 0 ? void 0 : e.message });
        return;
    }
    // Limpieza de tokens muertos (desinstalados / expirados).
    const invalidos = [];
    resp.responses.forEach((r, i) => {
        var _a, _b;
        if (!r.success) {
            const code = (_b = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : '';
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
                invalidos.push(tokens[i]);
            }
        }
    });
    if (invalidos.length > 0) {
        await db.doc(`users/${uid}`).update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidos),
        }).catch(() => { });
    }
    firebase_functions_1.logger.info('[push] enviado', {
        uid, ok: resp.successCount, fail: resp.failureCount, limpiados: invalidos.length,
    });
});
//# sourceMappingURL=pushNotificacion.js.map