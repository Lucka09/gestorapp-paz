"use strict";
// functions/src/infracciones/guardarConsultaInfraccion.ts
// ─── RECIBE LAS ACTAS CRUDAS DE LA EXTENSIÓN Y HACE TODO EL TRABAJO ──────────
//
// La extensión (content.js) hace POST con { consultaId, dominio, raw }.
// Acá: verificamos el ID token, parseamos/clasificamos/cotizamos, guardamos en
// `consultasInfracciones`, actualizamos/creamos el prospecto y armamos el mensaje
// de WhatsApp. El PDF y el auto-envío se enganchan después reusando jsPDF y
// whatsappSend del frontend.
//
// Es onRequest (no onCall) porque la extensión llama por fetch con Bearer token.
// Despliegue: firebase deploy --only functions:guardarConsultaInfraccion
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
exports.guardarConsultaInfraccion = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const parseInfracciones_1 = require("./parseInfracciones");
const CONFIG_DOC = 'configuracion/gestor';
// Orígenes permitidos (token-gated igual; CORS solo evita el bloqueo del browser)
const ORIGENES_OK = new Set([
    'https://infraccionesba.gba.gob.ar',
]);
function setCors(req, res) {
    var _a, _b, _c;
    const origin = Array.isArray((_a = req.headers) === null || _a === void 0 ? void 0 : _a.origin) ? (_b = req.headers) === null || _b === void 0 ? void 0 : _b.origin[0] : (_c = req.headers) === null || _c === void 0 ? void 0 : _c.origin;
    // La extensión (content script) hereda el origin del portal; los chrome-extension:// también.
    if (origin && (ORIGENES_OK.has(origin) || origin.startsWith('chrome-extension://'))) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Max-Age', '3600');
}
// ─── HELPER: leer la config de cotización (o default) ────────────────────────
async function leerConfigCotizacion() {
    try {
        const snap = await admin.firestore().doc(CONFIG_DOC).get();
        const data = snap.data();
        if (data === null || data === void 0 ? void 0 : data.cotizacionMultas) {
            // Merge superficial: lo que Matías configuró pisa el default.
            return Object.assign(Object.assign({}, parseInfracciones_1.DEFAULT_CONFIG_COTIZACION), data.cotizacionMultas);
        }
    }
    catch (e) {
        firebase_functions_1.logger.warn('[guardarConsulta] No se pudo leer config, usando default', e);
    }
    return parseInfracciones_1.DEFAULT_CONFIG_COTIZACION;
}
// ─── HELPER: mensaje de WhatsApp listo para copiar/enviar ────────────────────
function armarMensajeWhatsapp(params) {
    const { nombre, dominio, cotizacion, nombreComercial } = params;
    const money = (n) => `$${n.toLocaleString('es-AR')}`;
    if (cotizacion.cantidadTrabajable === 0) {
        return (`Hola ${nombre}! Consultamos el dominio ${dominio} y por el momento no ` +
            `encontramos infracciones que podamos gestionar. Cualquier cosa, quedamos a disposición.\n\n${nombreComercial}`);
    }
    const lineas = cotizacion.actasTrabajables.map((a) => {
        var _a, _b;
        const detalle = (_b = (_a = a.detalles[0]) === null || _a === void 0 ? void 0 : _a.descripcion) !== null && _b !== void 0 ? _b : 'Infracción';
        return `• Acta ${a.nroActa} — ${detalle} — ${money(a.importeTotal)}`;
    });
    let msg = `Hola ${nombre}! Consultamos las infracciones del dominio ${dominio}.\n\n` +
        `Infracciones que podemos gestionar (${cotizacion.cantidadTrabajable}):\n` +
        lineas.join('\n') +
        `\n\nHonorarios del trámite: ${money(cotizacion.honorariosGestoria)} (${cotizacion.detalleHonorarios}).`;
    if (cotizacion.cantidadExcluida > 0) {
        msg +=
            `\n\nDetectamos además ${cotizacion.cantidadExcluida} acta(s) que no corresponde ` +
                `gestionar (sentencia firme, descargo ya presentado o sin deber de informar). ` +
                `El detalle completo va en el presupuesto.`;
    }
    msg += `\n\n¿Avanzamos? Respondé este mensaje y lo dejamos en marcha.\n\n${nombreComercial}`;
    return msg;
}
// ─── HELPER: upsert del prospecto en el pipeline ─────────────────────────────
async function upsertProspecto(params) {
    const { db, gestoriaId, uid, prospectoId, contacto, dominio, cotizacion } = params;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const descripcion = cotizacion.cantidadTrabajable > 0
        ? `${cotizacion.cantidadTrabajable} multa(s) gestionable(s) · honorarios $${cotizacion.honorariosGestoria.toLocaleString('es-AR')}`
        : `Consulta sin deuda gestionable`;
    // Si ya existe (pre-prospecto de la web), lo actualizamos a "presupuestado".
    if (prospectoId) {
        await db.doc(`prospectos/${prospectoId}`).set({
            etapa: cotizacion.cantidadTrabajable > 0 ? 'presupuestado' : 'contactado',
            color: 'naranja',
            patente: dominio,
            descripcion,
            actualizadoEn: now,
        }, { merge: true });
        return prospectoId;
    }
    // Si no existe (carga manual), lo creamos.
    const [nombre, ...resto] = (contacto.nombre || 'Sin nombre').trim().split(' ');
    const ref = await db.collection('prospectos').add({
        gestoriaId,
        nombre,
        apellido: resto.join(' '),
        telefono: contacto.whatsapp || '',
        email: contacto.email || '',
        localidad: '',
        etapa: cotizacion.cantidadTrabajable > 0 ? 'presupuestado' : 'contactado',
        color: 'naranja',
        tipoTramite: 'descargo_multa',
        patente: dominio,
        descripcion,
        montoCierre: 0,
        formaPago: '',
        fechaCierre: '',
        tareas: [],
        etiquetas: ['consulta-multas'],
        asignadoA: uid,
        creadoPor: uid,
        orden: Date.now(),
        creadoEn: now,
        actualizadoEn: now,
    });
    return ref.id;
}
// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
exports.guardarConsultaInfraccion = (0, https_1.onRequest)({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 }, async (req, res) => {
    var _a, _b, _c, _d;
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'Método no permitido' });
        return;
    }
    // ── 1. Verificar ID token ───────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
        res.status(401).json({ ok: false, error: 'Falta token' });
        return;
    }
    let uid;
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
    }
    catch (_e) {
        res.status(401).json({ ok: false, error: 'Token inválido' });
        return;
    }
    const db = admin.firestore();
    // ── 2. Validar usuario ──────────────────────────────────────────────────
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
        res.status(403).json({ ok: false, error: 'Usuario no encontrado' });
        return;
    }
    const userData = userSnap.data();
    if (userData.activo === false) {
        res.status(403).json({ ok: false, error: 'Usuario inactivo' });
        return;
    }
    const gestoriaId = userData.gestoriaId;
    if (!gestoriaId) {
        res.status(403).json({ ok: false, error: 'Usuario sin gestoría' });
        return;
    }
    // ── 3. Validar payload ──────────────────────────────────────────────────
    const { consultaId, dominio, raw } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
    if (!consultaId || !raw) {
        res.status(400).json({ ok: false, error: 'Falta consultaId o raw' });
        return;
    }
    // ── 4. Verificar que la consulta pertenece a la gestoría del usuario ─────
    const consultaRef = db.doc(`consultasInfracciones/${consultaId}`);
    const consultaSnap = await consultaRef.get();
    if (!consultaSnap.exists) {
        res.status(404).json({ ok: false, error: 'Consulta no encontrada' });
        return;
    }
    const consulta = consultaSnap.data();
    if (consulta.gestoriaId !== gestoriaId) {
        res.status(403).json({ ok: false, error: 'Consulta de otra gestoría' });
        return;
    }
    // Rótulo para el mensaje: por DNI no hay un dominio único (las actas pueden
    // abarcar varios vehículos), así que usamos un rótulo neutro.
    const esDni = consulta.tipoConsulta === 'dni';
    const dominioEfectivo = dominio || consulta.dominio || '';
    const rotuloBusqueda = esDni
        ? (consulta.dni ? `DNI ${consulta.dni}` : 'tu documento')
        : dominioEfectivo;
    // ── 5. Parsear + clasificar + cotizar ───────────────────────────────────
    const config = await leerConfigCotizacion();
    const actas = (0, parseInfracciones_1.parseRespuestaPortal)(raw, config);
    const cotizacion = (0, parseInfracciones_1.cotizar)(actas, config);
    const contacto = (_b = consulta.contacto) !== null && _b !== void 0 ? _b : { nombre: 'Sin nombre', whatsapp: '' };
    // ── 6. Armar mensaje de WhatsApp ────────────────────────────────────────
    // nombreComercial: leído de config (fallback a "Gestoría Paz")
    let nombreComercial = 'Gestoría Paz';
    try {
        const cfgSnap = await db.doc(CONFIG_DOC).get();
        const cfgData = cfgSnap.data();
        nombreComercial = (_c = cfgData === null || cfgData === void 0 ? void 0 : cfgData.nombreComercial) !== null && _c !== void 0 ? _c : nombreComercial;
    }
    catch ( /* usa el fallback */_f) { /* usa el fallback */ }
    const mensajeWhatsapp = armarMensajeWhatsapp({
        nombre: ((_d = contacto.nombre) === null || _d === void 0 ? void 0 : _d.split(' ')[0]) || 'Hola',
        dominio: rotuloBusqueda,
        cotizacion,
        nombreComercial,
    });
    // ── 7. Upsert del prospecto ─────────────────────────────────────────────
    const prospectoId = await upsertProspecto({
        db, gestoriaId, uid,
        prospectoId: consulta.prospectoId,
        contacto,
        dominio: esDni ? '' : dominioEfectivo,
        cotizacion,
    });
    // ── 8. Guardar todo en la consulta ──────────────────────────────────────
    const sinDeuda = cotizacion.cantidadTrabajable === 0 && cotizacion.cantidadExcluida === 0;
    await consultaRef.set({
        estado: sinDeuda ? 'sin_deuda' : 'cotizada',
        actas,
        cotizacion,
        mensajeWhatsapp,
        prospectoId,
        consultadaPor: uid,
        consultadaEn: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    firebase_functions_1.logger.info(JSON.stringify({
        fn: 'guardarConsultaInfraccion', gestoriaId, uid, consultaId,
        dominio, actas: actas.length,
        trabajables: cotizacion.cantidadTrabajable,
        excluidas: cotizacion.cantidadExcluida,
        honorarios: cotizacion.honorariosGestoria,
    }));
    // ── 9. Responder ────────────────────────────────────────────────────────
    res.status(200).json({
        ok: true,
        estado: sinDeuda ? 'sin_deuda' : 'cotizada',
        prospectoId,
        resumen: {
            trabajables: cotizacion.cantidadTrabajable,
            excluidas: cotizacion.cantidadExcluida,
            deuda: cotizacion.importeTotalDeuda,
            honorarios: cotizacion.honorariosGestoria,
        },
        mensajeWhatsapp,
    });
});
//# sourceMappingURL=guardarConsultaInfraccion.js.map