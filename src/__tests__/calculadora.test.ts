// src/__tests__/calculadora.test.ts
// Tests para src/utils/calculadoraDNRPA.ts
//
// La calculadora es pura (sin side effects, sin Firebase) — ideal para tests.
// Cubre: tramos de transferencia, todos los tipos de trámite, overrides,
// gastos opcionales y la forma del resultado.

import { describe, it, expect } from 'vitest'
import {
  calcularHonorarios,
  TABLA_BASE_2025,
  REQUIERE_VALOR_FISCAL,
  type ParametrosCalculo,
  type ResultadoCalculo,
} from '@/utils/calculadoraDNRPA'

// ─── PARÁMETROS BASE ──────────────────────────────────────────────────────────

const BASE: ParametrosCalculo = {
  tipo:          'transferencia',
  valorFiscal:   2_000_000,
  anioVehiculo:  2020,
  tipoVehiculo:  'auto',
  honorariosCustom: 0,
  incluirGastos: false,
  provincia:     'Buenos Aires',
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function calc(overrides: Partial<ParametrosCalculo> = {}): ResultadoCalculo {
  return calcularHonorarios({ ...BASE, ...overrides })
}

// ─── FORMA DEL RESULTADO ──────────────────────────────────────────────────────

describe('ResultadoCalculo — forma y tipos', () => {
  it('devuelve las propiedades requeridas', () => {
    const r = calc()
    expect(r).toMatchObject({
      tipo:           'transferencia',
      tipoLabel:      expect.any(String),
      valorFiscal:    expect.any(Number),
      conceptos:      expect.any(Array),
      subtotalDNRPA:  expect.any(Number),
      honorariosGest: expect.any(Number),
      totalFinal:     expect.any(Number),
      esAproximado:   expect.any(Boolean),
      notas:          expect.any(Array),
    })
  })

  it('totalFinal = subtotalDNRPA + honorariosGest (sin gastos)', () => {
    const r = calc({ incluirGastos: false })
    expect(r.totalFinal).toBe(r.subtotalDNRPA + r.honorariosGest)
  })

  it('totalFinal incluye gastos cuando incluirGastos=true', () => {
    const sinGastos = calc({ incluirGastos: false })
    const conGastos = calc({ incluirGastos: true })
    expect(conGastos.totalFinal).toBeGreaterThan(sinGastos.totalFinal)
  })

  it('todos los montos son enteros (Math.round aplicado)', () => {
    const r = calc()
    expect(r.subtotalDNRPA  % 1).toBe(0)
    expect(r.honorariosGest % 1).toBe(0)
    expect(r.totalFinal     % 1).toBe(0)
  })

  it('todos los montos son positivos', () => {
    const r = calc()
    expect(r.subtotalDNRPA).toBeGreaterThan(0)
    expect(r.honorariosGest).toBeGreaterThan(0)
    expect(r.totalFinal).toBeGreaterThan(0)
    r.conceptos.forEach(c => expect(c.monto).toBeGreaterThanOrEqual(0))
  })
})

// ─── TRANSFERENCIA — TRAMOS PROGRESIVOS ───────────────────────────────────────

describe('Transferencia — escala progresiva de sellado', () => {
  const T = TABLA_BASE_2025

  it('aplica mínimo cuando el sellado calculado es menor', () => {
    // Un vehículo de valor muy bajo debería llegar al mínimo
    const r = calc({ valorFiscal: 100_000 })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBeGreaterThanOrEqual(T.transferencia.minimo)
  })

  it('tramo 1 (< 3M): usa 1.8%', () => {
    const valorFiscal = 2_000_000
    const selladoEsperado = Math.max(valorFiscal * 0.018, T.transferencia.minimo)
    const r = calc({ valorFiscal })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBe(Math.round(selladoEsperado))
  })

  it('tramo 2 (3M–8M): usa 2.0%', () => {
    const valorFiscal = 5_000_000
    const selladoEsperado = Math.max(valorFiscal * 0.020, T.transferencia.minimo)
    const r = calc({ valorFiscal })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBe(Math.round(selladoEsperado))
  })

  it('tramo 3 (8M–20M): usa 2.2%', () => {
    const valorFiscal = 12_000_000
    const selladoEsperado = Math.max(valorFiscal * 0.022, T.transferencia.minimo)
    const r = calc({ valorFiscal })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBe(Math.round(selladoEsperado))
  })

  it('tramo 4 (20M–50M): usa 2.4%', () => {
    const valorFiscal = 30_000_000
    const selladoEsperado = Math.max(valorFiscal * 0.024, T.transferencia.minimo)
    const r = calc({ valorFiscal })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBe(Math.round(selladoEsperado))
  })

  it('tramo 5 (> 50M): usa 2.6%', () => {
    const valorFiscal = 100_000_000
    const selladoEsperado = Math.max(valorFiscal * 0.026, T.transferencia.minimo)
    const r = calc({ valorFiscal })
    const sellado = r.conceptos.find(c => c.concepto.toLowerCase().includes('transferencia'))
    expect(sellado?.monto).toBe(Math.round(selladoEsperado))
  })

  it('incluye tasa registral + ITF en transferencia', () => {
    const r = calc()
    const nombres = r.conceptos.map(c => c.concepto.toLowerCase())
    expect(nombres.some(n => n.includes('tasa registral'))).toBe(true)
    expect(nombres.some(n => n.includes('itf'))).toBe(true)
  })
})

// ─── CADA TIPO DE TRÁMITE PRODUCE UN RESULTADO VÁLIDO ─────────────────────────

describe('Todos los tipos de trámite', () => {
  const tipos: Array<ParametrosCalculo['tipo']> = [
    'transferencia', 'alta', 'baja', 'tramite_08',
    'duplicado_titulo', 'duplicado_cedula', 'cambio_radicacion',
    'informe_dominio', 'certificado_dominio', 'inscripcion_inicial',
    'prenda', 'descargo_multa', 'inhibicion', 'levantamiento_inhibicion',
    'vtv', 'otro',
  ]

  tipos.forEach(tipo => {
    it(`${tipo}: subtotalDNRPA > 0`, () => {
      const r = calcularHonorarios({ ...BASE, tipo, valorFiscal: 5_000_000 })
      expect(r.subtotalDNRPA).toBeGreaterThan(0)
      expect(r.conceptos.length).toBeGreaterThan(0)
      expect(r.tipo).toBe(tipo)
    })
  })

  it('transferencia requiere valor fiscal', () => {
    expect(REQUIERE_VALOR_FISCAL).toContain('transferencia')
  })
})

// ─── HONORARIOS — PRIORIDAD DE OVERRIDES ──────────────────────────────────────

describe('Honorarios — jerarquía de overrides', () => {
  const honorarioBase = TABLA_BASE_2025.honorarios.transferencia

  it('usa el honorario de la tabla por defecto', () => {
    const r = calc({ honorariosCustom: 0 })
    expect(r.honorariosGest).toBe(honorarioBase)
  })

  it('honorariosCustom tiene la mayor prioridad', () => {
    const custom = 150_000
    const r = calc({ honorariosCustom: custom })
    expect(r.honorariosGest).toBe(custom)
  })

  it('honorariosPersonalizados sobreescribe la tabla cuando honorariosCustom=0', () => {
    const personalizado = 99_000
    const r = calcularHonorarios(
      { ...BASE, honorariosCustom: 0 },
      { transferencia: personalizado }
    )
    expect(r.honorariosGest).toBe(personalizado)
  })

  it('honorariosCustom gana sobre honorariosPersonalizados', () => {
    const custom = 75_000
    const r = calcularHonorarios(
      { ...BASE, honorariosCustom: custom },
      { transferencia: 99_000 }
    )
    expect(r.honorariosGest).toBe(custom)
  })

  it('honorariosPersonalizados puede sobreescribir solo algunos tipos', () => {
    // Sobrescribir 'alta', no 'transferencia'
    const r = calcularHonorarios(
      { ...BASE, tipo: 'transferencia', honorariosCustom: 0 },
      { alta: 50_000 }
    )
    // transferencia no está en el override → usa tabla
    expect(r.honorariosGest).toBe(honorarioBase)
  })
})

// ─── GASTOS OPCIONALES ────────────────────────────────────────────────────────

describe('Gastos adicionales', () => {
  it('incluirGastos=false no agrega conceptos de gastos', () => {
    const r = calc({ incluirGastos: false })
    const gastos = r.conceptos.filter(c => !c.obligatorio)
    expect(gastos).toHaveLength(0)
  })

  it('incluirGastos=true agrega al menos 1 concepto de gastos', () => {
    const r = calc({ incluirGastos: true })
    const gastos = r.conceptos.filter(c => !c.obligatorio)
    expect(gastos.length).toBeGreaterThan(0)
  })

  it('los conceptos obligatorios no cambian con incluirGastos', () => {
    const sin = calc({ incluirGastos: false })
    const con = calc({ incluirGastos: true })
    const obligSin = sin.conceptos.filter(c =>  c.obligatorio).length
    const obligCon = con.conceptos.filter(c =>  c.obligatorio).length
    expect(obligSin).toBe(obligCon)
  })
})

// ─── TABLA BASE — CONSISTENCIA INTERNA ───────────────────────────────────────

describe('TABLA_BASE_2025 — integridad', () => {
  it('todos los valores fijos son positivos', () => {
    const { tasaRegistral, selladoFormulario, informeDominio } = TABLA_BASE_2025
    expect(tasaRegistral).toBeGreaterThan(0)
    expect(selladoFormulario).toBeGreaterThan(0)
    expect(informeDominio).toBeGreaterThan(0)
  })

  it('transferencia.minimo es positivo', () => {
    expect(TABLA_BASE_2025.transferencia.minimo).toBeGreaterThan(0)
  })

  it('tramos de transferencia están ordenados', () => {
    const tramos = TABLA_BASE_2025.transferencia.tramos
    for (let i = 0; i < tramos.length - 1; i++) {
      expect(tramos[i].hasta).toBeLessThan(tramos[i + 1].hasta)
    }
  })

  it('todos los honorarios sugeridos son positivos', () => {
    Object.values(TABLA_BASE_2025.honorarios).forEach(h => {
      expect(h).toBeGreaterThan(0)
    })
  })
})