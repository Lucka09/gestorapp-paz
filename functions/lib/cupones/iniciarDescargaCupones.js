"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iniciarDescargaCupones = void 0;
// functions/src/cupones/iniciarDescargaCupones.ts
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)();
exports.iniciarDescargaCupones = (0, https_1.onCall)({ cors: [/gestorapp.*\.vercel\.app$/, /gestorapp.*\.web\.app$/, /localhost/] }, async (req) => {
    var _a, _b, _c, _d, _e;
    const uid = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Requiere login');
    const user = await auth.getUser(uid).catch(() => null);
    if (!user)
        throw new https_1.HttpsError('unauthenticated', 'Usuario no encontrado');
    const gestoriaId = (_b = user.customClaims) === null || _b === void 0 ? void 0 : _b.gestoriaId;
    if (!gestoriaId)
        throw new https_1.HttpsError('permission-denied', 'Usuario sin gestoría');
    const { tramiteId, nroCausas } = (_c = req.data) !== null && _c !== void 0 ? _c : {};
    if (!tramiteId || !Array.isArray(nroCausas) || nroCausas.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Faltan datos');
    }
    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get();
    if (!tramiteSnap.exists || tramiteSnap.get('gestoriaId') !== gestoriaId) {
        throw new https_1.HttpsError('permission-denied', 'Trámite no pertenece a la gestoría');
    }
    const jobRef = db.collection('descargaCupones').doc(tramiteId);
    const existente = await jobRef.get();
    if (existente.exists) {
        const est = existente.data().estadoGeneral;
        if (est !== 'completado' && est !== 'cancelado') {
            return { ok: true, reutilizado: true, estado: est };
        }
    }
    const items = {};
    for (const { nroCausa, nroActa } of nroCausas) {
        items[nroCausa] = {
            nroCausa,
            nroActa: nroActa !== null && nroActa !== void 0 ? nroActa : '',
            estado: 'pendiente',
            reintentos: 0,
        };
    }
    const ahora = firestore_1.FieldValue.serverTimestamp();
    await jobRef.set({
        id: tramiteId,
        tramiteId,
        gestoriaId,
        estadoGeneral: 'pendiente',
        totalItems: nroCausas.length,
        completadosOk: 0,
        conError: 0,
        omitidos: 0,
        items,
        iniciadoEn: ahora,
        iniciadoPor: uid,
        iniciadoPorNombre: (_e = (_d = user.displayName) !== null && _d !== void 0 ? _d : user.email) !== null && _e !== void 0 ? _e : '',
    });
    return { ok: true, totalItems: nroCausas.length };
});
//# sourceMappingURL=iniciarDescargaCupones.js.map