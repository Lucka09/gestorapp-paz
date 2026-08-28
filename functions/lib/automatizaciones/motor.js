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
exports.seedAutomatizaciones = exports.motorAutomatizaciones = void 0;
// functions/src/automatizaciones/motor.ts
// Motor: onCreate('/eventos') → evalúa automatizaciones activas del tenant →
// ejecuta acciones en orden. Idempotente por (automatizacion, evento).
// Despliegue: firebase deploy --only functions:motorAutomatizaciones,functions:seedAutomatizaciones
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const condiciones_1 = require("./condiciones");
const ejecutores_1 = require("./ejecutores");
const cors_1 = require("../cors");
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
exports.motorAutomatizaciones = (0, firestore_1.onDocumentCreated)({ document: 'eventos/{eventoId}', region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 60 }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const evento = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(evento === null || evento === void 0 ? void 0 : evento.gestoriaId) || !(evento === null || evento === void 0 ? void 0 : evento.tipo))
        return;
    if (String(evento.tipo).startsWith('automatizacion.'))
        return; // anti-recursión
    const snap = await db.collection('automatizaciones')
        .where('gestoriaId', '==', evento.gestoriaId)
        .where('activo', '==', true)
        .get();
    if (snap.empty)
        return;
    // Cargar la entidad de referencia (para condiciones, placeholders y acciones)
    let entidadDoc = null;
    const col = ejecutores_1.COLECCION_POR_ENTIDAD[evento.entidad];
    if (col && evento.entidadId) {
        try {
            const e = await db.collection(col).doc(evento.entidadId).get();
            entidadDoc = e.exists ? Object.assign({ id: e.id }, e.data()) : null;
        }
        catch (_h) {
            entidadDoc = null;
        }
    }
    const ctxCondiciones = Object.assign(Object.assign(Object.assign({}, evento), ((_b = evento.payload) !== null && _b !== void 0 ? _b : {})), (entidadDoc !== null && entidadDoc !== void 0 ? entidadDoc : {}));
    for (const doc of snap.docs) {
        const auto = Object.assign({ id: doc.id }, doc.data());
        if (auto.trigger !== evento.tipo)
            continue;
        if (!(0, condiciones_1.evaluarCondiciones)((_c = auto.condiciones) !== null && _c !== void 0 ? _c : [], ctxCondiciones))
            continue;
        // Idempotencia: una ejecución por (automatización, evento)
        const execRef = db.collection('ejecucionesAutomatizacion').doc(`${auto.id}_${event.params.eventoId}`);
        const ya = await execRef.get();
        if (ya.exists)
            continue;
        const ctx = { evento, gestoriaId: evento.gestoriaId, entidadDoc, automatizacion: auto };
        let ejecutadas = 0, fallidas = 0;
        const errores = [];
        for (const accion of (_d = auto.acciones) !== null && _d !== void 0 ? _d : []) {
            const fn = ejecutores_1.EJECUTORES[accion.tipo];
            if (!fn) {
                fallidas++;
                errores.push(`Ejecutor no implementado: ${accion.tipo}`);
                continue;
            }
            try {
                await fn(accion, ctx);
                ejecutadas++;
            }
            catch (e) {
                fallidas++;
                errores.push(`${accion.tipo}: ${e === null || e === void 0 ? void 0 : e.message}`);
                firebase_functions_1.logger.warn('[motor] acción falló', { auto: auto.id, accion: accion.tipo, error: e === null || e === void 0 ? void 0 : e.message });
            }
        }
        // Log de ejecución (doc con id determinístico = idempotencia)
        await execRef.set({
            gestoriaId: evento.gestoriaId,
            automatizacionId: auto.id,
            automatizacionNombre: (_e = auto.nombre) !== null && _e !== void 0 ? _e : '',
            eventoId: event.params.eventoId,
            eventoTipo: evento.tipo,
            entidad: (_f = evento.entidad) !== null && _f !== void 0 ? _f : null,
            entidadId: (_g = evento.entidadId) !== null && _g !== void 0 ? _g : null,
            estado: fallidas === 0 ? 'ejecutada' : 'fallida',
            accionesEjecutadas: ejecutadas,
            accionesFallidas: fallidas,
            errores,
            timestamp: FV.serverTimestamp(),
        }).catch(() => { });
        // Stats de la automatización
        await doc.ref.update(Object.assign(Object.assign({ ejecucionesTotales: FV.increment(1) }, (fallidas > 0 ? { ejecucionesFallidas: FV.increment(1) } : { ejecucionesExitosas: FV.increment(1) })), { ultimaEjecucion: FV.serverTimestamp() })).catch(() => { });
    }
});
// ─── SEED: activa las automatizaciones sugeridas del tenant (una sola vez) ───
exports.seedAutomatizaciones = (0, https_1.onCall)({
    region: 'us-central1',
    cors: cors_1.CORS_ORIGINS,
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Requiere login');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    if (!userSnap.exists)
        throw new https_1.HttpsError('permission-denied', 'Usuario no encontrado');
    const u = userSnap.data();
    if (!['propietario', 'admin', 'admin_gral'].includes(u.rol)) {
        throw new https_1.HttpsError('permission-denied', 'Solo propietarios/admins');
    }
    const gestoriaId = u.gestoriaId;
    if (!gestoriaId)
        throw new https_1.HttpsError('failed-precondition', 'Usuario sin gestoría');
    const plantillas = [
        {
            nombre: 'Lead nuevo → asignación rotativa + tarea de contacto',
            descripcion: 'Asigna el lead al equipo y crea tarea de contacto en 4 h.',
            trigger: 'lead.creado',
            condiciones: [],
            acciones: [
                { tipo: 'asignar_rotativo', params: {} },
                { tipo: 'crear_tarea', params: { titulo: 'Contactar lead {nombre}', vencimientoHoras: 4, prioridad: 'alta' } },
            ],
        },
        {
            nombre: 'Lead convertido → notificación al responsable',
            descripcion: 'Avisa cuando un lead pasa a prospecto.',
            trigger: 'lead.convertido',
            condiciones: [],
            acciones: [
                { tipo: 'crear_notificacion', params: { titulo: 'Lead {nombre} convertido en prospecto' } },
            ],
        },
        {
            nombre: 'Prospecto ganado → tarea de alta y recibo',
            descripcion: 'Crea la tarea de cierre cuando se gana el prospecto.',
            trigger: 'prospecto.cerrado_ganado',
            condiciones: [],
            acciones: [
                { tipo: 'crear_tarea', params: { titulo: 'Alta y recibo: {nombre}', vencimientoHoras: 24 } },
            ],
        },
    ];
    let creadas = 0;
    for (const p of plantillas) {
        const existente = await db.collection('automatizaciones')
            .where('gestoriaId', '==', gestoriaId)
            .where('nombre', '==', p.nombre)
            .limit(1).get();
        if (!existente.empty)
            continue;
        await db.collection('automatizaciones').add(Object.assign(Object.assign({ gestoriaId }, p), { activo: true, ejecucionesTotales: 0, ejecucionesExitosas: 0, ejecucionesFallidas: 0, creadoEn: FV.serverTimestamp(), creadoPor: request.auth.uid }));
        creadas++;
    }
    return { ok: true, creadas };
});
//# sourceMappingURL=motor.js.map