// scripts/fix-config-gestoria.mjs
// Setea configuracion/gestor.gestoriaId (estaba null → rompe el read de config).
// Uso:  node scripts/fix-config-gestoria.mjs
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const GESTORIA_ID = 'gestoria-paz'
const ref  = db.doc('configuracion/gestor')
const snap = await ref.get()
if (!snap.exists) { console.error('❌ configuracion/gestor no existe'); process.exit(1) }
console.log('gestoriaId actual:', JSON.stringify(snap.data().gestoriaId ?? null))
await ref.set({ gestoriaId: GESTORIA_ID }, { merge: true })
console.log('✅ configuracion/gestor.gestoriaId =', GESTORIA_ID)