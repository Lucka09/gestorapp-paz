"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.motorAlertasDiario = void 0;
// functions/src/motorAlertas.ts
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
// ─── FUNCIÓN 1: Vencimientos próximos ─────────────────────────────────────────
async function getVencimientosProximos(diasLimite) {
    const db = (0, firestore_1.getFirestore)();
    const ahora = firestore_1.Timestamp.now();
    const limite = firestore_1.Timestamp.fromMillis(ahora.toMillis() + diasLimite * 24 * 60 * 60 * 1000);
    const snap = await db
        .collectionGroup('tramites')
        .where('estado', 'not-in', ['completado', 'archivado'])
        .where('vencimiento', '>=', ahora)
        .where('vencimiento', '<=', limite)
        .get();
    return snap.docs.map(doc => {
        const data = doc.data();
        const diasRestantes = Math.ceil((data.vencimiento.toMillis() - ahora.toMillis()) / (1000 * 60 * 60 * 24));
        return {
            gestoriaId: data.gestoriaId,
            tipo: 'vencimiento_proximo',
            titulo: `Vencimiento en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'}`,
            descripcion: `El trámite "${data.titulo}" vence el ${data.vencimiento
                .toDate()
                .toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
            entidadId: doc.id,
            entidadTipo: 'tramite',
            fechaRef: data.vencimiento,
            prioridad: diasRestantes <= 2 ? 'alta' : 'normal',
        };
    });
}
// ─── FUNCIÓN 2: Trámites inactivos ────────────────────────────────────────────
async function getTramitesInactivos(diasSinMovimiento) {
    const db = (0, firestore_1.getFirestore)();
    const limite = firestore_1.Timestamp.fromMillis(Date.now() - diasSinMovimiento * 24 * 60 * 60 * 1000);
    const snap = await db
        .collectionGroup('tramites')
        .where('estado', 'not-in', ['completado', 'archivado'])
        .where('ultimaActualizacion', '<=', limite)
        .get();
    return snap.docs
        .filter(doc => doc.data().tipo !== 'descargo_multa') // multas alertan por fecha, no por inactividad
        .map(doc => {
        const data = doc.data();
        const diasSin = Math.floor((Date.now() - data.ultimaActualizacion.toMillis()) / (1000 * 60 * 60 * 24));
        return {
            gestoriaId: data.gestoriaId,
            tipo: 'tramite_inactivo',
            titulo: 'Trámite sin actividad',
            descripcion: `El trámite "${data.titulo}" no tiene movimientos hace ${diasSin} días.`,
            entidadId: doc.id,
            entidadTipo: 'tramite',
            prioridad: 'normal',
        };
    });
}
// ─── FUNCIÓN 3: Procesar y guardar alertas ────────────────────────────────────
async function procesarYGuardarAlertas(alertas) {
    if (alertas.length === 0)
        return;
    const db = (0, firestore_1.getFirestore)();
    const ahora = firestore_1.Timestamp.now();
    // Procesamos en lotes de 500 (límite de Firestore)
    const LOTE = 500;
    for (let i = 0; i < alertas.length; i += LOTE) {
        const batch = db.batch();
        const chunk = alertas.slice(i, i + LOTE);
        for (const alerta of chunk) {
            // Evitar duplicados: clave compuesta por entidadId + tipo + día
            const diaKey = ahora.toDate().toISOString().split('T')[0];
            const docId = `${alerta.entidadId}_${alerta.tipo}_${diaKey}`;
            const ref = db
                .collection('gestoras')
                .doc(alerta.gestoriaId)
                .collection('alertas')
                .doc(docId);
            batch.set(ref, Object.assign(Object.assign({}, alerta), { leida: false, creadoEn: ahora }), { merge: true }); // merge: true para no pisar si ya existe del día
        }
        await batch.commit();
    }
    console.log(`[motorAlertas] ${alertas.length} alerta(s) procesadas.`);
}
// ── FUNCIÓN NUEVA: recordatorios de transferencia vencidos ──────────────────
async function getRecordatoriosTransferenciaVencidos() {
    const db = (0, firestore_1.getFirestore)();
    const ahora = firestore_1.Timestamp.now();
    const alertas = [];
    // Seguimiento de plazos (paso 4) — venció la fecha de "próxima alerta"
    const snapSeguimiento = await db
        .collectionGroup('transferenciaWorkflow')
        .where('estadoWorkflow', '==', 'seguimiento')
        .where('recordatorioSeguimiento', '<=', ahora)
        .get();
    snapSeguimiento.docs.forEach(doc => {
        var _a;
        const data = doc.data();
        alertas.push({
            gestoriaId: data.gestoriaId,
            tipo: 'tramite_inactivo', // reutiliza el tipo existente — es lo más cercano
            titulo: 'Seguimiento de transferencia pendiente',
            descripcion: `La transferencia sigue en seguimiento en el registro. Plazo estimado: ${((_a = data.paso1) === null || _a === void 0 ? void 0 : _a.futuraRadicacion) ? 'hasta 45 días (futura radicación)' : '3 a 21 días'}. Conviene confirmar el estado con el registro.`,
            entidadId: doc.id,
            entidadTipo: 'tramite',
            prioridad: 'normal',
        });
    });
    // Turno de retiro — 24hs antes
    const snap24hs = await db
        .collectionGroup('transferenciaWorkflow')
        .where('estadoWorkflow', '==', 'recibo_listo')
        .where('recordatorio24hs', '<=', ahora)
        .get();
    snap24hs.docs.forEach(doc => {
        var _a, _b, _c, _d;
        const data = doc.data();
        alertas.push({
            gestoriaId: data.gestoriaId,
            tipo: 'vencimiento_proximo',
            titulo: '📅 Turno de retiro mañana',
            descripcion: `Recordatorio: turno de retiro el ${(_a = data.paso5) === null || _a === void 0 ? void 0 : _a.fechaTurnoRetiro} en ${(_c = (_b = data.paso5) === null || _b === void 0 ? void 0 : _b.registroNombre) !== null && _c !== void 0 ? _c : 'el registro'}. Gestor: ${(_d = data.gestorNombre) !== null && _d !== void 0 ? _d : 'sin asignar'}.`,
            entidadId: doc.id,
            entidadTipo: 'tramite',
            prioridad: 'alta',
        });
    });
    // Turno de retiro — el mismo día
    const snapDia = await db
        .collectionGroup('transferenciaWorkflow')
        .where('estadoWorkflow', '==', 'recibo_listo')
        .where('recordatorioDiaTurno', '<=', ahora)
        .get();
    snapDia.docs.forEach(doc => {
        var _a, _b, _c, _d;
        const data = doc.data();
        alertas.push({
            gestoriaId: data.gestoriaId,
            tipo: 'vencimiento_proximo',
            titulo: '📍 Turno de retiro HOY',
            descripcion: `Hoy es el turno de retiro en ${(_b = (_a = data.paso5) === null || _a === void 0 ? void 0 : _a.registroNombre) !== null && _b !== void 0 ? _b : 'el registro'}${((_c = data.paso5) === null || _c === void 0 ? void 0 : _c.horaTurnoRetiro) ? ' a las ' + data.paso5.horaTurnoRetiro : ''}. Gestor: ${(_d = data.gestorNombre) !== null && _d !== void 0 ? _d : 'sin asignar'}.`,
            entidadId: doc.id,
            entidadTipo: 'tramite',
            prioridad: 'alta',
        });
    });
    return alertas;
}
// ── RECORDATORIOS DE TURNOS PRÓXIMOS ─────────────────────────────────────────
async function getTurnosProximos() {
    const db = (0, firestore_1.getFirestore)();
    const ahora = firestore_1.Timestamp.now();
    const en30min = firestore_1.Timestamp.fromMillis(ahora.toMillis() + 30 * 60 * 1000);
    const alertas = [];
    const snap = await db
        .collection('turnos')
        .where('estado', 'in', ['reservado', 'confirmado'])
        .where('fecha', '>=', ahora)
        .where('fecha', '<=', en30min)
        .get();
    snap.docs.forEach(doc => {
        var _a, _b;
        const data = doc.data();
        const fechaTurno = data.fecha.toDate();
        const horaTurno = `${String(fechaTurno.getHours()).padStart(2, '0')}:${String(fechaTurno.getMinutes()).padStart(2, '0')}`;
        alertas.push({
            gestoriaId: data.gestoriaId,
            tipo: 'vencimiento_proximo',
            titulo: 'Turno en los próximos 30 minutos',
            descripcion: `Turno de ${(_a = data.tipoTramite) !== null && _a !== void 0 ? _a : 'trámite'} a las ${horaTurno} hs con ${(_b = data.clienteNombre) !== null && _b !== void 0 ? _b : 'cliente'}.`,
            entidadId: doc.id,
            entidadTipo: 'cliente',
            fechaRef: data.fecha,
            prioridad: 'alta',
        });
    });
    return alertas;
}
// ─── CLOUD FUNCTION ───────────────────────────────────────────────────────────
exports.motorAlertasDiario = (0, scheduler_1.onSchedule)('every 15 minutes', async () => {
    const [vencimientos, tramitesSinActualizar, recordatoriosTransferencia, turnosProximos] = await Promise.all([
        getVencimientosProximos(7),
        getTramitesInactivos(30),
        getRecordatoriosTransferenciaVencidos(),
        getTurnosProximos(),
    ]);
    await procesarYGuardarAlertas([
        ...vencimientos,
        ...tramitesSinActualizar,
        ...recordatoriosTransferencia,
        ...turnosProximos,
    ]);
});
//# sourceMappingURL=MotorAlertas.js.map