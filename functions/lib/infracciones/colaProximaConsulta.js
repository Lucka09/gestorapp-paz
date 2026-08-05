"use strict";
// functions/src/infracciones/colaProximaConsulta.ts
// ─── SIRVE EL PRÓXIMO DOMINIO DE LA COLA A LA EXTENSIÓN ──────────────────────
//
// content.js hace GET /colaProximaConsulta y espera { consulta: {...} | null }.
// Prioridad: leads de la web primero, después el más viejo (FIFO).
// Bloqueo suave: al servir un item se marca bloqueadoPor/bloqueadoEn durante
// LOCK_MS, para que dos operadoras (Jessica + Abigail) no procesen el mismo.
// Si se completa (estado → cotizada) sale del pool; si se abandona, el bloqueo
// vence solo y vuelve a estar disponible.
//
// Despliegue: firebase deploy --only functions:colaProximaConsulta
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
exports.colaProximaConsulta = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const LOCK_MS = 3 * 60 * 1000; // 3 min: cubre el tiempo de resolver el captcha
const MAX_CANDIDATOS = 20;
const ORIGENES_OK = new Set(['https://infraccionesba.gba.gob.ar']);
function setCors(req, res) {
    const origin = req.headers.origin;
    if (origin && (ORIGENES_OK.has(origin) || origin.startsWith('chrome-extension://'))) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Max-Age', '3600');
}
exports.colaProximaConsulta = (0, https_1.onRequest)({ region: 'us-central1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 }, async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método no permitido' });
        return;
    }
    // ── 1. Verificar ID token ───────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
        res.status(401).json({ error: 'Falta token' });
        return;
    }
    let uid;
    try {
        uid = (await admin.auth().verifyIdToken(token)).uid;
    }
    catch (_a) {
        res.status(401).json({ error: 'Token inválido' });
        return;
    }
    const db = admin.firestore();
    // ── 2. Validar usuario ──────────────────────────────────────────────────
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
        res.status(403).json({ error: 'Usuario no encontrado' });
        return;
    }
    const userData = userSnap.data();
    if (userData.activo === false) {
        res.status(403).json({ error: 'Usuario inactivo' });
        return;
    }
    const gestoriaId = userData.gestoriaId;
    if (!gestoriaId) {
        res.status(403).json({ error: 'Usuario sin gestoría' });
        return;
    }
    // ── 3. Traer candidatos pendientes (index: gestoriaId, estado, creadaEn) ─
    const snap = await db.collection('consultasInfracciones')
        .where('gestoriaId', '==', gestoriaId)
        .where('estado', '==', 'pendiente')
        .orderBy('creadaEn', 'asc')
        .limit(MAX_CANDIDATOS)
        .get();
    const now = Date.now();
    // Solo consultas por dominio (la extensión autocompleta el input de dominio),
    // con dominio presente y sin bloqueo vigente de otra persona.
    const disponibles = snap.docs.filter(d => {
        var _a, _b, _c;
        const x = d.data();
        if (x.tipoConsulta !== 'dominio' || !x.dominio)
            return false;
        const bloqueadoEn = (_c = (_b = (_a = x.bloqueadoEn) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        const bloqueadoPor = x.bloqueadoPor;
        if (bloqueadoPor && bloqueadoPor !== uid && (now - bloqueadoEn) < LOCK_MS)
            return false;
        return true;
    });
    // Prioridad: web primero. Dentro de cada grupo respeta el orden por creadaEn.
    disponibles.sort((a, b) => {
        const pa = a.data().origen === 'web' ? 0 : 1;
        const pb = b.data().origen === 'web' ? 0 : 1;
        return pa - pb;
    });
    const pick = disponibles[0];
    if (!pick) {
        res.status(200).json({ consulta: null });
        return;
    }
    // ── 4. Reclamar el item de forma atómica (evita doble-servido) ──────────
    try {
        const consulta = await db.runTransaction(async (tx) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const s = await tx.get(pick.ref);
            const x = s.data();
            if (!x || x.estado !== 'pendiente')
                return null;
            const bEn = (_c = (_b = (_a = x.bloqueadoEn) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
            if (x.bloqueadoPor && x.bloqueadoPor !== uid && (Date.now() - bEn) < LOCK_MS)
                return null;
            tx.update(pick.ref, {
                bloqueadoPor: uid,
                bloqueadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return {
                id: s.id,
                tipoConsulta: (_d = x.tipoConsulta) !== null && _d !== void 0 ? _d : 'dominio',
                dominio: (_e = x.dominio) !== null && _e !== void 0 ? _e : '',
                dni: (_f = x.dni) !== null && _f !== void 0 ? _f : '',
                genero: (_g = x.genero) !== null && _g !== void 0 ? _g : '',
                tipoDocumento: (_h = x.tipoDocumento) !== null && _h !== void 0 ? _h : 'DNI',
                contactoNombre: (_k = (_j = x.contacto) === null || _j === void 0 ? void 0 : _j.nombre) !== null && _k !== void 0 ? _k : '',
            };
        });
        if (consulta) {
            firebase_functions_1.logger.info(JSON.stringify({ fn: 'colaProximaConsulta', gestoriaId, uid, servido: consulta.id }));
        }
        res.status(200).json({ consulta });
    }
    catch (e) {
        firebase_functions_1.logger.warn('[colaProximaConsulta] transacción falló', e);
        res.status(200).json({ consulta: null }); // la extensión reintenta en el próximo poll
    }
});
//# sourceMappingURL=colaProximaConsulta.js.map