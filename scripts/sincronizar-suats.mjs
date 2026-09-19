// scripts/sincronizar-suats.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Pone al día el desglose de SUATS en todos los recibos y recalcula las dos
// cifras nuevas: netoGestoria (descuenta el COSTO) y baseComisionable
// (descuenta el PRECIO completo).
//
// QUÉ HACE, recibo por recibo:
//   · si tiene montoSUATS pero no costoSUATS  → le carga el costo ($7.600)
//   · si el trámite lleva SUATS y el recibo no lo tiene → lo imputa
//   · recalcula netoGestoria, baseComisionable, margenSUATS, costoFinanciero
//
// DIFERENCIA CON imputar-suats-retroactivo.mjs
//   Aquel solo imputaba el precio. Este además carga el costo de producción y
//   recalcula las dos cifras separadas. Se puede correr encima de lo que ya
//   hiciste: es idempotente.
//
// USO
//   node scripts/sincronizar-suats.mjs --dry-run
//   node scripts/sincronizar-suats.mjs --dry-run --desde=2026-09-01
//   node scripts/sincronizar-suats.mjs --apply
//
//   --costo=7600      costo de producción (default 7600)
//   --precio=25000    precio al cliente para los que falten (default 25000)
//   --asumir-suats    imputa también donde requiereSUATS no esté definido
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args   = process.argv.slice(2)
const APPLY  = args.includes('--apply')
const DRY    = !APPLY
const ASUMIR = args.includes('--asumir-suats')
const COSTO  = Number(args.find(a => a.startsWith('--costo='))?.split('=')[1] ?? 7600)
const PRECIO = Number(args.find(a => a.startsWith('--precio='))?.split('=')[1] ?? 25000)
const DESDE  = args.find(a => a.startsWith('--desde='))?.split('=')[1] ?? null
const GEST   = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.')
  process.exit(1)
}

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const ms  = t => t?.toMillis?.() ?? 0
const desdeMs = DESDE ? new Date(`${DESDE}T00:00:00`).getTime() : 0

// Misma fórmula que src/lib/firestore/finanzas.ts
function calcular(r) {
  const monto = num(r.monto)
  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado)) : 0

  const precioSUATS = num(r.montoSUATS)
  const costoSUATS  = precioSUATS > 0
    ? (r.costoSUATS != null ? num(r.costoSUATS) : COSTO) : 0
  const margenSUATS = Math.max(0, precioSUATS - costoSUATS)

  const precioInf = num(r.montoInformePersona)
  const costoInf  = precioInf > 0
    ? (r.costoInformePersona != null ? num(r.costoInformePersona) : precioInf) : 0

  const comision = num(r.comisionReferido)

  const deducciones      = costoSUATS  + costoInf  + comision + costoFinanciero
  const deduccionesPremio = precioSUATS + precioInf + comision + costoFinanciero

  return {
    netoGestoria:     monto >= 0 ? Math.max(0, monto - deducciones)       : monto + deducciones,
    baseComisionable: monto >= 0 ? Math.max(0, monto - deduccionesPremio) : monto + deduccionesPremio,
    margenSUATS, costoSUATS, costoFinanciero,
  }
}

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO'}`)
console.log(`   SUATS precio $${PRECIO.toLocaleString('es-AR')} · costo $${COSTO.toLocaleString('es-AR')}`)
console.log(`   Margen por SUATS: $${(PRECIO - COSTO).toLocaleString('es-AR')}`)
console.log(`   Desde: ${DESDE ?? 'sin límite'}\n`)

// ─── 1 · CARGAR ──────────────────────────────────────────────────────────────

let rq = db.collection('recibos')
if (GEST) rq = rq.where('gestoriaId', '==', GEST)
const rSnap = await rq.get()

const recibos = []
rSnap.forEach(d => {
  const r = { id: d.id, ...d.data() }
  if (desdeMs && ms(r.creadoEn) < desdeMs) return
  recibos.push(r)
})

const tramiteIds = [...new Set(recibos.map(r => r.tramiteId).filter(Boolean))]
console.log(`Recibos en el período: ${recibos.length}`)
console.log(`Trámites involucrados: ${tramiteIds.length}\n`)

// ─── 2 · ¿QUÉ TRÁMITES LLEVAN SUATS? ─────────────────────────────────────────

console.log('Leyendo multaWorkflow y tramites...')
const info = new Map()
for (let i = 0; i < tramiteIds.length; i += 300) {
  const lote = tramiteIds.slice(i, i + 300)
  const [wfs, trs] = await Promise.all([
    db.getAll(...lote.map(id => db.collection('multaWorkflow').doc(id))),
    db.getAll(...lote.map(id => db.collection('tramites').doc(id))),
  ])
  lote.forEach((id, idx) => {
    const wf = wfs[idx].exists ? wfs[idx].data() : null
    const tr = trs[idx].exists ? trs[idx].data() : null
    info.set(id, {
      esMulta:  tr?.tipo === 'descargo_multa',
      requiere: wf?.paso1?.requiereSUATS,
      // Si el paso 7 declaró un monto, ese manda sobre el default
      montoP7:  wf?.paso7?.suatsAbonado ? num(wf.paso7.montoSUATS) : 0,
      numero:   tr?.numero ?? '', patente: tr?.patente ?? '',
    })
  })
  process.stdout.write(`  ${Math.min(i + 300, tramiteIds.length)}/${tramiteIds.length}\r`)
}
console.log(`  ${tramiteIds.length}/${tramiteIds.length} ✓\n`)

// ─── 3 · CALCULAR ────────────────────────────────────────────────────────────

