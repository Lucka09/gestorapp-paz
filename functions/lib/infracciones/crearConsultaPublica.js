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
exports.crearConsultaPublica = void 0;
// functions/src/infracciones/crearConsultaPublica.ts
// ─── CAPTURA DE LEAD DESDE LA WEB PÚBLICA (gestoriapaz.com) ──────────────────
//
// [v2] Ahora además del pre-prospecto + la consulta en cola, crea un LEAD en
//      la capa omnicanal (/leads) y emite el evento lead.creado, alimentando
//      el stream de eventos (automatizaciones + IA).
//
// Este endpoint es PÚBLICO: lo llama el navegador del visitante SIN token.
//   • el gestoriaId NO viene del cliente → fijado server-side (env).
//   • validamos y normalizamos patente/DNI antes de escribir.
//   • idempotente: mismo dato el mismo día ⇒ mismo documento.
//   • honeypot anti-bots + CORS acotado.
//
// En una sola transacción crea/recupera:
//   1) consulta en `consultasInfracciones` (estado 'pendiente') → cola extensión
//   2) LEAD en `leads` (canal 'web', convertido a prospecto)
//   3) pre-prospecto en `prospectos` (etapa 'nuevo', naranja)
//   Y emite `lead.creado` (fuera de la transacción, fire-and-forget).
//
// Despliegue: firebase deploy --only functions:crearConsultaPublica
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
if (!admin.apps.length)
    admin.initializeApp();
// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Fijado server-side. NUNCA lo manda el cliente.
const GESTORIA_ID = process.env.GESTORIA_ID_WEB || 'gestoria-paz';
const ORIGENES_OK = new Set([
    'https://gestoriapaz.com',
    'https://www.gestoriapaz.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
]);
// ─── VALIDACIÓN / NORMALIZACIÓN ──────────────────────────────────────────────
const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/;
const RE_DNI = /^\d{7,8}$/;
function limpiar(v) {
    return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function diaAR() {
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}
function setCors(req, res) {
    const origin = req.headers.origin;
    if (origin && ORIGENES_OK.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
}
// ─── FUNCIÓN ─────────────────────────────────────────────────────────────────
exports.crearConsultaPublica = (0, https_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ ok: false });
        return;
    }
    try {
        const body = (req.body || {});
        // 1) Honeypot: bot llenó el campo trampa → fingimos éxito, no escribimos.
        if (body.hp && body.hp.trim() !== '') {
            res.status(200).json({ ok: true });
            return;
        }
        // 2) Resolver valor y tipo (tolerante con el hook viejo).
        const bruto = (_c = (_b = (_a = body.valor) !== null && _a !== void 0 ? _a : body.patente) !== null && _b !== void 0 ? _b : body.dni) !== null && _c !== void 0 ? _c : '';
        const valor = limpiar(bruto);
        if (!valor) {
            res.status(400).json({ ok: false, error: 'dato_invalido' });
            return;
        }
        let tipo;
        if (body.tipoConsulta === 'dni' || body.tipoConsulta === 'dominio') {
            tipo = body.tipoConsulta;
        }
        else {
            tipo = RE_DNI.test(valor) ? 'dni' : 'dominio';
        }
        // 3) Validar según tipo.
        const valido = tipo === 'dni' ? RE_DNI.test(valor) : RE_DOMINIO.test(valor);
        if (!valido) {
            res.status(400).json({ ok: false, error: 'dato_invalido' });
            return;
        }
        // 4) Contacto opcional (saneado) + género.
        const contacto = {
            nombre: (((_d = body.contacto) === null || _d === void 0 ? void 0 : _d.nombre) || '').toString().trim().slice(0, 80),
            whatsapp: limpiarTel(((_e = body.contacto) === null || _e === void 0 ? void 0 : _e.whatsapp) || ''),
            email: (((_f = body.contacto) === null || _f === void 0 ? void 0 : _f.email) || '').toString().trim().slice(0, 120),
        };
        const genero = normalizarGenero(body.genero);
        const db = admin.firestore();
        const now = admin.firestore.FieldValue.serverTimestamp();
        // Descripción legible (la usan el lead, el prospecto y el evento).
        const descripcion = tipo === 'dni'
            ? `Consulta de infracciones por DNI ${valor} (web)`
            : `Consulta de infracciones por dominio ${valor} (web)`;
        // 5) Clave de idempotencia: mismo dato + mismo día ⇒ mismo doc.
        const dedupeKey = `web_${GESTORIA_ID}_${tipo}_${valor}_${diaAR()}`.replace(/\//g, '_');
        const consultaRef = db.collection('consultasInfracciones').doc(dedupeKey);
        const prospectoRef = db.collection('prospectos').doc();
        const leadRef = db.collection('leads').doc(); // ← NUEVO: id reservado para el lead
        let creoNuevoLead = false;
        await db.runTransaction(async (t) => {
            var _a, _b, _c;
            const snap = await t.get(consultaRef);
            if (snap.exists) {
                // Ya existe hoy: solo completamos contacto si ahora lo mandaron.
                const prev = snap.data();
                const patch = {};
                if (contacto.nombre && !((_a = prev === null || prev === void 0 ? void 0 : prev.contacto) === null || _a === void 0 ? void 0 : _a.nombre))
                    patch['contacto.nombre'] = contacto.nombre;
                if (contacto.whatsapp && !((_b = prev === null || prev === void 0 ? void 0 : prev.contacto) === null || _b === void 0 ? void 0 : _b.whatsapp))
                    patch['contacto.whatsapp'] = contacto.whatsapp;
                if (contacto.email && !((_c = prev === null || prev === void 0 ? void 0 : prev.contacto) === null || _c === void 0 ? void 0 : _c.email))
                    patch['contacto.email'] = contacto.email;
                if (Object.keys(patch).length)
                    t.update(consultaRef, patch);
                if ((prev === null || prev === void 0 ? void 0 : prev.prospectoId) && (contacto.whatsapp || contacto.nombre || contacto.email)) {
                    const pRef = db.collection('prospectos').doc(prev.prospectoId);
                    const pPatch = { actualizadoEn: now };
                    if (contacto.nombre)
                        pPatch.nombre = contacto.nombre;
                    if (contacto.whatsapp)
                        pPatch.telefono = contacto.whatsapp;
                    if (contacto.email)
                        pPatch.email = contacto.email;
                    t.set(pRef, pPatch, { merge: true });
                }
                return;
            }
            // ── NUEVO: creamos LEAD + pre-prospecto + consulta, todo enlazado ──
            creoNuevoLead = true;
            // 1) LEAD — alimenta la capa omnicanal + el motor de automatizaciones
            const leadData = {
                gestoriaId: GESTORIA_ID,
                nombre: contacto.nombre || 'Consulta web',
                telefono: contacto.whatsapp || null,
                email: contacto.email || null,
                documento: tipo === 'dni' ? valor : null,
                consulta: descripcion,
                tipoTramiteInteres: 'descargo_multa',
                canal: 'web',
                fuente: 'gestoriapaz-web',
                origenSistema: 'web_form',
                estado: 'convertido', // se convierte en prospecto en esta misma transacción
                prioridad: 'normal',
                convertidoA: 'prospecto',
                prospectoId: prospectoRef.id,
                utm_source: null,
                utm_medium: null,
                utm_campaign: null,
                utm_content: null,
                paginaUrl: req.headers.referer || req.headers.origin || null,
                ipOrigen: req.ip || null,
                creadoPor: 'system',
                creadoEn: now,
                actualizadoEn: now,
                // Metadatos de la consulta de multas (los necesita el equipo para procesarla)
                consultaTipo: tipo,
                consultaValor: valor,
                genero: genero || null,
            };
            t.set(leadRef, leadData);
            // 2) PRE-PROSPECTO (como antes) + vínculo al lead
            t.set(prospectoRef, {
                gestoriaId: GESTORIA_ID,
                nombre: contacto.nombre || 'Lead web',
                apellido: '',
                telefono: contacto.whatsapp || '',
                email: contacto.email || '',
                localidad: '',
                etapa: 'nuevo',
                color: 'naranja',
                tipoTramite: 'descargo_multa',
                patente: tipo === 'dominio' ? valor : '',
                descripcion,
                montoCierre: 0,
                formaPago: '',
                fechaCierre: '',
                tareas: [],
                etiquetas: ['consulta-multas', 'origen-web'],
                asignadoA: '',
                creadoPor: 'web',
                leadId: leadRef.id, // ← NUEVO: trazabilidad lead → prospecto
                orden: Date.now(),
                creadoEn: now,
                actualizadoEn: now,
            });
            // 3) CONSULTA EN COLA (como antes) + vínculo al lead
            t.set(consultaRef, Object.assign(Object.assign(Object.assign({ gestoriaId: GESTORIA_ID, tipoConsulta: tipo }, (tipo === 'dominio' ? { dominio: valor } : { dni: valor, tipoDocumento: 'DNI' })), (tipo === 'dni' && genero ? { genero } : {})), { contacto, origen: 'web', estado: 'pendiente', prospectoId: prospectoRef.id, leadId: leadRef.id, creadaEn: now }));
        });
        // ── Evento lead.creado (fuera de la transacción, fire-and-forget) ─────
        if (creoNuevoLead) {
            try {
                await db.collection('eventos').add({
                    gestoriaId: GESTORIA_ID,
                    tipo: 'lead.creado',
                    entidad: 'lead',
                    entidadId: leadRef.id,
                    entidadLabel: contacto.nombre || 'Consulta web',
                    actor: { id: 'system', tipo: 'sistema' },
                    payload: { canal: 'web', tipoConsulta: tipo, valor },
                    resumen: `Nuevo lead web: ${descripcion}`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            catch (e) {
                firebase_functions_1.logger.warn('No se pudo emitir evento lead.creado', { message: e === null || e === void 0 ? void 0 : e.message });
            }
        }
        firebase_functions_1.logger.info('crearConsultaPublica', { gestoriaId: GESTORIA_ID, tipo, dedupeKey, lead: creoNuevoLead });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        firebase_functions_1.logger.error('crearConsultaPublica error', { message: err === null || err === void 0 ? void 0 : err.message });
        res.status(500).json({ ok: false });
    }
});
function limpiarTel(v) {
    const s = (v || '').toString().trim();
    const plus = s.startsWith('+') ? '+' : '';
    return (plus + s.replace(/[^0-9]/g, '')).slice(0, 20);
}
function normalizarGenero(v) {
    const s = (v || '').toString().trim().toUpperCase();
    if (!s)
        return '';
    if (s === 'M' || s.startsWith('MA'))
        return 'M';
    if (s === 'F' || s.startsWith('FE'))
        return 'F';
    if (s === 'X' || s.startsWith('NO') || s.startsWith('NB'))
        return 'X';
    return '';
}
//# sourceMappingURL=crearConsultaPublica.js.map