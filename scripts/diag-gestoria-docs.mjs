// scripts/diag-gestoria-docs.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Diagnostica docs con gestoriaId anómalo (null / ausente / 'default' / otro).
// Explica el "Error al guardar" + permission-denied cuando el PERFIL está OK
// pero el DOCUMENTO tiene mal el gestoriaId.
//
// Uso:
//   node scripts/diag-gestoria-docs.mjs
//     → escanea colecciones núcleo y reporta anomalías (READ-ONLY).
//
//   node scripts/diag-gestoria-docs.mjs --tramite <tramiteId>
//     → disecciona ese trámite: tramites + los 3 workflows + su cliente.
//
//   node scripts/diag-gestoria-docs.mjs --fix <coleccion> <docId> [--apply]
//     → setea gestoriaId=gestoria-paz en ESE doc. Dry-run salvo --apply.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore }        from 'firebase-admin/firestore'
import { readFileSync }        from 'node:fs'

const EXPECTED = 'gestoria-paz' // gestoriaId canónico (confirmado en la auditoría de users)

// Colecciones con campo gestoriaId + regla docDeMiGestoria()
const COLECCIONES = [
  'tramites',
  'multaWorkflow',
  'inscripcionWorkflow',
  'transferenciaWorkflow',
  'clientes',
  'vehiculos',
]

// ─── ARGS ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has  = (f) => args.includes(f)
const val  = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const APPLY   = has('--apply')
const tramite = val('--tramite')

// --fix <coleccion> <docId>
let fixCol, fixId
if (has('--fix')) {
  const i = args.indexOf('--fix')
  fixCol = args[i + 1]
  fixId  = args[i + 2]
}

// ─── INIT ────────────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

function clasificar(gid) {
  if (gid === undefined) return 'AUSENTE'
  if (gid === null)      return 'null'
  if (gid === '')        return 'vacío'
  if (gid === 'default') return "'default'"
  if (gid === EXPECTED)  return 'OK'
  return `otro: '${gid}'`
}

// ─── ESCANEO GLOBAL ──────────────────────────────────────────────────────────
async function escanear() {
  console.log(`\n🔎 Escaneando (esperado gestoriaId="${EXPECTED}")\n`)
  let totalAnom = 0

  for (const col of COLECCIONES) {
    const snap = await db.collection(col).get()
    const buckets = {} // clase → [ids]
    snap.forEach((d) => {
      const clase = clasificar(d.data().gestoriaId)
      if (clase === 'OK') return
      ;(buckets[clase] ??= []).push(d.id)
    })
    const anomalias = Object.values(buckets).reduce((s, a) => s + a.length, 0)
    totalAnom += anomalias
    if (anomalias === 0) {
      console.log(`✅ ${col.padEnd(24)} ${snap.size} docs, todos OK`)
    } else {
      console.log(`⚠️  ${col.padEnd(24)} ${snap.size} docs, ${anomalias} anómalos:`)
      for (const [clase, ids] of Object.entries(buckets)) {
        const muestra = ids.slice(0, 15).join(', ')
        const resto   = ids.length > 15 ? ` … (+${ids.length - 15})` : ''
        console.log(`     [${clase}] ${ids.length}: ${muestra}${resto}`)
      }
    }
  }

  console.log(
    totalAnom === 0
      ? '\n🟢 Cero anomalías. El problema no es gestoriaId de documento.\n'
      : `\n🔴 ${totalAnom} doc(s) con gestoriaId anómalo. Arreglá cada uno con:\n` +
        `   node scripts/diag-gestoria-docs.mjs --fix <coleccion> <docId> --apply\n`,
  )
}

// ─── DISECCIÓN DE UN TRÁMITE ─────────────────────────────────────────────────
async function diseccionar(id) {
  console.log(`\n🩺 Trámite ${id}\n`)
  const cols = ['tramites', 'multaWorkflow', 'inscripcionWorkflow', 'transferenciaWorkflow']
  let clienteId

  for (const col of cols) {
    const d = await db.collection(col).doc(id).get()
    if (!d.exists) { console.log(`   ${col.padEnd(24)} — no existe`); continue }
    const data  = d.data()
    const clase = clasificar(data.gestoriaId)
    const marca = clase === 'OK' ? '✅' : '❌'
    console.log(`${marca} ${col.padEnd(24)} gestoriaId=${data.gestoriaId ?? '(ausente)'}  [${clase}]`)
    if (col === 'tramites' && data.clienteId) clienteId = data.clienteId
  }

  if (clienteId) {
    const c = await db.collection('clientes').doc(clienteId).get()
    if (c.exists) {
      const clase = clasificar(c.data().gestoriaId)
      const marca = clase === 'OK' ? '✅' : '❌'
      console.log(`${marca} clientes/${clienteId}   gestoriaId=${c.data().gestoriaId ?? '(ausente)'}  [${clase}]`)
    }
  }
  console.log(
    `\n💡 El doc con ❌ es el que deniega read+update. Corregilo:\n` +
    `   node scripts/diag-gestoria-docs.mjs --fix <coleccion-con-❌> ${id} --apply\n`,
  )
}

// ─── FIX DE UN DOC ───────────────────────────────────────────────────────────
async function fix() {
  if (!COLECCIONES.concat(['inscripcionWorkflow']).includes(fixCol)) {
    console.error(`\n❌ Colección "${fixCol}" no reconocida. Usá una de: ${COLECCIONES.join(', ')}\n`)
    process.exit(1)
  }
  const ref = db.collection(fixCol).doc(fixId)
  const d   = await ref.get()
  if (!d.exists) { console.error(`\n❌ No existe ${fixCol}/${fixId}\n`); process.exit(1) }

  const antes = d.data().gestoriaId
  console.log(`\n🔧 ${fixCol}/${fixId}`)
  console.log(`   antes:  gestoriaId=${antes ?? '(ausente)'}  [${clasificar(antes)}]`)
  console.log(`   nuevo:  gestoriaId="${EXPECTED}"`)

  if (antes === EXPECTED) {
    console.log('\n🟡 Ya está en el valor correcto. Nada que hacer.\n')
    return
  }
  if (!APPLY) {
    console.log('\n🟡 DRY-RUN — no se escribió nada. Agregá --apply para confirmar.\n')
    return
  }
  await ref.set({ gestoriaId: EXPECTED }, { merge: true })
  console.log('\n✅ gestoriaId corregido.\n')
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
;(async () => {
  if (fixCol && fixId) { await fix() }
  else if (tramite)    { await diseccionar(tramite) }
  else                 { await escanear() }
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
