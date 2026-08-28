// scripts/diagnosticar-vencidos.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO (DRY-RUN PURO — NO ESCRIBE NADA).
//
// Replica la lógica de la Torre de Control para detectar los trámites que
// aparecen "rojos / vencidos" (no están en estado final y llevan >N días sin
// movimiento) y los clasifica según si TERMINARON DE VERDAD o siguen activos.
//
// Señales de "terminado de verdad":
//   - tramite.pagado === true, o
//   - tramite.totalCobradoCliente > 0, o
//   - existe multaWorkflow/{id}.paso7 con pago (pagoTotalRecibo / suatsAbonado /
//     estadoWorkflow cerrado)
//
// Clasificación:
//   C-1  Terminado de verdad  → candidato a normalizar estado a 'entregado'
//   C-2  Dudoso (sin señal)   → revisión manual
//   C-3  Genuinamente activo  → no tocar (workflow en curso, sin pago)
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/diagnosticar-vencidos.mjs
//   node scripts/diagnosticar-vencidos.mjs --dias=5
//   node scripts/diagnosticar-vencidos.mjs --csv
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Parámetros ───────────────────────────────────────────────────────────────
const EXPORT_CSV = process.argv.includes('--csv')
const diasArg = process.argv.find(a => a.startsWith('--dias='))
const DIAS_UMBRAL = diasArg ? Number(diasArg.split('=')[1]) : 5   // igual que la Torre (sin_movimiento_5d)

// Estados que la Torre considera FINALES (no generan alerta). Mismo criterio que
// useTorreControl.ts, más 'completado' (legacy, por si algún doc viejo lo tiene).
const ESTADOS_FINALES = new Set(['completado', 'entregado', 'cancelado'])

// ── Init Firebase Admin ──────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// ── Helpers ──────────────────────────────────────────────────────────────────
function toMs(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts._seconds === 'number') return ts._seconds * 1000
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  return 0
}
function diasSinMov(t) {
  const ms = toMs(t.actualizadoEn) || toMs(t.creadoEn)
  if (!ms) return 0
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24))
}
function fmtFecha(ts) {
  const ms = toMs(ts)
  return ms ? new Date(ms).toISOString().slice(0, 10) : '—'
}

// Señal de "terminado de verdad" a nivel trámite
function tramiteTienePago(t) {
  return t.pagado === true
    || (typeof t.totalCobradoCliente === 'number' && t.totalCobradoCliente > 0)
    || Boolean(t.fechaPago)
}

