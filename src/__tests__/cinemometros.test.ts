import { describe, expect, it } from 'vitest';
import {
  clavesDeSerie,
  diasEntre,
  evaluarVerificacion,
  normalizarSerie,
  parseFechaVerificacion,
  type Cinemometro,
} from '../lib/cinemometros';

const cinemometroDe = (id: string, fechas: string[]): Cinemometro => ({
  id,
  marca: 'STALKER / SERVITEC',
  modelo: 'LIDAR XLR / S13',
  serieOriginal: id,
  serieVariants: [id],
  codAprobacion: 'DNCI Nº 02/2015',
  tipo: 'Portátil',
  lugar: '',
  fuente: 'INTI-2025',
  actualizadoEl: '2025-01-01',
  verificaciones: fechas.map((f) => parseFechaVerificacion(f)),
});

describe('normalización de series', () => {
  it('unifica separadores y mayúsculas', () => {
    expect(normalizarSerie(' 13003 0007 ')).toBe('130030007');
    expect(normalizarSerie('ts_control_x_0314')).toBe('TSCONTROLX0314');
  });
  it('genera claves por variante y descarta triviales', () => {
    expect(clavesDeSerie('LF001656 / 002-LF001656')).toEqual(['LF001656', '002LF001656']);
    expect(clavesDeSerie('LS079006/080534 / RC/008')).toEqual(['LS079006', '080534']);
  });
});

describe('parseo de fechas del XLSX INTI', () => {
  it('DD/MM/YYYY directo', () => {
    const v = parseFechaVerificacion('29/04/2025');
    expect(v.iso).toBe('2025-04-29');
    expect(v.ambigua).toBe(false);
  });
  it('detecta formato US cuando el "mes" es imposible', () => {
    expect(parseFechaVerificacion('9/23/24').iso).toBe('2024-09-23');
    expect(parseFechaVerificacion('10/14/24').iso).toBe('2024-10-14');
  });
  it('marca ambigua cuando ambos son plausibles y deja alternativa', () => {
    const v = parseFechaVerificacion('12/6/23');
    expect(v.iso).toBe('2023-06-12');
    expect(v.isoAlt).toBe('2023-12-06');
    expect(v.ambigua).toBe(true);
  });
  it('maneja Primitiva y basura', () => {
    expect(parseFechaVerificacion('Primitiva').primitiva).toBe(true);
    expect(parseFechaVerificacion('k').iso).toBeNull();
    expect(parseFechaVerificacion('').iso).toBeNull();
  });
});

describe('evaluarVerificacion', () => {
  const lf = cinemometroDe('LF001624', ['Primitiva', '4/29/19', '9/14/20', '30/08/2021', '8/10/22']);

  it('sin registro INTI', () => {
    const r = evaluarVerificacion(undefined, 'TS_CONTROL_X_0314', '2023-01-08');
    expect(r.estado).toBe('sin_registro');
    expect(r.fundamentos[0]).toContain('TS_CONTROL_X_0314');
  });

  it('vigente dentro del año', () => {
    const r = evaluarVerificacion(lf, 'LF001624', '2021-01-08');
    expect(r.estado).toBe('vigente');
    expect(r.ultimaVerifAnterior?.iso).toBe('2020-09-14');
  });

  it('vencida con días de exceso', () => {
    // Hueco entre la verificación 2019-04-29 y la siguiente (2020-09-14):
    // un hecho el 2020-06-01 queda fuera del año de vigencia.
    const r = evaluarVerificacion(lf, 'LF001624', '2020-06-01');
    expect(r.estado).toBe('vencida');
    expect(r.ultimaVerifAnterior?.iso).toBe('2019-04-29');
    expect(r.ultimaVerifAnterior?.vencimiento).toBe('2020-04-29');
    expect(r.diasExceso).toBe(33);
  });

  it('sin verificación previa al hecho', () => {
    const r = evaluarVerificacion(lf, 'LF001624', '2018-06-01');
    expect(r.estado).toBe('sin_verificacion_previa');
  });

  it('ambigua que invierte el resultado => revisión humana', () => {
    const amb = cinemometroDe('TEST01', ['12/6/23']);
    const r = evaluarVerificacion(amb, 'TEST01', '2024-06-20');
    // DD/MM: venció 2024-06-12 => vencida | MM/DD: vence 2024-12-06 => vigente
    expect(r.estado).toBe('vencida');
    expect(r.ambigua).toBe(true);
    expect(r.escenarioAlternativo?.estado).toBe('vigente');
  });
});