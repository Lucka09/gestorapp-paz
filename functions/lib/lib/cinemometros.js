"use strict";
// functions/src/lib/cinemometros.ts
// COPIA de src/lib/cinemometros.ts — necesario porque Cloud Functions solo sube
// archivos dentro de functions/. Mantener sincronizado manualmente si cambia.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETIQUETAS_ESTADO = void 0;
exports.normalizarSerie = normalizarSerie;
exports.clavesDeSerie = clavesDeSerie;
exports.parseFechaVerificacion = parseFechaVerificacion;
exports.addYearsISO = addYearsISO;
exports.diasEntre = diasEntre;
exports.evaluarVerificacion = evaluarVerificacion;
function normalizarSerie(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function clavesDeSerie(celda) {
    const partes = (celda || '')
        .split(/\s*\/\s*/)
        .map(normalizarSerie)
        .filter((k) => k.length >= 4);
    return [...new Set(partes)];
}
function parseFechaVerificacion(raw) {
    const original = (raw || '').trim();
    const base = { iso: null, primitiva: false, ambigua: false, original };
    if (!original)
        return base;
    if (/primitiva/i.test(original))
        return Object.assign(Object.assign({}, base), { primitiva: true });
    const m = original.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
    if (!m)
        return base;
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a < 1 || b < 1 || a > 31 || b > 31)
        return base;
    let d;
    let mo;
    let ambigua = false;
    let isoAlt;
    if (a > 12 && b <= 12) {
        d = a;
        mo = b;
    }
    else if (a <= 12 && b > 12) {
        d = b;
        mo = a;
    }
    else if (a > 12 && b > 12) {
        return base;
    }
    else {
        d = a;
        mo = b;
        ambigua = true;
        isoAlt = armarISO(year, a, b);
    }
    return { iso: armarISO(year, mo, d), isoAlt, ambigua, primitiva: false, original };
}
function armarISO(year, mo, d) {
    return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function addYearsISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y + 1, m - 1, d));
    if (dt.getUTCMonth() !== m - 1)
        dt.setUTCDate(0);
    return dt.toISOString().slice(0, 10);
}
function diasEntre(desdeISO, hastaISO) {
    const [y1, m1, d1] = desdeISO.split('-').map(Number);
    const [y2, m2, d2] = hastaISO.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function escenario(isoVerif, fechaHechoISO) {
    const vencimiento = addYearsISO(isoVerif);
    const vigente = fechaHechoISO <= vencimiento;
    return { vencimiento, vigente, diasExceso: vigente ? undefined : diasEntre(vencimiento, fechaHechoISO) };
}
function evaluarVerificacion(cinemometro, seriePortal, fechaHechoISO) {
    const key = normalizarSerie(seriePortal);
    const base = {
        estado: 'serie_vacia',
        serieNormalizada: key,
        verificacionesPosteriores: 0,
        fundamentos: [],
    };
    if (!key)
        return base;
    if (!cinemometro) {
        return Object.assign(Object.assign({}, base), { estado: 'sin_registro', fundamentos: [
                `El equipo con nro. de serie ${seriePortal} no figura en el listado de cinemómetros verificados por INTI (Ley 19511/72). No consta acreditación metrológica del instrumento que originó el acta.`,
            ] });
    }
    const conFecha = cinemometro.verificaciones
        .filter((v) => !!v.iso)
        .sort((x, y) => (x.iso < y.iso ? -1 : 1));
    const anteriores = conFecha.filter((v) => v.iso <= fechaHechoISO);
    const posteriores = conFecha.length - anteriores.length;
    const datos = {
        marca: cinemometro.marca,
        modelo: cinemometro.modelo,
        codAprobacion: cinemometro.codAprobacion,
    };
    if (anteriores.length === 0) {
        return Object.assign(Object.assign({}, base), { estado: 'sin_verificacion_previa', cinemometro: datos, verificacionesPosteriores: posteriores, fundamentos: [
                `Al momento del hecho (${fechaHechoISO}) el equipo ${cinemometro.serieOriginal} (${cinemometro.marca} ${cinemometro.modelo}, ${cinemometro.codAprobacion}) no registraba verificación alguna en el listado INTI.`,
            ] });
    }
    const ultima = anteriores[anteriores.length - 1];
    const esc = escenario(ultima.iso, fechaHechoISO);
    const estado = esc.vigente ? 'vigente' : 'vencida';
    const res = Object.assign(Object.assign({}, base), { estado, cinemometro: datos, ultimaVerifAnterior: {
            original: ultima.original,
            iso: ultima.iso,
            vencimiento: esc.vencimiento,
        }, diasExceso: esc.diasExceso, verificacionesPosteriores: posteriores, fundamentos: estado === 'vencida'
            ? [
                `Al momento del hecho (${fechaHechoISO}), la última verificación del equipo ${cinemometro.serieOriginal} (${cinemometro.marca} ${cinemometro.modelo}) fue el ${ultima.original}, cuya vigencia anual venció el ${esc.vencimiento}. El hecho ocurrió ${esc.diasExceso} días después del vencimiento de la verificación periódica (Ley 19511/72).`,
            ]
            : [
                `Verificación del ${ultima.original} vigente al momento del hecho. Revisar fundamentos alternativos (radicación, señalización, notificación).`,
            ] });
    if (ultima.isoAlt) {
        const escB = escenario(ultima.isoAlt, fechaHechoISO);
        const estadoB = escB.vigente ? 'vigente' : 'vencida';
        if (estadoB !== estado) {
            res.ambigua = true;
            res.escenarioAlternativo = { estado: estadoB, diasExceso: escB.diasExceso };
        }
    }
    return res;
}
exports.ETIQUETAS_ESTADO = {
    vigente: 'Verificación vigente',
    vencida: 'Verificación vencida',
    sin_verificacion_previa: 'Sin verificación previa al hecho',
    sin_registro: 'Sin registro INTI',
    serie_vacia: 'Serie no informada',
};
//# sourceMappingURL=cinemometros.js.map