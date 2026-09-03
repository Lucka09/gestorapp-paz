// scripts/diagnosticar-multa.mjs
// Uso:  node scripts/diagnosticar-multa.mjs <tramiteId>
// Fix:  node scripts/diagnosticar-multa.mjs <tramiteId> --fix
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ID  = process.argv[2]
const FIX = process.argv.includes('--fix')
if (!ID) { console.error('Falta el tramiteId.'); process.exit(1) }

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const tSnap = await db.doc(`tramites/${ID}`).get()
const wSnap = await db.doc(`multaWorkflow/${ID}`).get()

console.log('\n──── TRÁMITE ────')
console.log('existe     :', tSnap.exists)
if (tSnap.exists) {
  console.log('tipo       :', tSnap.data().tipo)
  console.log('gestoriaId :', JSON.stringify(tSnap.data().gestoriaId ?? null))
}
console.log('\n──── multaWorkflow ────')
console.log('existe     :', wSnap.exists)
if (wSnap.exists) {
  console.log('gestoriaId :', JSON.stringify(wSnap.data().gestoriaId ?? null))
  console.log('pasoActual :', wSnap.data().pasoActual)
  console.log('estado     :', wSnap.data().estadoWorkflow)
}

const gestoriaOk = tSnap.exists ? (tSnap.data().gestoriaId ?? 'gestoria-paz') : 'gestoria-paz'
console.log('\n──── DIAGNÓSTICO ────')
if (!wSnap.exists) {
  console.log('• multaWorkflow NO existe → era el listener muriendo sobre doc inexistente.')
  console.log('  El fix de reglas (resource == null) lo resuelve. No hay que tocar datos.')
} else if (wSnap.data().gestoriaId !== gestoriaOk) {
  console.log(`• Existe con gestoriaId ${JSON.stringify(wSnap.data().gestoriaId ?? null)} ≠ ${JSON.stringify(gestoriaOk)} → lectura denegada siempre.`)
  if (FIX) { await wSnap.ref.set({ gestoriaId: gestoriaOk }, { merge: true }); console.log(`  ✅ Corregido: gestoriaId = ${gestoriaOk}`) }
  else     { console.log('  (Corré con --fix para corregirlo.)') }
} else {
  console.log('• Existe con gestoriaId correcto → aplicá el fix de reglas y recargá.')
}