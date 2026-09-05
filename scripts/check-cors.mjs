// scripts/check-cors.mjs
// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY. Muestra el CORS que el bucket tiene APLICADO ahora mismo.
// NO modifica nada (a diferencia de setCorsStorage.mjs, que sí escribe).
//
// Uso:  node scripts/check-cors.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { Storage }      from '@google-cloud/storage'
import { readFileSync } from 'node:fs'

const BUCKET_NAME = 'gestorapp-paz.firebasestorage.app'

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
const storage = new Storage({ projectId: serviceAccount.project_id, credentials: serviceAccount })

const ORIGENES_ESPERADOS = [
  'https://gestorapp-tau.vercel.app',
  'https://panel.gestoriapaz.com',
]

;(async () => {
  const [metadata] = await storage.bucket(BUCKET_NAME).getMetadata()
  const cors = metadata.cors ?? []

  console.log(`\n🪣 Bucket: ${BUCKET_NAME}`)
  console.log('\nCORS aplicado ACTUALMENTE:\n')
  console.log(JSON.stringify(cors, null, 2))

  const todosLosOrigenes = cors.flatMap((r) => r.origin ?? [])
  console.log('\n─── Chequeo de orígenes clave ───')
  for (const o of ORIGENES_ESPERADOS) {
    console.log(`${todosLosOrigenes.includes(o) ? '✅' : '❌ FALTA'}  ${o}`)
  }
  console.log('')
  process.exit(0)
})().catch((e) => { console.error('❌', e.message); process.exit(1) })
