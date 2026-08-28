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
exports.kommoRecibirLead = void 0;
// functions/src/whatsapp/kommoRecibirLead.ts
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const MAPEO_PIPELINES_KOMMO = {
    // Reemplazá 'ID_PIPELINE_JESSICA' por el número real que veas en la URL de Kommo
    '14258279': { email: 'Jessjoker1@gmail.com', linea: '5491136141431' },
    '14323319': { email: 'florchiperez1987@gmail.com', linea: '5491161859697' },
    '14323315': { email: 'gonzalonicolas948@gmail.com', linea: '5491157037764' },
    '14286743': { email: 'Alexiapini.t@gmail.com', linea: '5491149470249' },
};
// ─── NORMALIZADORES ─────────────────────────────────────────────────────────
function normalizarTelefono(raw) {
    const limpio = (raw || '').replace(/\D/g, '');
    if (!limpio)
        return '';
    if (limpio.length === 10 && limpio.startsWith('11'))
        return `549${limpio}`;
    if (limpio.length === 11 && limpio.startsWith('911'))
        return `54${limpio}`;
    return limpio.startsWith('54') ? limpio : `54${limpio}`;
}
const normalizarDNI = (raw) => (raw || '').replace(/[.\s-]/g, '');
const normalizarPatente = (raw) => (raw || '').toUpperCase().replace(/\s/g, '');
const validarPatente = (p) => /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p);
function campoKommo(customFields, nombres) {
    var _a, _b;
    const lows = nombres.map(n => n.toLowerCase());
    const f = (customFields !== null && customFields !== void 0 ? customFields : []).find(cf => { var _a; return lows.includes(String((_a = cf === null || cf === void 0 ? void 0 : cf.name) !== null && _a !== void 0 ? _a : '').trim().toLowerCase()); });
    return ((_b = (_a = f === null || f === void 0 ? void 0 : f.values) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) != null ? String(f.values[0].value) : '';
}
// ─── PARSEO ─────────────────────────────────────────────────────────────────
function desdeFormatoSimple(b) {
    var _a, _b, _c, _d, _e, _f, _g;
    return {
        nombre: String((_a = b.nombre) !== null && _a !== void 0 ? _a : '').trim(),
        telefono: normalizarTelefono(String((_b = b.telefono) !== null && _b !== void 0 ? _b : '')),
        dni: normalizarDNI(String((_c = b.dni) !== null && _c !== void 0 ? _c : '')),
        patente: normalizarPatente(String((_d = b.patente) !== null && _d !== void 0 ? _d : '')),
        email: String((_e = b.email) !== null && _e !== void 0 ? _e : ''),
        canal: String((_f = b.canal) !== null && _f !== void 0 ? _f : 'whatsapp'),
        mensaje: String((_g = b.mensaje) !== null && _g !== void 0 ? _g : ''),
        kommoLeadId: b.kommoLeadId ? String(b.kommoLeadId) : null,
        kommoContactId: b.kommoContactId ? String(b.kommoContactId) : null,
        kommoPipelineId: b.kommoPipelineId ? String(b.kommoPipelineId) : null,
    };
}
function desdeKommoNativo(body) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const todos = [
        ...((_b = (_a = body === null || body === void 0 ? void 0 : body.leads) === null || _a === void 0 ? void 0 : _a.add) !== null && _b !== void 0 ? _b : []),
        ...((_d = (_c = body === null || body === void 0 ? void 0 : body.leads) === null || _c === void 0 ? void 0 : _c.update) !== null && _d !== void 0 ? _d : []),
    ];
    const contactos = [
        ...((_f = (_e = body === null || body === void 0 ? void 0 : body.contacts) === null || _e === void 0 ? void 0 : _e.add) !== null && _f !== void 0 ? _f : []),
        ...((_h = (_g = body === null || body === void 0 ? void 0 : body.contacts) === null || _g === void 0 ? void 0 : _g.update) !== null && _h !== void 0 ? _h : []),
    ];
    const telPorContacto = new Map();
    for (const c of contactos) {
        const tels = ((_j = c.custom_fields) !== null && _j !== void 0 ? _j : [])
            .filter((f) => { var _a; return (f === null || f === void 0 ? void 0 : f.code) === 'PHONE' || /tel|whatsapp|phone/i.test(String((_a = f === null || f === void 0 ? void 0 : f.name) !== null && _a !== void 0 ? _a : '')); })
            .map((f) => { var _a, _b, _c; return String((_c = (_b = (_a = f === null || f === void 0 ? void 0 : f.values) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : ''); })
            .filter(Boolean);
        if ((c === null || c === void 0 ? void 0 : c.id) != null && tels.length)
            telPorContacto.set(String(c.id), tels[0]);
    }
    return todos.map(l => {
        var _a, _b, _c, _d;
        const cf = (_a = l.custom_fields) !== null && _a !== void 0 ? _a : [];
        const contactoId = (_c = (_b = l.contact_id) !== null && _b !== void 0 ? _b : l.main_contact_id) !== null && _c !== void 0 ? _c : null;
        return {
            nombre: String((_d = l.name) !== null && _d !== void 0 ? _d : ''),
            telefono: normalizarTelefono(campoKommo(cf, ['teléfono', 'telefono', 'tel', 'whatsapp']) ||
                telPorContacto.get(String(contactoId)) || ''),
            dni: normalizarDNI(campoKommo(cf, ['dni', 'cuit', 'dni/cuit', 'documento'])),
            patente: normalizarPatente(campoKommo(cf, ['patente', 'dominio', 'patente/dominio'])),
            email: campoKommo(cf, ['email', 'correo']),
            canal: 'whatsapp',
            mensaje: campoKommo(cf, ['consulta', 'mensaje', 'nota']),
            kommoLeadId: l.id != null ? String(l.id) : null,
            kommoContactId: contactoId != null ? String(contactoId) : null,
            kommoPipelineId: l.pipeline_id != null ? String(l.pipeline_id) : null,
        };
    });
}
// ─── HELPERS DE FIRESTORE ───────────────────────────────────────────────────
async function obtenerUidPorEmail(email, gestoriaId) {
    if (!email)
        return null;
    const snap = await db.collection('equipo')
        .where('gestoriaId', '==', gestoriaId)
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();
    if (snap.empty) {
        firebase_functions_1.logger.warn('[kommo] No se encontró usuario en equipo para email:', email);
        return null;
    }
    return snap.docs[0].id; // El ID del documento en 'equipo' es el UID del usuario
}
async function crearProspectoYConsulta(p) {
    var _a, _b, _c, _d, _e, _f;
    const tipoConsulta = p.patente ? 'dominio' : 'dni';
    const pRef = await db.collection('prospectos').add({
        gestoriaId: p.gestoriaId,
        nombre: p.nombre || 'Sin nombre',
        apellido: (_a = p.apellido) !== null && _a !== void 0 ? _a : '',
        telefono: (_b = p.telefono) !== null && _b !== void 0 ? _b : '',
        email: (_c = p.email) !== null && _c !== void 0 ? _c : '',
        localidad: '',
        etapa: 'nuevo', color: 'azul',
        tipoTramite: 'descargo_multa',
        patente: p.patente, documento: p.dni,
        descripcion: p.mensaje || `Consulta Kommo ${p.patente || p.dni}`,
        montoCierre: 0, formaPago: '', fechaCierre: '',
        tareas: [], etiquetas: ['kommo'],
        leadId: p.leadId, asesorId: p.asesorId || 'sin_asignar', creadoPor: 'kommo',
        orden: Date.now(), creadoEn: now(), actualizadoEn: now(),
    });
    const cRef = await db.collection('consultasInfracciones').add(Object.assign(Object.assign({ gestoriaId: p.gestoriaId, tipoConsulta }, (tipoConsulta === 'dominio' ? { dominio: p.patente } : { dni: p.dni, tipoDocumento: 'DNI' })), { contacto: { nombre: `${p.nombre} ${(_d = p.apellido) !== null && _d !== void 0 ? _d : ''}`.trim(), whatsapp: (_e = p.telefono) !== null && _e !== void 0 ? _e : '', email: (_f = p.email) !== null && _f !== void 0 ? _f : '' }, origen: p.canal, estado: 'pendiente', prospectoId: pRef.id, leadId: p.leadId, asesorId: p.asesorId || 'sin_asignar', creadaEn: now() }));
    return { prospectoId: pRef.id, consultaId: cRef.id };
}
// ─── NÚCLEO ─────────────────────────────────────────────────────────────────
async function procesarLead(b) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const gestoriaId = (_a = process.env.GESTORIA_ID_WEB) !== null && _a !== void 0 ? _a : 'gestoria-paz';
    let patente = b.patente;
    if (patente && !validarPatente(patente))
        patente = '';
    // 1. Determinar asesor y línea según el Pipeline de Kommo
    let asesorEmail = '';
    let lineaOrigen = '';
    if (b.kommoPipelineId && MAPEO_PIPELINES_KOMMO[b.kommoPipelineId]) {
        asesorEmail = MAPEO_PIPELINES_KOMMO[b.kommoPipelineId].email;
        lineaOrigen = MAPEO_PIPELINES_KOMMO[b.kommoPipelineId].linea;
    }
    else {
        firebase_functions_1.logger.warn('[kommo] Pipeline no mapeado o sin ID', { pipelineId: b.kommoPipelineId });
    }
    const asesorId = await obtenerUidPorEmail(asesorEmail, gestoriaId);
    // 2. Dedup nivel 1: kommoLeadId / nivel 2: teléfono
    let existingId = null;
    if (b.kommoLeadId) {
        const dup = await db.collection('leads')
            .where('gestoriaId', '==', gestoriaId).where('kommoLeadId', '==', b.kommoLeadId)
            .limit(1).get();
        if (!dup.empty)
            existingId = dup.docs[0].id;
    }
    if (!existingId && b.telefono) {
        const dup = await db.collection('leads')
            .where('gestoriaId', '==', gestoriaId).where('telefono', '==', b.telefono)
            .limit(1).get();
        if (!dup.empty)
            existingId = dup.docs[0].id;
    }
    // ── Ya existe → completar campos faltantes ──
    if (existingId) {
        const ref = db.collection('leads').doc(existingId);
        const ld = ((_b = (await ref.get()).data()) !== null && _b !== void 0 ? _b : {});
        const patch = { actualizadoEn: now() };
        if (patente && !ld.patente)
            patch.patente = patente;
        if (b.dni && !ld.documento)
            patch.documento = b.dni;
        if (b.telefono && !ld.telefono)
            patch.telefono = b.telefono;
        if (b.email && !ld.email)
            patch.email = b.email;
        if (b.mensaje && !ld.consulta)
            patch.consulta = b.mensaje;
        if (lineaOrigen && !ld.lineaOrigen)
            patch.lineaOrigen = lineaOrigen;
        if (asesorId && !ld.asesorId)
            patch.asesorId = asesorId;
        await ref.update(patch);
        const patenteFinal = patente || ld.patente || '';
        const dniFinal = b.dni || ld.documento || '';
        const clave = patenteFinal || dniFinal;
        if (!ld.consultaId && clave) {
            const ids = await crearProspectoYConsulta({
                gestoriaId, nombre: (_c = ld.nombre) !== null && _c !== void 0 ? _c : b.nombre, apellido: (_d = ld.apellido) !== null && _d !== void 0 ? _d : '',
                telefono: (_e = ld.telefono) !== null && _e !== void 0 ? _e : b.telefono, email: (_f = ld.email) !== null && _f !== void 0 ? _f : b.email,
                patente: patenteFinal, dni: dniFinal,
                mensaje: (_g = ld.consulta) !== null && _g !== void 0 ? _g : b.mensaje, canal: (_h = ld.canal) !== null && _h !== void 0 ? _h : b.canal,
                leadId: existingId, asesorId: ld.asesorId || asesorId,
            });
            await ref.update(ids);
            return Object.assign({ ok: true, leadId: existingId, duplicado: true, encolado: true }, ids);
        }
        return { ok: true, leadId: existingId, duplicado: true, encolado: !!ld.consultaId };
    }
    // ── No existe → crear ──
    const [nom, ...resto] = (b.nombre || 'Sin nombre').split(' ');
    const apellido = resto.join(' ');
    const base = {
        gestoriaId,
        nombre: nom, apellido,
        telefono: b.telefono, email: b.email,
        documento: b.dni, patente,
        canal: b.canal, origenSistema: 'kommo',
        estado: 'nuevo', prioridad: 'normal',
        tipoTramiteInteres: 'descargo_multa',
        consulta: b.mensaje || `Lead Kommo vía ${b.canal}`,
        kommoLeadId: b.kommoLeadId, kommoContactId: b.kommoContactId,
        kommoPipelineId: b.kommoPipelineId,
        lineaOrigen: lineaOrigen || 'desconocida',
        asesorId: asesorId || 'sin_asignar',
        creadoPor: 'kommo', creadoEn: now(), actualizadoEn: now(),
    };
    let leadId;
    if (b.kommoLeadId) {
        leadId = `kommo_${gestoriaId}_${b.kommoLeadId}`;
        await db.collection('leads').doc(leadId).set(base, { merge: true });
    }
    else {
        leadId = (await db.collection('leads').add(base)).id;
    }
    let ids = {};
    if (patente || b.dni) {
        ids = await crearProspectoYConsulta({
            gestoriaId, nombre: b.nombre, apellido,
            telefono: b.telefono, email: b.email, patente, dni: b.dni,
            mensaje: b.mensaje, canal: b.canal, leadId, asesorId,
        });
        await db.collection('leads').doc(leadId).update(ids);
    }
    await db.collection('eventos').add({
        gestoriaId, tipo: 'lead.creado', entidad: 'lead', entidadId: leadId,
        entidadLabel: b.nombre || b.telefono,
        actor: { id: 'kommo', nombre: 'Kommo', tipo: 'sistema' },
        payload: { canal: b.canal, origenSistema: 'kommo', kommoLeadId: b.kommoLeadId, lineaOrigen, asesorId },
        resumen: `Nuevo lead ${b.nombre || b.telefono} vía Kommo (${b.canal}) - Asignado a ${asesorEmail || 'sin asignar'}`,
        timestamp: now(),
    });
    firebase_functions_1.logger.info('[kommo] lead nuevo procesado', { leadId, kommoLeadId: b.kommoLeadId, lineaOrigen, asesorId });
    return Object.assign({ ok: true, leadId, duplicado: false }, ids);
}
// ─── HANDLER ────────────────────────────────────────────────────────────────
exports.kommoRecibirLead = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 30 }, async (req, res) => {
    var _a, _b;
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method === 'GET') {
        res.status(200).json({ ok: true, status: 'active' });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ ok: false });
        return;
    }
    const key = req.headers['x-kommo-key'] || req.query.key || '';
    if (!process.env.KOMMO_WEBHOOK_KEY || key !== process.env.KOMMO_WEBHOOK_KEY) {
        res.status(401).json({ ok: false, error: 'Key inválida' });
        return;
    }
    const body = (_a = req.body) !== null && _a !== void 0 ? _a : {};
    const esNativo = Boolean((body === null || body === void 0 ? void 0 : body.leads) || (body === null || body === void 0 ? void 0 : body.contacts));
    const entrantes = esNativo ? desdeKommoNativo(body) : [desdeFormatoSimple(body)];
    if (entrantes.length === 0 || entrantes.every(e => !e.nombre && !e.telefono)) {
        firebase_functions_1.logger.info('[kommo] webhook recibido, sin leads parseables', { bodyKeys: Object.keys(body !== null && body !== void 0 ? body : {}) });
    }
    const resultados = [];
    for (const b of entrantes) {
        if (!b.nombre && !b.telefono) {
            resultados.push({ ok: false, error: 'Sin nombre ni teléfono' });
            continue;
        }
        try {
            resultados.push(await procesarLead(b));
        }
        catch (e) {
            firebase_functions_1.logger.error('[kommo] error procesando lead', {
                kommoLeadId: b.kommoLeadId, telefono: b.telefono, error: e === null || e === void 0 ? void 0 : e.message,
            });
            resultados.push({ ok: false, error: (_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : 'Error interno', kommoLeadId: b.kommoLeadId });
        }
    }
    firebase_functions_1.logger.info('[kommo] batch procesado', {
        total: entrantes.length, ok: resultados.filter(r => r === null || r === void 0 ? void 0 : r.ok).length,
    });
    res.status(200).json({ ok: true, procesados: resultados });
});
//# sourceMappingURL=kommoRecibirLead.js.map