// Señal de cierre en el workflow de multa (paso7)
function workflowCerrado(wf) {
  if (!wf) return false
  const p7 = wf.paso7
  if (p7 && (p7.pagoTotalRecibo || p7.suatsAbonado || p7.completado)) return true
  const est = (wf.estadoWorkflow || wf.estado || '').toString().toLowerCase()
  return ['finalizado', 'cerrado', 'completado', 'pagado'].includes(est)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  DIAGNÓSTICO DE TRÁMITES VENCIDOS (DRY-RUN — no escribe nada)')
  console.log(`  Umbral: >${DIAS_UMBRAL} días sin movimiento`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  // 1) Traer todos los trámites
  const snap = await db.collection('tramites').get()
  const tramites = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`Total trámites en la base: ${tramites.length}`)

  // 2) Filtrar los "rojos" según la Torre: no-final + >umbral días sin mover
  const rojos = tramites.filter(t =>
    !ESTADOS_FINALES.has(t.estado) && diasSinMov(t) > DIAS_UMBRAL
  )
  console.log(`Trámites "rojos / vencidos" (no-final + >${DIAS_UMBRAL}d): ${rojos.length}\n`)

  if (rojos.length === 0) {
    console.log('✅ No hay trámites vencidos con ese criterio.')
    await cleanup(); return
  }

  // 3) Cargar los workflows de multa de esos trámites (para la señal paso7)
  const wfMap = new Map()
  await Promise.all(rojos.map(async t => {
    try {
      const wfSnap = await db.collection('multaWorkflow').doc(t.id).get()
      if (wfSnap.exists) wfMap.set(t.id, wfSnap.data())
    } catch { /* sin workflow */ }
  }))

  // 4) Clasificar
  const C1 = [], C2 = [], C3 = []
  for (const t of rojos) {
    const wf = wfMap.get(t.id)
    const terminado = tramiteTienePago(t) || workflowCerrado(wf)
    if (terminado) C1.push({ t, wf })
    else if (t.estado === 'pendiente') C3.push({ t, wf })   // nunca arrancó → activo real
    else C2.push({ t, wf })                                  // en curso sin señal de pago → dudoso
  }

  // 5) Conteo por estado
  const porEstado = {}
  for (const t of rojos) porEstado[t.estado] = (porEstado[t.estado] || 0) + 1

  console.log('── Desglose por ESTADO ────────────────────────────────────────')
  Object.entries(porEstado).sort((a, b) => b[1] - a[1])
    .forEach(([e, n]) => console.log(`  ${String(e).padEnd(26)} ${n}`))

  console.log('\n── Clasificación ──────────────────────────────────────────────')
  console.log(`  C-1  Terminados de verdad (pago / paso7):  ${C1.length}   ← candidatos a cerrar`)
  console.log(`  C-2  Dudosos (en curso, sin señal de pago): ${C2.length}   ← revisión manual`)
  console.log(`  C-3  Genuinamente activos (pendiente):      ${C3.length}   ← no tocar`)
  console.log(`  ────────────────────────────────────────────`)
  console.log(`  TOTAL:                                      ${rojos.length}\n`)

  // 6) Muestra de ejemplos por categoría
  const muestra = (arr, label) => {
    console.log(`── Ejemplos ${label} (hasta 10) ──`)
    arr.slice(0, 10).forEach(({ t, wf }) => {
      const señ = []
      if (t.pagado) señ.push('pagado')
      if (t.totalCobradoCliente > 0) señ.push(`cobrado:${t.totalCobradoCliente}`)
      if (workflowCerrado(wf)) señ.push('paso7')
      console.log(
        `  ${String(t.numeroTramite || t.id).padEnd(16)} ` +
        `${String(t.tipo || '—').padEnd(16)} ` +
        `estado:${String(t.estado).padEnd(24)} ` +
        `${diasSinMov(t)}d  act:${fmtFecha(t.actualizadoEn)}  ${señ.join(',')}`
      )
    })
    console.log('')
  }
  muestra(C1, 'C-1 (terminados)')
  muestra(C2, 'C-2 (dudosos)')

  // 7) CSV opcional
  if (EXPORT_CSV) {
    const filas = [['categoria','id','numeroTramite','tipo','estado','diasSinMov','actualizadoEn','pagado','totalCobradoCliente','workflowCerrado']]
    const push = (arr, cat) => arr.forEach(({ t, wf }) => filas.push([
      cat, t.id, t.numeroTramite || '', t.tipo || '', t.estado, diasSinMov(t),
      fmtFecha(t.actualizadoEn), t.pagado ? 'si' : 'no',
      t.totalCobradoCliente ?? '', workflowCerrado(wf) ? 'si' : 'no',
    ]))
    push(C1, 'C-1'); push(C2, 'C-2'); push(C3, 'C-3')
    const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const out = join(__dirname, 'diagnostico-vencidos.csv')
    writeFileSync(out, csv, 'utf8')
    console.log(`📄 CSV escrito en: ${out}`)
  }

  console.log('DRY-RUN terminado. No se modificó ningún dato.\n')
  await cleanup()
}

async function cleanup() {
  await admin.app().delete().catch(() => {})
}

main().catch(async err => {
  console.error('ERROR:', err)
  await cleanup()
  process.exit(1)
})
