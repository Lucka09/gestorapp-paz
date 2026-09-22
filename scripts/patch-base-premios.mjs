// scripts/patch-base-premios.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Corrige la base de premios de los secretarios comerciales.
//
//  1. finanzas.ts      netoDeRecibo/baseDeRecibo recalculan SIEMPRE desde las
//                      partes del recibo (antes preferían el valor guardado,
//                      que estaba mal: base = monto sin descontar tarjeta).
//  2. recibos.ts       crearRecibo le pasa el recibo completo al cálculo
//                      (antes solo { monto }).
//  3. metricasEquipo   la tabla de secretarios (ingresosMes / ingresosSemana)
//                      y el scorecard (ingresos) pasan a la BASE DE PREMIOS.
//                      El neto sigue disponible en netoMes / netoGestoria.
//
// USO
//   node scripts/patch-base-premios.mjs            # verifica anclas, no escribe
//   node scripts/patch-base-premios.mjs --apply    # escribe
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')

const PATCHES = [
  // ═══ finanzas.ts ══════════════════════════════════════════════════════════
  {
    file: 'src/lib/firestore/finanzas.ts',
    marker: 'SIEMPRE desde las partes',
    ops: [
      {
        find: `  montoAcreditado?:     number   // tarjeta: lo que realmente entra`,
        repl: `  montoAcreditado?:     number   // tarjeta: lo que realmente entra
  costoFinanciero?:     number   // fallback si no se cargó montoAcreditado`,
      },
      {
        find: `  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado))
    : 0`,
        repl: `  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado))
    : Math.max(0, num(r.costoFinanciero))`,
      },
      {
        find: `/** Neto de un recibo guardado, con cascada defensiva para los viejos. */
export function netoDeRecibo(r: any): number {
  if (typeof r?.netoGestoria === 'number' && Number.isFinite(r.netoGestoria)) {
    return r.netoGestoria
  }
  return calcularNetoGestoria(r ?? { monto: 0 }).netoGestoria
}

/** Base comisionable de un recibo guardado. */
export function baseDeRecibo(r: any): number {
  if (typeof r?.baseComisionable === 'number' && Number.isFinite(r.baseComisionable)) {
    return r.baseComisionable
  }
  return calcularNetoGestoria(r ?? { monto: 0 }).baseComisionable
}`,
        repl: `// Neto y base se calculan SIEMPRE desde las partes del recibo (monto, tarjeta,
// SUATS, informe, comisión). Los campos netoGestoria / baseComisionable
// guardados son solo caché: si alguien corrige el montoAcreditado después de
// emitir el recibo, o el recibo se guardó con un cálculo viejo, el valor
// guardado queda desactualizado. Recalcular es barato y nunca miente.

/** Ingreso real de la gestoría para un recibo. */
export function netoDeRecibo(r: any): number {
  return calcularNetoGestoria(r ?? { monto: 0 }).netoGestoria
}

/** Base de premios para un recibo. */
export function baseDeRecibo(r: any): number {
  return calcularNetoGestoria(r ?? { monto: 0 }).baseComisionable
}`,
      },
      {
        find: `  acc.netoGestoria     += netoDeRecibo(r)
  acc.baseComisionable += baseDeRecibo(r)`,
        repl: `  acc.netoGestoria     += calc.netoGestoria
  acc.baseComisionable += calc.baseComisionable`,
      },
    ],
  },

  // ═══ recibos.ts ═══════════════════════════════════════════════════════════
  {
    file: 'src/lib/firestore/recibos.ts',
    marker: 'calcularNetoGestoria({ ...data })',
    ops: [
      { find: `calcularNetoGestoria({ monto: data.monto })`,
        repl: `calcularNetoGestoria({ ...data })` },
    ],
  },

  // ═══ metricasEquipo.ts ════════════════════════════════════════════════════
  {
    file: 'src/lib/firestore/metricasEquipo.ts',
    marker: 'baseMes',
    ops: [
      {
        find: `import { fechaDeRecibo, netoDeRecibo as netoDeReciboFinanzas } from './finanzas'`,
        repl: `import { fechaDeRecibo, calcularNetoGestoria } from './finanzas'`,
      },
      {
        find: `  netoGestoria:        number   // base comisionable para premios
  /** @deprecated alias de netoGestoria — mantener hasta migrar los consumidores */
  ingresos:            number`,
        repl: `  netoGestoria:        number   // ingreso real (descuenta el COSTO del SUATS)
  baseComisionable:    number   // base de premios (PRECIO SUATS/informe, tarjeta, comisión, devoluciones)
  /** alias de baseComisionable — lo que cuenta para premios */
  ingresos:            number`,
      },
      {
        find: `    netoGestoria: 0, ingresos: 0,`,
        repl: `    netoGestoria: 0, baseComisionable: 0, ingresos: 0,`,
      },
      {
        // borrar el wrapper local: ya no se usa (noUnusedLocals)
        find: `/**
 * Neto de un recibo. Si el recibo ya trae \`netoGestoria\` persistido, se usa.
 * Si no (recibos anteriores a la migración), se recalcula desde las partes.
 * Fallback final: el monto bruto — un recibo viejo sin desglose se considera
 * todo ingreso, que es como se contaba hasta ahora.
 */
function netoDeRecibo(r: any): number {
  // Misma fórmula que Reportes y Panel (finanzas.ts): una sola fuente de verdad.
  return netoDeReciboFinanzas(r)
}
`,
        repl: ``,
      },
      {
        find: `    f.deducComision   += num(r.comisionReferido)
    f.deducFinanciero += num(r.costoFinanciero)
    f.netoGestoria    += netoDeRecibo(r)`,
        repl: `    f.deducComision   += num(r.comisionReferido)
    const calc = calcularNetoGestoria(r)
    f.deducFinanciero  += calc.costoFinanciero
    f.netoGestoria     += calc.netoGestoria
    f.baseComisionable += calc.baseComisionable`,
      },
      {
        find: `  return Object.values(acc).map(f => ({ ...f, ingresos: f.netoGestoria }))`,
        repl: `  return Object.values(acc).map(f => ({ ...f, ingresos: f.baseComisionable }))`,
      },
      {
        find: `  netoSemana:     number
  netoMes:        number`,
        repl: `  netoSemana:     number
  netoMes:        number
  // base de premios (lo que cuenta para objetivos del secretario)
  baseSemana:     number
  baseMes:        number`,
      },
      {
        find: `  /** @deprecated alias de netoMes */
  ingresosMes:    number
  /** @deprecated alias de netoSemana */
  ingresosSemana: number`,
        repl: `  /** alias de baseMes — lo que muestra el Panel de Mando */
  ingresosMes:    number
  /** alias de baseSemana */
  ingresosSemana: number`,
      },
      {
        find: `    netoSemana: 0,  netoMes: 0,`,
        repl: `    netoSemana: 0,  netoMes: 0,
    baseSemana: 0,  baseMes: 0,`,
      },
      {
        find: `    const bruto = num(r.monto)
    const neto  = netoDeRecibo(r)
    const dedu  = Math.max(0, bruto - neto)`,
        repl: `    const bruto = num(r.monto)
    const calc  = calcularNetoGestoria(r)
    const neto  = calc.netoGestoria
    const base  = calc.baseComisionable
    const dedu  = Math.max(0, bruto - neto)`,
      },
      {
        find: `      f.netoMes        += neto`,
        repl: `      f.netoMes        += neto
      f.baseMes        += base`,
      },
      {
        find: `      f.netoSemana  += neto`,
        repl: `      f.netoSemana  += neto
      f.baseSemana  += base`,
      },
      {
        find: `    ingresosMes:    f.netoMes,
    ingresosSemana: f.netoSemana,`,
        repl: `    ingresosMes:    f.baseMes,
    ingresosSemana: f.baseSemana,`,
      },
      {
        find: `    t.deducFinanciero += num(r.costoFinanciero)
    t.netoGestoria    += netoDeRecibo(r)`,
        repl: `    const calc = calcularNetoGestoria(r)
    t.deducFinanciero += calc.costoFinanciero
    t.netoGestoria    += calc.netoGestoria`,
      },
    ],
  },
]

