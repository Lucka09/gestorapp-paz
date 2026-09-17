// scripts/reconciliar-pagos-recibos.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Compara, trámite por trámite:
//     Σ paso2.historialPagos  (lo que dice el workflow que se cobró)
//     Σ recibos emitidos      (lo que llegó a la colección recibos)
//     tramite.honorarios      (lo facturado)
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args   = process.argv.slice(2)
const EMITIR = args.includes('--emitir')
const DRY    = !EMITIR
const MES    = args.find(a => a.startsWith('--mes='))?.split('=')[1] ?? null
const GEST   = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!EMITIR && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --emitir.')
  process.exit(1)
}

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const ms  = t => t?.toMillis?.() ?? (typeof t === 'number' ? t : 0)

let desdeMs = 0, hastaMs = Infinity
if (MES) {
  const [y, m] = MES.split('-').map(Number)
  desdeMs = new Date(y, m - 1, 1).getTime()
  hastaMs = new Date(y, m, 1).getTime() - 1
}

console.log(`\n${DRY ? '🔍 DIAGNÓSTICO' : '⚠️  EMITIENDO RECIBOS'}${MES ? ` · ${MES}` : ''}\n`)

// ─── 1 · CARGA ───────────────────────────────────────────────────────────────

let wfQ = db.collection('multaWorkflow')
if (GEST) wfQ = wfQ.where('gestoriaId', '==', GEST)
const wfSnap = await wfQ.get()

let rQ = db.collection('recibos')
if (GEST) rQ = rQ.where('gestoriaId', '==', GEST)
const rSnap = await rQ.get()

// recibos agrupados por trámite
const recibosPorTramite = new Map()
rSnap.forEach(d => {
  const r = { id: d.id, ...d.data() }
  if (!r.tramiteId) return
  if (!recibosPorTramite.has(r.tramiteId)) recibosPorTramite.set(r.tramiteId, [])
  recibosPorTramite.get(r.tramiteId).push(r)
})

console.log(`Workflows de multa: ${wfSnap.size}`)
console.log(`Recibos totales:    ${rSnap.size}\n`)

// trámites (para gestoriaId, patente, numero, clienteId)
const ids = wfSnap.docs.map(d => d.id)
const tramites = new Map()
for (let i = 0; i < ids.length; i += 300) {
  const lote = ids.slice(i, i + 300)
  const snaps = await db.getAll(...lote.map(id => db.collection('tramites').doc(id)))
  snaps.forEach((s, idx) => { if (s.exists) tramites.set(lote[idx], s.data()) })
}

// ─── 2 · RECONCILIAR ─────────────────────────────────────────────────────────

const filas = [[
  'tramiteId','numero','patente','estadoWorkflow','pasoActual',
  'pagosWorkflow','recibosEmitidos','diferencia','honorarios',
  'cantPagos','cantRecibos','caso','registradoPor',
].join(',')]

const faltantes = []   // pagos sin recibo
const stats = {
  ok: 0, faltaRecibo: 0, reciboDeMas: 0, sinPagos: 0, sinTramite: 0,
  montoFaltante: 0, pagosHuerfanos: 0,
}

for (const d of wfSnap.docs) {
  const wf = d.data()
  const tramiteId = d.id
  const tr = tramites.get(tramiteId)
  if (!tr) { stats.sinTramite++; continue }

  const pagos = wf.paso2?.historialPagos ?? []
  const recibos = recibosPorTramite.get(tramiteId) ?? []

  // Se filtra por la fecha del PAGO, no del workflow
  const pagosEnRango = pagos.filter(p => {
    const t = ms(p.registradoEn)
    return !MES || (t >= desdeMs && t <= hastaMs)
  })

  if (pagosEnRango.length === 0) {
    if (!MES || (ms(tr.creadoEn) >= desdeMs && ms(tr.creadoEn) <= hastaMs)) {
      stats.sinPagos++
      filas.push([
        tramiteId, tr.numero ?? '', tr.patente ?? '',
        wf.estadoWorkflow ?? '', wf.pasoActual ?? '',
        0, 0, 0, num(tr.honorarios),
        0, recibos.length, 'sin-pagos', '',
      ].join(','))
    }
    continue
  }

  const totalPagos = pagosEnRango.reduce((a, p) => a + num(p.monto), 0)
  const totalRecibos = recibos
    .filter(r => r.tipo !== 'devolucion' && num(r.monto) > 0)
    .reduce((a, r) => a + num(r.monto), 0)

  const dif = totalPagos - totalRecibos

  let caso = 'ok'
  if (Math.abs(dif) < 1) {
    stats.ok++
  } else if (dif > 0) {
    caso = 'FALTA-RECIBO'
    stats.faltaRecibo++
    stats.montoFaltante += dif

    const montosConRecibo = recibos
      .filter(r => r.tipo !== 'devolucion')
      .map(r => num(r.monto))
    const pendientes = []
    for (const p of pagosEnRango) {
      const i = montosConRecibo.findIndex(m => Math.abs(m - num(p.monto)) < 1)
      if (i >= 0) montosConRecibo.splice(i, 1)
      else pendientes.push(p)
    }
    stats.pagosHuerfanos += pendientes.length

    faltantes.push({ tramiteId, tr, wf, pagos: pendientes })
  } else {
    caso = 'RECIBO-DE-MAS'
    stats.reciboDeMas++
  }

  filas.push([
    tramiteId, tr.numero ?? '', tr.patente ?? '',
    wf.estadoWorkflow ?? '', wf.pasoActual ?? '',
    totalPagos, totalRecibos, dif, num(tr.honorarios),
    pagosEnRango.length, recibos.length, caso,
    `"${pagosEnRango[0]?.registradoPorNombre ?? ''}"`,
  ].join(','))
}

