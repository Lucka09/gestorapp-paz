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
const media_1 = require("./media");
const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
// Limpia patente/DNI a solo A-Z0-9 en mayúsculas (mismo criterio que la web).
const limpiarValor = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const gestoriaId = (0, Utils_1.getGestoriaId)();
    for (const entry of (_a = payload.entry) !== null && _a !== void 0 ? _a : []) {
        for (const change of (_b = entry.changes) !== null && _b !== void 0 ? _b : []) {
            const { messages = [], contacts = [], statuses = [], metadata, errors = [], message_echoes = [], // field: smb_message_echoes
            history = [], // field: history
             } = ((_c = change.value) !== null && _c !== void 0 ? _c : {});
            const phoneNumberId = (_d = metadata === null || metadata === void 0 ? void 0 : metadata.phone_number_id) !== null && _d !== void 0 ? _d : '';
            // ── DIAGNÓSTICO — dejalo unos días y después sacalo ──────────────────
            console.log('[WA][diag] field=%s keys=%s', change.field, Object.keys((_e = change.value) !== null && _e !== void 0 ? _e : {}).join(','));
            // ── HISTORIAL (field: history) ───────────────────────────────────────
            // Llega en tandas después del onboarding. Es un import masivo: NO crea
            // leads, NO clasifica multas, NO manda bienvenida, NO toca noLeidos.
            if (change.field === 'history' && history.length) {
                for (const chunk of history) {
                    try {
                        await procesarHistorial(gestoriaId, chunk, phoneNumberId);
                    }
                    catch (e) {
                        console.error('[WA][hist] error en chunk', {
                            orden: (_f = chunk === null || chunk === void 0 ? void 0 : chunk.metadata) === null || _f === void 0 ? void 0 : _f.chunk_order, msg: e === null || e === void 0 ? void 0 : e.message,
                        });
                    }
                }
                continue;
            }
            // ── ECOS (field: smb_message_echoes) ─────────────────────────────────
            // Mensajes que los secretarios mandan desde el celular.
            // OJO: acá `from` es el número de la gestoría y `to` el del cliente.
            if (message_echoes.length) {
                for (const eco of message_echoes) {
                    try {
                        await procesarEcoSaliente(gestoriaId, eco);
                    }
                    catch (e) {
                        console.error('[WA][eco] error', { id: eco === null || eco === void 0 ? void 0 : eco.id, msg: e === null || e === void 0 ? void 0 : e.message });
                    }
                }
                continue;
            }
            // ── FLUJO NORMAL (sin cambios) ───────────────────────────────────────
            for (const error of errors) {
                console.warn('[WA] Error de mensaje:', error);
                try {
                    await registrarErrorMensaje(gestoriaId, error);
                }
                catch (e) {
                    console.warn('[WA] fallo registrarErrorMensaje:', e === null || e === void 0 ? void 0 : e.message);
                }
            }
            for (const status of statuses) {
                try {
                    await actualizarEstadoMensaje(gestoriaId, status.id, status.status);
                }
                catch (e) {
                    console.warn('[WA] fallo actualizarEstadoMensaje:', e === null || e === void 0 ? void 0 : e.message);
                }
            }
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const contact = (_g = contacts[i]) !== null && _g !== void 0 ? _g : contacts[0];
                const nombre = (_j = (_h = contact === null || contact === void 0 ? void 0 : contact.profile) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : '';
                try {
                    await procesarMensaje(gestoriaId, msg, nombre, metadata);
                }
                catch (e) {
                    console.error('[WA] fallo procesarMensaje:', e === null || e === void 0 ? void 0 : e.message, e === null || e === void 0 ? void 0 : e.stack);
                }
            }
        }
    }
}
async function procesarEcoSaliente(gestoriaId, eco) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const telefonoCliente = (0, Utils_1.normalizarTelefono)(String((_a = eco.to) !== null && _a !== void 0 ? _a : ''));
    if (!telefonoCliente || !eco.id)
        return;
    const convRef = db().collection('conversacionesWA').doc(telefonoCliente);
    const msgRef = convRef.collection('mensajes').doc(idSeguro(eco.id));
    if ((await msgRef.get()).exists)
        return;
    const convSnap = await convRef.get();
    const texto = (_j = (_g = (_e = (_c = (_b = eco.text) === null || _b === void 0 ? void 0 : _b.body) !== null && _c !== void 0 ? _c : (_d = eco.image) === null || _d === void 0 ? void 0 : _d.caption) !== null && _e !== void 0 ? _e : (_f = eco.document) === null || _f === void 0 ? void 0 : _f.caption) !== null && _g !== void 0 ? _g : (_h = eco.document) === null || _h === void 0 ? void 0 : _h.filename) !== null && _j !== void 0 ? _j : `[${eco.type}]`;
    const tipo = mapTipo(eco.type);
    const segundos = Number((_k = eco.timestamp) !== null && _k !== void 0 ? _k : Date.now() / 1000);
    const ts = admin.firestore.Timestamp.fromMillis(Number.isFinite(segundos) ? segundos * 1000 : Date.now());
    const batch = db().batch();
    batch.set(msgRef, {
        gestoriaId,
        waMessageId: eco.id,
        direccion: 'saliente',
        tipo,
        texto,
        timestamp: ts,
        estado: 'enviado',
        origenEnvio: 'celular',
        enviadoPor: '',
    });
    // Si la conversación no existe, el secretario escribió primero desde el
    // celular a alguien que nunca nos había escrito. Se crea mínima.
    const datosConv = {
        ultimoMensaje: texto.slice(0, 120),
        ultimaActividad: ts,
        ultimoMensajeDireccion: 'saliente',
        noLeidos: 0,
        alertaSinRespuestaEn: admin.firestore.FieldValue.delete(),
    };
    if (!convSnap.exists) {
        Object.assign(datosConv, {
            gestoriaId,
            telefono: telefonoCliente,
            nombre: telefonoCliente,
            estado: 'en_atencion',
            asignadoA: '',
            asignadoNombre: '',
            creadoEn: ts,
        });
    }
    batch.set(convRef, datosConv, { merge: true });
    await batch.commit();
    console.log('[WA][eco] guardado', { conv: telefonoCliente, tipo });
}
async function procesarHistorial(gestoriaId, chunk, phoneNumberId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    const { phase, chunk_order, progress } = (_a = chunk.metadata) !== null && _a !== void 0 ? _a : {};
    const threads = (_b = chunk.threads) !== null && _b !== void 0 ? _b : [];
    console.log('[WA][hist] chunk', {
        fase: phase, orden: chunk_order, progreso: progress, hilos: threads.length,
    });
    let importados = 0, saltados = 0;
    for (const thread of threads) {
        const telefono = (0, Utils_1.normalizarTelefono)(String((_c = thread.id) !== null && _c !== void 0 ? _c : ''));
        const mensajes = (_d = thread.messages) !== null && _d !== void 0 ? _d : [];
        if (!telefono || mensajes.length === 0)
            continue;
        const convRef = db().collection('conversacionesWA').doc(telefono);
        const convSnap = await convSnapSeguro(convRef);
        // Firestore: máximo 500 operaciones por batch. Dejamos margen para el
        // update de la conversación.
        const LOTE = 400;
        let ultimo = null;
        for (let i = 0; i < mensajes.length; i += LOTE) {
            const batch = db().batch();
            let enBatch = 0;
            for (const m of mensajes.slice(i, i + LOTE)) {
                if (!m.id) {
                    saltados++;
                    continue;
                }
                const msgRef = convRef.collection('mensajes').doc(idSeguro(m.id));
                // La dirección sale de history_context.from_me. Si no viene, se
                // deduce comparando `from` con el teléfono del hilo.
                const saliente = ((_e = m.history_context) === null || _e === void 0 ? void 0 : _e.from_me) === true
                    || (!!m.from && (0, Utils_1.normalizarTelefono)(m.from) !== telefono);
                const texto = (_q = (_o = (_l = (_j = (_g = (_f = m.text) === null || _f === void 0 ? void 0 : _f.body) !== null && _g !== void 0 ? _g : (_h = m.image) === null || _h === void 0 ? void 0 : _h.caption) !== null && _j !== void 0 ? _j : (_k = m.video) === null || _k === void 0 ? void 0 : _k.caption) !== null && _l !== void 0 ? _l : (_m = m.document) === null || _m === void 0 ? void 0 : _m.caption) !== null && _o !== void 0 ? _o : (_p = m.document) === null || _p === void 0 ? void 0 : _p.filename) !== null && _q !== void 0 ? _q : `[${m.type}]`;
                const segundos = Number(m.timestamp);
                const ts = admin.firestore.Timestamp.fromMillis(Number.isFinite(segundos) ? segundos * 1000 : Date.now());
                // set() sin merge sobre un doc id determinístico: si el chunk se
                // reenvía, se pisa con lo mismo. Idempotente y sin lectura previa
                // (leer 20.000 mensajes uno por uno sería carísimo).
                batch.set(msgRef, Object.assign(Object.assign({ gestoriaId, waMessageId: m.id, direccion: saliente ? 'saliente' : 'entrante', tipo: mapTipo(m.type), texto, timestamp: ts }, (saliente ? {
                    estado: ((_r = m.history_context) === null || _r === void 0 ? void 0 : _r.status) === 'read' ? 'leido' : 'enviado',
                    origenEnvio: 'celular',
                    enviadoPor: '',
                } : {})), { importadoDeHistorial: true }));
                enBatch++;
                importados++;
                if (!ultimo || ts.toMillis() > ultimo.ts.toMillis()) {
                    ultimo = { ts, texto, saliente };
                }
            }
            if (enBatch > 0)
                await batch.commit();
        }
        // ── Cabecera de la conversación ────────────────────────────────────────
        // Solo se pisa si el historial trae algo MÁS NUEVO que lo que ya hay.
        // Sin este guard, un chunk viejo retrocedería la conversación y la
        // mandaría al fondo de la Bandeja.
        if (!ultimo)
            continue;
        const actualMs = (_u = (_t = (_s = convSnap === null || convSnap === void 0 ? void 0 : convSnap.get('ultimaActividad')) === null || _s === void 0 ? void 0 : _s.toMillis) === null || _t === void 0 ? void 0 : _t.call(_s)) !== null && _u !== void 0 ? _u : 0;
        const esMasNuevo = ultimo.ts.toMillis() > actualMs;
        const datos = Object.assign(Object.assign({ gestoriaId,
            telefono, historialImportadoEn: now() }, ((convSnap === null || convSnap === void 0 ? void 0 : convSnap.exists) ? {} : {
            nombre: telefono,
            estado: 'en_atencion',
            asignadoA: '',
            asignadoNombre: '',
            noLeidos: 0, // el historial NUNCA suma pendientes
            waPhoneNumberId: phoneNumberId,
            creadoEn: ultimo.ts,
        })), (esMasNuevo ? {
            ultimoMensaje: ultimo.texto.slice(0, 120),
            ultimaActividad: ultimo.ts,
            ultimoMensajeDireccion: ultimo.saliente ? 'saliente' : 'entrante',
        } : {}));
        await convRef.set(datos, { merge: true });
    }
    console.log('[WA][hist] fin chunk', { importados, saltados, progreso: progress });
}
// getDoc que no tira si la conversación no existe
async function convSnapSeguro(ref) {
    try {
        return await ref.get();
    }
    catch (_a) {
        return null;
    }
}
async function cargarConfigWA() {
    var _a, _b, _c, _d, _e, _f, _g;
    const cfgRef = db().doc('configuracion/gestor');
    const data = (_a = (await cfgRef.get()).data()) !== null && _a !== void 0 ? _a : {};
    return {
        lineas: ((_c = (_b = data.ruteoWhatsApp) === null || _b === void 0 ? void 0 : _b.lineas) !== null && _c !== void 0 ? _c : []),
        keywords: ((_e = (_d = data.clasificacionMultas) === null || _d === void 0 ? void 0 : _d.keywords) !== null && _e !== void 0 ? _e : clasificador_1.KEYWORDS_MULTA_DEFAULT),
        // Bienvenida ON por defecto; se apaga con configuracion/gestor.bienvenidaWA.activo = false
        bienvenidaActiva: ((_g = (_f = data.bienvenidaWA) === null || _f === void 0 ? void 0 : _f.activo) !== null && _g !== void 0 ? _g : true),
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
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
    const datos = (0, clasificador_1.detectarTodosDatos)(texto); // TODAS las patentes/DNI del mensaje
    const convRef = db().collection('conversacionesWA').doc(telefono);
    const convSnap = await convRef.get();
    const esNueva = !convSnap.exists;
    const prev = esNueva ? {} : ((_d = convSnap.data()) !== null && _d !== void 0 ? _d : {});
    // Dueño de la línea (solo al abrir) + GUARD: si el secretario está inactivo,
    // la conversación cae al pool en vez de asignarse a un fantasma.
    const ownerLinea = esNueva ? await resolverDueno(cfg, phoneNumberId, displayPhone) : null;
    const owner = ownerLinea && (await estaActivo(ownerLinea.uid)) ? ownerLinea : null;
    if (ownerLinea && !owner) {
        console.warn(`[WA] Dueño de línea inactivo (${ownerLinea.nombre}) → al pool`);
    }
    // Responsable efectivo (nuevo: dueño activo; existente: asignado activo).
    let asigneeUid = '';
    let asigneeNombre = '';
    if (esNueva) {
        asigneeUid = (_e = owner === null || owner === void 0 ? void 0 : owner.uid) !== null && _e !== void 0 ? _e : '';
        asigneeNombre = (_f = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _f !== void 0 ? _f : '';
    }
    else {
        const pu = String((_g = prev.asignadoA) !== null && _g !== void 0 ? _g : '');
        if (pu && await estaActivo(pu)) {
            asigneeUid = pu;
            asigneeNombre = String((_h = prev.asignadoNombre) !== null && _h !== void 0 ? _h : '');
        }
    }
    // ── UMBRAL + MÚLTIPLES PATENTES + DATO SUELTO ─────────────────────────────
    // 1) Contexto de multa (keyword ahora o marcada antes) + patente/DNI válido →
    //    AUTO-ENCOLA todas las patentes/DNI del mensaje (agencia con varios autos).
    // 2) Patente/DNI SIN contexto de multa (cliente que manda solo la patente) →
    //    NO encola (evita basura): la deja como SUGERENCIA en el chip y AVISA al
    //    secretario para que confirme o descarte.
    // 3) Keyword sin dato válido → chip sugerido vacío (a completar a mano).
    const convEsMulta = esMulta || (!esNueva && (prev.esConsultaMulta === true || !!prev.consultaSugerida));
    const mkKey = (valor, tipoC) => `wa_${gestoriaId}_${tipoC}_${valor}_${diaAR()}`.replace(/\//g, '_');
    let consultaSugeridaConv = null;
    let encolarLista = [];
    // Aviso "llegó una patente/DNI, confirmá o descartá" (caso dato suelto sin keyword)
    let avisoSugerencia = null;
    if (datos.length > 0 && convEsMulta) {
        // Encolar TODAS las patentes/DNI detectadas
        encolarLista = datos.map(d => {
            const valor = limpiarValor(d.valor);
            const tipoC = (0, clasificador_1.tipoDeValor)(valor);
            return { tipo: tipoC, valor, dedupeKey: mkKey(valor, tipoC) };
        });
        const ult = encolarLista[encolarLista.length - 1];
        consultaSugeridaConv = {
            tipo: ult.tipo, valor: ult.valor, estado: 'confirmada', consultaId: ult.dedupeKey, detectadoEn: ts,
        };
    }
    else if (datos.length > 0 && !convEsMulta) {
        // Dato(s) suelto(s) SIN contexto → sugerencia + aviso para confirmar/descartar.
        const valores = datos.map(d => limpiarValor(d.valor));
        const d0 = datos[0];
        const tipo0 = (0, clasificador_1.tipoDeValor)(limpiarValor(d0.valor));
        consultaSugeridaConv = Object.assign({ tipo: tipo0, valor: valores[0], estado: 'sugerida', detectadoEn: ts }, (valores.length > 1 ? { valores } : {}));
        avisoSugerencia = { tipo: tipo0, valor: valores[0] };
    }
    else if (esMulta && ((_j = prev.consultaSugerida) === null || _j === void 0 ? void 0 : _j.estado) !== 'confirmada') {
        consultaSugeridaConv = construirSugerida(null, ts);
    }
    const batch = db().batch();
    let leadIdConv = esNueva
        ? undefined
        : (prev.leadId ? String(prev.leadId) : undefined);
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
            ultimoMensajeDireccion: 'entrante',
            ultimaActividad: ts,
            estado: 'nueva',
            asignadoA: (_k = owner === null || owner === void 0 ? void 0 : owner.uid) !== null && _k !== void 0 ? _k : '',
            asignadoNombre: (_l = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _l !== void 0 ? _l : '',
            noLeidos: 1,
            waPhoneNumberId: phoneNumberId,
            waDisplayPhone: displayPhone,
            creadoEn: ts,
            lineaOrigen: (_m = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _m !== void 0 ? _m : (ownerLinea ? `${ownerLinea.nombre} (inactivo)` : 'sin ruteo'),
        };
        if (clienteId)
            convData.clienteId = clienteId;
        if (prospectoId)
            convData.prospectoId = prospectoId;
        if (consultaSugeridaConv)
            convData.consultaSugerida = consultaSugeridaConv;
        if (convEsMulta)
            convData.esConsultaMulta = true;
        if (!clienteId && !prospectoId) {
            const leadId = await crearLeadDesdeWA({
                gestoriaId, telefono, nombre, texto,
                owner, phoneNumberId, displayPhone, referral, esMulta, batch,
            });
            if (leadId) {
                convData.leadId = leadId;
                leadIdConv = leadId;
            }
        }
        batch.set(convRef, convData);
    }
    else {
        const update = Object.assign({ ultimoMensaje: texto, ultimoMensajeDireccion: 'entrante', ultimaActividad: ts, noLeidos: admin.firestore.FieldValue.increment(1) }, (nombre && prev.nombre === telefono ? { nombre } : {}));
        if (consultaSugeridaConv)
            update.consultaSugerida = consultaSugeridaConv;
        if (convEsMulta && !prev.esConsultaMulta)
            update.esConsultaMulta = true;
        if (esMulta && prev.leadId) {
            await marcarLeadComoMulta(String(prev.leadId)).catch(() => { });
        }
        batch.update(convRef, update);
    }
    // ── 3. Guardar el mensaje ─────────────────────────────────────────────────
    const msgRef = convRef.collection('mensajes').doc();
    batch.set(msgRef, {
        gestoriaId, waMessageId,
        direccion: 'entrante', tipo, texto, timestamp: ts,
    });
    await batch.commit();
    // ── 3b. AUTO-ENCOLADO / AVISO DE SUGERENCIA (post-commit) ──────────────────
    const nombreContacto = String(esNueva ? (nombre || telefono) : ((_o = prev.nombre) !== null && _o !== void 0 ? _o : telefono));
    // (1) Contexto de multa → encolar TODAS las patentes/DNI. Idempotente por dato.
    let encoladasNuevas = 0;
    for (const e of encolarLista) {
        const creada = await crearConsultaEnCola({
            gestoriaId, tipo: e.tipo, valor: e.valor, dedupeKey: e.dedupeKey,
            contactoNombre: nombreContacto, telefono,
            asigneeUid, asigneeNombre, leadId: leadIdConv,
        });
        if (creada) {
            encoladasNuevas++;
            if (asigneeUid) {
                await crearAvisoConsulta({
                    gestoriaId, destinatarioId: asigneeUid,
                    tipo: e.tipo, valor: e.valor,
                    contactoNombre: nombreContacto, dedupeKey: e.dedupeKey,
                });
            }
        }
    }
    if (encoladasNuevas > 0) {
        await convRef.update({
            consultasEncoladas: admin.firestore.FieldValue.increment(encoladasNuevas),
        }).catch(() => { });
    }
    // (2) Dato suelto sin contexto → avisar al secretario para confirmar/descartar.
    if (avisoSugerencia && asigneeUid) {
        const etiqueta = avisoSugerencia.tipo === 'dominio' ? 'patente' : 'DNI';
        await db().collection('notificaciones').add({
            gestoriaId,
            destinatarioId: asigneeUid,
            titulo: 'Revisar dato recibido',
            mensaje: `${nombreContacto} envió ${etiqueta} ${avisoSugerencia.valor} sin más contexto. Confirmá si es consulta de multa o descartalo desde la Bandeja.`,
            tipo: 'general',
            entidadTipo: 'conversacionWA',
            entidadId: telefono,
            leida: false,
            creadoEn: now(),
        }).catch(err => console.warn('[WA] no se pudo avisar sugerencia:', err === null || err === void 0 ? void 0 : err.message));
    }
    // ── 3c. MEDIA ENTRANTE (foto del acta, audios, PDF) ────────────────────────
    // Bajamos el archivo de Meta y lo guardamos en Storage; la URL queda en el
    // mensaje para que la Bandeja lo muestre. Si falla, queda el placeholder.
    const media = msg.image ? { id: msg.image.id, mime: msg.image.mime_type } :
        msg.audio ? { id: msg.audio.id, mime: msg.audio.mime_type } :
            msg.document ? { id: msg.document.id, mime: msg.document.mime_type } :
                msg.sticker ? { id: msg.sticker.id, mime: msg.sticker.mime_type } :
                    null;
    if (media === null || media === void 0 ? void 0 : media.id) {
        const mediaUrl = await (0, media_1.descargarYGuardarMedia)({
            mediaId: media.id, mime: media.mime, gestoriaId, telefono, waMessageId,
        });
        if (mediaUrl) {
            await msgRef.update({ mediaUrl, mediaType: media.mime }).catch(() => { });
        }
    }
    // ── 4. Bienvenida (NO marcamos leído para no confundir la app del celular) ─
    if (esNueva && cfg.bienvenidaActiva) {
        await enviarBienvenida(telefono, phoneNumberId).catch(err => console.warn('[WA] No se pudo enviar bienvenida:', err));
        await convRef.update({ bienvenidaEnviada: true }).catch(() => { });
    }
    console.log(`[WA] ${telefono} -> "${texto.slice(0, 40)}" | multa:${esMulta} datos:${datos.length} encoladas:${encoladasNuevas} sugerencia:${(_p = avisoSugerencia === null || avisoSugerencia === void 0 ? void 0 : avisoSugerencia.valor) !== null && _p !== void 0 ? _p : '-'} dueno:${(_q = owner === null || owner === void 0 ? void 0 : owner.nombre) !== null && _q !== void 0 ? _q : (esNueva ? 'sin ruteo' : 'existente')}`);
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
// ─── AUTO-ENCOLADO: HELPERS ──────────────────────────────────────────────────
// Día AR (UTC-3) en formato YYYYMMDD. DEBE coincidir con diaAR() del frontend
// para compartir el mismo dedupeKey (auto-encolada y confirmada a mano = 1 doc).
function diaAR() {
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}
function idSeguro(wamid) {
    return String(wamid).replace(/[/\\]/g, '_').slice(0, 300);
}
// ¿El usuario existe y no está desactivado? (guard de secretario inactivo)
async function estaActivo(uid) {
    var _a;
    if (!uid)
        return false;
    try {
        const s = await db().doc(`users/${uid}`).get();
        return s.exists && ((_a = s.data()) === null || _a === void 0 ? void 0 : _a.activo) !== false;
    }
    catch (_b) {
        return false;
    }
}
// Crea la consulta en la cola con ID determinístico. create() rechaza si ya
// existe → idempotente (no reabre una consulta ya cotizada ni re-notifica).
async function crearConsultaEnCola(p) {
    var _a;
    const ref = db().collection('consultasInfracciones').doc(p.dedupeKey);
    const data = Object.assign(Object.assign(Object.assign(Object.assign({ gestoriaId: p.gestoriaId, tipoConsulta: p.tipo }, (p.tipo === 'dominio' ? { dominio: p.valor } : { dni: p.valor, tipoDocumento: 'DNI' })), { contacto: { nombre: p.contactoNombre, whatsapp: p.telefono, email: '' }, origen: 'whatsapp', estado: 'pendiente' }), (p.leadId ? { leadId: p.leadId } : {})), { asignadoA: p.asigneeUid || '', asignadoANombre: p.asigneeNombre || '', creadoPor: p.asigneeUid || 'whatsapp', creadoPorNombre: p.asigneeNombre || 'WhatsApp (auto)', creadaEn: now() });
    try {
        await ref.create(data);
        return true;
    }
    catch (e) {
        console.log(`[WA] consulta no creada (${p.dedupeKey}): ${(_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : 'ya existe'}`);
        return false;
    }
}
// Aviso in-app (dispara push por el trigger de notificaciones) al secretario.
async function crearAvisoConsulta(p) {
    const etiqueta = p.tipo === 'dominio' ? 'patente' : 'DNI';
    await db().collection('notificaciones').add({
        gestoriaId: p.gestoriaId,
        destinatarioId: p.destinatarioId,
        titulo: 'Consulta de multas lista',
        mensaje: `Consulta de ${etiqueta} ${p.valor} (${p.contactoNombre}) lista para procesar. Abrí la extensión para resolver el captcha.`,
        tipo: 'general',
        entidadTipo: 'consultaInfraccion',
        entidadId: p.dedupeKey,
        leida: false,
        creadoEn: now(),
    }).catch(err => console.warn('[WA] no se pudo crear aviso:', err === null || err === void 0 ? void 0 : err.message));
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
    // Query por UN solo campo (waMessageId) → usa el índice de collection-group
    // que ya existe (el mismo del dedupe). Evita el índice compuesto de 3 campos
    // (direccion+gestoriaId+waMessageId) que hacía fallar el webhook. El resto se
    // filtra en memoria (waMessageId es único, así que son 1-2 docs a lo sumo).
    const snap = await db()
        .collectionGroup('mensajes')
        .where('waMessageId', '==', waMessageId)
        .limit(5)
        .get();
    const doc = snap.docs.find(d => {
        const m = d.data();
        return m.direccion === 'saliente' && m.gestoriaId === gestoriaId;
    });
    if (!doc)
        return;
    const estadoMap = {
        sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'error',
    };
    await doc.ref.update({ estado: (_a = estadoMap[status]) !== null && _a !== void 0 ? _a : status });
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
        video: 'video', document: 'documento', sticker: 'sticker',
    };
    return (_a = map[type]) !== null && _a !== void 0 ? _a : 'texto';
}
//# sourceMappingURL=Webhook.js.map