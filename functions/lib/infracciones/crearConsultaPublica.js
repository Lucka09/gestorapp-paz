"use strict";
// functions/src/infracciones/crearConsultaPublica.ts
// ─── CAPTURA DE LEAD DESDE LA WEB PÚBLICA (gestoriapaz.com) ──────────────────
//
// Este endpoint es PÚBLICO: lo llama el navegador del visitante desde el sitio
// estático, SIN token de usuario. Por eso:
//   • el gestoriaId NO viene del cliente (sería un vector de spam) → está fijado
//     en el server vía env GESTORIA_ID_WEB.
//   • validamos y normalizamos el dato (patente o DNI) antes de escribir nada.
//   • es idempotente: mismo dato el mismo día ⇒ mismo documento (no duplica
//     consultas ni prospectos si el visitante manda dos veces).
//   • incluye honeypot anti-bots y CORS acotado a los orígenes del sitio.
//   • nunca devuelve datos internos: responde { ok:true } y listo.
//
// Qué hace en un solo movimiento (transacción):
//   1) crea/recupera la consulta en `consultasInfracciones` (estado 'pendiente')
//      → queda en la cola que consume la extensión.
//   2) crea/recupera un pre-prospecto en `prospectos` (etapa 'nuevo', naranja).
//
// El resto de la cadena ya existe: cola → captcha (humano) → guardarConsulta →
// cotización → PresupuestoMultas → envío.
//
// Despliegue: firebase deploy --only functions:crearConsultaPublica
// Env:        firebase functions:config no aplica en v2 → usar .env / secrets:
//             GESTORIA_ID_WEB=<id de Gestoría Paz>
//
// ⚠️ Endurecimiento para producción: activar App Check (attestation del sitio)
//    y/o rate-limit por IP. Ver nota al pie.
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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
if (!admin.apps.length)
    admin.initializeApp();
// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Fijado en el server. NO se acepta desde el cliente.
const GESTORIA_ID = process.env.GESTORIA_ID_WEB || 'gestoria-paz';
// Orígenes desde los que se permite la llamada (CORS).
const ORIGENES_OK = new Set([
    'https://gestoriapaz.com',
    'https://www.gestoriapaz.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5500', // Live Server (VS Code) para pruebas locales
]);
// ─── VALIDACIÓN / NORMALIZACIÓN ──────────────────────────────────────────────
// Patentes AR: auto viejo (AAA123), auto Mercosur (AA123AA),
// moto vieja (123ABC), moto Mercosur (A123BCD).
const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/;
const RE_DNI = /^\d{7,8}$/;
/** Deja solo A-Z0-9 y pasa a mayúsculas. */
function limpiar(v) {
    return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
/** Bucket de día en horario Argentina (UTC-3) para la clave de idempotencia. */
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
exports.crearConsultaPublica = (0, https_1.onRequest)({ cors: false }, // manejamos CORS a mano para acotar orígenes
async (req, res) => {
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
        // 1) Honeypot: si un bot llenó el campo trampa, fingimos éxito y no escribimos.
        if (body.hp && body.hp.trim() !== '') {
            res.status(200).json({ ok: true });
            return;
        }
        // 2) Resolver el valor y el tipo (tolerante con el hook viejo).
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
            tipo = RE_DNI.test(valor) ? 'dni' : 'dominio'; // inferencia
        }
        // 3) Validar según tipo.
        const valido = tipo === 'dni' ? RE_DNI.test(valor) : RE_DOMINIO.test(valor);
        if (!valido) {
            res.status(400).json({ ok: false, error: 'dato_invalido' });
            return;
        }
        // 4) Contacto opcional (saneado y acotado).
        const contacto = {
            nombre: (((_d = body.contacto) === null || _d === void 0 ? void 0 : _d.nombre) || '').toString().trim().slice(0, 80),
            whatsapp: limpiarTel(((_e = body.contacto) === null || _e === void 0 ? void 0 : _e.whatsapp) || ''),
            email: (((_f = body.contacto) === null || _f === void 0 ? void 0 : _f.email) || '').toString().trim().slice(0, 120),
        };
        // Género (solo relevante para DNI; el portal lo pide en el formulario).
        const genero = normalizarGenero(body.genero);
        const db = admin.firestore();
        const now = admin.firestore.FieldValue.serverTimestamp();
        // 5) Clave de idempotencia: mismo dato + mismo día ⇒ mismo doc.
        const dedupeKey = `web_${GESTORIA_ID}_${tipo}_${valor}_${diaAR()}`.replace(/\//g, '_');
        const consultaRef = db.collection('consultasInfracciones').doc(dedupeKey);
        const prospectoRef = db.collection('prospectos').doc(); // id reservado por si hay que crear
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
                // Reflejar contacto en el prospecto ya vinculado.
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
            // Nuevo: creamos pre-prospecto + consulta enlazados.
            const descripcion = tipo === 'dni'
                ? `Consulta de infracciones por DNI ${valor} (web)`
                : `Consulta de infracciones por dominio ${valor} (web)`;
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
                orden: Date.now(),
                creadoEn: now,
                actualizadoEn: now,
            });
            t.set(consultaRef, Object.assign(Object.assign(Object.assign({ gestoriaId: GESTORIA_ID, tipoConsulta: tipo }, (tipo === 'dominio' ? { dominio: valor } : { dni: valor, tipoDocumento: 'DNI' })), (tipo === 'dni' && genero ? { genero } : {})), { contacto, origen: 'web', estado: 'pendiente', prospectoId: prospectoRef.id, creadaEn: now }));
        });
        firebase_functions_1.logger.info('crearConsultaPublica', { gestoriaId: GESTORIA_ID, tipo, dedupeKey });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        firebase_functions_1.logger.error('crearConsultaPublica error', { message: err === null || err === void 0 ? void 0 : err.message });
        // No filtramos detalle al cliente público.
        res.status(500).json({ ok: false });
    }
});
/** Deja solo dígitos y un + inicial opcional, acota longitud. */
function limpiarTel(v) {
    const s = (v || '').toString().trim();
    const plus = s.startsWith('+') ? '+' : '';
    return (plus + s.replace(/[^0-9]/g, '')).slice(0, 20);
}
/** Normaliza el género al carácter de un char que espera el portal (M/F/X).
 *  El portal usa: genero=M, genero=F (No binario no está confirmado — usamos X). */
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