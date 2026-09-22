// scripts/auditar-cobros.mjs — SOLO LECTURA (no escribe nada en Firestore)
// ─── AUDITORÍA DEL LIBRO DE COBROS ───────────────────────────────────────────
// Mide cuánto desvío histórico queda después de las fases 1 y 2:
//   A. Pagos de multas sin recibo (paso 2 anterior a la fase 1). Se descartan
//      los que ya tienen un recibo parcial del mismo monto (agregarPagoMulta
//      viejo emitía recibo pero no marcaba reciboId).
//        · multa ABIERTA  → su plata va a entrar al recibo de cierre (fecha del
//                           cierre, no la del pago). Candidato a regularizar.
//        · multa CERRADA  → ya quedó dentro del recibo de cierre. NO regenerar
//                           (duplicaría). Solo informativo.
//   B. Trámites pagados donde Σ recibos ≠ totalCobradoCliente (tolerancia $1).
//   C. Recibos sin fechaCobro (se cuentan por creadoEn — informativo).
//
// Uso:  node scripts/auditar-cobros.mjs [gestoriaId]     (default: gestoria-paz)
// Salida: auditoria-cobros-AAAAMMDD.csv en la carpeta actual.
import admin from 'firebase-admin'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const credPath = [path.join(__dirname, 'serviceAccount.json'), path.join(__dirname, '..', 'serviceAccount.json')]
  .find(p => fs.existsSync(p))
if (!credPath) { console.error('✗ No encuentro serviceAccount.json (ni en scripts/ ni en la raíz).'); process.exit(1) }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, 'utf8'))) })
const db = admin.firestore()
const gestoriaId = process.argv[2] ?? 'gestoria-paz'

const fmt  = n => `$${Math.round(n).toLocaleString('es-AR')}`
const ms   = t => t?.toMillis?.() ?? (t?._seconds != null ? t._seconds * 1000 : null)
const dia  = t => { const m = ms(t); return m ? new Date(m).toISOString().slice(0, 10) : '' }
const esc  = v => `"${String(v ?? '').replace(/"/g, '""')}"`
const signo = r => { const m = Number(r.monto) || 0; return (r.tipo === 'devolucion' || m < 0) ? -Math.abs(m) : m }

console.log(`\n🔎 Auditando cobros de ${gestoriaId}…\n`)
const [recSnap, wfSnap, trSnap] = await Promise.all([
  db.collection('recibos').where('gestoriaId', '==', gestoriaId).get(),
  db.collection('multaWorkflow').where('gestoriaId', '==', gestoriaId).get(),
  db.collection('tramites').where('gestoriaId', '==', gestoriaId).get(),
])

const recibosPorTramite = new Map()
let sinFechaCobro = 0
recSnap.forEach(d => {
  const r = { id: d.id, ...d.data() }
  if (!r.fechaCobro) sinFechaCobro++
  if (!recibosPorTramite.has(r.tramiteId)) recibosPorTramite.set(r.tramiteId, [])
  recibosPorTramite.get(r.tramiteId).push(r)
})
const tramites = new Map(trSnap.docs.map(d => [d.id, d.data()]))

const filas = [['tipo_hallazgo', 'tramiteId', 'numero', 'patente', 'estado', 'fecha_pago', 'monto', 'detalle']]

// ── A. Pagos de multas sin recibo ────────────────────────────────────────────
let aAbiertas = 0, aCerradas = 0, nAbiertas = 0, nCerradas = 0
wfSnap.forEach(d => {
  const wf = d.data()
  const pagos = wf.paso2?.historialPagos ?? []
  if (!pagos.length) return
  const cerrada = wf.estadoWorkflow === 'completado' || (wf.pasoActual ?? 0) >= 8
  const disponibles = (recibosPorTramite.get(d.id) ?? [])
    .filter(r => r.tipo === 'parcial' && Number(r.monto) > 0)
  const usados = new Set()
  const t = tramites.get(d.id) ?? {}
  for (const p of pagos) {
    if (p.reciboId) continue
    const match = disponibles.find(r => !usados.has(r.id) && Number(r.monto) === Number(p.monto))
    if (match) { usados.add(match.id); continue }
    const monto = Number(p.monto) || 0
    if (cerrada) { aCerradas += monto; nCerradas++ } else { aAbiertas += monto; nAbiertas++ }
    filas.push([cerrada ? 'pago_sin_recibo_multa_CERRADA' : 'pago_sin_recibo_multa_ABIERTA',
      d.id, t.numero, t.patente ?? wf.paso1?.patente, wf.estadoWorkflow, dia(p.registradoEn), monto,
      cerrada ? 'Ya incluido en el recibo de cierre — no regenerar' : 'Entrará al recibo de cierre con fecha del cierre'])
  }
})

// ── B. Σ recibos vs totalCobradoCliente ──────────────────────────────────────
let nDif = 0
for (const [id, t] of tramites) {
  if (!t.pagado || t.totalCobradoCliente == null) continue
  const suma = (recibosPorTramite.get(id) ?? []).reduce((a, r) => a + signo(r), 0)
  const dif  = Number(t.totalCobradoCliente) - suma
  if (Math.abs(dif) > 1) {
    nDif++
    filas.push(['recibos_no_cuadran', id, t.numero, t.patente, t.estado, dia(t.fechaPago), dif,
      `totalCobradoCliente ${fmt(t.totalCobradoCliente)} vs recibos ${fmt(suma)}`])
  }
}

const out = `auditoria-cobros-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
fs.writeFileSync(out, '\uFEFF' + filas.map(f => f.map(esc).join(',')).join('\n'), 'utf8')

console.log(`A. Pagos de multas sin recibo`)
console.log(`   · multas ABIERTAS: ${nAbiertas} pagos · ${fmt(aAbiertas)}  → se van a registrar en el mes del cierre`)
console.log(`   · multas CERRADAS: ${nCerradas} pagos · ${fmt(aCerradas)}  → ya contados en el cierre (informativo)`)
console.log(`B. Trámites pagados cuyos recibos no cuadran: ${nDif}`)
console.log(`C. Recibos sin fechaCobro (se cuentan por creadoEn): ${sinFechaCobro} de ${recSnap.size}`)
console.log(`\n📄 Detalle: ${out}\n`)
process.exit(0)
