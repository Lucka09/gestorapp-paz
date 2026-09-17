// scripts/corregir-recibo-tarjeta.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Corrige recibos ya emitidos donde se cobró con tarjeta y quedó registrado
// como ingreso el monto que pagó el cliente, en vez de lo que realmente entró
// a la gestoría.
//
// POR QUÉ UN SCRIPT Y NO LA UI
//   Las reglas de Firestore solo permiten `create` sobre `recibos`, sin update
//   ni delete. Es correcto: un recibo emitido no se edita. Pero el desglose
//   interno (cuánto de ese cobro es costo financiero) no es parte del
//   comprobante que vio el cliente — es contabilidad interna. El Admin SDK
//   pasa por encima de las reglas, así que se corrige desde acá con registro.
//
//   El monto del recibo NO se toca: el cliente pagó lo que pagó y su
//   comprobante sigue siendo válido. Lo que se agrega es `montoAcreditado`, y
//   con eso se recalcula el neto.
//
// USO
//   # 1. Ver los candidatos (tarjeta / mercadopago sin montoAcreditado)
//   node scripts/corregir-recibo-tarjeta.mjs --listar
//
//   # 2. Corregir uno puntual
//   node scripts/corregir-recibo-tarjeta.mjs --recibo=REC-2026-0042 --acreditado=180000 --apply
//
//   # 3. Corregir varios desde un CSV: numeroRecibo,montoAcreditado
//   node scripts/corregir-recibo-tarjeta.mjs --csv=./correcciones.csv --apply
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args  = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LISTAR = args.includes('--listar')
const RECIBO = args.find(a => a.startsWith('--recibo='))?.split('=')[1] ?? null
const ACRED  = args.find(a => a.startsWith('--acreditado='))?.split('=')[1] ?? null
const CSV    = args.find(a => a.startsWith('--csv='))?.split('=')[1] ?? null
const GEST   = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// Misma fórmula que src/lib/firestore/finanzas.ts
function calcularNeto(r) {
  const monto = num(r.monto)
  const costoFinanciero = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado))
    : 0
  const deducciones = num(r.montoSUATS) + num(r.montoInformePersona)
                    + num(r.comisionReferido) + costoFinanciero
  const neto = monto >= 0
    ? Math.max(0, monto - deducciones)
    : monto + deducciones
  return { netoGestoria: neto, costoFinanciero, deducciones }
}

// ─── CARGA ───────────────────────────────────────────────────────────────────

let q = db.collection('recibos')
if (GEST) q = q.where('gestoriaId', '==', GEST)
const snap = await q.get()

const recibos = snap.docs.map(d => ({ id: d.id, ...d.data() }))

// ─── MODO LISTAR ─────────────────────────────────────────────────────────────

if (LISTAR || (!RECIBO && !CSV)) {
  const METODOS_TARJETA = ['tarjeta', 'mercadopago', 'mercado_pago', 'debito', 'credito']

  const candidatos = recibos.filter(r => {
    const fp = String(r.formaPago ?? '').toLowerCase()
    const esTarjeta = METODOS_TARJETA.some(m => fp.includes(m))
    const sinAcreditado = r.montoAcreditado == null
    return esTarjeta && sinAcreditado && num(r.monto) > 0
  })

  // "Mixto" también puede esconder una parte en tarjeta: se listan aparte.
  const mixtos = recibos.filter(r =>
    String(r.formaPago ?? '').toLowerCase().includes('mixto') &&
    r.montoAcreditado == null && num(r.monto) > 0)

  console.log(`\nRecibos totales: ${recibos.length}`)
  console.log(`Con tarjeta sin monto acreditado: ${candidatos.length}`)
  console.log(`Con forma "mixto" (revisar a mano): ${mixtos.length}\n`)

  const filas = [['numeroRecibo','fecha','patente','monto','formaPago','netoActual','atribuidoANombre','tipo'].join(',')]

  for (const r of [...candidatos, ...mixtos]) {
    const fecha = r.creadoEn?.toDate?.()?.toISOString?.().slice(0, 10) ?? ''
    filas.push([
      r.numeroRecibo ?? r.id, fecha, r.patente ?? '',
      num(r.monto), r.formaPago ?? '',
      num(r.netoGestoria), `"${r.atribuidoANombre ?? ''}"`,
      String(r.formaPago ?? '').toLowerCase().includes('mixto') ? 'mixto' : 'tarjeta',
    ].join(','))
  }

  writeFileSync('./recibos-tarjeta-a-corregir.csv', filas.join('\n'), 'utf8')
  console.log('📄 ./recibos-tarjeta-a-corregir.csv')
  console.log('\nCompletá una columna montoAcreditado y corré:')
  console.log('  node scripts/corregir-recibo-tarjeta.mjs --csv=./correcciones.csv --apply')
  console.log('\nO corregí uno solo:')
  console.log('  node scripts/corregir-recibo-tarjeta.mjs --recibo=REC-2026-0042 --acreditado=180000 --apply\n')

  // Muestra los 10 más grandes, para atacar primero lo que más mueve la aguja
  const top = [...candidatos].sort((a, b) => num(b.monto) - num(a.monto)).slice(0, 10)
  if (top.length) {
    console.log('Los 10 de mayor monto:')
    for (const r of top) {
      console.log(`  ${String(r.numeroRecibo ?? r.id).padEnd(16)} ` +
                  `${String(r.patente ?? '').padEnd(9)} ` +
                  `$${num(r.monto).toLocaleString('es-AR').padStart(12)}  ${r.formaPago}`)
    }
    console.log()
  }
  process.exit(0)
}

