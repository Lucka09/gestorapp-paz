// scripts/recalcular-base-recibos.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Recalcula netoGestoria, baseComisionable y costoFinanciero de cada recibo
// a partir de sus partes (monto, montoAcreditado, SUATS, informe, comisión).
//
// POR QUÉ: crearRecibo llamaba calcularNetoGestoria({ monto }) sin el resto de
// los campos, así que los recibos guardaron baseComisionable = monto. Los que
// después pasó sincronizar-suats quedaron bien en SUATS, pero los de tarjeta
// (sin SUATS) nunca descontaron el costo financiero.
//
// USO
//   node scripts/recalcular-base-recibos.mjs --dry-run --desde=2026-09-01
//   node scripts/recalcular-base-recibos.mjs --apply   --desde=2026-09-01
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'

const args  = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DESDE = args.find(a => a.startsWith('--desde='))?.split('=')[1] ?? null
const GEST  = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? 'gestoria-paz'
const SUATS_COSTO_DEFAULT = 7600

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.'); process.exit(1)
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))),
})
const db = admin.firestore()

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// Copia EXACTA de calcularNetoGestoria (finanzas.ts). Si cambia allá, cambia acá.
function calcular(r) {
  const monto = num(r.monto)
  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado)) : 0
  const precioSUATS = num(r.montoSUATS)
  const costoSUATS  = precioSUATS > 0
    ? (r.costoSUATS != null ? num(r.costoSUATS) : SUATS_COSTO_DEFAULT) : 0
  const precioInf = num(r.montoInformePersona)
  const costoInf  = precioInf > 0
    ? (r.costoInformePersona != null ? num(r.costoInformePersona) : precioInf) : 0
  const comision = num(r.comisionReferido)

  const deduc   = costoSUATS + costoInf + comision + costoFinanciero
  const deducPr = precioSUATS + precioInf + comision + costoFinanciero
  return {
    netoGestoria:     monto >= 0 ? Math.max(0, monto - deduc)   : monto + deduc,
    baseComisionable: monto >= 0 ? Math.max(0, monto - deducPr) : monto + deducPr,
    costoFinanciero,
    margenSUATS: Math.max(0, precioSUATS - costoSUATS),
  }
}

const snap = await db.collection('recibos').where('gestoriaId', '==', GEST).get()
const desde = DESDE ? new Date(DESDE + 'T00:00:00') : null

let revisados = 0, cambios = 0, difBase = 0, difNeto = 0
const porSecretario = {}
let batch = db.batch(), enBatch = 0

for (const d of snap.docs) {
  const r = d.data()
  const f = (r.fechaCobro ?? r.creadoEn)?.toDate?.()
  if (desde && (!f || f < desde)) continue
  revisados++

  const c = calcular(r)
  const cambio =
    num(r.baseComisionable) !== c.baseComisionable ||
    num(r.netoGestoria)     !== c.netoGestoria     ||
    num(r.costoFinanciero)  !== c.costoFinanciero
  if (!cambio) continue

  cambios++
  const db_ = c.baseComisionable - num(r.baseComisionable)
  difBase += db_
  difNeto += c.netoGestoria - num(r.netoGestoria)
  const quien = r.atribuidoANombre || r.emitidoPorNombre || '(sin atribuir)'
  porSecretario[quien] = (porSecretario[quien] ?? 0) + db_

  console.log(`${r.numeroRecibo ?? d.id}  ${quien}  base ${num(r.baseComisionable)} → ${c.baseComisionable}  neto ${num(r.netoGestoria)} → ${c.netoGestoria}`)

  if (APPLY) {
    batch.update(d.ref, c); enBatch++
    if (enBatch === 400) { await batch.commit(); batch = db.batch(); enBatch = 0 }
  }
}
if (APPLY && enBatch) await batch.commit()

console.log('\n── RESUMEN ──')
console.log(`Recibos revisados: ${revisados}  |  con diferencias: ${cambios}`)
console.log(`Ajuste total base de premios: ${difBase}`)
console.log(`Ajuste total neto gestoría:   ${difNeto}`)
console.log('Ajuste de base por secretario:', porSecretario)
console.log(APPLY ? '\n✓ Aplicado.' : '\n(dry-run: no se escribió nada)')
