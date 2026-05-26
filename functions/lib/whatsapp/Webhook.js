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
const db = () => admin.firestore();
// ─── VERIFICACIÓN DEL WEBHOOK (GET) ──────────────────────────────────────────
// Meta llama a GET cuando se configura el webhook por primera vez.
// Debe responder con hub.challenge si el token coincide.
function handleVerification(query, res) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token === (0, Utils_1.getVerifyToken)()) {
        console.log('[WA Webhook] Verificación OK');
        res.status(200).send(Number(challenge));
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
            const { messages = [], contacts = [], statuses = [] } = change.value;
            // ── Actualizar estados de mensajes salientes (delivered/read) ──────────
            for (const status of statuses) {
                await actualizarEstadoMensaje(gestoriaId, status.id, status.status);
            }
            // ── Procesar mensajes entrantes ────────────────────────────────────────
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const contact = (_c = contacts[i]) !== null && _c !== void 0 ? _c : contacts[0];
                const nombre = (_e = (_d = contact === null || contact === void 0 ? void 0 : contact.profile) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : '';
                await procesarMensaje(gestoriaId, msg, nombre);
            }
        }
    }
}
// ─── PROCESAR UN MENSAJE INDIVIDUAL ──────────────────────────────────────────
async function procesarMensaje(gestoriaId, msg, nombre) {
    var _a, _b;
    const telefono = (0, Utils_1.normalizarTelefono)(msg.from);
    const waMessageId = msg.id;
    const texto = extraerTexto(msg);
    const tipo = mapTipo(msg.type);
    const ts = admin.firestore.Timestamp.fromMillis(Number(msg.timestamp) * 1000);
    // ── 1. Deduplicación — ignorar si ya procesamos este waMessageId ───────────
    const existing = await db()
        .collectionGroup('mensajes')
        .where('waMessageId', '==', waMessageId)
        .limit(1)
        .get();
    if (!existing.empty) {
        console.log(`[WA] Mensaje duplicado ignorado: ${waMessageId}`);
        return;
    }
    // ── 2. Upsert de la conversación ──────────────────────────────────────────
    const convRef = db().collection('conversacionesWA').doc(telefono);
    const convSnap = await convRef.get();
    const batch = db().batch();
    if (!convSnap.exists) {
        // Conversación nueva — buscar si el teléfono existe como cliente/prospecto
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
            asignadoA: '',
            noLeidos: 1,
            waPhoneNumberId: (_a = process.env.WHATSAPP_PHONE_NUMBER_ID) !== null && _a !== void 0 ? _a : '',
            creadoEn: ts,
        };
        if (clienteId)
            convData.clienteId = clienteId;
        if (prospectoId)
            convData.prospectoId = prospectoId;
        batch.set(convRef, convData);
        // Si es número nuevo sin prospecto → crear prospecto en Pipeline
        if (!clienteId && !prospectoId) {
            await crearProspectoDesdeWA(gestoriaId, telefono, nombre, texto, batch);
        }
    }
    else {
        // Conversación existente — actualizar preview + contador
        batch.update(convRef, Object.assign({ ultimoMensaje: texto, ultimaActividad: ts, noLeidos: admin.firestore.FieldValue.increment(1) }, (nombre && ((_b = convSnap.data()) === null || _b === void 0 ? void 0 : _b.nombre) === telefono ? { nombre } : {})));
    }
    // ── 3. Guardar el mensaje en la subcolección ──────────────────────────────
    const msgRef = convRef.collection('mensajes').doc();
    batch.set(msgRef, {
        gestoriaId,
        waMessageId,
        direccion: 'entrante',
        tipo,
        texto,
        timestamp: ts,
    });
    await batch.commit();
    // ── 4. Marcar como leído en Meta (buenas prácticas UX) ───────────────────
    await (0, Utils_1.markMessageRead)(waMessageId).catch(() => { });
    // ── 5. Mensaje de bienvenida en primer contacto ───────────────────────────
    if (!convSnap.exists) {
        await enviarBienvenida(telefono).catch(err => console.warn('[WA] No se pudo enviar bienvenida:', err));
    }
    console.log(`[WA] Mensaje procesado: ${telefono} → "${texto.slice(0, 40)}"`);
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
            sent: 'enviado',
            delivered: 'entregado',
            read: 'leido',
            failed: 'error',
        };
        await snap.docs[0].ref.update({ estado: (_a = estadoMap[status]) !== null && _a !== void 0 ? _a : status });
    }
}
// ─── CREAR PROSPECTO EN PIPELINE ─────────────────────────────────────────────
async function crearProspectoDesdeWA(gestoriaId, telefono, nombre, texto, batch) {
    const prospectoRef = db().collection('prospectos').doc();
    batch.set(prospectoRef, {
        gestoriaId,
        nombre: nombre || 'Contacto WA',
        apellido: '',
        telefono,
        email: '',
        localidad: '',
        etapa: 'nuevo',
        color: 'azul',
        tipoTramite: 'transferencia', // default — el agente lo actualiza
        patente: '',
        descripcion: `Primer mensaje: "${texto.slice(0, 120)}"`,
        montoCierre: 0,
        formaPago: '',
        fechaCierre: '',
        tareas: [],
        etiquetas: ['whatsapp'],
        asignadoA: '',
        creadoPor: 'whatsapp_bot',
        orden: Date.now(),
        origenWA: true, // campo extra para filtrar en Pipeline
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Actualizar la conversación con el prospectoId
    const convRef = db().collection('conversacionesWA').doc(telefono);
    batch.update(convRef, { prospectoId: prospectoRef.id });
}
// ─── MENSAJE DE BIENVENIDA ────────────────────────────────────────────────────
async function enviarBienvenida(telefono) {
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
    await (0, Utils_1.sendTextMessage)(telefono, texto);
}
// ─── HELPERS DE BÚSQUEDA ─────────────────────────────────────────────────────
async function buscarClientePorTelefono(gestoriaId, telefono) {
    // Buscar con y sin código de país
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
        text: 'texto',
        image: 'imagen',
        audio: 'audio',
        document: 'documento',
        sticker: 'sticker',
    };
    return (_a = map[type]) !== null && _a !== void 0 ? _a : 'texto';
}
//# sourceMappingURL=Webhook.js.map