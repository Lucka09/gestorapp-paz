// scripts/fix-suats-facturacion.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Recorre multaWorkflow (paso1.requiereSUATS === true) y corrige el trámite
// asociado en `tramites` para que el costo de SUATS quede DESGLOSADO y NO
// sume a `honorarios` / facturación / premios.
//
// REGLA DE NEGOCIO CONFIRMADA (Luca, 01/07):
//   Si el trámite requería SUATS y el SUATS se generó realmente
//   (paso6.suatsGenerado=true) y ya hay un pago cargado — sea porque el
//   workflow cerró en paso7 (paso7.pagoTotalRecibo) o porque todavía está en
//   paso 4/5/6 pero ya se registró un cobro parcial vía Cobranzas
//   (paso2.historialPagos / paso2.montoTotal) — se toma como que el SUATS
//   SÍ se abonó. Esto es exactamente el mismo fallback que ya usa
//   `sincronizarPagoMultaAlTramite` en MultaWorwflow.ts ("si existe paso7
//   usarlo, si no usar historialPagos del paso2"), aplicado en bulk.
//
//   honorariosGestoria = pagoTotalRecibo - montoSUATS - montoInformePersona(si aplica)
//   honorarios         = honorariosGestoria > 0 ? honorariosGestoria : pagoTotalRecibo
//
// Se actualiza `tramites/{id}` (honorarios, costosSUATS, totalCobradoCliente
// — de donde usePremios.ts ya descuenta automáticamente) y, SOLO cuando
// existe paso7, también `multaWorkflow/{id}.paso7` (suatsAbonado, montoSUATS)
// para trazabilidad. Para los que aún no llegaron a paso7 no se toca el
// workflow (ni `pagado`, ni `estadoWorkflow`) — solo se corrige el monto de
// honorarios para que Reportes/Premios ya reflejen el desglose correcto de
// este mes; cuando el gestor cierre el paso 7 en la app, el propio flujo ya
// obliga a marcar SUATS (fix de UI ya aplicado) y va a recalcular en base a
// eso, sin conflicto con este ajuste.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//   node scripts/fix-suats-facturacion.mjs                            → dry-run
//   node scripts/fix-suats-facturacion.mjs --apply                    → aplica
//   node scripts/fix-suats-facturacion.mjs --apply --gestoriaId=XXXX  → 1 gestoría
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const gestoriaIdArg = process.argv.find(a => a.startsWith('--gestoriaId='))
const GESTORIA_FILTRO = gestoriaIdArg ? gestoriaIdArg.split('=')[1] : null

// Monto SUATS estándar de la gestoría — se usa para inferir el desglose
// cuando no quedó un monto explícito capturado en paso7.
const SUATS_REFERENCIA = 16000

const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function centavosIguales(a, b) {
  return Math.round(num(a)) === Math.round(num(b))
}

