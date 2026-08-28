// scripts/reconciliar-multas-trabadas.mjs
// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIACIÓN de multas que YA SE PAGARON pero quedaron sin cerrar en
// "Revisión de Multas" (aparecen "Vencidas +10d" para siempre por un bug que
// dejó el workflow en un paso intermedio).
//
// Cierra SOLO los C-1 (pago confirmado) → estadoMultaManual: 'entregado'.
// No toca C-2 (dudosas) ni C-3 (sin revisar).
//
// Lógica de fecha/estado replicada EXACTA de RevisionMultasPage:
//   fechaEntrega = m.fechaTramiteActual ?? m.paso1?.fechaTramite
//   diasHasta    = (fecha 00:00 -03:00) − (hoy 00:00) en días
//   estadoEfectivo = estadoMultaManual ?? derivarEstadoMulta(estadoWorkflow)
//   vencida = !archivada && !esperando_fecha_cliente && dias < -10
//
// C-1 se define por PAGO CONFIRMADO (no por la fecha):
//   tramite.pagado / totalCobradoCliente > 0 / fechaPago, o workflow paso7.
//
// SEGURIDAD:
//   - Dry-run por defecto (no escribe).
//   - --apply     → aplica en batch atómico (bloques de 500).
//   - --rollback  → revierte usando el backup (_estadoMultaManualPrevio).
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/reconciliar-multas-trabadas.mjs                # dry-run
//   node scripts/reconciliar-multas-trabadas.mjs --apply        # aplica
//   node scripts/reconciliar-multas-trabadas.mjs --rollback              # dry-run rollback
//   node scripts/reconciliar-multas-trabadas.mjs --rollback --apply      # revierte
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY    = process.argv.includes('--apply')
const ROLLBACK = process.argv.includes('--rollback')
const diasArg  = process.argv.find(a => a.startsWith('--dias='))
const DIAS_VENCIDA = diasArg ? Number(diasArg.split('=')[1]) : 10
const ESTADO_FINAL = 'entregado'

const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()
const { FieldValue } = admin.firestore

// ── Lógica replicada de la app ───────────────────────────────────────────────
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
const estadoMultaEfectivo = w => w.estadoMultaManual ?? derivarEstadoMulta(w)
const esArchivada = e => e === 'entregado' || e === 'cancelado'
const SIN_ALERTA_FECHA = ['esperando_fecha_cliente']

// fechaEntrega EXACTA de la app: fechaTramiteActual ?? paso1.fechaTramite
function fechaEntrega(m) {
  return m.fechaTramiteActual ?? m.paso1?.fechaTramite ?? undefined
}
// diasHasta EXACTO de la app: medianoche AR (-03:00)
function diasHasta(fechaStr) {
  if (!fechaStr) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const f = new Date(fechaStr + 'T00:00:00-03:00'); f.setHours(0, 0, 0, 0)
  return Math.round((f.getTime() - hoy.getTime()) / 86_400_000)
}

// Señal de "pago confirmado" (define C-1)
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

async function commitEnBatches(ops) {
  let n = 0
  for (let i = 0; i < ops.length; i += 500) {
    const lote = ops.slice(i, i + 500)
    const batch = db.batch()
    for (const { ref, data } of lote) batch.update(ref, data)
    await batch.commit()
    n += lote.length
    console.log(`  … batch commit: ${n}/${ops.length}`)
  }
  return n
}

// ── Reunir y clasificar (compartido por reconciliar y rollback) ──────────────
async function cargarClasificado() {
  const [wfSnap, trSnap] = await Promise.all([
    db.collection('multaWorkflow').get(),
    db.collection('tramites').get(),
  ])
  const workflows = wfSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
  const tramMap = new Map(trSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))

  const vencidas = []
  for (const w of workflows) {
    const est = estadoMultaEfectivo(w)
    if (esArchivada(est) || SIN_ALERTA_FECHA.includes(est)) continue
    const dias = diasHasta(fechaEntrega(w))
    if (dias !== null && dias < -DIAS_VENCIDA) vencidas.push({ w, est, dias })
  }

  const C1 = []
  for (const v of vencidas) {
    const t = tramMap.get(v.w.id)
    if (tramiteTerminado(t) || workflowCerrado(v.w)) C1.push({ ...v, t })
  }
  return { total: workflows.length, vencidas, C1 }
}

