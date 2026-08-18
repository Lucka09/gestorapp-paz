"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCuponPDF = parseCuponPDF;
exports.parseResultADocFields = parseResultADocFields;
function limpiar(texto) {
    return texto.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function extraer(texto, patron) {
    const m = texto.match(patron);
    return m ? m[1].trim() : undefined;
}
function aNumero(s) {
    if (!s)
        return undefined;
    const limpio = s.replace(/\./g, '').replace(',', '.');
    const n = Number(limpio);
    return Number.isFinite(n) ? n : undefined;
}
function fechaArgAISO(s) {
    if (!s)
        return undefined;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m)
        return undefined;
    return `${m[3]}-${m[2]}-${m[1]}`;
}
function parseCuponPDF(texto) {
    var _a, _b;
    const t = limpiar(texto);
    const nroActa = (_a = extraer(t, /Acta\s*(?:N[°º.]?\s*)?(:?\d{2}-\d{3}-\d{8}-\d(?:-\d{2})?)/i)) !== null && _a !== void 0 ? _a : extraer(t, /(\d{2}-\d{3}-\d{8}-\d(?:-\d{2})?)/);
    const serieOriginal = extraer(t, /Nro\.?\s*de\s*Serie:?\s*([A-Z0-9_\-\/\s]{3,})/i);
    const marca = extraer(t, /(?:Equipo\s+)?Marca:?\s*([A-ZÁÉÍÓÚÑ0-9\s\-\.]+?)(?=\s+Nro\.?\s*de\s*Serie)/i);
    const modelo = extraer(t, /Modelo:?\s*([A-ZÁÉÍÓÚÑ0-9\s\-\.,]+?)(?=\s+Descripci[oó]n|\s*$)/i);
    const fechaHecho = (_b = extraer(t, /Fecha\s*(?:del\s*hecho|de\s*la\s*infracci[oó]n|cometida):?\s*(\d{2}\/\d{2}\/\d{4})/i)) !== null && _b !== void 0 ? _b : extraer(t, /(\d{2}\/\d{2}\/\d{4})/);
    const importeNeto = aNumero(extraer(t, /IMPORTE\s*(?:NETO\s*)?(?:A\s*PAGAR)?:?\s*\$?\s*([\d\.,]+)/i));
    const valorUF = aNumero(extraer(t, /VALOR\s*UF:?\s*\$?\s*([\d\.,]+)/i));
    const cantidadUF = aNumero(extraer(t, /CANTIDAD\s*UF:?\s*([\d\.,]+)/i));
    const fechaVencimiento = fechaArgAISO(extraer(t, /(?:FECHA\s+DE\s+)?VENCIMIENTO:?\s*(\d{2}\/\d{2}\/\d{4})/i));
    const nroExpediente = extraer(t, /(?:Expediente|Causa|N[°º]\s*de\s*causa):?\s*([A-Z0-9\-\/\s]+)/i);
    return {
        nroActa,
        fechaHechoISO: fechaArgAISO(fechaHecho),
        marca: marca === null || marca === void 0 ? void 0 : marca.replace(/\s+/g, ' ').trim(),
        modelo: modelo === null || modelo === void 0 ? void 0 : modelo.replace(/\s+/g, ' ').trim(),
        serieOriginal: serieOriginal === null || serieOriginal === void 0 ? void 0 : serieOriginal.replace(/\s+/g, ' ').trim(),
        importeNeto,
        cantidadUF,
        valorUF,
        fechaVencimiento,
        nroExpediente,
    };
}
function parseResultADocFields(p) {
    return {
        nroActa: p.nroActa,
        fechaHechoISO: p.fechaHechoISO,
        marca: p.marca,
        modelo: p.modelo,
        serieOriginal: p.serieOriginal,
        importeNeto: p.importeNeto,
        cantidadUF: p.cantidadUF,
        valorUF: p.valorUF,
        fechaVencimiento: p.fechaVencimiento,
    };
}
//# sourceMappingURL=parseCupon.js.map