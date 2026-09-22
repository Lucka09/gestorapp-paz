// scripts/diagnostico-base-premios.mjs — SOLO LECTURA
// Arma, desde los recibos del mes, lo mismo que debería mostrar el Panel:
// bruto, SUATS, tarjeta, base de premios y neto, por secretario.
// También lista los recibos con tarjeta y los que tienen algo raro
// (devoluciones, neto recortado a 0, SUATS sin costo).
//
//   node scripts/diagnostico-base-premios.mjs --desde=2026-09-01

import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'

const args  = process.argv.slice(2)
const DESDE = args.find(a => a.startsWith('--desde='))?.split('=')[1] ?? '2026-09-01'
const GEST  = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? 'gestoria-paz'
const SUATS_COSTO_DEFAULT = 7600

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))),
})
const db = admin.firestore()
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const $ = n => '$' + Math.round(n).toLocaleString('es-AR')

const snap  = await db.collection('recibos').where('gestoriaId', '==', GEST).get()
const desde = new Date(DESDE + 'T00:00:00')

const porSec = {}
const tot = { bruto: 0, devol: 0, suatsPrecio: 0, suatsCosto: 0, informe: 0, comision: 0, tarjeta: 0, base: 0, neto: 0 }
const tarjetas = [], raros = []

for (const d of snap.docs) {
  const r = d.data()
  const f = (r.fechaCobro ?? r.creadoEn)?.toDate?.()
  if (!f || f < desde) continue

  const monto   = num(r.monto)
  const tarjeta = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado)) : Math.max(0, num(r.costoFinanciero))
  const pS = num(r.montoSUATS)
  const cS = pS > 0 ? (r.costoSUATS != null ? num(r.costoSUATS) : SUATS_COSTO_DEFAULT) : 0
  const pI = num(r.montoInformePersona)
  const cI = pI > 0 ? (r.costoInformePersona != null ? num(r.costoInformePersona) : pI) : 0
  const com = num(r.comisionReferido)
  const dN = cS + cI + com + tarjeta, dB = pS + pI + com + tarjeta
  const neto = monto >= 0 ? Math.max(0, monto - dN) : monto + dN
  const base = monto >= 0 ? Math.max(0, monto - dB) : monto + dB

  const quien = r.atribuidoANombre || r.emitidoPorNombre || '(sin atribuir)'
  const s = porSec[quien] ??= { recibos: 0, bruto: 0, suats: 0, tarjeta: 0, base: 0, neto: 0 }
  s.recibos++; s.bruto += monto; s.suats += pS; s.tarjeta += tarjeta; s.base += base; s.neto += neto

  if (monto < 0 || r.tipo === 'devolucion') tot.devol += Math.abs(monto)
  else tot.bruto += monto
  tot.suatsPrecio += pS; tot.suatsCosto += cS; tot.informe += pI; tot.comision += com
  tot.tarjeta += tarjeta; tot.base += base; tot.neto += neto

  const id = `${r.numeroRecibo ?? d.id} ${r.patente ?? ''} (${quien})`
  if (tarjeta > 0) tarjetas.push(`${id}  monto ${$(monto)}  acreditado ${$(num(r.montoAcreditado))}  costo ${$(tarjeta)}  base ${$(base)}  baseGuardada ${$(num(r.baseComisionable))}`)
  if (monto < 0 || r.tipo === 'devolucion') raros.push(`DEVOLUCIÓN  ${id}  ${$(monto)}`)
  if (monto >= 0 && monto - dN < 0) raros.push(`NETO RECORTADO A 0  ${id}  monto ${$(monto)}  deducciones ${$(dN)}`)
  if (monto >= 0 && monto - dB < 0) raros.push(`BASE RECORTADA A 0  ${id}  monto ${$(monto)}  deducciones ${$(dB)}`)
}

console.log(`\n── TOTALES desde ${DESDE} ──`)
console.log(`Cobrado bruto          ${$(tot.bruto)}`)
console.log(`Devoluciones          −${$(tot.devol)}`)
console.log(`SUATS precio          −${$(tot.suatsPrecio)}   (costo ${$(tot.suatsCosto)})`)
console.log(`Informe persona       −${$(tot.informe)}`)
console.log(`Comisiones            −${$(tot.comision)}`)
console.log(`Tarjeta               −${$(tot.tarjeta)}`)
console.log(`BASE DE PREMIOS        ${$(tot.base)}`)
console.log(`Ingreso real (neto)    ${$(tot.neto)}`)

console.log('\n── POR SECRETARIO ──')
for (const [n, s] of Object.entries(porSec).sort((a, b) => b[1].base - a[1].base))
  console.log(`${n.padEnd(22)} recibos ${String(s.recibos).padStart(3)}  bruto ${$(s.bruto).padStart(13)}  SUATS ${$(s.suats).padStart(11)}  tarjeta ${$(s.tarjeta).padStart(11)}  BASE ${$(s.base).padStart(13)}  neto ${$(s.neto).padStart(13)}`)

console.log(`\n── RECIBOS CON TARJETA (${tarjetas.length}) ──`); tarjetas.forEach(l => console.log(l))
console.log(`\n── A REVISAR (${raros.length}) ──`); raros.forEach(l => console.log(l))
