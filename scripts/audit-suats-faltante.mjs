// scripts/audit-suats-faltante.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Complemento de fix-suats-facturacion.mjs — SOLO LECTURA, no escribe nada.
//
// Para los trámites que requerían SUATS (paso1.requiereSUATS=true) y cerraron
// el workflow (paso7 existe) pero NUNCA se marcó paso7.suatsAbonado, trae
// contexto adicional para que decidas caso por caso si en realidad sí se
// abonó el SUATS y solo faltó tildar el checkbox, o si genuinamente no
// correspondía.
//
// Señal más importante: paso6.suatsGenerado
//   - Si es true  → el informe SUATS SÍ se generó en el paso 6. Muy probable
//                    que también se haya abonado y solo falte el checkbox
//                    del paso 7 (esto es justamente el bug de UI "(opcional)"
//                    que ya se corrigió puertas para adelante).
//   - Si es false/undefined → puede que directamente no se haya llegado a
//                    generar el SUATS (ej. se resolvió sin él pese a que en
//                    el paso 1 se había tildado "requiere").
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/audit-suats-faltante.mjs
//   node scripts/audit-suats-faltante.mjs --csv     → además guarda un CSV
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_CSV = process.argv.includes('--csv')
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtFecha(ts) {
  if (!ts?.toDate) return '-'
  return ts.toDate().toISOString().slice(0, 10)
}

async function main() {
  console.log('\nBuscando trámites con SUATS requerido pero no capturado...\n')

  const snap = await db.collection('multaWorkflow').get()
  const casos = []

  for (const doc of snap.docs) {
    const wf = doc.data()
    const requiereSUATS = wf.paso1?.requiereSUATS === true
    if (!requiereSUATS) continue
    if (!wf.paso7) continue                 // aún no cerró
    if (wf.paso7.suatsAbonado) continue      // ya está capturado — no es un caso dudoso

    const tramiteId = wf.tramiteId || doc.id
    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get()
    const tramite = tramiteSnap.exists ? tramiteSnap.data() : null

    casos.push({
      tramiteId,
      patente:            tramite?.patente ?? wf.paso1?.patente ?? '-',
      numero:             tramite?.numero ?? '-',
      nombreCompleto:     wf.paso1?.nombreCompleto ?? '-',
      fechaTramite:       wf.paso1?.fechaTramite ?? '-',
      fechaCierre:        fmtFecha(wf.paso7?.completadoEn),
      suatsGeneradoPaso6: wf.paso6?.suatsGenerado === true ? 'SÍ' : 'no',
      pagoTotalRecibo:    num(wf.paso7?.pagoTotalRecibo),
      canalEntrega:       wf.paso7?.canalEntrega ?? '-',
      observacionFinal:   (wf.paso7?.observacionFinal ?? '').replace(/[\r\n]+/g, ' ').slice(0, 80),
      honorariosActual:   tramite ? num(tramite.honorarios) : null,
    })
  }

  // Los más "sospechosos" primero: suatsGenerado=SÍ en paso 6 pero nunca marcado en paso 7
  casos.sort((a, b) => (b.suatsGeneradoPaso6 === 'SÍ' ? 1 : 0) - (a.suatsGeneradoPaso6 === 'SÍ' ? 1 : 0))

  console.log(`Total de casos a revisar: ${casos.length}\n`)
  console.log(`${'tramiteId'.padEnd(22)} ${'patente'.padEnd(9)} ${'fecha'.padEnd(11)} ${'SUATS gen. p6'.padEnd(14)} ${'pagoTotal'.padEnd(11)} canal`)
  console.log('-'.repeat(100))
  for (const c of casos) {
    console.log(
      `${c.tramiteId.padEnd(22)} ${String(c.patente).padEnd(9)} ${c.fechaTramite.padEnd(11)} ${c.suatsGeneradoPaso6.padEnd(14)} ${String(c.pagoTotalRecibo).padEnd(11)} ${c.canalEntrega}`
    )
    if (c.observacionFinal) console.log(`   obs: ${c.observacionFinal}`)
  }

  const sospechosos = casos.filter(c => c.suatsGeneradoPaso6 === 'SÍ').length
  console.log(`\n⚠️  ${sospechosos} de ${casos.length} tienen suatsGenerado=SÍ en paso 6 — son los más probables de haber pagado SUATS sin marcarlo.\n`)

  if (EXPORT_CSV) {
    const header = 'tramiteId,patente,numero,nombreCompleto,fechaTramite,fechaCierre,suatsGeneradoPaso6,pagoTotalRecibo,canalEntrega,honorariosActual,observacionFinal\n'
    const rows = casos.map(c => [
      c.tramiteId, c.patente, c.numero, `"${c.nombreCompleto}"`, c.fechaTramite, c.fechaCierre,
      c.suatsGeneradoPaso6, c.pagoTotalRecibo, c.canalEntrega, c.honorariosActual, `"${c.observacionFinal}"`,
    ].join(','))
    const csv = header + rows.join('\n')
    const outPath = join(__dirname, 'audit-suats-faltante.csv')
    writeFileSync(outPath, csv, 'utf8')
    console.log(`CSV guardado en: ${outPath}\n`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error ejecutando el script:', err)
    process.exit(1)
  })
