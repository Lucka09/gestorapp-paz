"use strict";
// POST /api/kommo/consultar-multas
// Body: { telefono, patente?, dni?, canal, nombre? }
// Response: { ok: true, leadId, prospectoId, estado: 'encolado' }
Object.defineProperty(exports, "__esModule", { value: true });
exports.kommoConsultaMultas = void 0;
exports.kommoConsultaMultas = onRequest({ region: 'us-central1', cors: ['https://*.kommo.com'] }, async (req, res) => {
    // 1. Validar API key de Kommo (header Authorization)
    // 2. Crear lead + prospecto + consultaInfraccion
    // 3. Encolar la consulta
    // 4. Devolver IDs
});
//# sourceMappingURL=consusultaMultas.js.map