const porTramite = new Map()
recibos.forEach(r => {
  if (!r.tramiteId) return
  if (!porTramite.has(r.tramiteId)) porTramite.set(r.tramiteId, [])
  porTramite.get(r.tramiteId).push(r)
})

const updates = []
const filas = [[
  'reciboId','numeroRecibo','numeroTramite','patente','monto',
  'suatsAntes','suatsDespues','costoSUATS','margen',
  'netoAntes','netoDespues','baseComisionable','accion',
].join(',')]

const stats = {
  costoAgregado: 0, suatsImputado: 0, soloRecalculo: 0, sinCambio: 0,
  margenTotal: 0, netoDelta: 0,
}

for (const [tramiteId, lista] of porTramite) {
  const i = info.get(tramiteId) ?? {}
  const suatsYaEnTramite = lista.reduce((a, r) => a + num(r.montoSUATS), 0)

  // ¿Hay que imputar SUATS a este trámite?
  let imputar = 0
  if (i.esMulta && suatsYaEnTramite === 0) {
    if (i.montoP7 > 0)            imputar = i.montoP7
    else if (i.requiere === true) imputar = PRECIO
    else if (i.requiere == null && ASUMIR) imputar = PRECIO
  }

  // Se imputa al recibo de mayor monto: es el que más pesa en el premio
  const orden = [...lista].sort((a, b) => num(b.monto) - num(a.monto))

  orden.forEach((r, idx) => {
    const antesSuats = num(r.montoSUATS)
    const antesNeto  = num(r.netoGestoria)

    const nuevo = { ...r }
    let accion = ''

    // a) imputar SUATS si falta (solo al primero)
    if (imputar > 0 && idx === 0 && antesSuats === 0) {
      nuevo.montoSUATS = Math.min(imputar, num(r.monto))
      nuevo.costoSUATS = COSTO
      accion = 'suats-imputado'
      stats.suatsImputado++
    }
    // b) cargar el costo si tiene precio pero no costo
    else if (num(nuevo.montoSUATS) > 0 && nuevo.costoSUATS == null) {
      nuevo.costoSUATS = COSTO
      accion = 'costo-agregado'
      stats.costoAgregado++
    }

    const calc = calcular(nuevo)

    // c) si no cambió nada de SUATS pero falta baseComisionable, igual recalcula
    const faltaBase = r.baseComisionable == null
    if (!accion && !faltaBase && Math.abs(calc.netoGestoria - antesNeto) < 1) {
      stats.sinCambio++
      return
    }
    if (!accion) { accion = 'recalculo'; stats.soloRecalculo++ }

    stats.margenTotal += calc.margenSUATS
    stats.netoDelta   += calc.netoGestoria - antesNeto

    updates.push({
      id: r.id,
      patch: {
        montoSUATS:       num(nuevo.montoSUATS),
        costoSUATS:       num(nuevo.costoSUATS),
        margenSUATS:      calc.margenSUATS,
        costoFinanciero:  calc.costoFinanciero,
        netoGestoria:     calc.netoGestoria,
        baseComisionable: calc.baseComisionable,
        suatsSincronizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
    })

    filas.push([
      r.id, r.numeroRecibo ?? '', i.numero ?? '', i.patente ?? '', num(r.monto),
      antesSuats, num(nuevo.montoSUATS), num(nuevo.costoSUATS), calc.margenSUATS,
      antesNeto, calc.netoGestoria, calc.baseComisionable, accion,
    ].join(','))
  })
}

writeFileSync('./sincronizacion-suats.csv', filas.join('\n'), 'utf8')

// ─── 4 · REPORTE ─────────────────────────────────────────────────────────────

console.log('─'.repeat(60))
console.log(`Recibos analizados            ${recibos.length}`)
console.log(`  SUATS imputado (faltaba)    ${stats.suatsImputado}`)
console.log(`  Costo agregado              ${stats.costoAgregado}`)
console.log(`  Solo recálculo              ${stats.soloRecalculo}`)
console.log(`  Sin cambios                 ${stats.sinCambio}`)
console.log('─'.repeat(60))
console.log(`A actualizar                  ${updates.length}`)
console.log(`Margen SUATS total            $${Math.round(stats.margenTotal).toLocaleString('es-AR')}`)
console.log(`Variación del neto            ${stats.netoDelta >= 0 ? '+' : ''}$${Math.round(stats.netoDelta).toLocaleString('es-AR')}`)
console.log('─'.repeat(60))
console.log('\n📄 ./sincronizacion-suats.csv\n')

if (stats.netoDelta > 0) {
  console.log('ℹ️  El neto SUBE porque antes se descontaban los $25.000 completos')
  console.log('   y ahora solo sale el costo real. Ese margen siempre fue de la')
  console.log('   gestoría, solo que no estaba contabilizado.\n')
}

if (DRY) {
  console.log('🔍 No se escribió nada. Revisá el CSV y corré con --apply.\n')
  process.exit(0)
}

// ─── 5 · APLICAR ─────────────────────────────────────────────────────────────

console.log(`\n⚠️  Actualizando ${updates.length} recibos...\n`)
let hechos = 0
for (let i = 0; i < updates.length; i += 400) {
  const batch = db.batch()
  updates.slice(i, i + 400).forEach(u =>
    batch.update(db.collection('recibos').doc(u.id), u.patch))
  await batch.commit()
  hechos += Math.min(400, updates.length - i)
  process.stdout.write(`  ${hechos}/${updates.length}\r`)
}
console.log(`  ${hechos}/${updates.length} ✓`)
console.log('\n✅ Listo. Verificá en Reportes que aparezca la línea de margen SUATS.')
console.log('   Los premios NO cambian: la base comisionable sigue descontando')
console.log('   los $25.000 completos.\n')
process.exit(0)