// ─── MOTOR ───────────────────────────────────────────────────────────────────
let fallas = 0
for (const p of PATCHES) {
  if (!existsSync(p.file)) { console.log(`✗ ${p.file}: no existe`); fallas++; continue }
  const raw  = readFileSync(p.file, 'utf8')
  const crlf = raw.includes('\r\n')
  let src    = raw.replace(/\r\n/g, '\n')

  if (src.includes(p.marker)) { console.log(`• ${p.file}: ya estaba parcheado`); continue }

  const faltan = []
  for (const [i, op] of p.ops.entries()) {
    const n = src.split(op.find).length - 1
    if (n !== 1) { faltan.push(`op ${i + 1}: ancla encontrada ${n} veces\n    «${op.find.split('\n')[0].trim()}»`); continue }
    src = src.replace(op.find, () => op.repl)
  }
  if (faltan.length) {
    fallas++
    console.log(`✗ ${p.file}: no se toca\n  ${faltan.join('\n  ')}`)
    continue
  }
  if (APPLY) writeFileSync(p.file, crlf ? src.replace(/\n/g, '\r\n') : src)
  console.log(`✓ ${p.file}: ${p.ops.length} cambios${APPLY ? ' aplicados' : ' listos'}`)
}
console.log(fallas ? `\n${fallas} archivo(s) con problemas — pasame el error.` :
  APPLY ? '\nListo. Corré npm run build.' : '\nTodo OK. Repetí con --apply.')
process.exit(fallas ? 1 : 0)