writeFileSync('./reconciliacion-pagos.csv', filas.join('\n'), 'utf8')

// ─── 3 · REPORTE ─────────────────────────────────────────────────────────────

console.log('─'.repeat(60))
console.log(`Cuadran                       ${stats.ok}`)
console.log(`FALTA RECIBO                  ${stats.faltaRecibo}   (${stats.pagosHuerfanos} pagos sueltos)`)
console.log(`Recibo de más que pagos       ${stats.reciboDeMas}`)
console.log(`Sin pagos (solo facturado)    ${stats.sinPagos}`)
console.log(`Workflow sin trámite          ${stats.sinTramite}`)
console.log('─'.repeat(60))
console.log(`Monto sin respaldo de recibo  $${stats.montoFaltante.toLocaleString('es-AR')}`)
console.log('─'.repeat(60))
console.log('\n📄 ./reconciliacion-pagos.csv\n')

if (DRY) {
  console.log('🔍 No se escribió nada. Revisá el CSV y corré con --emitir.\n')
  process.exit(0)
}

// ─── 4 · EMITIR LOS FALTANTES ────────────────────────────────────────────────

if (faltantes.length === 0) {
  console.log('Nada para emitir.\n')
  process.exit(0)
}

console.log(`\n⚠️  Emitiendo recibos para ${stats.pagosHuerfanos} pagos...\n`)

async function numeroRecibo(gestoriaId, anio) {
  const ref = db.collection('contadoresRecibos').doc(`${gestoriaId}_${anio}`)
  const n = await db.runTransaction(async tx => {
    const s = await tx.get(ref)
    const sig = (s.exists ? (s.data()?.contador ?? 0) : 0) + 1
    tx.set(ref, { gestoriaId, anio, contador: sig }, { merge: true })
    return sig
  })
  return `REC-${anio}-${String(n).padStart(4, '0')}`
}

function calcularNeto(r) {
  const monto = num(r.monto)
  const cf = r.montoAcreditado != null && num(r.montoAcreditado) > 0
    ? Math.max(0, monto - num(r.montoAcreditado)) : 0
  const ded = num(r.montoSUATS) + num(r.montoInformePersona) + num(r.comisionReferido) + cf
  return { netoGestoria: Math.max(0, monto - ded), costoFinanciero: cf }
}

let emitidos = 0
for (const f of faltantes) {
  const { tramiteId, tr, wf, pagos } = f
  const gestoriaId = tr.gestoriaId
  if (!gestoriaId) continue

  for (const p of pagos) {
    const fechaPago = ms(p.registradoEn) || ms(tr.creadoEn) || Date.now()
    const anio = new Date(fechaPago).getFullYear()

    const base = {
      monto:               num(p.monto),
      montoSUATS:          num(p.montoSUATS),
      montoInformePersona: num(p.montoInformePersona),
      comisionReferido:    num(p.comisionReferido),
    }
    if (p.montoAcreditado != null) base.montoAcreditado = num(p.montoAcreditado)
    if (p.cuotasTarjeta   != null) base.cuotasTarjeta   = num(p.cuotasTarjeta)

    const { netoGestoria, costoFinanciero } = calcularNeto(base)

    const nro = await numeroRecibo(gestoriaId, anio)

    const docData = {
      numeroRecibo:  nro,
      tramiteId,
      clienteId:     tr.clienteId ?? '',
      gestoriaId,
      tipo:          'parcial',
      ...base,
      costoFinanciero,
      netoGestoria,
      formaPago:     p.metodoPago ?? 'efectivo',
      notas:         `${p.nota ?? ''} (recibo emitido por reconciliación)`.trim(),
      patente:       tr.patente ?? '',
      numeroTramite: tr.numero ?? '',
      tipoTramite:   tr.tipo ?? '',
      emitidoPor:       p.registradoPor ?? '',
      emitidoPorNombre: p.registradoPorNombre ?? '',
      atribuidoA:       p.registradoPor ?? '',
      atribuidoANombre: p.registradoPorNombre ?? '',
      creadoEn: admin.firestore.Timestamp.fromMillis(fechaPago),
      emitidoPorReconciliacion: true,
    }

    for (const k of Object.keys(docData)) {
      if (docData[k] === undefined) delete docData[k]
    }

    // Persistencia efectiva en Firestore
    await db.collection('recibos').add(docData)

    emitidos++
    process.stdout.write(`  ${emitidos}/${stats.pagosHuerfanos}\r`)
  }
}

console.log(`  ${emitidos}/${stats.pagosHuerfanos} ✓`)
console.log(`\n✅ ${emitidos} recibos emitidos con su fecha y su secretario originales.`)
console.log('   Verificá Cobranzas: el total del mes debería subir')
console.log(`   $${stats.montoFaltante.toLocaleString('es-AR')}.\n`)
process.exit(0)