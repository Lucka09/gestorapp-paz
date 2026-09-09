"use strict";
// functions/src/leads/repescaLeadsFrios.ts
// ─── REPESCA DE LEADS FRÍOS ──────────────────────────────────────────────────
// Corre 1 vez por día (10:00 ART). Busca leads que quedaron sin avanzar hace
// N días (ni convertidos ni descartados) y les manda un WhatsApp de reactivación
// con TEMPLATE APROBADO. Recupera plata que se estaba perdiendo, sin trabajo manual.
//
// ⚠️ REQUIERE TEMPLATE APROBADO EN META (probablemente categoría MARKETING, que
//    exige opción de baja / opt-out en el texto). Fuera de la ventana de 24 h no
//    se puede mandar texto libre.
//
// Config (configuracion/gestor.repescaLeads):
//   activo:         boolean   (default false — no dispara hasta aprobar el template)
//   diasFrio:       number    (default 15)  — inactividad mínima para repescar
//   templateNombre: string    (default 'repesca_lead')
//   idioma:         string    (default 'es_AR')
//   phoneNumberId?: string    — número emisor (default: línea principal / env)
//   maxPorDia:      number    (default 30)  — tope diario para no quemar la línea
//
// Idempotente: cada lead marca `repescadoEn` → se repesca una sola vez.
//
// Despliegue: firebase deploy --only functions:repescaLeadsFrios
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
exports.repescaLeadsFrios = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const Utils_1 = require("../utils/Utils");
const DIA_MS = 86400000;
const FV = admin.firestore.FieldValue;
// Estados en los que NO tiene sentido repescar (ya cerraron de un lado u otro).
const ESTADOS_FINALES = new Set(['convertido', 'perdido', 'descartado']);
exports.repescaLeadsFrios = (0, scheduler_1.onSchedule)({
    schedule: '0 10 * * *',
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
}, async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const db = admin.firestore();
    const cfgSnap = await db.doc('configuracion/gestor').get();
    const rc = (_a = cfgSnap.data()) === null || _a === void 0 ? void 0 : _a.repescaLeads;
    if (!(rc === null || rc === void 0 ? void 0 : rc.activo)) {
        firebase_functions_1.logger.info('[repesca] desactivado');
        return;
    }
    const diasFrio = Number((_b = rc.diasFrio) !== null && _b !== void 0 ? _b : 15);
    const templateNombre = String((_c = rc.templateNombre) !== null && _c !== void 0 ? _c : 'repesca_lead');
    const idioma = String((_d = rc.idioma) !== null && _d !== void 0 ? _d : 'es_AR');
    const emisor = rc.phoneNumberId || undefined;
    const maxPorDia = Number((_e = rc.maxPorDia) !== null && _e !== void 0 ? _e : 30);
    const ahora = Date.now();
    // Frío = inactivo hace >= diasFrio, pero no más de 90 días (no perseguir fósiles).
    const limiteSup = admin.firestore.Timestamp.fromMillis(ahora - diasFrio * DIA_MS);
    const limiteInf = admin.firestore.Timestamp.fromMillis(ahora - 90 * DIA_MS);
    // Un solo rango de desigualdad (actualizadoEn); el resto se filtra en memoria.
    const snap = await db.collection('leads')
        .where('actualizadoEn', '>=', limiteInf)
        .where('actualizadoEn', '<=', limiteSup)
        .get();
    if (snap.empty) {
        firebase_functions_1.logger.info('[repesca] sin leads fríos');
        return;
    }
    let enviados = 0, saltados = 0, errores = 0;
    for (const doc of snap.docs) {
        if (enviados >= maxPorDia)
            break;
        const l = doc.data();
        if (ESTADOS_FINALES.has(String((_f = l.estado) !== null && _f !== void 0 ? _f : ''))) {
            saltados++;
            continue;
        }
        if (l.repescadoEn) {
            saltados++;
            continue;
        }
        const telefono = (0, Utils_1.normalizarTelefono)(String((_g = l.telefono) !== null && _g !== void 0 ? _g : ''));
        if (!telefono) {
            saltados++;
            continue;
        }
        const nombre = String((_h = l.nombre) !== null && _h !== void 0 ? _h : '').trim() || 'Hola';
        // Parámetros del template (orden EXACTO al dar de alta en Meta):
        //   {{1}} nombre
        const parametros = [nombre];
        try {
            await (0, Utils_1.sendTextMessage)(telefono, `${templateNombre} (${idioma}): ${parametros.join(', ')}`, emisor);
            await doc.ref.update({
                repescadoEn: FV.serverTimestamp(),
                estado: l.estado === 'nuevo' ? 'contactado' : l.estado,
                actualizadoEn: FV.serverTimestamp(),
            });
            enviados++;
        }
        catch (e) {
            errores++;
            firebase_functions_1.logger.error('[repesca] error enviando template', {
                lead: doc.id, template: templateNombre, message: e === null || e === void 0 ? void 0 : e.message,
            });
        }
    }
    firebase_functions_1.logger.info('[repesca] fin', { total: snap.size, enviados, saltados, errores, diasFrio });
});
//# sourceMappingURL=repescaLeadsFrios.js.map