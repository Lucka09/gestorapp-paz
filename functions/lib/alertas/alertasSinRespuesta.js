"use strict";
// functions/src/alertas/alertasSinRespuesta.ts
// ─── ALERTA DE LEAD / CHAT SIN RESPUESTA (SLA) ───────────────────────────────
// Corre cada hora en horario laboral (9–20 ART). Busca conversaciones de
// WhatsApp donde el cliente escribió y NADIE respondió/abrió en X horas, y le
// crea al secretario una TAREA + una NOTIFICACIÓN (que dispara push por el
// trigger de notificaciones). Objetivo: que ningún lead se caiga por demora.
//
// Señal usada: noLeidos > 0 (el secretario ni lo abrió) + ultimaActividad
// vieja (más de horasLimite) pero reciente (últimos 7 días, para no perseguir
// chats abandonados). Idempotente: marca `alertaSinRespuestaEn` en la conv.
//
// Config (configuracion/gestor.alertasSinRespuesta):
//   activo:      boolean   (default true)
//   horasLimite: number    (default 3)
//
// Despliegue: firebase deploy --only functions:alertasSinRespuesta
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
exports.alertasSinRespuesta = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const HORA_MS = 3600000;
const DIA_MS = 86400000;
const FV = admin.firestore.FieldValue;
async function estaActivo(uid) {
    var _a;
    if (!uid)
        return false;
    const s = await admin.firestore().doc(`users/${uid}`).get();
    return s.exists && ((_a = s.data()) === null || _a === void 0 ? void 0 : _a.activo) !== false;
}
exports.alertasSinRespuesta = (0, scheduler_1.onSchedule)({
    schedule: '0 9-20 * * *',
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
}, async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const db = admin.firestore();
    const cfgSnap = await db.doc('configuracion/gestor').get();
    const cfg = (_a = cfgSnap.data()) === null || _a === void 0 ? void 0 : _a.alertasSinRespuesta;
    if ((cfg === null || cfg === void 0 ? void 0 : cfg.activo) === false) {
        firebase_functions_1.logger.info('[SLA] desactivado');
        return;
    }
    const horasLimite = Number((_b = cfg === null || cfg === void 0 ? void 0 : cfg.horasLimite) !== null && _b !== void 0 ? _b : 4);
    const ahora = Date.now();
    const limiteSup = admin.firestore.Timestamp.fromMillis(ahora - horasLimite * HORA_MS); // más viejo que esto
    const limiteInf = admin.firestore.Timestamp.fromMillis(ahora - 7 * DIA_MS); // pero no más de 7 días
    // Un solo rango de desigualdad (ultimaActividad); el resto se filtra en memoria.
    const snap = await db.collection('conversacionesWA')
        .where('ultimaActividad', '>=', limiteInf)
        .where('ultimaActividad', '<=', limiteSup)
        .get();
    if (snap.empty) {
        firebase_functions_1.logger.info('[SLA] sin conversaciones en ventana');
        return;
    }
    let liberadas = 0, saltadas = 0;
    for (const doc of snap.docs) {
        const c = doc.data();
        if (((_c = c.noLeidos) !== null && _c !== void 0 ? _c : 0) <= 0) {
            saltadas++;
            continue;
        } // ya lo abrieron
        if (c.alertaSinRespuestaEn) {
            saltadas++;
            continue;
        } // ya se procesó
        const gestoriaId = String((_d = c.gestoriaId) !== null && _d !== void 0 ? _d : '');
        if (!gestoriaId) {
            saltadas++;
            continue;
        }
        const duenoPrevio = String((_e = c.asignadoA) !== null && _e !== void 0 ? _e : '');
        const nombre = String((_g = (_f = c.nombre) !== null && _f !== void 0 ? _f : c.telefono) !== null && _g !== void 0 ? _g : 'un cliente');
        const horas = Math.floor((ahora - ((_k = (_j = (_h = c.ultimaActividad) === null || _h === void 0 ? void 0 : _h.toMillis) === null || _j === void 0 ? void 0 : _j.call(_h)) !== null && _k !== void 0 ? _k : ahora)) / HORA_MS);
        const batch = db.batch();
        // 1) PASAR AL POOL: se libera para que cualquiera lo tome. Si ya estaba en
        //    el pool (sin dueño), no hace falta re-liberar pero igual marcamos.
        batch.update(doc.ref, {
            asignadoA: '',
            asignadoNombre: '',
            alertaSinRespuestaEn: FV.serverTimestamp(),
        });
        // 2) Avisar al dueño anterior (si tenía y sigue activo) que se liberó.
        if (duenoPrevio && await estaActivo(duenoPrevio)) {
            const notiRef = db.collection('notificaciones').doc();
            batch.set(notiRef, {
                gestoriaId,
                destinatarioId: duenoPrevio,
                titulo: 'Chat liberado al pool',
                mensaje: `${nombre} quedó ${horas} h sin respuesta, así que pasó al pool "Sin asignar" para que otro secretario lo tome. Si querés seguirlo vos, reabrilo desde la Bandeja.`,
                tipo: 'general',
                entidadTipo: 'conversacionWA',
                entidadId: doc.id,
                leida: false,
                creadoEn: FV.serverTimestamp(),
            });
        }
        await batch.commit().then(() => { liberadas++; }).catch(err => {
            firebase_functions_1.logger.warn('[SLA] no se pudo liberar', { conv: doc.id, error: err === null || err === void 0 ? void 0 : err.message });
            saltadas++;
        });
    }
    firebase_functions_1.logger.info('[SLA] fin', { total: snap.size, liberadas, saltadas, horasLimite });
});
//# sourceMappingURL=alertasSinRespuesta.js.map