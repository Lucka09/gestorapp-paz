// scripts/audit-mes-completo.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Trae TODAS las multas de un mes (no solo las que el fix automático detectó)
// con su estado completo de SUATS, para cruzar contra revisión manual y
// aislar los casos que fix-suats-facturacion.mjs no pudo corregir solo.
//
// Filtra por paso1.fechaTramite (YYYY-MM-DD) dentro del mes indicado.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/audit-mes-completo.mjs --mes=2026-06
//   node scripts/audit-mes-completo.mjs --mes=2026-06 --csv
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_CSV = process.argv.includes('--csv')
const mesArg = process.argv.find(a => a.startsWith('--mes='))
const MES = mesArg ? mesArg.split('=')[1] : null // 'YYYY-MM'

if (!MES || !/^\d{4}-\d{2}$/.test(MES)) {
  console.error('Uso: node scripts/audit-mes-completo.mjs --mes=2026-06 [--csv]')
  process.exit(1)
}

const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  console.log(`\nAuditando multas de ${MES}...\n`)

  const snap = await db.collection('multaWorkflow').get()
  const casos = []

  for (const doc of snap.docs) {
    const wf = doc.data()
    const fecha = wf.paso1?.fechaTramite ?? ''
    if (!fecha.startsWith(MES)) continue

    const tramiteId = wf.tramiteId || doc.id
    const requiereSUATS = wf.paso1?.requiereSUATS === true
    const suatsGenerado  = wf.paso6?.suatsGenerado === true
    const paso7 = wf.paso7
    const paso2 = wf.paso2

    const pagoTotalRecibo = num(paso7?.pagoTotalRecibo) > 0
      ? num(paso7.pagoTotalRecibo)
      : num(paso2?.montoTotal)

    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get()
    const tramite = tramiteSnap.exists ? tramiteSnap.data() : null

    let estado
    if (!requiereSUATS) {
      estado = 'no_requiere'
    } else if (num(tramite?.costosSUATS) > 0) {
      estado = 'ya_corregido'
    } else if (!suatsGenerado) {
      estado = 'sin_suatsGenerado_paso6'
    } else if (pagoTotalRecibo <= 0) {
      estado = 'sin_pago_cargado'
    } else {
      estado = 'REVISAR — cumple condiciones, no debería haber quedado sin corregir'
    }

    casos.push({
      tramiteId,
      patente:          tramite?.patente ?? wf.paso1?.patente ?? '-',
      nombreCompleto:   wf.paso1?.nombreCompleto ?? '-',
      fechaTramite:     fecha,
      pasoActual:       wf.pasoActual,
      estadoWorkflow:   wf.estadoWorkflow,
      requiereSUATS:    requiereSUATS ? 'sí' : 'no',
      suatsGenerado:    suatsGenerado ? 'sí' : 'no',
      suatsAbonadoP7:   paso7?.suatsAbonado === true ? 'sí' : 'no',
      pagoTotalRecibo,
      honorariosActual: tramite ? num(tramite.honorarios) : null,
      costosSUATSActual: tramite ? num(tramite.costosSUATS) : null,
      estado,
    })
  }

  casos.sort((a, b) => a.estado.localeCompare(b.estado) || a.tramiteId.localeCompare(b.tramiteId))

  const resumen = {}
  for (const c of casos) resumen[c.estado] = (resumen[c.estado] ?? 0) + 1

  console.log(`Total multas en ${MES}: ${casos.length}\n`)
  console.log('── RESUMEN ─────────────────────────────────────────────────────────────────')
  for (const [estado, n] of Object.entries(resumen)) {
    console.log(`  ${estado.padEnd(45)} ${n}`)
  }
  console.log()

  console.log('── DETALLE ─────────────────────────────────────────────────────────────────')
  for (const c of casos) {
    console.log(`  [${c.estado}] ${c.tramiteId} patente=${c.patente} fecha=${c.fechaTramite} paso=${c.pasoActual} (${c.estadoWorkflow})`)
    console.log(`      requiereSUATS=${c.requiereSUATS}  suatsGenerado(p6)=${c.suatsGenerado}  suatsAbonado(p7)=${c.suatsAbonadoP7}  pagoTotalRecibo=${c.pagoTotalRecibo}`)
    console.log(`      honorarios=${c.honorariosActual}  costosSUATS=${c.costosSUATSActual}`)
  }

  if (EXPORT_CSV) {
    const header = 'tramiteId,patente,nombreCompleto,fechaTramite,pasoActual,estadoWorkflow,requiereSUATS,suatsGenerado,suatsAbonadoP7,pagoTotalRecibo,honorariosActual,costosSUATSActual,estado\n'
    const rows = casos.map(c => [
      c.tramiteId, c.patente, `"${c.nombreCompleto}"`, c.fechaTramite, c.pasoActual, c.estadoWorkflow,
      c.requiereSUATS, c.suatsGenerado, c.suatsAbonadoP7, c.pagoTotalRecibo, c.honorariosActual, c.costosSUATSActual, c.estado,
    ].join(','))
    const csv = header + rows.join('\n')
    const outPath = join(__dirname, `audit-${MES}.csv`)
    writeFileSync(outPath, csv, 'utf8')
    console.log(`\nCSV guardado en: ${outPath}\n`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error ejecutando el script:', err)
    process.exit(1)
  })
