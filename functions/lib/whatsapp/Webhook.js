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
exports.handleVerification = handleVerification;
exports.handleIncomingMessage = handleIncomingMessage;
const admin = __importStar(require("firebase-admin"));
const Utils_1 = require("../utils/Utils");
const clasificador_1 = require("./clasificador");
const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
// ─── VERIFICACIÓN DEL WEBHOOK (GET) ──────────────────────────────────────────
function handleVerification(query, res) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token === (0, Utils_1.getVerifyToken)()) {
        console.log('[WA Webhook] Verificación OK');
        // Meta espera el challenge como TEXTO en el body. Pasar un número hace que
        // Express lo interprete como status code y rompe (ERR_HTTP_INVALID_STATUS_CODE).
        res.status(200).send(String(challenge !== null && challenge !== void 0 ? challenge : ''));
    }
    else {
        console.warn('[WA Webhook] Verificación FALLIDA — token incorrecto');
        res.status(403).send('Forbidden');
    }
}
// ─── PROCESAR WEBHOOK (POST) ──────────────────────────────────────────────────
async function handleIncomingMessage(payload) {
    var _a, _b, _c, _d, _e;
    const gestoriaId = (0, Utils_1.getGestoriaId)();
    for (const entry of (_a = payload.entry) !== null && _a !== void 0 ? _a : []) {
        for (const change of (_b = entry.changes) !== null && _b !== void 0 ? _b : []) {
            const { messages = [], contacts = [], statuses = [], metadata, errors = [] } = change.value;
            for (const error of errors) {
                console.warn('[WA] Error de mensaje:', error);
                await registrarErrorMensaje(gestoriaId, error);
            }
            for (const status of statuses) {
                await actualizarEstadoMensaje(gestoriaId, status.id, status.status);
            }
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const contact = (_c = contacts[i]) !== null && _c !== void 0 ? _c : contacts[0];
                const nombre = (_e = (_d = contact === null || contact === void 0 ? void 0 : contact.profile) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : '';
                await procesarMensaje(gestoriaId, msg, nombre, metadata);
            }
        }
    }
}
async function cargarConfigWA() {
    var _a, _b, _c, _d, _e;
    const cfgRef = db().doc('configuracion/gestor');
    const data = (_a = (await cfgRef.get()).data()) !== null && _a !== void 0 ? _a : {};
    return {
        lineas: ((_c = (_b = data.ruteoWhatsApp) === null || _b === void 0 ? void 0 : _b.lineas) !== null && _c !== void 0 ? _c : []),
        keywords: ((_e = (_d = data.clasificacionMultas) === null || _d === void 0 ? void 0 : _d.keywords) !== null && _e !== void 0 ? _e : clasificador_1.KEYWORDS_MULTA_DEFAULT),
        cfgRef,
    };
}
// Resuelve el dueño de la línea y, si hace falta, auto-completa el phone_number_id.
async function resolverDueno(cfg, phoneNumberId, displayPhoneRaw) {
    const { lineas, cfgRef } = cfg;
    if (lineas.length === 0) {
        console.warn('[WA] Sin ruteoWhatsApp configurado en configuracion/gestor');
        return null;
    }
    const porId = lineas.find(l => l.phoneNumberId && l.phoneNumberId === phoneNumberId);
    if (porId)
        return porId;
    const dp = (0, Utils_1.normalizarTelefono)(displayPhoneRaw);
    const idx = lineas.findIndex(l => (0, Utils_1.normalizarTelefono)(l.displayPhone) === dp);
    if (idx >= 0) {
        if (!lineas[idx].phoneNumberId && phoneNumberId) {
            lineas[idx].phoneNumberId = phoneNumberId;
            await cfgRef.set({ ruteoWhatsApp: { lineas } }, { merge: true }).catch(() => { });
            console.log(`[WA] phone_number_id auto-completado → ${lineas[idx].nombre}: ${phoneNumberId}`);
        }
        return lineas[idx];
    }
    console.warn(`[WA] Número sin ruteo: pnid=${phoneNumberId} display=${dp}`);
    return null;
}
// ─── PROCESAR UN MENSAJE INDIVIDUAL ──────────────────────────────────────────
async function procesarMensaje(gestoriaId, msg, nombre, metadata) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const telefono = (0, Utils_1.normalizarTelefono)(msg.from);
    const waMessageId = msg.id;
    const texto = extraerTexto(msg);
    const tipo = mapTipo(msg.type);
    const ts = admin.firestore.Timestamp.fromMillis(Number(msg.timestamp) * 1000);
    const phoneNumberId = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.phone_number_id) !== null && _a !== void 0 ? _a : '';
    const displayPhone = (_b = metadata === null || metadata === void 0 ? void 0 : metadata.display_phone_number) !== null && _b !== void 0 ? _b : '';
    const referral = (_c = msg.referral) !== null && _c !== void 0 ? _c : null;
    // ── 1. Deduplicación ──────────────────────────────────────────────────────
    const existing = await db()
        .collectionGroup('mensajes')
        .where('waMessageId', '==', waMessageId)
        .limit(1)
        .get();
    if (!existing.empty) {
        console.log(`[WA] Mensaje duplicado ignorado: ${waMessageId}`);
        return;
    }
    // ── 2. Config + clasificación del texto ───────────────────────────────────
    const cfg = await cargarConfigWA();
    const esMulta = (0, clasificador_1.esConsultaMulta)(texto, cfg.keywords);
    const dato = (0, clasificador_1.detectarDatoInfraccion)(texto); // patente/DNI o null
    const convRef = db().collection('conversacionesWA').doc(telefono);
    const convSnap = await convRef.get();
    const esNueva = !convSnap.exists;
    const owner = esNueva ? await resolverDueno(cfg, phoneNumberId, displayPhone) : null;
    const batch = db().batch();
    if (esNueva) {
        const clienteId = await buscarClientePorTelefono(gestoriaId, telefono);
        const prospectoId = clienteId
            ? undefined
            : await buscarProspectoPorTelefono(gestoriaId, telefono);
        const convData = {
            gestoriaId,
            telefono,
            nombre: nombre || telefono,
            ultimoMensaje: texto,
            ultimaActividad: ts,
            estado: 'nueva',
            asignadoA: (_d = owner === null || owner === void 0 ? void 0 : owner.uid) !== null && _d !== void 0 ? _d : '',
            asignadoNombre: (_e = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _e !== void 0 ? _e : '',
            noLeidos: 1,
            waPhoneNumberId: phoneNumberId,
            waDisplayPhone: displayPhone,
            creadoEn: ts,
            lineaOrigen: (_f = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _f !== void 0 ? _f : 'sin ruteo',
        };
        if (clienteId)
            convData.clienteId = clienteId;
        if (prospectoId)
            convData.prospectoId = prospectoId;
        // Si es multa → dejamos una consulta SUGERIDA (la confirma la secretaria).
        // Prellenamos con la patente/DNI detectado; si no hubo, queda vacío.
        if (esMulta) {
            convData.consultaSugerida = construirSugerida(dato, ts);
        }
        if (!clienteId && !prospectoId) {
            const leadId = await crearLeadDesdeWA({
                gestoriaId, telefono, nombre, texto,
                owner, phoneNumberId, displayPhone, referral, esMulta, batch,
            });
            if (leadId)
                convData.leadId = leadId;
        }
        batch.set(convRef, convData);
    }
    else {
        const prev = (_g = convSnap.data()) !== null && _g !== void 0 ? _g : {};
        const update = Object.assign({ ultimoMensaje: texto, ultimaActividad: ts, noLeidos: admin.firestore.FieldValue.increment(1) }, (nombre && prev.nombre === telefono ? { nombre } : {}));
        // La patente/multa puede llegar recién en un mensaje posterior. Si ya hay
        // una consulta CONFIRMADA, no la tocamos.
        const sugActual = prev.consultaSugerida;
        const yaConfirmada = (sugActual === null || sugActual === void 0 ? void 0 : sugActual.estado) === 'confirmada';
        if (!yaConfirmada && (esMulta || dato)) {
            update.consultaSugerida = construirSugerida(dato !== null && dato !== void 0 ? dato : (sugActual ? { tipo: sugActual.tipo, valor: sugActual.valor } : null), ts);
            if (esMulta && prev.leadId) {
                await marcarLeadComoMulta(String(prev.leadId)).catch(() => { });
            }
        }
        // `update` es dinámico (Record<string, unknown>); batch.update usa UpdateData,
        // más estricto que set. Casteamos en el punto de uso.
        batch.update(convRef, update);
    }
    // ── 3. Guardar el mensaje ─────────────────────────────────────────────────
    const msgRef = convRef.collection('mensajes').doc();
    batch.set(msgRef, {
        gestoriaId, waMessageId,
        direccion: 'entrante', tipo, texto, timestamp: ts,
    });
    await batch.commit();
    // ── 4. Marcar leído + bienvenida (desde el MISMO número que recibió) ──────
    await (0, Utils_1.markMessageRead)(waMessageId, phoneNumberId).catch(() => { });
    if (esNueva) {
        await enviarBienvenida(telefono, phoneNumberId).catch(err => console.warn('[WA] No se pudo enviar bienvenida:', err));
    }
    console.log(`[WA] ${telefono} -> "${texto.slice(0, 40)}" | multa:${esMulta} dato:${(_h = dato === null || dato === void 0 ? void 0 : dato.valor) !== null && _h !== void 0 ? _h : '-'} dueno:${(_j = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _j !== void 0 ? _j : 'sin ruteo'}`);
}
// Construye el objeto consultaSugerida (estado 'sugerida', pendiente de confirmar).
function construirSugerida(dato, ts) {
    var _a, _b;
    return {
        tipo: (_a = dato === null || dato === void 0 ? void 0 : dato.tipo) !== null && _a !== void 0 ? _a : 'dominio',
        valor: (_b = dato === null || dato === void 0 ? void 0 : dato.valor) !== null && _b !== void 0 ? _b : '',
        estado: 'sugerida',
        detectadoEn: ts,
    };
}
// ─── CREAR LEAD DESDE WHATSAPP ───────────────────────────────────────────────
async function crearLeadDesdeWA(p) {
    var _a, _b, _c, _d;
    const { gestoriaId, telefono, nombre, texto, owner, phoneNumberId, displayPhone, referral, esMulta, batch } = p;
    if (telefono) {
        const dup = await db().collection('leads')
            .where('gestoriaId', '==', gestoriaId)
            .where('telefono', '==', telefono)
            .limit(1)
            .get();
        if (!dup.empty)
            return dup.docs[0].id;
    }
    const [nom, ...resto] = (nombre || 'Contacto WA').split(' ');
    const apellido = resto.join(' ');
    const leadRef = db().collection('leads').doc();
    batch.set(leadRef, {
        gestoriaId,
        nombre: nom, apellido,
        telefono, email: '',
        documento: '', patente: '',
        canal: 'whatsapp', origenSistema: 'wa_api',
        estado: 'nuevo', prioridad: 'normal',
        tipoTramiteInteres: esMulta ? 'descargo_multa' : '', // clasificacion
        consulta: texto || 'Consulta por WhatsApp',
        asignadoA: (_a = owner === null || owner === void 0 ? void 0 : owner.uid) !== null && _a !== void 0 ? _a : '',
        asignadoNombre: (_b = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _b !== void 0 ? _b : '',
        waPhoneNumberId: phoneNumberId,
        waDisplayPhone: displayPhone,
        referralWA: referral !== null && referral !== void 0 ? referral : null,
        creadoPor: 'whatsapp',
        creadoEn: now(), actualizadoEn: now(),
    });
    const evtRef = db().collection('eventos').doc();
    batch.set(evtRef, {
        gestoriaId,
        tipo: 'lead.creado', entidad: 'lead', entidadId: leadRef.id,
        entidadLabel: nombre || telefono,
        actor: { id: 'whatsapp', nombre: `WhatsApp - ${(_c = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _c !== void 0 ? _c : 'sin ruteo'}`, tipo: 'sistema' },
        payload: {
            canal: 'whatsapp', origenSistema: 'wa_api',
            waPhoneNumberId: phoneNumberId,
            asignadoA: (_d = owner === null || owner === void 0 ? void 0 : owner.uid) !== null && _d !== void 0 ? _d : '',
            tipoTramiteInteres: esMulta ? 'descargo_multa' : '',
            referral: referral !== null && referral !== void 0 ? referral : null,
        },
        resumen: `Nuevo lead ${nombre || telefono} por WhatsApp${owner ? ` (${owner.nombre})` : ''}${esMulta ? ' - multa' : ''}`,
        timestamp: now(),
    });
    return leadRef.id;
}
// Marca tipoTramiteInteres='descargo_multa' solo si el lead no tenia otro tipo.
async function marcarLeadComoMulta(leadId) {
    var _a;
    const ref = db().collection('leads').doc(leadId);
    const snap = await ref.get();
    const t = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.tipoTramiteInteres;
    if (!t)
        await ref.update({ tipoTramiteInteres: 'descargo_multa', actualizadoEn: now() });
}
// ─── ACTUALIZAR ESTADO DE MENSAJE SALIENTE ────────────────────────────────────
async function actualizarEstadoMensaje(gestoriaId, waMessageId, status) {
    var _a;
    const snap = await db()
        .collectionGroup('mensajes')
        .where('gestoriaId', '==', gestoriaId)
        .where('waMessageId', '==', waMessageId)
        .where('direccion', '==', 'saliente')
        .limit(1)
        .get();
    if (!snap.empty) {
        const estadoMap = {
            sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'error',
        };
        await snap.docs[0].ref.update({ estado: (_a = estadoMap[status]) !== null && _a !== void 0 ? _a : status });
    }
}
// ─── REGISTRAR ERROR DE MENSAJE ──────────────────────────────────────────────
async function registrarErrorMensaje(gestoriaId, error) {
    var _a, _b;
    await db().collection('whatsappErrors').add({
        gestoriaId,
        codigo: error.code,
        titulo: error.title,
        detalles: (_b = (_a = error.error_data) === null || _a === void 0 ? void 0 : _a.details) !== null && _b !== void 0 ? _b : '',
        timestamp: now(),
    });
}
// ─── MENSAJE DE BIENVENIDA ────────────────────────────────────────────────────
async function enviarBienvenida(telefono, phoneNumberId) {
    var _a;
    const numeroLlamadas = (_a = process.env.NUMERO_LLAMADAS) !== null && _a !== void 0 ? _a : '';
    const textoLlamadas = numeroLlamadas
        ? `\n\nPara llamadas de WhatsApp escribinos al:\n📞 ${numeroLlamadas}`
        : '';
    const texto = `¡Hola! 👋 Gracias por escribir a *Gestoría Paz*.` +
        `\n\nSomos tu gestoría de confianza para trámites del automotor. ` +
        `Un asesor te responde en breve. 🟠` +
        textoLlamadas +
        `\n\n_Gestoría Paz · Trámites sin vueltas._`;
    await (0, Utils_1.sendTextMessage)(telefono, texto, phoneNumberId);
}
// ─── HELPERS DE BÚSQUEDA ─────────────────────────────────────────────────────
async function buscarClientePorTelefono(gestoriaId, telefono) {
    const variantes = [telefono, telefono.replace(/^549/, '0'), telefono.slice(-10)];
    for (const tel of variantes) {
        const snap = await db().collection('clientes')
            .where('gestoriaId', '==', gestoriaId)
            .where('telefono', '==', tel)
            .limit(1)
            .get();
        if (!snap.empty)
            return snap.docs[0].id;
    }
    return undefined;
}
async function buscarProspectoPorTelefono(gestoriaId, telefono) {
    const variantes = [telefono, telefono.slice(-10)];
    for (const tel of variantes) {
        const snap = await db().collection('prospectos')
            .where('gestoriaId', '==', gestoriaId)
            .where('telefono', '==', tel)
            .limit(1)
            .get();
        if (!snap.empty)
            return snap.docs[0].id;
    }
    return undefined;
}
// ─── UTIL: EXTRAER TEXTO ─────────────────────────────────────────────────────
function extraerTexto(msg) {
    var _a, _b;
    if (msg.text)
        return msg.text.body;
    if (msg.image)
        return (_a = msg.image.caption) !== null && _a !== void 0 ? _a : '📷 Imagen';
    if (msg.audio)
        return '🎵 Audio';
    if (msg.document)
        return `📄 ${(_b = msg.document.filename) !== null && _b !== void 0 ? _b : 'Documento'}`;
    if (msg.sticker)
        return '🎭 Sticker';
    return `[${msg.type}]`;
}
function mapTipo(type) {
    var _a;
    const map = {
        text: 'texto', image: 'imagen', audio: 'audio',
        document: 'documento', sticker: 'sticker',
    };
    return (_a = map[type]) !== null && _a !== void 0 ? _a : 'texto';
}
//# sourceMappingURL=Webhook.js.map