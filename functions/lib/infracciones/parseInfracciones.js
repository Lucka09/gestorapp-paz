"use strict";
// src/lib/parseInfracciones.ts
// ─── PARSER + CLASIFICADOR + COTIZADOR — INFRACCIONES PBA ─────────────────────
//
// Transforma la respuesta cruda del portal en el modelo interno de GestorApp,
// clasifica cada acta en trabajable / excluida, y calcula honorarios.
//
// ⚠️ REGLA DE NEGOCIO — CONFIRMAR CON MATÍAS antes de producción:
// La matriz de estados (qué se trabaja y qué no) y el modelo de honorarios son
// PROVISORIOS. Se guardan en `configuracion.cotizacionMultas` y se editan desde
// la UI de Configuración. Acá van solo los defaults de arranque.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG_COTIZACION = void 0;
exports.epochToISO = epochToISO;
exports.clasificarActa = clasificarActa;
exports.parseActa = parseActa;
exports.parseRespuestaPortal = parseRespuestaPortal;
exports.cotizar = cotizar;
// Default de arranque. `montoPorActa: 55000` sale de calculadoraDNRPA.honorarios.descargo_multa.
// ⚠️ Matías debe confirmar: ¿es por acta, por dominio, o por tramos de cantidad?
exports.DEFAULT_CONFIG_COTIZACION = {
    matrizEstados: {
        'CON DEUDA': { trabajable: true, motivo: null },
        'DESCARGO PENDIENTE VALIDACION': { trabajable: false, motivo: 'Ya tiene descargo presentado, pendiente de validación' },
        'SENTENCIA': { trabajable: false, motivo: 'Causa con sentencia firme' },
        'SIN DEUDA': { trabajable: false, motivo: 'Sin deuda' },
        'PAGADA': { trabajable: false, motivo: 'Ya abonada' },
    },
    reglaPorDefecto: { trabajable: false, motivo: 'Estado no clasificado — revisar manualmente' },
    overrides: {
        excluirSiApremio: true,
        excluirSiVencida: false,
        excluirSiTieneDescargo: true, // la matriz ya maneja "DESCARGO PENDIENTE VALIDACION"
        excluirSiSinDI: true, // sin Deber de Informar → no se trabaja
    },
    honorarios: {
        modo: 'por_acta',
        montoPorActa: 55000,
        montoPorDominio: 55000,
        tramos: [
            { hasta: 3, montoPorActa: 55000 },
            { hasta: 8, montoPorActa: 48000 },
            { hasta: Infinity, montoPorActa: 42000 },
        ],
    },
};
// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Epoch en ms → ISO 'yyyy-mm-dd'. Devuelve '' si el valor no es válido. */
function epochToISO(ms) {
    if (ms == null || !Number.isFinite(ms))
        return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()))
        return '';
    return d.toISOString().slice(0, 10);
}
// ─── CLASIFICACIÓN ───────────────────────────────────────────────────────────
// REGLAS DURAS DE NEGOCIO (confirmadas por Matías): NUNCA se trabajan actas
// sin Deber de Informar, con descargo pendiente de validación, ni sentenciadas.
// Van ANTES de cualquier otra regla y no son configurables.
function clasificarActa(raw, config = exports.DEFAULT_CONFIG_COTIZACION) {
    var _a, _b, _c;
    const estado = ((_b = (_a = raw.estadoCausaPublico) === null || _a === void 0 ? void 0 : _a.descripcion) !== null && _b !== void 0 ? _b : '').trim().toUpperCase();
    // ── REGLAS DURAS DE NEGOCIO (confirmadas) ────────────────────────────────
    // 1) SENTENCIADAS
    if (estado.includes('SENTENCIA'))
        return { trabajable: false, motivoExclusion: 'Causa con sentencia firme' };
    // 2) DESCARGO PENDIENTE DE VALIDACION
    if (estado.includes('DESCARGO'))
        return { trabajable: false, motivoExclusion: 'Descargo presentado, pendiente de validación' };
    // 3) SIN DI — VERIFICADO contra datos reales del portal:
    //    debeDI=true ⇒ el acta DEBE el Deber de Informar (badge "Sin DI") ⇒ excluir.
    if (config.overrides.excluirSiSinDI && raw.debeDI)
        return { trabajable: false, motivoExclusion: 'Sin Deber de Informar (sin DI)' };
    // ── Exclusiones obvias por estado ────────────────────────────────────────
    if (estado.includes('SIN DEUDA'))
        return { trabajable: false, motivoExclusion: 'Sin deuda' };
    if (estado.includes('PAGADA'))
        return { trabajable: false, motivoExclusion: 'Ya abonada' };
    // ── Overrides configurables (solo pueden EXCLUIR) ────────────────────────
    if (config.overrides.excluirSiApremio && raw.conApremio)
        return { trabajable: false, motivoExclusion: 'En apremio (ejecución fiscal)' };
    if (config.overrides.excluirSiTieneDescargo && raw.tieneDescargo)
        return { trabajable: false, motivoExclusion: 'Ya tiene descargo presentado' };
    if (config.overrides.excluirSiVencida && raw.estaVencida)
        return { trabajable: false, motivoExclusion: 'Acta vencida' };
    // ── Matriz exacta para estados conocidos ─────────────────────────────────
    const exacta = config.matrizEstados[estado];
    if (exacta) {
        return exacta.trabajable
            ? { trabajable: true, motivoExclusion: null }
            : { trabajable: false, motivoExclusion: exacta.motivo };
    }
    // ── Habilitar: cualquier acta con deuda > 0 ──────────────────────────────
    if (((_c = raw.importeTotal) !== null && _c !== void 0 ? _c : 0) > 0)
        return { trabajable: true, motivoExclusion: null };
    // ── Sin deuda ni estado reconocible ──────────────────────────────────────
    return { trabajable: false, motivoExclusion: `Estado no clasificado (${estado || 'sin estado'})` };
}
// ─── PARSEO ──────────────────────────────────────────────────────────────────
function parseActa(raw, config = exports.DEFAULT_CONFIG_COTIZACION) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    return {
        id: raw.id,
        nroActa: raw.nroActa,
        nroCausa: raw.nroCausa,
        dominio: raw.dominio,
        importeTotal: (_a = raw.importeTotal) !== null && _a !== void 0 ? _a : 0,
        codigoBarra: (_b = raw.codigoBarra) !== null && _b !== void 0 ? _b : '',
        fechaInfraccion: epochToISO(raw.fechaInfraccion),
        fechaEmision: epochToISO(raw.fechaEmision),
        fechaVencimiento: epochToISO(raw.fechaVencimiento),
        detalles: ((_c = raw.infracciones) !== null && _c !== void 0 ? _c : []).map((d) => ({
            articulo: d.articulo,
            descripcion: d.descripcion,
        })),
        autoridadAplicacion: (_d = raw.autoridadAplicacion) !== null && _d !== void 0 ? _d : '',
        estadoCausa: (_f = (_e = raw.estadoCausaPublico) === null || _e === void 0 ? void 0 : _e.descripcion) !== null && _f !== void 0 ? _f : '',
        estadoColorHex: (_h = (_g = raw.estadoCausaPublico) === null || _g === void 0 ? void 0 : _g.colorHex) !== null && _h !== void 0 ? _h : '',
        estaEnFecha: !!raw.estaEnFecha,
        estaVencida: !!raw.estaVencida,
        conApremio: !!raw.conApremio,
        debeDI: !!raw.debeDI,
        tieneDescargo: !!raw.tieneDescargo,
        tipoDescargo: (_k = (_j = raw.descargo) === null || _j === void 0 ? void 0 : _j.tipoDescargo) !== null && _k !== void 0 ? _k : null,
        fechaDescargo: ((_l = raw.descargo) === null || _l === void 0 ? void 0 : _l.fechaCreacion) ? epochToISO(raw.descargo.fechaCreacion) : null,
        sePuedeGenerarDescargo: !!raw.sePuedeGenerarDescargo,
        clasificacion: clasificarActa(raw, config),
    };
}
/** Respuesta cruda del portal → array de actas normalizadas. */
function parseRespuestaPortal(raw, config = exports.DEFAULT_CONFIG_COTIZACION) {
    if (!raw || raw.error || !Array.isArray(raw.infracciones))
        return [];
    return raw.infracciones.map((a) => parseActa(a, config));
}
// ─── COTIZACIÓN ──────────────────────────────────────────────────────────────
function cotizar(actas, config = exports.DEFAULT_CONFIG_COTIZACION) {
    var _a;
    const trabajables = actas.filter(a => a.clasificacion.trabajable);
    const excluidas = actas.filter(a => !a.clasificacion.trabajable);
    const importeTotalDeuda = trabajables.reduce((sum, a) => sum + a.importeTotal, 0);
    const n = trabajables.length;
    let honorarios = 0;
    let detalle = '';
    const h = config.honorarios;
    if (n === 0) {
        detalle = 'Sin actas trabajables';
    }
    else if (h.modo === 'por_dominio') {
        honorarios = h.montoPorDominio;
        detalle = `Honorario único por dominio: $${h.montoPorDominio.toLocaleString('es-AR')}`;
    }
    else if (h.modo === 'tramos') {
        const tramo = (_a = h.tramos.find(t => n <= t.hasta)) !== null && _a !== void 0 ? _a : h.tramos[h.tramos.length - 1];
        honorarios = n * tramo.montoPorActa;
        detalle = `${n} acta(s) × $${tramo.montoPorActa.toLocaleString('es-AR')} = $${honorarios.toLocaleString('es-AR')}`;
    }
    else {
        // por_acta
        honorarios = n * h.montoPorActa;
        detalle = `${n} acta(s) × $${h.montoPorActa.toLocaleString('es-AR')} = $${honorarios.toLocaleString('es-AR')}`;
    }
    return {
        actasTrabajables: trabajables,
        actasExcluidas: excluidas,
        cantidadTrabajable: trabajables.length,
        cantidadExcluida: excluidas.length,
        importeTotalDeuda,
        honorariosGestoria: honorarios,
        detalleHonorarios: detalle,
    };
}
//# sourceMappingURL=parseInfracciones.js.map