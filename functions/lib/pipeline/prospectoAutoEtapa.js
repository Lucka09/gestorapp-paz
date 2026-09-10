"use strict";
// functions/src/pipeline/prospectoAutoEtapa.ts
// ─── AUTO-TRANSICIÓN DE ETAPA POR TRÁMITE ────────────────────────────────────
// Trigger sobre `tramites`. Busca el prospecto ACTIVO del cliente (por clienteId,
// enlace de Fase B) y mueve su etapa sola:
//   • Trámite creado / en curso → 'en_tramite' (si estaba antes en el embudo)
//   • Trámite 'entregado' (cierre de gestión) → 'ganado'
//
// La plata NO se toca acá: los ingresos se cuentan por recibos, no por el cierre.
// Al ganar emite el evento `prospecto.cerrado_ganado` para que el motor dispare
// sus automatizaciones (tarea de alta, etc.) igual que si se moviera a mano.
//
// Despliegue: firebase deploy --only functions:prospectoAutoEtapa
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
exports.prospectoAutoEtapa = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const db = () => admin.firestore();
const FV = admin.firestore.FieldValue;
const ETAPAS_CERRADAS = new Set(['ganado', 'perdido']);
const ETAPAS_PRE_TRAMITE = new Set(['nuevo', 'contactado', 'presupuestado']);
// Día AR en formato YYYY-MM-DD (para fechaCierre, string como en el resto).
function diaArISO() {
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
exports.prospectoAutoEtapa = (0, firestore_1.onDocumentWritten)({ document: 'tramites/{tramiteId}', region: 'southamerica-east1', memory: '256MiB', timeoutSeconds: 60 }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const after = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    if (!after)
        return; // borrado → nada
    const before = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.before) === null || _d === void 0 ? void 0 : _d.data();
    const esCreacion = !((_f = (_e = event.data) === null || _e === void 0 ? void 0 : _e.before) === null || _f === void 0 ? void 0 : _f.exists);
    // Solo seguimos si es alta o si cambió el estado (evita trabajo en ediciones triviales).
    if (!esCreacion && (before === null || before === void 0 ? void 0 : before.estado) === after.estado)
        return;
    const gestoriaId = String((_g = after.gestoriaId) !== null && _g !== void 0 ? _g : '');
    const clienteId = String((_h = after.clienteId) !== null && _h !== void 0 ? _h : '');
    if (!gestoriaId || !clienteId)
        return;
    // Prospecto ACTIVO del cliente (dos where de igualdad → sin índice compuesto).
    const snap = await db().collection('prospectos')
        .where('gestoriaId', '==', gestoriaId)
        .where('clienteId', '==', clienteId)
        .get();
    const activos = snap.docs.filter(d => !ETAPAS_CERRADAS.has(String(d.data().etapa)));
    if (activos.length === 0)
        return;
    // El más reciente, por si el cliente tuvo varias gestiones.
    activos.sort((a, b) => { var _a, _b, _c, _d, _e, _f; return ((_c = (_b = (_a = b.data().creadoEn) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0) - ((_f = (_e = (_d = a.data().creadoEn) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0); });
    const pros = activos[0];
    const pData = pros.data();
    const etapa = String((_j = pData.etapa) !== null && _j !== void 0 ? _j : 'nuevo');
    const cerroAhora = after.estado === 'entregado' && (before === null || before === void 0 ? void 0 : before.estado) !== 'entregado';
    // 1) Cierre de gestión → GANADO
    if (cerroAhora) {
        if (etapa === 'ganado')
            return;
        await pros.ref.update({
            etapa: 'ganado',
            tramiteId: event.params.tramiteId,
            fechaCierre: diaArISO(),
            actualizadoEn: FV.serverTimestamp(),
        });
        // Evento para que el motor dispare sus automatizaciones de "ganado".
        await db().collection('eventos').add({
            gestoriaId,
            tipo: 'prospecto.cerrado_ganado',
            entidad: 'prospecto',
            entidadId: pros.id,
            entidadLabel: `${(_k = pData.nombre) !== null && _k !== void 0 ? _k : ''} ${(_l = pData.apellido) !== null && _l !== void 0 ? _l : ''}`.trim() || pData.telefono || 'Prospecto',
            actor: { id: 'sistema', nombre: 'Auto (trámite entregado)', tipo: 'sistema' },
            payload: { etapa: 'ganado', origen: 'tramite_entregado', tramiteId: event.params.tramiteId },
            resumen: 'Prospecto ganado automáticamente al entregar el trámite',
            timestamp: FV.serverTimestamp(),
        }).catch(err => firebase_functions_1.logger.warn('[autoEtapa] evento ganado falló', { error: err === null || err === void 0 ? void 0 : err.message }));
        firebase_functions_1.logger.info('[autoEtapa] → ganado', { prospecto: pros.id, tramite: event.params.tramiteId });
        return;
    }
    // 2) Trámite en curso → EN TRÁMITE (solo si el prospecto está más atrás)
    if (ETAPAS_PRE_TRAMITE.has(etapa)) {
        await pros.ref.update({
            etapa: 'en_tramite',
            tramiteId: event.params.tramiteId,
            actualizadoEn: FV.serverTimestamp(),
        });
        firebase_functions_1.logger.info('[autoEtapa] → en_tramite', { prospecto: pros.id, tramite: event.params.tramiteId });
    }
});
//# sourceMappingURL=prospectoAutoEtapa.js.map