// ─── CORRECCIONES A APLICAR ──────────────────────────────────────────────────

const correcciones = []

if (RECIBO) {
  if (ACRED == null) {
    console.error('Falta --acreditado=<monto>')
    process.exit(1)
  }
  correcciones.push({ numeroRecibo: RECIBO, montoAcreditado: Number(ACRED) })
}

if (CSV) {
  const lineas = readFileSync(CSV, 'utf8').trim().split('\n')
  const head = lineas[0].split(',').map(s => s.trim())
  const iNum = head.indexOf('numeroRecibo')
  const iAcr = head.indexOf('montoAcreditado')
  if (iNum < 0 || iAcr < 0) {
    console.error('El CSV necesita las columnas numeroRecibo y montoAcreditado')
    process.exit(1)
  }
  for (const l of lineas.slice(1)) {
    const c = l.split(',')
    const n = (c[iNum] ?? '').trim()
    const a = Number((c[iAcr] ?? '').trim())
    if (n && Number.isFinite(a) && a > 0) {
      correcciones.push({ numeroRecibo: n, montoAcreditado: a })
    }
  }
}

console.log(`\n${APPLY ? '⚠️  APLICANDO' : '🔍 SIMULACIÓN'} · ${correcciones.length} correcciones\n`)

const porNumero = new Map(recibos.map(r => [String(r.numeroRecibo ?? r.id), r]))
const updates = []

for (const c of correcciones) {
  const r = porNumero.get(c.numeroRecibo)
  if (!r) {
    console.warn(`  ✗ ${c.numeroRecibo} — no encontrado`)
    continue
  }

  const monto = num(r.monto)
  if (c.montoAcreditado > monto) {
    console.warn(
      `  ✗ ${c.numeroRecibo} — acreditado ($${c.montoAcreditado.toLocaleString('es-AR')}) ` +
      `mayor al cobro ($${monto.toLocaleString('es-AR')})`)
    continue
  }

  const antes = num(r.netoGestoria) || monto
  const { netoGestoria, costoFinanciero } =
    calcularNeto({ ...r, montoAcreditado: c.montoAcreditado })

  console.log(
    `  ${c.numeroRecibo.padEnd(16)} cobrado $${monto.toLocaleString('es-AR').padStart(11)} · ` +
    `acreditado $${c.montoAcreditado.toLocaleString('es-AR').padStart(11)} · ` +
    `costo $${costoFinanciero.toLocaleString('es-AR').padStart(9)} · ` +
    `neto ${antes.toLocaleString('es-AR')} → ${netoGestoria.toLocaleString('es-AR')}`)

  updates.push({
    id: r.id,
    patch: {
      montoAcreditado: c.montoAcreditado,
      costoFinanciero,
      netoGestoria,
      corregidoEn:     admin.firestore.FieldValue.serverTimestamp(),
      corregidoMotivo: 'monto acreditado de tarjeta cargado a posteriori',
    },
  })
}

if (!APPLY) {
  console.log('\n🔍 Simulación — no se escribió nada. Agregá --apply.\n')
  process.exit(0)
}

if (updates.length === 0) {
  console.log('\nNada para aplicar.\n')
  process.exit(0)
}

const batch = db.batch()
updates.forEach(u => batch.update(db.collection('recibos').doc(u.id), u.patch))
await batch.commit()

const totalCosto = updates.reduce((a, u) => a + num(u.patch.costoFinanciero), 0)
console.log(`\n✅ ${updates.length} recibos corregidos.`)
console.log(`   El neto de la gestoría baja $${totalCosto.toLocaleString('es-AR')}.`)
console.log('   Ese monto se lo quedó el procesador de la tarjeta.\n')
process.exit(0)
