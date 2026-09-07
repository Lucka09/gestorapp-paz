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
async function propietarioDe(gestoriaId) {
    const db = admin.firestore();
    const q = await db.collection('users')
        .where('gestoriaId', '==', gestoriaId)
        .where('rol', '==', 'propietario')
        .limit(1).get();
    return q.empty ? null : q.docs[0].id;
}
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const db = admin.firestore();
    const cfgSnap = await db.doc('configuracion/gestor').get();
    const cfg = (_a = cfgSnap.data()) === null || _a === void 0 ? void 0 : _a.alertasSinRespuesta;
    if ((cfg === null || cfg === void 0 ? void 0 : cfg.activo) === false) {
        firebase_functions_1.logger.info('[SLA] desactivado');
        return;
    }
    const horasLimite = Number((_b = cfg === null || cfg === void 0 ? void 0 : cfg.horasLimite) !== null && _b !== void 0 ? _b : 3);
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
    let alertadas = 0, saltadas = 0;
    for (const doc of snap.docs) {
        const c = doc.data();
        if (((_c = c.noLeidos) !== null && _c !== void 0 ? _c : 0) <= 0) {
            saltadas++;
            continue;
        } // ya lo abrieron
        if (c.alertaSinRespuestaEn) {
            saltadas++;
            continue;
        } // ya se alertó
        const gestoriaId = String((_d = c.gestoriaId) !== null && _d !== void 0 ? _d : '');
        if (!gestoriaId) {
            saltadas++;
            continue;
        }
        // Destinatario: el asignado (si sigue activo), si no el propietario.
        let destinatario = String((_e = c.asignadoA) !== null && _e !== void 0 ? _e : '');
        if (destinatario && !(await estaActivo(destinatario)))
            destinatario = '';
        if (!destinatario)
            destinatario = (_f = (await propietarioDe(gestoriaId))) !== null && _f !== void 0 ? _f : '';
        if (!destinatario) {
            saltadas++;
            continue;
        }
        const nombre = String((_h = (_g = c.nombre) !== null && _g !== void 0 ? _g : c.telefono) !== null && _h !== void 0 ? _h : 'un cliente');
        const horas = Math.floor((ahora - ((_l = (_k = (_j = c.ultimaActividad) === null || _j === void 0 ? void 0 : _j.toMillis) === null || _k === void 0 ? void 0 : _k.call(_j)) !== null && _l !== void 0 ? _l : ahora)) / HORA_MS);
        const batch = db.batch();
        // Tarea trackeable
        const tareaRef = db.collection('tareas').doc();
        batch.set(tareaRef, {
            gestoriaId,
            titulo: `Responder a ${nombre} (WhatsApp)`,
            descripcion: `El cliente escribió y no tuvo respuesta hace ${horas} h.`,
            prioridad: 'alta',
            estado: 'pendiente',
            leadId: (_m = c.leadId) !== null && _m !== void 0 ? _m : null,
            clienteId: (_o = c.clienteId) !== null && _o !== void 0 ? _o : null,
            asignadoA: destinatario,
            asignadoNombre: (_p = c.asignadoNombre) !== null && _p !== void 0 ? _p : '',
            creadoPor: 'automatizacion',
            creadoPorNombre: 'Alerta sin respuesta',
            vencimiento: admin.firestore.Timestamp.fromMillis(ahora + 2 * HORA_MS),
            creadoEn: FV.serverTimestamp(),
            actualizadoEn: FV.serverTimestamp(),
        });
        // Notificación (dispara push por el trigger de notificaciones)
        const notiRef = db.collection('notificaciones').doc();
        batch.set(notiRef, {
            gestoriaId,
            destinatarioId: destinatario,
            titulo: 'Lead sin responder',
            mensaje: `${nombre} escribió hace ${horas} h por WhatsApp y sigue sin respuesta. Abrí la Bandeja.`,
            tipo: 'general',
            entidadTipo: 'conversacionWA',
            entidadId: doc.id,
            leida: false,
            creadoEn: FV.serverTimestamp(),
        });
        // Marca de idempotencia en la conversación
        batch.update(doc.ref, { alertaSinRespuestaEn: FV.serverTimestamp() });
        await batch.commit().then(() => { alertadas++; }).catch(err => {
            firebase_functions_1.logger.warn('[SLA] no se pudo alertar', { conv: doc.id, error: err === null || err === void 0 ? void 0 : err.message });
            saltadas++;
        });
    }
    firebase_functions_1.logger.info('[SLA] fin', { total: snap.size, alertadas, saltadas, horasLimite });
});
//# sourceMappingURL=alertasSinRespuesta.js.map