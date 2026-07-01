// scripts/apply-suats-confirmados.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Aplica la corrección de SUATS SOLO a los tramiteId confirmados manualmente.
//
// Lista actual: los 14 pendientes de Junio 2026 con requiereSUATS=sí pero
// paso6.suatsGenerado=no (confirmados por Luca el 01/07 — quedan afuera, por
// ahora, los 4 dudosos marcados "no_requiere" y los 2 con honorarios=null).
//
// No adivina nada más allá de esta lista: marca paso6.suatsGenerado=true +
// paso7.suatsAbonado=true + paso7.montoSUATS en el workflow (si paso7 existe),
// y recalcula honorarios/costosSUATS/totalCobradoCliente en el trámite con la
// misma fórmula que usa el resto del sistema.
//
// ── CÓMO USARLO ────────────────────────────────────────────────────────────
// 1. Dry-run primero:   node scripts/apply-suats-confirmados.mjs
// 2. Aplicar:            node scripts/apply-suats-confirmados.mjs --apply
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'serviceAccount.json')

// ─── LISTA CONFIRMADA — 14 pendientes de Junio 2026 ──────────────────────────
const CONFIRMADOS = [
  { tramiteId: '10EthuHtrCF2yC8XamKe', monto: 16000 }, // AB419VB
  { tramiteId: '5DIiyKnBjkWUV8IrRyYQ', monto: 16000 }, // AD552OF
  { tramiteId: '6fsGTTvZNo1O0Mhz5eIB', monto: 16000 }, // AH928QY
  { tramiteId: '8s9292AS2hARBpXpt28W', monto: 16000 }, // CQV849
  { tramiteId: 'cGibMdDSZ5YfNsXslLjf', monto: 16000 }, // KJY236
  { tramiteId: 'DQ7L02yaSxdLUwQ1Ldvd', monto: 16000 }, // LFD721
  { tramiteId: 'Fdh2LGeiIh7KNE5UJEQR', monto: 16000 }, // a208jks — ⚠️ honorarios era null, revisar tras aplicar
  { tramiteId: 'glKqjfzAtYSkfdLYWkrX', monto: 16000 }, // OFX242
  { tramiteId: 'k1iX0DGcs3clv7Iy5JL7', monto: 16000 }, // AA183WF
  { tramiteId: 'PN2VcNerZ0n94xQspbdT', monto: 16000 }, // AB292RN
  { tramiteId: 'rDKn15NBn19kFuSffNGe', monto: 16000 }, // kbf882 — ⚠️ honorarios era null, revisar tras aplicar
  { tramiteId: 'v5j9p7XuvdWF3V72gFZK', monto: 16000 }, // LPB915
  { tramiteId: 'VFHXfChqElmZa7JyGJZZ', monto: 16000 }, // BRO503
  { tramiteId: 'zj5hZagb0s7QoKnwTgn0', monto: 16000 }, // AA858GZ
]
// ────────────────────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  if (CONFIRMADOS.length === 0) {
    console.log('\nLa lista CONFIRMADOS está vacía. Editá el script y agregá los tramiteId a corregir.\n')
    return
  }

  console.log(`\n${APPLY ? 'APLICANDO' : 'DRY-RUN'} corrección para ${CONFIRMADOS.length} trámite(s) confirmado(s)...\n`)

  for (const { tramiteId, monto = 16000 } of CONFIRMADOS) {
    const wfRef = db.collection('multaWorkflow').doc(tramiteId)
    const wfSnap = await wfRef.get()
    if (!wfSnap.exists) {
      console.log(`  ✗ ${tramiteId}: workflow no encontrado, se omite`)
      continue
    }
    const wf = wfSnap.data()
    const paso7 = wf.paso7
    const paso2 = wf.paso2

    // Mismo fallback que el resto de los scripts: paso7 si existe, si no paso2.montoTotal
    const pagoTotalRecibo = num(paso7?.pagoTotalRecibo) > 0
      ? num(paso7.pagoTotalRecibo)
      : num(paso2?.montoTotal)

    if (pagoTotalRecibo <= 0) {
      console.log(`  ✗ ${tramiteId}: sin pago cargado (ni paso7 ni paso2.montoTotal), se omite`)
      continue
    }

    const montoInforme = paso7?.informePersonaRealizado ? num(paso7.montoInformePersona) : 0
    const honorariosCorregidos = pagoTotalRecibo - monto - montoInforme
    const honorariosFinal = honorariosCorregidos > 0 ? honorariosCorregidos : pagoTotalRecibo

    const tramiteRef = db.collection('tramites').doc(tramiteId)
    const tramiteSnap = await tramiteRef.get()
    const honorariosActual = tramiteSnap.exists ? num(tramiteSnap.data().honorarios) : null

    console.log(`  ${tramiteId}: pagoTotalRecibo=${pagoTotalRecibo}  SUATS=${monto}  honorarios ${honorariosActual} → ${honorariosFinal}`)

    if (!APPLY) continue

    if (!tramiteSnap.exists) {
      console.log(`    ✗ trámite no encontrado, no se pudo aplicar`)
      continue
    }

    // Marcar el workflow: paso6.suatsGenerado=true (si no lo estaba) +
    // paso7.suatsAbonado/montoSUATS (si paso7 existe).
    const updateWf = { 'paso6.suatsGenerado': true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() }
    if (paso7) {
      updateWf['paso7.suatsAbonado'] = true
      updateWf['paso7.montoSUATS'] = monto
    }
    await wfRef.update(updateWf)

    await tramiteRef.update({
      honorarios:          honorariosFinal,
      costosSUATS:         monto,
      totalCobradoCliente: pagoTotalRecibo,
      actualizadoEn:       admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  console.log(APPLY ? '\n✔ Listo.\n' : '\nDry-run: no se escribió nada. Corré con --apply para aplicar.\n')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error ejecutando el script:', err)
    process.exit(1)
  })
