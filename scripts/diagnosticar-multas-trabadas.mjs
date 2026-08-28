// scripts/diagnosticar-multas-trabadas.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO (DRY-RUN PURO — NO ESCRIBE NADA).
//
// Replica la lógica de "Revisión de Multas" (RevisionMultasPage) para detectar
// las multas que aparecen "Vencidas +10d" y clasificarlas según si YA
// TERMINARON (pagadas / workflow cerrado) o siguen en gestión real.
//
// Lógica replicada de la app:
//   estadoMultaEfectivo = estadoMultaManual ?? derivarEstadoMulta(estadoWorkflow)
//   vencida = !archivada && !sinAlertaFecha && diasHasta(fechaEntrega) < -10
//   archivada = estado === 'entregado' || 'cancelado'
//   sinAlertaFecha = estado === 'esperando_fecha_cliente'
//
// Señal de "terminado de verdad" (misma que trámites):
//   tramite.pagado / totalCobradoCliente > 0 / fechaPago, o workflow paso7.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/diagnosticar-multas-trabadas.mjs
//   node scripts/diagnosticar-multas-trabadas.mjs --csv
//   node scripts/diagnosticar-multas-trabadas.mjs --dias=10
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_CSV = process.argv.includes('--csv')
const diasArg = process.argv.find(a => a.startsWith('--dias='))
const DIAS_VENCIDA = diasArg ? Number(diasArg.split('=')[1]) : 10

const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// ── Lógica replicada de la app (multa_types.ts) ──────────────────────────────
function derivarEstadoMulta(w) {
  switch (w.estadoWorkflow) {
    case 'recepcion':
    case 'en_revision':        return 'pendiente_revision'
    case 'rebotado':
    case 'en_espera_mesa':     return 'docs_requerida'
    case 'en_gestion':
      return w.paso3?.resultado === 'ok' && w.pasoActual === 4 ? 'revision_ok' : 'en_proceso'
    case 'borradores_listos':
    case 'descargo_subido':    return 'en_proceso'
    case 'suats_generado':
    case 'resuelto_sin_suats': return 'listo_presentar'
    case 'completado':         return 'entregado'
    default:                   return 'pendiente_revision'
  }
}
function estadoMultaEfectivo(w) {
  return w.estadoMultaManual ?? derivarEstadoMulta(w)
}
const esArchivada = e => e === 'entregado' || e === 'cancelado'
const SIN_ALERTA_FECHA = ['esperando_fecha_cliente']

// ── Helpers ──────────────────────────────────────────────────────────────────
function toMs(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts._seconds === 'number') return ts._seconds * 1000
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  return 0
}
// fechaEntrega: la app la deriva del workflow. Buscamos las señales habituales.
function fechaEntregaMs(w) {
  const cand = w.fechaEntrega ?? w.paso1?.fechaEntrega ?? w.paso1?.fechaTramite ?? w.fechaPresentacion
  if (!cand) return null
  if (typeof cand === 'string') { const ms = Date.parse(cand); return Number.isNaN(ms) ? null : ms }
  return toMs(cand) || null
}
function diasHasta(ms) {
  if (!ms) return null
  return Math.round((ms - Date.now()) / (1000 * 60 * 60 * 24))
}
function fmt(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : '—' }

