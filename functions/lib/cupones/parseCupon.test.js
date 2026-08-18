"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// functions/src/cupones/parseCupon.test.ts
const vitest_1 = require("vitest");
const parseCupon_1 = require("./parseCupon");
// Texto real extraído del PDF de ejemplo (todo en una línea)
const EJEMPLO = 'emero de 2 X-0561621-0314-01-03022-1-Equipo Marca: TS TECNOLOGY Nro. de Serie: TS_CONTROL_X_0314 Modelo: TS CONTROL- X V2. ' +
    'Descripción de las Infracciones de acuerdo al Anexo V del Decreto Reglamentario N° 532/2009 de la Ley Provincial ' +
    '1) Por no respetar los límites reglamentarios de velocidad previstos. Importe $ 340650.0 ' +
    'Para pagos en Cajeros Banelco y Pagomiscuentas: 000420337734531 ' +
    'Para pagos en Cajeros Link y Pagos Link: 27213163162 ' +
    'IMPORTE NETO A PAGAR: $ 340650.0 ' +
    'FECHA DE VENCIMIENTO: 23/09/2026 ' +
    'CANTIDAD UF: 150 ' +
    'VALOR UF: 2271.0';
(0, vitest_1.describe)('parseCuponPDF', () => {
    (0, vitest_1.it)('extrae todos los campos del cupón de ejemplo', () => {
        const p = (0, parseCupon_1.parseCuponPDF)(EJEMPLO);
        (0, vitest_1.expect)(p.marca).toBe('TS TECNOLOGY');
        (0, vitest_1.expect)(p.serieOriginal).toBe('TS_CONTROL_X_0314');
        (0, vitest_1.expect)(p.modelo).toBe('TS CONTROL- X V2');
        (0, vitest_1.expect)(p.importeNeto).toBe(340650);
        (0, vitest_1.expect)(p.valorUF).toBe(2271);
        (0, vitest_1.expect)(p.fechaVencimiento).toBe('2026-09-23');
    });
    (0, vitest_1.it)('maneja campos faltantes sin romper', () => {
        const p = (0, parseCupon_1.parseCuponPDF)('Acta N° 02-155-00000000-0-00');
        (0, vitest_1.expect)(p.nroActa).toBe('02-155-00000000-0-00');
        (0, vitest_1.expect)(p.marca).toBeUndefined();
        (0, vitest_1.expect)(p.importeNeto).toBeUndefined();
    });
});
//# sourceMappingURL=parseCupon.test.js.map