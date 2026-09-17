// scripts/imputar-suats-retroactivo.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Imputa el SUATS a los recibos ya emitidos de trámites de multas que todavía
// no llegaron al paso 7.
//
// POR QUÉ HACE FALTA
//   `migrar-recibos-retroactivo.mjs` dio "0 con deducción imputada". No es un
//   error: leía `multaWorkflow.paso7`, y ninguno de los 73 trámites de
//   septiembre llegó ahí. El SUATS se cobró al cliente pero nunca quedó
//   registrado como deducción, así que Reportes muestra $0 y el neto de la
//   gestoría aparece inflado en ~$25.000 por trámite.
//
// QUÉ HACE
//   Para cada trámite de tipo `descargo_multa` con recibos cobrados:
//     · lee `multaWorkflow.paso1.requiereSUATS`
//     · si es true (o si falta el dato y se pasa --asumir-suats), imputa
//       $25.000 al recibo más grande del trámite
//     · recalcula `netoGestoria` de ese recibo
//
// ⚠️ ESTO ES UNA IMPUTACIÓN, NO UN DATO REAL
//   Asume que a cada trámite que requería SUATS se le cobró el monto estándar.
//   Si algún cliente pagó un SUATS distinto, o si se cobró el honorario sin el
//   SUATS todavía, el número va a quedar aproximado. Revisá el CSV antes de
//   aplicar. De acá en adelante el dato sale del formulario de cobro y deja de
//   ser una estimación.
//
// USO
//   node scripts/imputar-suats-retroactivo.mjs --dry-run
//   node scripts/imputar-suats-retroactivo.mjs --dry-run --desde=2026-09-01
//   node scripts/imputar-suats-retroactivo.mjs --apply --desde=2026-09-01
//
//   --asumir-suats   imputa también donde requiereSUATS no está definido
//                    (regla del negocio: todas las multas llevan SUATS salvo
//                     que se confirme lo contrario)
//   --monto=25000    monto del SUATS (default 25000)
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args   = process.argv.slice(2)
const APPLY  = args.includes('--apply')
const DRY    = !APPLY
const ASUMIR = args.includes('--asumir-suats')
const MONTO  = Number(args.find(a => a.startsWith('--monto='))?.split('=')[1] ?? 25000)
const DESDE  = args.find(a => a.startsWith('--desde='))?.split('=')[1] ?? null
const GEST   = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const desdeMs = DESDE ? new Date(`${DESDE}T00:00:00`).getTime() : 0

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO'}`)
console.log(`   SUATS: $${MONTO.toLocaleString('es-AR')}`)
console.log(`   Desde: ${DESDE ?? 'sin límite'}`)
console.log(`   Asumir SUATS si falta el dato: ${ASUMIR ? 'SÍ' : 'no'}\n`)

// ─── 1. RECIBOS ──────────────────────────────────────────────────────────────

let q = db.collection('recibos')
if (GEST) q = q.where('gestoriaId', '==', GEST)
const recibosSnap = await q.get()

const porTramite = new Map()
recibosSnap.forEach(d => {
  const r = { id: d.id, ...d.data() }
  if (!r.tramiteId) return
  const ms = r.creadoEn?.toMillis?.() ?? 0
  if (desdeMs && ms < desdeMs) return
  if (r.tipo === 'devolucion' || num(r.monto) < 0) return   // no se toca
  if (!porTramite.has(r.tramiteId)) porTramite.set(r.tramiteId, [])
  porTramite.get(r.tramiteId).push(r)
})

console.log(`Recibos en el período: ${recibosSnap.size}`)
console.log(`Trámites con cobros:   ${porTramite.size}\n`)

// ─── 2. WORKFLOWS Y TRÁMITES ─────────────────────────────────────────────────

const ids = [...porTramite.keys()]
const info = new Map()

console.log('Leyendo multaWorkflow y tramites...')
for (let i = 0; i < ids.length; i += 300) {
  const lote = ids.slice(i, i + 300)
  const [wfs, trs] = await Promise.all([
    db.getAll(...lote.map(id => db.collection('multaWorkflow').doc(id))),
    db.getAll(...lote.map(id => db.collection('tramites').doc(id))),
  ])
  lote.forEach((id, idx) => {
    const wf = wfs[idx].exists ? wfs[idx].data() : null
    const tr = trs[idx].exists ? trs[idx].data() : null
    info.set(id, {
      esMulta:    tr?.tipo === 'descargo_multa',
      requiere:   wf?.paso1?.requiereSUATS,     // true | false | undefined
      yaEnPaso7:  !!wf?.paso7,
      pasoActual: wf?.pasoActual ?? 0,
      numero:     tr?.numero ?? '',
      patente:    tr?.patente ?? '',
    })
  })
  process.stdout.write(`  ${Math.min(i + 300, ids.length)}/${ids.length}\r`)
}
console.log(`  ${ids.length}/${ids.length} ✓\n`)