// ── RECONCILIAR ──────────────────────────────────────────────────────────────
async function reconciliar() {
  console.log('\n═══ RECONCILIAR MULTAS TRABADAS ═══')
  console.log(`MODO: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}   Vencida: < -${DIAS_VENCIDA}d\n`)

  const { total, vencidas, C1 } = await cargarClasificado()
  console.log(`Total multaWorkflow: ${total}`)
  console.log(`Vencidas +${DIAS_VENCIDA}d: ${vencidas.length}`)
  console.log(`C-1 con pago confirmado (se cierran): ${C1.length}\n`)

  if (C1.length === 0) { console.log('Nada para reconciliar.'); await cleanup(); return }

  console.log('── Se archivan (estadoMultaManual → entregado) ──')
  C1.slice(0, 15).forEach(({ w, est, t }) =>
    console.log(`  ${String(t?.numeroTramite || w.id).padEnd(16)} wf:${String(w.estadoWorkflow).padEnd(16)} ${est} → entregado`)
  )
  if (C1.length > 15) console.log(`  … y ${C1.length - 15} más`)

  if (!APPLY) {
    console.log(`\nDRY-RUN: se cerrarían ${C1.length}. Corré con --apply para ejecutar.\n`)
    await cleanup(); return
  }

  const ops = C1.map(({ w }) => ({
    ref: w.ref,
    data: {
      estadoMultaManual:       ESTADO_FINAL,
      estadoMultaManualPor:    'reconciliacion',
      estadoMultaManualNombre: 'Reconciliación automática',
      estadoMultaManualEn:     FieldValue.serverTimestamp(),
      // backup: guarda el override previo (o null si no tenía) para el rollback
      _estadoMultaManualPrevio: (w.estadoMultaManual ?? null),
      _reconciliadoEn:          FieldValue.serverTimestamp(),
    },
  }))
  console.log(`\nAplicando ${ops.length} cambios…`)
  const n = await commitEnBatches(ops)
  console.log(`\n✅ Archivadas ${n} multas → 'entregado'.`)
  console.log('   (backup en _estadoMultaManualPrevio — revertible con --rollback --apply)\n')
  await cleanup()
}

// ── ROLLBACK ─────────────────────────────────────────────────────────────────
async function rollback() {
  console.log('\n═══ ROLLBACK MULTAS ═══')
  console.log(APPLY ? 'MODO: APPLY (revierte)\n' : 'MODO: DRY-RUN (no escribe)\n')

  const snap = await db.collection('multaWorkflow').get()
  const conBackup = snap.docs
    .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(w => Object.prototype.hasOwnProperty.call(w, '_estadoMultaManualPrevio'))

  console.log(`Multas con backup a revertir: ${conBackup.length}`)
  if (conBackup.length === 0) { await cleanup(); return }

  conBackup.slice(0, 10).forEach(w =>
    console.log(`  ${w.id}  ${w.estadoMultaManual} → ${w._estadoMultaManualPrevio ?? '(sin override)'}`)
  )

  if (!APPLY) {
    console.log(`\nDRY-RUN: revertiría ${conBackup.length}. Corré con --rollback --apply.\n`)
    await cleanup(); return
  }

  const ops = conBackup.map(w => {
    const previo = w._estadoMultaManualPrevio
    return {
      ref: w.ref,
      data: {
        // si antes no tenía override, se borra; si tenía, se restaura
        estadoMultaManual: previo == null ? FieldValue.delete() : previo,
        estadoMultaManualPor:    FieldValue.delete(),
        estadoMultaManualNombre: FieldValue.delete(),
        estadoMultaManualEn:     FieldValue.delete(),
        _estadoMultaManualPrevio: FieldValue.delete(),
        _reconciliadoEn:          FieldValue.delete(),
      },
    }
  })
  const n = await commitEnBatches(ops)
  console.log(`\n✅ Revertidas ${n} multas a su estado previo.\n`)
  await cleanup()
}

async function cleanup() { await admin.app().delete().catch(() => {}) }
const run = ROLLBACK ? rollback : reconciliar
run().catch(async err => { console.error('ERROR:', err); await cleanup(); process.exit(1) })
