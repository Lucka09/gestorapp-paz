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
exports.EJECUTORES = exports.COLECCION_POR_ENTIDAD = void 0;
// functions/src/automatizaciones/ejecutores.ts
// Registro de ejecutores idempotentes: uno por TipoAccion.
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const condiciones_1 = require("./condiciones");
const Utils_1 = require("../utils/Utils");
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
exports.COLECCION_POR_ENTIDAD = {
    lead: 'leads', prospecto: 'prospectos', cliente: 'clientes', tramite: 'tramites',
};
function contextoPlantilla(ctx) {
    var _a, _b;
    return Object.assign(Object.assign(Object.assign({}, ctx.evento), ((_a = ctx.evento.payload) !== null && _a !== void 0 ? _a : {})), ((_b = ctx.entidadDoc) !== null && _b !== void 0 ? _b : {}));
}
async function actualizarAsignado(ctx, uid, nombre) {
    const col = exports.COLECCION_POR_ENTIDAD[ctx.evento.entidad];
    if (!col || !ctx.evento.entidadId)
        return;
    await db.collection(col).doc(ctx.evento.entidadId).update({
        asignadoA: uid, asignadoNombre: nombre, actualizadoEn: FV.serverTimestamp(),
    });
}
// ── ASIGNACIÓN ROTATIVA (round-robin estable) ────────────────────────────────
const ROLES_DEFAULT = ['asesor_comercial', 'vendedor', 'operador'];
const ejecutarAsignarRotativo = async (accion, ctx) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const roles = (_b = (_a = accion.params) === null || _a === void 0 ? void 0 : _a.roles) !== null && _b !== void 0 ? _b : (((_c = accion.params) === null || _c === void 0 ? void 0 : _c.rol) ? [accion.params.rol] : ROLES_DEFAULT);
    const snap = await db.collection('users')
        .where('gestoriaId', '==', ctx.gestoriaId)
        .where('activo', '==', true)
        .get();
    const miembros = snap.docs
        .map(d => (Object.assign({ uid: d.id }, d.data())))
        .filter(m => roles.includes(m.rol))
        .sort((a, b) => a.uid.localeCompare(b.uid)); // orden estable entre ejecuciones
    if (miembros.length === 0) {
        firebase_functions_1.logger.warn('[motor] sin miembros para rotativo', { roles });
        return;
    }
    const metaRef = db.collection('automatizaciones_meta').doc(ctx.gestoriaId);
    const metaSnap = await metaRef.get();
    const ultimo = metaSnap.exists ? ((_e = (_d = metaSnap.data()) === null || _d === void 0 ? void 0 : _d.ultimoIndiceRotativo) !== null && _e !== void 0 ? _e : -1) : -1;
    const indice = (ultimo + 1) % miembros.length;
    const elegido = miembros[indice];
    await metaRef.set({ ultimoIndiceRotativo: indice, actualizadoEn: Date.now() }, { merge: true });
    const nombre = `${(_f = elegido.nombre) !== null && _f !== void 0 ? _f : ''} ${(_g = elegido.apellido) !== null && _g !== void 0 ? _g : ''}`.trim();
    await actualizarAsignado(ctx, elegido.uid, nombre);
};
// ── ASIGNAR A USUARIO ESPECÍFICO ─────────────────────────────────────────────
const ejecutarAsignarUsuario = async (accion, ctx) => {
    var _a, _b, _c;
    const uid = (_a = accion.params) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        return;
    const u = await db.doc(`users/${uid}`).get();
    if (!u.exists)
        return;
    const d = u.data();
    await actualizarAsignado(ctx, uid, `${(_b = d.nombre) !== null && _b !== void 0 ? _b : ''} ${(_c = d.apellido) !== null && _c !== void 0 ? _c : ''}`.trim());
};
// ── CREAR TAREA ──────────────────────────────────────────────────────────────
const ejecutarCrearTarea = async (accion, ctx) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const titulo = (0, condiciones_1.rellenarPlantilla)((_b = (_a = accion.params) === null || _a === void 0 ? void 0 : _a.titulo) !== null && _b !== void 0 ? _b : 'Seguimiento: {nombre}', contextoPlantilla(ctx));
    const horas = Number((_d = (_c = accion.params) === null || _c === void 0 ? void 0 : _c.vencimientoHoras) !== null && _d !== void 0 ? _d : 24);
    await db.collection('tareas').add({
        gestoriaId: ctx.gestoriaId,
        titulo,
        descripcion: (_e = ctx.evento.resumen) !== null && _e !== void 0 ? _e : '',
        prioridad: (_g = (_f = accion.params) === null || _f === void 0 ? void 0 : _f.prioridad) !== null && _g !== void 0 ? _g : 'normal',
        estado: 'pendiente',
        clienteId: ctx.evento.entidad === 'cliente' ? ctx.evento.entidadId : null,
        clienteNombre: ctx.evento.entidad === 'cliente' ? ctx.evento.entidadLabel : null,
        tramiteId: ctx.evento.entidad === 'tramite' ? ctx.evento.entidadId : null,
        tramiteLabel: ctx.evento.entidad === 'tramite' ? ctx.evento.entidadLabel : null,
        leadId: ctx.evento.entidad === 'lead' ? ctx.evento.entidadId : null,
        prospectoId: ctx.evento.entidad === 'prospecto' ? ctx.evento.entidadId : null,
        asignadoA: (_j = (_h = ctx.entidadDoc) === null || _h === void 0 ? void 0 : _h.asignadoA) !== null && _j !== void 0 ? _j : '',
        asignadoNombre: (_l = (_k = ctx.entidadDoc) === null || _k === void 0 ? void 0 : _k.asignadoNombre) !== null && _l !== void 0 ? _l : '',
        creadoPor: 'automatizacion',
        creadoPorNombre: `Automatización · ${(_o = (_m = ctx.automatizacion) === null || _m === void 0 ? void 0 : _m.nombre) !== null && _o !== void 0 ? _o : ''}`,
        vencimiento: admin.firestore.Timestamp.fromMillis(Date.now() + horas * 3600 * 1000),
        creadoEn: FV.serverTimestamp(),
        actualizadoEn: FV.serverTimestamp(),
    });
};
// ── CREAR NOTIFICACIÓN (al asignado, o al propietario si no hay) ─────────────
const ejecutarCrearNotificacion = async (accion, ctx) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    let destinatario = ((_a = ctx.entidadDoc) === null || _a === void 0 ? void 0 : _a.asignadoA) || null;
    if (!destinatario) {
        const prop = await db.collection('users')
            .where('gestoriaId', '==', ctx.gestoriaId)
            .where('rol', '==', 'propietario')
            .limit(1).get();
        destinatario = prop.empty ? null : prop.docs[0].id;
    }
    if (!destinatario)
        return;
    await db.collection('notificaciones').add({
        gestoriaId: ctx.gestoriaId,
        destinatarioId: destinatario,
        titulo: (0, condiciones_1.rellenarPlantilla)((_c = (_b = accion.params) === null || _b === void 0 ? void 0 : _b.titulo) !== null && _c !== void 0 ? _c : 'Novedad: {nombre}', contextoPlantilla(ctx)),
        mensaje: (0, condiciones_1.rellenarPlantilla)((_e = (_d = accion.params) === null || _d === void 0 ? void 0 : _d.mensaje) !== null && _e !== void 0 ? _e : ((_f = ctx.evento.resumen) !== null && _f !== void 0 ? _f : ''), contextoPlantilla(ctx)),
        tipo: (_h = (_g = accion.params) === null || _g === void 0 ? void 0 : _g.tipo) !== null && _h !== void 0 ? _h : 'general',
        entidadTipo: (_j = ctx.evento.entidad) !== null && _j !== void 0 ? _j : null,
        entidadId: (_k = ctx.evento.entidadId) !== null && _k !== void 0 ? _k : null,
        leida: false,
        creadoEn: FV.serverTimestamp(),
    });
};
// ── ENVIAR WHATSAPP (requiere secrets de Meta; falla visible si faltan) ──────
const ejecutarEnviarWA = async (accion, ctx) => {
    var _a, _b, _c, _d;
    const telefono = (0, Utils_1.normalizarTelefono)((_b = (_a = ctx.entidadDoc) === null || _a === void 0 ? void 0 : _a.telefono) !== null && _b !== void 0 ? _b : '');
    if (!telefono) {
        firebase_functions_1.logger.warn('[motor] enviar_wa sin teléfono');
        return;
    }
    const texto = (0, condiciones_1.rellenarPlantilla)((_d = (_c = accion.params) === null || _c === void 0 ? void 0 : _c.texto) !== null && _d !== void 0 ? _d : 'Hola {nombre}! Gracias por contactarte con Gestoría Paz. Ya estamos revisando tu consulta y te respondemos a la brevedad.', contextoPlantilla(ctx));
    await (0, Utils_1.sendTextMessage)(telefono, texto);
};
// ── CAMBIAR ESTADO DE LEAD ───────────────────────────────────────────────────
const ejecutarCambiarEstadoLead = async (accion, ctx) => {
    var _a, _b;
    if (ctx.evento.entidad !== 'lead' || !ctx.evento.entidadId)
        return;
    await db.collection('leads').doc(ctx.evento.entidadId).update({
        estado: (_b = (_a = accion.params) === null || _a === void 0 ? void 0 : _a.estado) !== null && _b !== void 0 ? _b : 'contactado',
        actualizadoEn: FV.serverTimestamp(),
    });
};
// ── REGISTRO ─────────────────────────────────────────────────────────────────
exports.EJECUTORES = {
    asignar_rotativo: ejecutarAsignarRotativo,
    asignar_usuario: ejecutarAsignarUsuario,
    crear_tarea: ejecutarCrearTarea,
    crear_notificacion: ejecutarCrearNotificacion,
    enviar_wa: ejecutarEnviarWA,
    cambiar_estado_lead: ejecutarCambiarEstadoLead,
};
//# sourceMappingURL=ejecutores.js.map