// ─── 3. CALCULAR ─────────────────────────────────────────────────────────────

const updates = []
const filas = [[
  'reciboId','numeroRecibo','tramiteId','numero','patente','monto',
  'suatsPrevio','suatsImputado','netoAntes','netoDespues','requiereSUATS','nota',
].join(',')]

const stats = {
  imputados: 0, yaTenian: 0, noMulta: 0,
  noRequiere: 0, sinDato: 0, montoTotal: 0,
}

for (const [tramiteId, recibos] of porTramite) {
  const i = info.get(tramiteId) ?? {}

  if (!i.esMulta) { stats.noMulta++; continue }

  // ¿Ya tiene el SUATS imputado en algún recibo del trámite?
  const suatsYaImputado = recibos.reduce((a, r) => a + num(r.montoSUATS), 0)
  if (suatsYaImputado > 0) { stats.yaTenian++; continue }

  // ¿Corresponde imputar?
  let corresponde = false
  let nota = ''
  if (i.requiere === true) {
    corresponde = true
  } else if (i.requiere === false) {
    stats.noRequiere++
    continue
  } else {
    // dato ausente
    if (ASUMIR) { corresponde = true; nota = 'asumido-sin-dato' }
    else { stats.sinDato++; continue }
  }
  if (!corresponde) continue

  // Se imputa al recibo de mayor monto: es el que más pesa en el premio.
  recibos.sort((a, b) => num(b.monto) - num(a.monto))
  const objetivo = recibos[0]
  const monto = num(objetivo.monto)

  // No puede superar el propio recibo (dejaría neto negativo).
  const imputado = Math.min(MONTO, monto)
  if (imputado <= 0) continue

  const netoAntes = num(objetivo.netoGestoria) || monto
  const otrasDeduc = num(objetivo.montoInformePersona)
                   + num(objetivo.comisionReferido)
                   + num(objetivo.costoFinanciero)
  const netoDespues = Math.max(0, monto - imputado - otrasDeduc)

  updates.push({
    id: objetivo.id,
    patch: {
      montoSUATS:    imputado,
      netoGestoria:  netoDespues,
      suatsImputadoEn: admin.firestore.FieldValue.serverTimestamp(),
      suatsImputadoOrigen: nota || 'paso1.requiereSUATS',
    },
  })

  stats.imputados++
  stats.montoTotal += imputado

  filas.push([
    objetivo.id, objetivo.numeroRecibo ?? '', tramiteId,
    i.numero ?? '', i.patente ?? '', monto,
    suatsYaImputado, imputado, netoAntes, netoDespues,
    String(i.requiere), nota,
  ].join(','))
}

// ─── 4. REPORTE ──────────────────────────────────────────────────────────────

writeFileSync('./imputacion-suats-preview.csv', filas.join('\n'), 'utf8')

console.log('─'.repeat(58))
console.log(`Trámites con cobros         ${porTramite.size}`)
console.log(`  a imputar                 ${stats.imputados}`)
console.log(`  ya tenían SUATS           ${stats.yaTenian}`)
console.log(`  no son multas             ${stats.noMulta}`)
console.log(`  requiereSUATS = false     ${stats.noRequiere}`)
console.log(`  sin dato (no imputado)    ${stats.sinDato}`)
console.log('─'.repeat(58))
console.log(`SUATS total a deducir       $${stats.montoTotal.toLocaleString('es-AR')}`)
console.log('─'.repeat(58))
console.log('\n📄 Detalle en ./imputacion-suats-preview.csv')

if (stats.sinDato > 0 && !ASUMIR) {
  console.log(
    `\nℹ️  ${stats.sinDato} trámites no tienen paso1.requiereSUATS definido.\n` +
    '   Si la regla es "todas las multas llevan SUATS salvo que se confirme lo\n' +
    '   contrario", volvé a correr con --asumir-suats.',
  )
}

if (DRY) {
  console.log('\n🔍 DRY-RUN — no se escribió nada.')
  console.log('Abrí el CSV, verificá contra lo que realmente se cobró, y corré --apply.\n')
  process.exit(0)
}

// ─── 5. APLICAR ──────────────────────────────────────────────────────────────

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
console.log(`\n✅ Listo. El neto de la gestoría baja $${stats.montoTotal.toLocaleString('es-AR')}.`)
console.log('   Ese monto no era plata de la gestoría: era el SUATS del cliente.\n')
process.exit(0)