async function main() {
  console.log(`\n${'='.repeat(78)}`)
  console.log(`  FIX SUATS → FACTURACIÓN   ${APPLY ? '(MODO APLICAR — escribe en Firestore)' : '(DRY-RUN — solo reporte, no escribe nada)'}`)
  console.log(`${'='.repeat(78)}\n`)

  let q = db.collection('multaWorkflow')
  if (GESTORIA_FILTRO) q = q.where('gestoriaId', '==', GESTORIA_FILTRO)
  const snap = await q.get()
  console.log(`Workflows de multa encontrados: ${snap.size}\n`)

  const paraCorregir = []   // { tramiteId, origen, actual, correcto, necesitaMarcarWorkflow }
  const sinSuatsGenerado = []  // requiereSUATS=true pero paso6.suatsGenerado no está en true
  const sinPago       = []  // SUATS generado pero todavía no hay ningún pago cargado

  for (const doc of snap.docs) {
    const wf = doc.data()
    if (wf.paso1?.requiereSUATS !== true) continue

    const paso2 = wf.paso2
    const paso6 = wf.paso6
    const paso7 = wf.paso7
    const tramiteId = wf.tramiteId || doc.id

    // Señal fuerte: el informe SUATS se generó de verdad (paso 6).
    if (paso6?.suatsGenerado !== true) {
      sinSuatsGenerado.push({ tramiteId, gestoriaId: wf.gestoriaId, pasoActual: wf.pasoActual })
      continue
    }

    // Mismo fallback que usa sincronizarPagoMultaAlTramite: paso7 si existe,
    // si no el total acumulado en paso2 (Cobranzas ya lo carga ahí).
    const pagoTotalRecibo = num(paso7?.pagoTotalRecibo) > 0
      ? num(paso7.pagoTotalRecibo)
      : num(paso2?.montoTotal)

    if (pagoTotalRecibo <= 0) {
      sinPago.push({ tramiteId, gestoriaId: wf.gestoriaId, pasoActual: wf.pasoActual })
      continue
    }

    const yaMarcado  = paso7?.suatsAbonado === true && num(paso7?.montoSUATS) > 0
    const montoSUATS = yaMarcado ? num(paso7.montoSUATS) : SUATS_REFERENCIA
    const montoInforme = paso7?.informePersonaRealizado ? num(paso7.montoInformePersona) : 0

    const origen = yaMarcado
      ? 'ya_marcado'
      : (paso7 ? 'inferido_paso7' : 'inferido_pre_paso7')

    const honorariosCorregidos = pagoTotalRecibo - montoSUATS - montoInforme
    const honorariosFinal = honorariosCorregidos > 0 ? honorariosCorregidos : pagoTotalRecibo

    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get()
    if (!tramiteSnap.exists) continue
    const tramite = tramiteSnap.data()

    const honorariosActual   = num(tramite.honorarios)
    const costosSUATSActual  = num(tramite.costosSUATS)
    const totalCobradoActual = num(tramite.totalCobradoCliente)

    const yaCorrecto =
      centavosIguales(honorariosActual, honorariosFinal) &&
      centavosIguales(costosSUATSActual, montoSUATS) &&
      centavosIguales(totalCobradoActual, pagoTotalRecibo) &&
      (origen !== 'inferido_paso7' || yaMarcado)

    if (yaCorrecto) continue

    paraCorregir.push({
      tramiteId, gestoriaId: wf.gestoriaId, patente: tramite.patente, origen, pasoActual: wf.pasoActual,
      actual:   { honorarios: honorariosActual, costosSUATS: costosSUATSActual, totalCobradoCliente: totalCobradoActual },
      correcto: { honorarios: honorariosFinal, costosSUATS: montoSUATS, costosInformePersona: montoInforme, totalCobradoCliente: pagoTotalRecibo },
      necesitaMarcarWorkflow: origen === 'inferido_paso7',
    })
  }

  const porOrigen = {
    ya_marcado:          paraCorregir.filter(c => c.origen === 'ya_marcado').length,
    inferido_paso7:      paraCorregir.filter(c => c.origen === 'inferido_paso7').length,
    inferido_pre_paso7:  paraCorregir.filter(c => c.origen === 'inferido_pre_paso7').length,
  }

  console.log(`Trámites a corregir:                         ${paraCorregir.length}`)
  console.log(`  · ya tenían SUATS marcado (desajuste):       ${porOrigen.ya_marcado}`)
  console.log(`  · inferidos, paso7 cerrado sin tildar:       ${porOrigen.inferido_paso7}`)
  console.log(`  · inferidos, AÚN EN PASO 4-6 con pago cargado: ${porOrigen.inferido_pre_paso7}`)
  console.log(`SUATS no generado (paso6 vacío/false):       ${sinSuatsGenerado.length}  (se ignoran, no corresponde)`)
  console.log(`SUATS generado pero sin ningún pago cargado: ${sinPago.length}  (se ignoran, todavía no hay nada que desglosar)`)
  console.log()

  if (paraCorregir.length > 0) {
    console.log('── DETALLE A CORREGIR ─────────────────────────────────────────────────────')
    for (const c of paraCorregir) {
      console.log(`  [${c.origen} · paso${c.pasoActual}] tramiteId=${c.tramiteId} patente=${c.patente ?? '-'}`)
      console.log(`    honorarios:           ${c.actual.honorarios} → ${c.correcto.honorarios}`)
      console.log(`    costosSUATS:          ${c.actual.costosSUATS} → ${c.correcto.costosSUATS}`)
      console.log(`    totalCobradoCliente:  ${c.actual.totalCobradoCliente} → ${c.correcto.totalCobradoCliente}`)
    }
    console.log()
  }

  if (!APPLY) {
    console.log('Dry-run: no se escribió nada. Corré con --apply para aplicar los cambios.\n')
    return
  }

  if (paraCorregir.length === 0) {
    console.log('Nada para aplicar.\n')
    return
  }

  console.log(`Aplicando ${paraCorregir.length} correcciones...`)
  let batch = db.batch()
  let contador = 0

  for (const c of paraCorregir) {
    const refTramite = db.collection('tramites').doc(c.tramiteId)
    batch.update(refTramite, {
      honorarios:           c.correcto.honorarios,
      costosSUATS:          c.correcto.costosSUATS,
      costosInformePersona: c.correcto.costosInformePersona,
      totalCobradoCliente:  c.correcto.totalCobradoCliente,
      actualizadoEn:        admin.firestore.FieldValue.serverTimestamp(),
    })
    contador++

    if (c.necesitaMarcarWorkflow) {
      const refWf = db.collection('multaWorkflow').doc(c.tramiteId)
      batch.update(refWf, {
        'paso7.suatsAbonado': true,
        'paso7.montoSUATS':   c.correcto.costosSUATS,
        actualizadoEn:        admin.firestore.FieldValue.serverTimestamp(),
      })
      contador++
    }

    if (contador >= 400) {
      await batch.commit()
      batch = db.batch()
      contador = 0
    }
  }
  await batch.commit()
  console.log(`✔ Listo. ${paraCorregir.length} trámites corregidos.\n`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error ejecutando el script:', err)
    process.exit(1)
  })
