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
exports.colaProximaConsulta = void 0;
// functions/src/infracciones/colaProximaConsulta.ts
// ─── COLA DE CONSULTAS PARA LA EXTENSIÓN ─────────────────────────────────────
// Devuelve la próxima consulta pendiente de la gestoría del usuario autenticado
// y la bloquea temporalmente para que dos operadores no tomen la misma.
//
// Contrato con extension/content.js:
//   GET → { consulta: null } | { consulta: { id, tipoConsulta, dominio, dni,
//           tipoDocumento, genero, contactoNombre, contacto } }
//   Auth: Bearer <ID token de Firebase>
//
// Multi-tenant: el gestoriaId sale del perfil del usuario (users/{uid}),
// no de un secret — funciona para cualquier gestoría sin tocar el código.
//
// Despliegue: firebase deploy --only functions:colaProximaConsulta
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const BLOQUEO_MS = 10 * 60 * 1000; // 10 min: si no se procesa, vuelve a la cola
exports.colaProximaConsulta = (0, https_1.onRequest)(async (req, res) => {
    var _a, _b, _c, _d;
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    try {
        // 1) Autenticación
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            res.status(401).json({ consulta: null });
            return;
        }
        const decoded = await admin.auth().verifyIdToken(token);
        // 2) Tenant desde el perfil del usuario (multi-tenant real)
        const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
        const gestoriaId = userSnap.exists ? (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.gestoriaId : null;
        if (!gestoriaId) {
            firebase_functions_1.logger.warn('[cola] usuario sin gestoriaId', { uid: decoded.uid });
            res.status(403).json({ consulta: null });
            return;
        }
        // 3) Pendientes del tenant (dos where de igualdad → sin índice compuesto)
        const db = admin.firestore();
        const snap = await db.collection('consultasInfracciones')
            .where('gestoriaId', '==', gestoriaId)
            .where('estado', '==', 'pendiente')
            .limit(50)
            .get();
        // 4) Descartar bloqueadas recientes (en memoria)
        const ahora = Date.now();
        const disponibles = snap.docs.filter(d => {
            const b = d.data().bloqueadoEn;
            if (!b)
                return true;
            const t = b.toMillis ? b.toMillis() : 0;
            return ahora - t > BLOQUEO_MS;
        });
        // 5) Prioridad por secretario: primero LAS MÍAS (asignadoA == uid), luego el
        //    POOL (sin asignar). Nunca tomamos consultas asignadas a OTRO secretario:
        //    cada uno resuelve el captcha de sus propios leads.
        const porAntiguedad = (a, b) => {
            var _a, _b, _c, _d, _e, _f;
            const ta = (_c = (_b = (_a = a.data().creadaEn) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
            const tb = (_f = (_e = (_d = b.data().creadaEn) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
            return ta - tb;
        };
        const mias = disponibles
            .filter(d => d.data().asignadoA === decoded.uid)
            .sort(porAntiguedad);
        const pool = disponibles
            .filter(d => !d.data().asignadoA)
            .sort(porAntiguedad);
        const elegida = (_c = (_b = mias[0]) !== null && _b !== void 0 ? _b : pool[0]) !== null && _c !== void 0 ? _c : null;
        firebase_functions_1.logger.info('[cola] búsqueda', {
            gestoriaId, uid: decoded.uid,
            pendientes: snap.size, mias: mias.length, pool: pool.length,
        });
        if (!elegida) {
            res.status(200).json({ consulta: null });
            return;
        }
        // 6) Bloquear la elegida y devolverla
        const doc = elegida;
        await doc.ref.update({
            bloqueadoEn: admin.firestore.FieldValue.serverTimestamp(),
        });
        const c = doc.data();
        res.status(200).json({
            consulta: {
                id: doc.id,
                tipoConsulta: c.tipoConsulta || 'dominio',
                dominio: c.dominio || '',
                dni: c.dni || '',
                tipoDocumento: c.tipoDocumento || 'DNI',
                genero: c.genero || '',
                contactoNombre: ((_d = c.contacto) === null || _d === void 0 ? void 0 : _d.nombre) || '',
                contacto: c.contacto || null,
            },
        });
    }
    catch (e) {
        firebase_functions_1.logger.error('[cola] error', { message: e === null || e === void 0 ? void 0 : e.message });
        res.status(401).json({ consulta: null });
    }
});
//# sourceMappingURL=colaProximaConsulta.js.map