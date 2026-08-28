// scripts/reconciliar-vencidos.mjs
// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIACIÓN de trámites vencidos que YA TERMINARON pero quedaron con el
// estado sin cerrar (aparecen rojos en la Torre para siempre).
//
// Normaliza SOLO los C-1 (terminados de verdad) → estado: 'entregado'.
// No toca C-2 (dudosos) ni C-3 (activos). Misma clasificación que
// diagnosticar-vencidos.mjs (re-lee fresco de Firestore en cada corrida).
//
// SEGURIDAD:
//   - Dry-run por defecto (no escribe nada).
//   - --apply     → ejecuta los cambios en batch atómico (bloques de 500).
//   - --rollback  → revierte usando el backup (_estadoAntesReconciliacion).
//   - Guarda backup por doc: _estadoAntesReconciliacion + _reconciliadoEn.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/reconciliar-vencidos.mjs                 # dry-run (default)
//   node scripts/reconciliar-vencidos.mjs --apply         # aplica
//   node scripts/reconciliar-vencidos.mjs --rollback      # dry-run del rollback
//   node scripts/reconciliar-vencidos.mjs --rollback --apply   # revierte de verdad
//   node scripts/reconciliar-vencidos.mjs --dias=5
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Parámetros ───────────────────────────────────────────────────────────────
const APPLY    = process.argv.includes('--apply')
const ROLLBACK = process.argv.includes('--rollback')
const diasArg  = process.argv.find(a => a.startsWith('--dias='))
const DIAS_UMBRAL = diasArg ? Number(diasArg.split('=')[1]) : 5
const ESTADO_FINAL = 'entregado'
const ESTADOS_FINALES = new Set(['completado', 'entregado', 'cancelado'])

// ── Init Firebase Admin ──────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()
const { FieldValue } = admin.firestore

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
  return ms ? Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)) : 0
}
function tramiteTienePago(t) {
  return t.pagado === true
    || (typeof t.totalCobradoCliente === 'number' && t.totalCobradoCliente > 0)
    || Boolean(t.fechaPago)
}
function workflowCerrado(wf) {
  if (!wf) return false
  const p7 = wf.paso7
  if (p7 && (p7.pagoTotalRecibo || p7.suatsAbonado || p7.completado)) return true
  const est = (wf.estadoWorkflow || wf.estado || '').toString().toLowerCase()
  return ['finalizado', 'cerrado', 'completado', 'pagado'].includes(est)
}

// Escribe en batches de 500 (límite de Firestore)
async function commitEnBatches(ops) {
  let procesados = 0
  for (let i = 0; i < ops.length; i += 500) {
    const lote = ops.slice(i, i + 500)
    const batch = db.batch()
    for (const { ref, data } of lote) batch.update(ref, data)
    await batch.commit()
    procesados += lote.length
    console.log(`  … batch commit: ${procesados}/${ops.length}`)
  }
  return procesados
}

// ── ROLLBACK ─────────────────────────────────────────────────────────────────
async function rollback() {
  console.log('\n═══ ROLLBACK — restaurar estado previo desde el backup ═══')
  console.log(APPLY ? 'MODO: APPLY (revierte de verdad)\n' : 'MODO: DRY-RUN (no escribe)\n')

  const snap = await db.collection('tramites').get()
  const conBackup = snap.docs
    .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(t => t._estadoAntesReconciliacion != null)

  console.log(`Trámites con backup a revertir: ${conBackup.length}`)
  if (conBackup.length === 0) { await cleanup(); return }

  conBackup.slice(0, 10).forEach(t =>
    console.log(`  ${String(t.numeroTramite || t.id).padEnd(16)} ${t.estado} → ${t._estadoAntesReconciliacion}`)
  )

  if (!APPLY) {
    console.log(`\nDRY-RUN: revertiría ${conBackup.length}. Corré con --rollback --apply para ejecutar.\n`)
    await cleanup(); return
  }

  const ops = conBackup.map(t => ({
    ref: t.ref,
    data: {
      estado: t._estadoAntesReconciliacion,
      _estadoAntesReconciliacion: FieldValue.delete(),
      _reconciliadoEn: FieldValue.delete(),
    },
  }))
  const n = await commitEnBatches(ops)
  console.log(`\n✅ Revertidos ${n} trámites a su estado previo.\n`)
  await cleanup()
}

// ── RECONCILIAR ──────────────────────────────────────────────────────────────
async function reconciliar() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  RECONCILIACIÓN DE TRÁMITES VENCIDOS TERMINADOS')
  console.log(`  MODO: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}   Umbral: >${DIAS_UMBRAL}d`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  const snap = await db.collection('tramites').get()
  const tramites = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))

  const rojos = tramites.filter(t =>
    !ESTADOS_FINALES.has(t.estado) && diasSinMov(t) > DIAS_UMBRAL
  )

  // Cargar workflows de multa
  const wfMap = new Map()
  await Promise.all(rojos.map(async t => {
    try {
      const wfSnap = await db.collection('multaWorkflow').doc(t.id).get()
      if (wfSnap.exists) wfMap.set(t.id, wfSnap.data())
    } catch { /* sin workflow */ }
  }))

  // Clasificar (idéntico al diagnóstico)
  const C1 = [], C2 = [], C3 = []
  for (const t of rojos) {
    const terminado = tramiteTienePago(t) || workflowCerrado(wfMap.get(t.id))
    if (terminado) C1.push(t)
    else if (t.estado === 'pendiente') C3.push(t)
    else C2.push(t)
  }

  console.log(`Rojos totales: ${rojos.length}`)
  console.log(`  C-1 terminados (se cierran): ${C1.length}`)
  console.log(`  C-2 dudosos (NO se tocan):   ${C2.length}`)
  console.log(`  C-3 activos (NO se tocan):   ${C3.length}\n`)

  if (C1.length === 0) { console.log('Nada para reconciliar.'); await cleanup(); return }

  console.log('── Se cerrarán (estado → entregado) ──')
  C1.slice(0, 15).forEach(t =>
    console.log(`  ${String(t.numeroTramite || t.id).padEnd(16)} ${String(t.tipo).padEnd(16)} ${t.estado} → ${ESTADO_FINAL}`)
  )
  if (C1.length > 15) console.log(`  … y ${C1.length - 15} más`)

  if (!APPLY) {
    console.log(`\nDRY-RUN: se cerrarían ${C1.length} trámites. Corré con --apply para ejecutar.\n`)
    await cleanup(); return
  }

  const ops = C1.map(t => ({
    ref: t.ref,
    data: {
      estado: ESTADO_FINAL,
      _estadoAntesReconciliacion: t.estado,          // backup para rollback
      _reconciliadoEn: FieldValue.serverTimestamp(),
    },
  }))
  console.log(`\nAplicando ${ops.length} cambios…`)
  const n = await commitEnBatches(ops)
  console.log(`\n✅ Reconciliados ${n} trámites → '${ESTADO_FINAL}'.`)
  console.log('   (backup en _estadoAntesReconciliacion — revertible con --rollback --apply)\n')
  await cleanup()
}

async function cleanup() { await admin.app().delete().catch(() => {}) }

const run = ROLLBACK ? rollback : reconciliar
run().catch(async err => { console.error('ERROR:', err); await cleanup(); process.exit(1) })