function tramiteTerminado(t) {
  if (!t) return false
  return t.pagado === true
    || (typeof t.totalCobradoCliente === 'number' && t.totalCobradoCliente > 0)
    || Boolean(t.fechaPago)
}
function workflowCerrado(w) {
  const p7 = w.paso7
  if (p7 && (p7.pagoTotalRecibo || p7.suatsAbonado || p7.completado)) return true
  return w.estadoWorkflow === 'completado'
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  DIAGNÓSTICO MULTAS TRABADAS EN REVISIÓN (DRY-RUN — no escribe)')
  console.log(`  Umbral vencida: fecha entrega < -${DIAS_VENCIDA}d`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  const [wfSnap, trSnap] = await Promise.all([
    db.collection('multaWorkflow').get(),
    db.collection('tramites').get(),
  ])
  const workflows = wfSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const tramMap = new Map(trSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))
  console.log(`Total multaWorkflow: ${workflows.length}`)

  // Clasificar cada multa igual que la UI
  const vencidas = []
  for (const w of workflows) {
    const est = estadoMultaEfectivo(w)
    if (esArchivada(est)) continue
    if (SIN_ALERTA_FECHA.includes(est)) continue
    const dias = diasHasta(fechaEntregaMs(w))
    if (dias !== null && dias < -DIAS_VENCIDA) vencidas.push({ w, est, dias })
  }
  console.log(`Multas "Vencidas +${DIAS_VENCIDA}d": ${vencidas.length}\n`)
  if (vencidas.length === 0) { console.log('✅ Sin multas vencidas.'); await cleanup(); return }

  // Clasificar C-1/C-2/C-3
  const C1 = [], C2 = [], C3 = []
  for (const v of vencidas) {
    const t = tramMap.get(v.w.id)
    const terminado = tramiteTerminado(t) || workflowCerrado(v.w)
    if (terminado) C1.push({ ...v, t })
    else if (v.est === 'pendiente_revision') C3.push({ ...v, t })
    else C2.push({ ...v, t })
  }

  const porEstado = {}
  for (const v of vencidas) porEstado[v.est] = (porEstado[v.est] || 0) + 1
  console.log('── Desglose por ESTADO efectivo ───────────────────────────────')
  Object.entries(porEstado).sort((a, b) => b[1] - a[1])
    .forEach(([e, n]) => console.log(`  ${String(e).padEnd(26)} ${n}`))

  console.log('\n── Clasificación ──────────────────────────────────────────────')
  console.log(`  C-1  Terminadas (pago / paso7):        ${C1.length}   ← candidatas a cerrar`)
  console.log(`  C-2  Dudosas (en gestión, sin pago):   ${C2.length}   ← revisión manual`)
  console.log(`  C-3  Sin revisar aún:                  ${C3.length}   ← no tocar`)
  console.log(`  ──────────────────────────────────────`)
  console.log(`  TOTAL:                                 ${vencidas.length}\n`)

  const muestra = (arr, label) => {
    console.log(`── Ejemplos ${label} (hasta 10) ──`)
    arr.slice(0, 10).forEach(({ w, est, dias, t }) => {
      const señ = []
      if (t?.pagado) señ.push('pagado')
      if (t?.totalCobradoCliente > 0) señ.push(`cobrado:${t.totalCobradoCliente}`)
      if (workflowCerrado(w)) señ.push('paso7/completado')
      console.log(`  ${String(t?.numeroTramite || w.id).padEnd(16)} wf:${String(w.estadoWorkflow || '—').padEnd(18)} est:${String(est).padEnd(20)} ${dias}d  ${señ.join(',')}`)
    })
    console.log('')
  }
  muestra(C1, 'C-1 (terminadas)')
  muestra(C2, 'C-2 (dudosas)')

  if (EXPORT_CSV) {
    const filas = [['categoria','id','numeroTramite','estadoWorkflow','estadoEfectivo','estadoMultaManual','dias','pagado','totalCobradoCliente','workflowCerrado']]
    const push = (arr, cat) => arr.forEach(({ w, est, dias, t }) => filas.push([
      cat, w.id, t?.numeroTramite || '', w.estadoWorkflow || '', est,
      w.estadoMultaManual || '', dias, t?.pagado ? 'si' : 'no',
      t?.totalCobradoCliente ?? '', workflowCerrado(w) ? 'si' : 'no',
    ]))
    push(C1, 'C-1'); push(C2, 'C-2'); push(C3, 'C-3')
    const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const out = join(__dirname, 'diagnostico-multas-trabadas.csv')
    writeFileSync(out, csv, 'utf8')
    console.log(`📄 CSV escrito en: ${out}`)
  }

  console.log('DRY-RUN terminado. No se modificó ningún dato.\n')
  await cleanup()
}

async function cleanup() { await admin.app().delete().catch(() => {}) }
main().catch(async err => { console.error('ERROR:', err); await cleanup(); process.exit(1) })
