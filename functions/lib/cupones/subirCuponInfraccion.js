"use strict";
// functions/src/cupones/subirCuponInfraccion.ts
// Recibe el PDF base64 de la extensión, lo sube a Cloud Storage, lo parsea,
// busca cinemómetro, evalúa verificación, y guarda el doc cupones.
// Actualiza el contador del job descargaCupones/{tramiteId}.
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
exports.subirCuponInfraccion = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const auth_1 = require("firebase-admin/auth");
const parseCupon_1 = require("./parseCupon");
const cinemometros_1 = require("../lib/cinemometros");
const cors_1 = require("../cors");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)();
const storage = (0, storage_1.getStorage)().bucket(); // bucket predeterminado
exports.subirCuponInfraccion = (0, https_1.onCall)({
    cors: cors_1.CORS_ORIGINS,
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (req) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    // ─── 1. Auth + gestoriaId server-side (defensa estándar GestorApp) ───
    const uid = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Requiere login');
    const user = await auth.getUser(uid).catch(() => null);
    if (!user)
        throw new https_1.HttpsError('unauthenticated', 'Usuario no encontrado');
    const gestoriaId = (_b = user.customClaims) === null || _b === void 0 ? void 0 : _b.gestoriaId;
    if (!gestoriaId)
        throw new https_1.HttpsError('permission-denied', 'Usuario sin gestoría asignada');
    // ─── 2. Validar input ───
    const { tramiteId, nroCausa, nroActa, dominio, pdfBase64 } = (_c = req.data) !== null && _c !== void 0 ? _c : {};
    if (!tramiteId || !nroCausa || !pdfBase64) {
        throw new https_1.HttpsError('invalid-argument', 'Faltan campos requeridos');
    }
    if (!/^[\w\-]{10,80}$/.test(nroCausa)) {
        throw new https_1.HttpsError('invalid-argument', 'nroCausa con formato inválido');
    }
    // Defensa IDOR: verificar que el trámite sea del gestoriaId
    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get();
    if (!tramiteSnap.exists || tramiteSnap.get('gestoriaId') !== gestoriaId) {
        throw new https_1.HttpsError('permission-denied', 'Trámite no pertenece a la gestoría');
    }
    const cuponRef = db.collection('tramites').doc(tramiteId).collection('cupones').doc(nroCausa);
    const jobRef = db.collection('descargaCupones').doc(tramiteId);
    // Idempotencia: si el cupón ya está ok, no reprocesar ni tocar contadores
    const cuponExistente = await cuponRef.get();
    if (cuponExistente.exists && cuponExistente.get('estado') === 'ok') {
        return {
            ok: true,
            nroCausa,
            estado: 'ok',
            yaProcesado: true,
            evaluacion: (_e = (_d = cuponExistente.get('evaluacion')) === null || _d === void 0 ? void 0 : _d.estado) !== null && _e !== void 0 ? _e : 'sin_evaluar',
        };
    }
    await marcarItem(jobRef, nroCausa, 'subiendo');
    try {
        // ─── 3. Subir a Cloud Storage ───
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        if (pdfBuffer.length < 1024)
            throw new Error('PDF demasiado chico, probablemente vacío');
        if (pdfBuffer.slice(0, 4).toString() !== '%PDF')
            throw new Error('No es un PDF válido');
        const storagePath = `cupones/${gestoriaId}/${tramiteId}/${nroCausa}.pdf`;
        const file = storage.file(storagePath);
        await file.save(pdfBuffer, {
            contentType: 'application/pdf',
            metadata: { metadata: { tramiteId, nroCausa, gestoriaId, subidoPor: uid } },
            resumable: false,
        });
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        // ─── 4. Parsear (lazy import de pdf-parse: evita timeout de cold start) ───
        const pdfParse = (await Promise.resolve().then(() => __importStar(require('pdf-parse')))).default;
        const pdfData = await pdfParse(pdfBuffer);
        const parseado = (0, parseCupon_1.parseCuponPDF)(pdfData.text);
        const serieNormalizada = parseado.serieOriginal
            ? (0, cinemometros_1.normalizarSerie)(parseado.serieOriginal)
            : undefined;
        // ─── 5. Buscar cinemómetro (F1) ───
        let cinemometro;
        if (serieNormalizada) {
            const snap = await db.collection('cinemometros').doc(serieNormalizada).get();
            if (snap.exists)
                cinemometro = snap.data();
        }
        // ─── 6. Evaluar (siempre que haya fecha de hecho) ───
        let evaluacion;
        if (parseado.fechaHechoISO && serieNormalizada) {
            const r = (0, cinemometros_1.evaluarVerificacion)(cinemometro, serieNormalizada, parseado.fechaHechoISO);
            evaluacion = {
                estado: r.estado,
                cinemometro: r.cinemometro,
                ultimaVerifAnterior: r.ultimaVerifAnterior,
                diasExceso: r.diasExceso,
                ambigua: r.ambigua,
                fundamentos: r.fundamentos,
            };
        }
        // ─── 7. Guardar doc del cupón ───
        const ahora = firestore_1.FieldValue.serverTimestamp();
        const docData = Object.assign(Object.assign({}, (0, parseCupon_1.parseResultADocFields)(parseado)), { id: nroCausa, tramiteId,
            gestoriaId,
            nroCausa, nroActa: (_g = (_f = parseado.nroActa) !== null && _f !== void 0 ? _f : nroActa) !== null && _g !== void 0 ? _g : '', dominio: (_h = dominio !== null && dominio !== void 0 ? dominio : tramiteSnap.get('patente')) !== null && _h !== void 0 ? _h : '', serieNormalizada,
            storagePath,
            signedUrl, signedUrlExpira: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), pdfSizeBytes: pdfBuffer.length, estado: 'ok', evaluacion, descargadoPor: uid, descargadoPorNombre: (_k = (_j = user.displayName) !== null && _j !== void 0 ? _j : user.email) !== null && _k !== void 0 ? _k : '', descargadoEn: ahora, creadoEn: ahora, actualizadoEn: ahora });
        await cuponRef.set(docData, { merge: true });
        // ─── 8. Marcar item ok y actualizar contadores del job ───
        await marcarItem(jobRef, nroCausa, 'ok');
        await jobRef.update({
            completadosOk: firestore_1.FieldValue.increment(1),
            actualizadoEn: ahora,
        });
        await recalcularEstadoGeneral(jobRef);
        return { ok: true, nroCausa, estado: 'ok', evaluacion: (_l = evaluacion === null || evaluacion === void 0 ? void 0 : evaluacion.estado) !== null && _l !== void 0 ? _l : 'sin_evaluar' };
    }
    catch (err) {
        const mensaje = (_m = err === null || err === void 0 ? void 0 : err.message) !== null && _m !== void 0 ? _m : String(err);
        const tipo = mensaje.includes('No es un PDF') || mensaje.includes('demasiado chico')
            ? 'error_pdf'
            : mensaje.includes('parse') || mensaje.includes('serie')
                ? 'error_parse'
                : 'error_storage';
        await marcarItem(jobRef, nroCausa, tipo, mensaje);
        await jobRef.update({
            conError: firestore_1.FieldValue.increment(1),
            actualizadoEn: firestore_1.FieldValue.serverTimestamp(),
        });
        await recalcularEstadoGeneral(jobRef);
        console.error('[subirCuponInfraccion] error', { tramiteId, nroCausa, tipo, mensaje });
        throw new https_1.HttpsError('internal', `Error procesando cupón: ${mensaje}`);
    }
});
// ─── Helpers ──
async function marcarItem(jobRef, nroCausa, estado, errorDetalle) {
    await jobRef.update(Object.assign(Object.assign({ [`items.${nroCausa}.estado`]: estado, [`items.${nroCausa}.ultimoIntento`]: firestore_1.FieldValue.serverTimestamp() }, (errorDetalle ? { [`items.${nroCausa}.errorDetalle`]: errorDetalle } : {})), (estado === 'reintentar' ? { [`items.${nroCausa}.reintentos`]: firestore_1.FieldValue.increment(1) } : {})));
}
async function recalcularEstadoGeneral(jobRef) {
    var _a, _b, _c;
    const snap = await jobRef.get();
    if (!snap.exists)
        return;
    const data = snap.data();
    const total = data.totalItems;
    const ok = (_a = data.completadosOk) !== null && _a !== void 0 ? _a : 0;
    const err = (_b = data.conError) !== null && _b !== void 0 ? _b : 0;
    const omit = (_c = data.omitidos) !== null && _c !== void 0 ? _c : 0;
    const procesados = ok + err + omit;
    let nuevo;
    if (procesados < total) {
        nuevo = data.estadoGeneral === 'pausado' ? 'pausado' : 'en_progreso';
    }
    else if (err === 0) {
        nuevo = 'completado';
    }
    else {
        nuevo = 'parcial';
    }
    await jobRef.update(Object.assign({ estadoGeneral: nuevo }, (nuevo === 'completado' ? { completadoEn: firestore_1.FieldValue.serverTimestamp() } : {})));
}
//# sourceMappingURL=subirCuponInfraccion.js.map