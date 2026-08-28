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
const ROLES_DEFAULT = ['asesor_comercial'];
const ejecutarAsignarRotativo = async (accion, ctx) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const yaAsignado = ((_a = ctx.entidadDoc) === null || _a === void 0 ? void 0 : _a.asignadoA) || ((_c = (_b = ctx.evento) === null || _b === void 0 ? void 0 : _b.payload) === null || _c === void 0 ? void 0 : _c.asignadoA);
    if (yaAsignado) {
        firebase_functions_1.logger.info('[motor] rotativo omitido: entidad ya asignada', {
            entidadId: (_d = ctx.evento) === null || _d === void 0 ? void 0 : _d.entidadId, asignadoA: yaAsignado,
        });
        return;
    }
    const roles = (_f = (_e = accion.params) === null || _e === void 0 ? void 0 : _e.roles) !== null && _f !== void 0 ? _f : (((_g = accion.params) === null || _g === void 0 ? void 0 : _g.rol) ? [accion.params.rol] : ROLES_DEFAULT);
    const snap = await db.collection('users')
        .where('gestoriaId', '==', ctx.gestoriaId)
        .where('activo', '==', true)
        .get();
    const miembros = snap.docs
        .map(d => (Object.assign({ uid: d.id }, d.data())))
        .filter(m => roles.includes(m.rol))
        .sort((a, b) => a.uid.localeCompare(b.uid));
    if (miembros.length === 0) {
        firebase_functions_1.logger.warn('[motor] sin miembros para rotativo', { roles });
        return;
    }
    const metaRef = db.collection('automatizaciones_meta').doc(ctx.gestoriaId);
    const metaSnap = await metaRef.get();
    const ultimo = metaSnap.exists ? ((_j = (_h = metaSnap.data()) === null || _h === void 0 ? void 0 : _h.ultimoIndiceRotativo) !== null && _j !== void 0 ? _j : -1) : -1;
    const indice = (ultimo + 1) % miembros.length;
    const elegido = miembros[indice];
    await metaRef.set({ ultimoIndiceRotativo: indice, actualizadoEn: Date.now() }, { merge: true });
    const nombre = `${(_k = elegido.nombre) !== null && _k !== void 0 ? _k : ''} ${(_l = elegido.apellido) !== null && _l !== void 0 ? _l : ''}`.trim();
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
// ── MATERIALIZAR CLIENTE + VEHÍCULO DESDE LEAD ───────────────────────────────
// Apenas entra el lead, deja un registro real en `clientes` (+ `vehiculos` si
// hay patente) para que la persona quede disponible para campañas y repesca
// aunque nunca convierta.
// • Dedupe idempotente: cliente por `documento`→`dni`, fallback `telefono`;
//   vehículo por `patente`.
// • Modo FILL-ONLY: si el cliente ya existe, solo completa campos vacíos —
//   nunca pisa un dato cargado con uno vacío.
// • Ciclo de vida: nace `cicloVida:'prospecto'` (se promueve a 'cliente' al
//   convertir). Marca `datosIncompletos` para que el equipo sepa qué completar.
// • Cross-ref de vuelta al lead (`clienteId`/`vehiculoId`/`materializado`).
const ejecutarMaterializarCliente = async (_accion, ctx) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (ctx.evento.entidad !== 'lead' || !ctx.evento.entidadId)
        return;
    const lead = ctx.entidadDoc;
    if (!lead) {
        firebase_functions_1.logger.warn('[motor] materializar_cliente sin entidadDoc');
        return;
    }
    // Idempotencia dura: si el lead ya fue materializado, no repetir.
    if (lead.clienteId) {
        firebase_functions_1.logger.info('[motor] materializar_cliente omitido: lead ya materializado', {
            leadId: ctx.evento.entidadId, clienteId: lead.clienteId,
        });
        return;
    }
    const gestoriaId = ctx.gestoriaId;
    const documento = String((_a = lead.documento) !== null && _a !== void 0 ? _a : '').trim();
    const telefono = (0, Utils_1.normalizarTelefono)(String((_b = lead.telefono) !== null && _b !== void 0 ? _b : ''));
    const patente = String((_c = lead.patente) !== null && _c !== void 0 ? _c : '').toUpperCase().trim();
    const nombre = String((_d = lead.nombre) !== null && _d !== void 0 ? _d : '').trim();
    const apellido = String((_e = lead.apellido) !== null && _e !== void 0 ? _e : '').trim();
    const email = String((_f = lead.email) !== null && _f !== void 0 ? _f : '').trim();
    const localidad = String((_g = lead.localidad) !== null && _g !== void 0 ? _g : '').trim();
    // Sin ninguna clave de contacto no tiene sentido crear registro.
    if (!documento && !telefono && !nombre) {
        firebase_functions_1.logger.info('[motor] materializar_cliente: lead sin datos suficientes', {
            leadId: ctx.evento.entidadId,
        });
        return;
    }
    const datosIncompletos = !documento || !apellido;
    // ── 1. DEDUPE CLIENTE (documento→dni, fallback teléfono) ────────────────
    let clienteId = null;
    let clienteExistente = null;
    if (documento) {
        const q = await db.collection('clientes')
            .where('gestoriaId', '==', gestoriaId)
            .where('dni', '==', documento)
            .limit(1).get();
        if (!q.empty) {
            clienteId = q.docs[0].id;
            clienteExistente = q.docs[0].data();
        }
    }
    if (!clienteId && telefono) {
        const q = await db.collection('clientes')
            .where('gestoriaId', '==', gestoriaId)
            .where('telefono', '==', telefono)
            .limit(1).get();
        if (!q.empty) {
            clienteId = q.docs[0].id;
            clienteExistente = q.docs[0].data();
        }
    }
    if (clienteId) {
        // FILL-ONLY: completar solo lo que esté vacío en el cliente existente.
        const patch = {};
        const fill = (campo, valor) => {
            if (valor && !(clienteExistente === null || clienteExistente === void 0 ? void 0 : clienteExistente[campo]))
                patch[campo] = valor;
        };
        fill('dni', documento);
        fill('nombre', nombre);
        fill('apellido', apellido);
        fill('telefono', telefono);
        fill('email', email);
        fill('localidad', localidad);
        // Si el DNI + apellido llegaron ahora, sacar el flag de incompleto.
        if ((clienteExistente === null || clienteExistente === void 0 ? void 0 : clienteExistente.datosIncompletos) && !datosIncompletos) {
            patch.datosIncompletos = false;
        }
        if (Object.keys(patch).length > 0) {
            patch.actualizadoEn = FV.serverTimestamp();
            await db.collection('clientes').doc(clienteId).update(patch);
        }
    }
    else {
        // CREAR esqueleto — cicloVida 'prospecto' hasta que convierta.
        const nuevo = {
            gestoriaId,
            nombre: nombre || 'Sin nombre',
            apellido,
            dni: documento,
            telefono,
            email,
            localidad,
            origenCanal: (_h = lead.canal) !== null && _h !== void 0 ? _h : null,
            cicloVida: 'prospecto',
            datosIncompletos,
            origen: 'lead',
            origenLeadId: ctx.evento.entidadId,
            creadoAutomaticamente: true,
            vehiculosIds: [],
            creadoPor: 'automatizacion',
            creadoEn: FV.serverTimestamp(),
            actualizadoEn: FV.serverTimestamp(),
        };
        const clean = {};
        for (const [k, v] of Object.entries(nuevo))
            if (v !== undefined)
                clean[k] = v;
        const ref = await db.collection('clientes').add(clean);
        clienteId = ref.id;
    }
    // ── 2. DEDUPE + CREAR VEHÍCULO (solo si hay patente) ────────────────────
    let vehiculoId = null;
    if (patente) {
        const q = await db.collection('vehiculos')
            .where('gestoriaId', '==', gestoriaId)
            .where('patente', '==', patente)
            .limit(1).get();
        if (!q.empty) {
            vehiculoId = q.docs[0].id;
        }
        else {
            const vref = await db.collection('vehiculos').add({
                gestoriaId,
                patente,
                tipo: 'auto',
                marca: '', modelo: '', anio: 0, color: '',
                nroMotor: '', nroChasis: '', nroDominio: '',
                clienteId,
                historialTitulares: [{
                        clienteId,
                        desde: admin.firestore.Timestamp.now(),
                        hasta: null,
                    }],
                tramitesIds: [],
                datosIncompletos: true,
                creadoAutomaticamente: true,
                creadoEn: FV.serverTimestamp(),
            });
            vehiculoId = vref.id;
        }
        // Linkear al cliente sin duplicar.
        await db.collection('clientes').doc(clienteId).update({
            vehiculosIds: FV.arrayUnion(vehiculoId),
        });
    }
    // ── 3. CROSS-REF de vuelta al lead ──────────────────────────────────────
    const leadPatch = {
        clienteId,
        materializado: true,
        actualizadoEn: FV.serverTimestamp(),
    };
    if (vehiculoId)
        leadPatch.vehiculoId = vehiculoId;
    await db.collection('leads').doc(ctx.evento.entidadId).update(leadPatch);
    firebase_functions_1.logger.info('[motor] materializar_cliente OK', {
        leadId: ctx.evento.entidadId, clienteId, vehiculoId, datosIncompletos,
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
    materializar_cliente: ejecutarMaterializarCliente,
};
//# sourceMappingURL=ejecutores.js.map