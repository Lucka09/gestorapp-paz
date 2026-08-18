"use strict";
// functions/src/automatizaciones/condiciones.ts
// Evaluador de condiciones (AND) + plantillas con placeholders {nombre}, {patente}…
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolverCampo = resolverCampo;
exports.evaluarCondiciones = evaluarCondiciones;
exports.rellenarPlantilla = rellenarPlantilla;
function resolverCampo(obj, path) {
    return path.split('.').reduce((acc, k) => (acc == null ? null : acc[k]), obj);
}
function evaluarCondiciones(condiciones, contexto) {
    if (!condiciones || condiciones.length === 0)
        return true;
    return condiciones.every(c => evaluarUna(c, contexto));
}
function evaluarUna(c, ctx) {
    const real = resolverCampo(ctx, c.campo);
    switch (c.operador) {
        case '==': return real === c.valor;
        case '!=': return real !== c.valor;
        case 'in': return Array.isArray(c.valor) && c.valor.includes(real);
        case 'not_in': return Array.isArray(c.valor) && !c.valor.includes(real);
        case '>': return Number(real) > Number(c.valor);
        case '<': return Number(real) < Number(c.valor);
        case '>=': return Number(real) >= Number(c.valor);
        case '<=': return Number(real) <= Number(c.valor);
        case 'contains': return String(real !== null && real !== void 0 ? real : '').toLowerCase().includes(String(c.valor).toLowerCase());
        case 'starts_with': return String(real !== null && real !== void 0 ? real : '').toLowerCase().startsWith(String(c.valor).toLowerCase());
        case 'exists': return real !== undefined && real !== null && real !== '';
        case 'not_exists': return real === undefined || real === null || real === '';
        default: return false;
    }
}
function rellenarPlantilla(template, contexto) {
    return String(template).replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, path) => {
        const v = resolverCampo(contexto, path);
        return v == null ? '' : String(v);
    });
}
//# sourceMappingURL=condiciones.js.map