"use strict";
// functions/src/vencimientos/recordatoriosVencimientoWA.ts
// ─── RECORDATORIOS DE VENCIMIENTO POR WHATSAPP ───────────────────────────────
// Corre 1 vez por día (9:00 ART). Busca vencimientos de vehículo (VTV, patente,
// seguro, licencia) que entran en una "banda" de aviso y le manda al cliente un
// TEMPLATE APROBADO de WhatsApp. Genera recurrencia/upsell sin trabajo manual.
//
// ⚠️ REQUIERE UN TEMPLATE APROBADO EN META. Fuera de la ventana de 24 h Meta
//    solo permite templates pre-aprobados (no texto libre). Ver el nombre y los
//    parámetros en `configuracion/gestor.recordatoriosVencimiento`.
//
// Config (configuracion/gestor.recordatoriosVencimiento):
//   activo:         boolean            ← apagado por defecto (no spamear sin template)
//   diasAviso:      number[]           ← bandas de aviso, ej [30, 7, 1] (agregá 0 para "vence hoy")
//   templateNombre: string             ← nombre EXACTO del template aprobado en Meta
//   idioma:         string             ← ej 'es_AR'
//   phoneNumberId?: string             ← número emisor (default: línea principal / env)
//   tipos?:         string[]           ← qué tipos avisar (default: todos)
//
// Idempotencia: cada vencimiento guarda `recordatoriosEnviados: string[]` con las
// bandas ya enviadas → nunca se manda dos veces el mismo hito.
//
// Despliegue: firebase deploy --only functions:recordatoriosVencimientoWA
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
exports.recordatoriosVencimientoWA = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const Utils_1 = require("../utils/Utils");
const DIA_MS = 86400000;
const ART_OFFSET_MS = -3 * 3600 * 1000; // Argentina = UTC-3
// Días calendario (ART) entre hoy y una fecha. Hoy=0, mañana=1, ayer=-1.
function diasHasta(fecha) {
    const aMedianocheArt = (d) => {
        const a = new Date(d.getTime() + ART_OFFSET_MS);
        a.setUTCHours(0, 0, 0, 0);
        return a.getTime();
    };
    return Math.round((aMedianocheArt(fecha) - aMedianocheArt(new Date())) / DIA_MS);
}
// Etiqueta legible del tipo de vencimiento (para el parámetro del template).
const LABEL_TIPO = {
    vtv: 'VTV', patente: 'patente', seguro: 'seguro',
    licencia: 'licencia de conducir', ruta: 'seguro obligatorio',
};
const etiquetaTipo = (t) => { var _a; return (_a = LABEL_TIPO[String(t).toLowerCase()]) !== null && _a !== void 0 ? _a : String(t); };
exports.recordatoriosVencimientoWA = (0, scheduler_1.onSchedule)({
    schedule: '0 9 * * *',
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
}, async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const db = admin.firestore();
    // ── Config del tenant ──────────────────────────────────────────────────
    const cfgSnap = await db.doc('configuracion/gestor').get();
    const rc = (_a = cfgSnap.data()) === null || _a === void 0 ? void 0 : _a.recordatoriosVencimiento;
    if (!(rc === null || rc === void 0 ? void 0 : rc.activo)) {
        firebase_functions_1.logger.info('[recVenc] desactivado — nada que hacer');
        return;
    }
    const diasAviso = (Array.isArray(rc.diasAviso) && rc.diasAviso.length ? rc.diasAviso : [30, 7, 1])
        .map(Number).filter(n => Number.isFinite(n) && n >= 0)
        .sort((a, b) => b - a); // descendente
    if (!diasAviso.length) {
        firebase_functions_1.logger.warn('[recVenc] sin diasAviso válidos');
        return;
    }
    const templateNombre = String((_b = rc.templateNombre) !== null && _b !== void 0 ? _b : 'recordatorio_vencimiento');
    const idioma = String((_c = rc.idioma) !== null && _c !== void 0 ? _c : 'es_AR');
    const emisor = rc.phoneNumberId || undefined;
    const tiposFiltro = Array.isArray(rc.tipos) && rc.tipos.length
        ? new Set(rc.tipos.map(t => String(t).toLowerCase()))
        : null;
    // ── Ventana de vencimientos a revisar ──────────────────────────────────
    const maxDias = diasAviso[0];
    const inicioArt = new Date(Date.now() + ART_OFFSET_MS);
    inicioArt.setUTCHours(0, 0, 0, 0);
    const desde = admin.firestore.Timestamp.fromMillis(inicioArt.getTime() - ART_OFFSET_MS);
    const hasta = admin.firestore.Timestamp.fromMillis(Date.now() + (maxDias + 1) * DIA_MS);
    const snap = await db.collection('vencimientos')
        .where('fechaVencimiento', '>=', desde)
        .where('fechaVencimiento', '<=', hasta)
        .get();
    if (snap.empty) {
        firebase_functions_1.logger.info('[recVenc] sin vencimientos en ventana');
        return;
    }
    // Cache de teléfonos de cliente para no releer el mismo doc.
    const cacheTel = new Map();
    const telefonoDe = async (clienteId) => {
        var _a, _b, _c;
        if (!clienteId)
            return null;
        if (cacheTel.has(clienteId))
            return (_a = cacheTel.get(clienteId)) !== null && _a !== void 0 ? _a : null;
        const c = await db.doc(`clientes/${clienteId}`).get();
        const tel = c.exists ? (0, Utils_1.normalizarTelefono)(String((_c = (_b = c.data()) === null || _b === void 0 ? void 0 : _b.telefono) !== null && _c !== void 0 ? _c : '')) : '';
        const val = tel || null;
        cacheTel.set(clienteId, val);
        return val;
    };
    let enviados = 0, saltados = 0, errores = 0;
    for (const doc of snap.docs) {
        const v = doc.data();
        const tipo = String((_d = v.tipo) !== null && _d !== void 0 ? _d : '').toLowerCase();
        if (tiposFiltro && !tiposFiltro.has(tipo)) {
            saltados++;
            continue;
        }
        const fecha = (_f = (_e = v.fechaVencimiento) === null || _e === void 0 ? void 0 : _e.toDate) === null || _f === void 0 ? void 0 : _f.call(_e);
        if (!fecha) {
            saltados++;
            continue;
        }
        const d = diasHasta(fecha);
        if (d < 0) {
            saltados++;
            continue;
        } // ya vencido: no recordamos hacia atrás
        // Banda aplicable = el umbral más ajustado que ya se cruzó (>= d).
        const candidatos = diasAviso.filter(t => t >= d);
        if (!candidatos.length) {
            saltados++;
            continue;
        } // todavía lejos
        const banda = Math.min(...candidatos);
        const yaEnviadas = Array.isArray(v.recordatoriosEnviados) ? v.recordatoriosEnviados : [];
        if (yaEnviadas.includes(String(banda))) {
            saltados++;
            continue;
        } // ya avisado este hito
        const telefono = await telefonoDe(String((_g = v.clienteId) !== null && _g !== void 0 ? _g : ''));
        if (!telefono) {
            firebase_functions_1.logger.warn('[recVenc] vencimiento sin teléfono de cliente', { id: doc.id, clienteId: v.clienteId });
            saltados++;
            continue;
        }
        // Cliente: nombre (para el saludo del template)
        let nombreCliente = 'Hola';
        const cli = await db.doc(`clientes/${v.clienteId}`).get();
        if (cli.exists)
            nombreCliente = String((_j = (_h = cli.data()) === null || _h === void 0 ? void 0 : _h.nombre) !== null && _j !== void 0 ? _j : 'Hola');
        const fechaStr = fecha.toLocaleDateString('es-AR', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
        });
        // Parámetros del template (orden EXACTO al dar de alta en Meta):
        //   {{1}} nombre · {{2}} tipo · {{3}} patente · {{4}} fecha
        const parametros = [
            nombreCliente,
            etiquetaTipo(tipo),
            String((_k = v.patente) !== null && _k !== void 0 ? _k : '').toUpperCase(),
            fechaStr,
        ];
        try {
            await (0, Utils_1.sendTemplateMessage)(telefono, templateNombre, idioma, parametros, emisor);
            await doc.ref.update({
                recordatoriosEnviados: admin.firestore.FieldValue.arrayUnion(String(banda)),
                ultimoRecordatorioEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            enviados++;
        }
        catch (e) {
            errores++;
            firebase_functions_1.logger.error('[recVenc] error enviando template', {
                id: doc.id, template: templateNombre, message: e === null || e === void 0 ? void 0 : e.message,
            });
        }
    }
    firebase_functions_1.logger.info('[recVenc] fin', { total: snap.size, enviados, saltados, errores, diasAviso });
});
//# sourceMappingURL=recordatoriosVencimientoWA.js.map