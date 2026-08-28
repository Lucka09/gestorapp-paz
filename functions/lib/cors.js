"use strict";
// functions/src/cors.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fuente ÚNICA de orígenes permitidos para todas las Cloud Functions callable
// (onCall) y HTTP (onRequest) que reciben llamadas desde el navegador.
//
// Cuando agregues un dominio nuevo (otro tenant, otro subdominio, etc.),
// cambialo ACÁ y solo acá. Todas las funciones lo toman de esta lista.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORS_ORIGINS = void 0;
exports.CORS_ORIGINS = [
    // Producción
    'https://panel.gestoriapaz.com',
    'https://gestorapp-tau.vercel.app',
    'https://gestorapp-paz.web.app',
    'https://gestorapp-paz.firebaseapp.com',
    // Cualquier preview de Vercel del proyecto (deploys de rama)
    /^https:\/\/gestorapp.*\.vercel\.app$/,
    // Desarrollo local
    'http://localhost:5173',
    'http://localhost:5174',
];
//# sourceMappingURL=cors.js.map