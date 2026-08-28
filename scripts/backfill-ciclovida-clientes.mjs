// scripts/backfill-ciclovida-clientes.mjs
// Backfill NO destructivo: agrega cicloVida:'cliente' SOLO a los clientes que
// no lo tienen. Nunca borra, nunca pisa otros campos, nunca reclasifica.
//
//   node scripts/backfill-ciclovida-clientes.mjs           → dry-run (no escribe)
//   node scripts/backfill-ciclovida-clientes.mjs --apply   → aplica
//
console.log('>>> script arranca')
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const GESTORIA_ID = 'gestoria-paz'
const APPLY = process.argv.includes('--apply')

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const run = async () => {
  const snap = await db.collection('clientes')
    .where('gestoriaId', '==', GESTORIA_ID)
    .get()

  const yaTienen = []      // ya tienen cicloVida → se saltean (intactos)
  const aBackfillear = []  // sin el campo → reciben cicloVida:'cliente'

  snap.forEach(doc => {
    const d = doc.data()
    if (d.cicloVida === undefined || d.cicloVida === null) aBackfillear.push(doc)
    else yaTienen.push({ id: doc.id, cicloVida: d.cicloVida })
  })

  console.log('─────────────────────────────────────────────')
  console.log(`Total clientes:      ${snap.size}`)
  console.log(`Ya tienen cicloVida: ${yaTienen.length} (saltados, sin tocar)`)
  console.log(`A backfillear:       ${aBackfillear.length} → cicloVida:'cliente'`)
  console.log('─────────────────────────────────────────────')

  aBackfillear.slice(0, 5).forEach(doc => {
    const d = doc.data()
    console.log(`  · ${doc.id}  ${d.apellido ?? '—'}, ${d.nombre ?? '—'}`)
  })
  if (aBackfillear.length > 5) console.log(`  … y ${aBackfillear.length - 5} más`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se escribió nada. Corré con --apply para aplicar.')
    return
  }

  // APPLY: update de UN SOLO campo. No toca ningún otro dato. No borra nada.
  let escritos = 0
  const CHUNK = 400
  for (let i = 0; i < aBackfillear.length; i += CHUNK) {
    const batch = db.batch()
    for (const doc of aBackfillear.slice(i, i + CHUNK)) {
      batch.update(doc.ref, { cicloVida: 'cliente' })
    }
    await batch.commit()
    escritos += Math.min(CHUNK, aBackfillear.length - i)
    console.log(`  commit: ${escritos}/${aBackfillear.length}`)
  }

  console.log(`\n[APPLY] Listo. ${escritos} marcados como 'cliente'. 0 borrados, 0 pisados.`)
}

run().catch(e => { console.error(e); process.exit(1) })