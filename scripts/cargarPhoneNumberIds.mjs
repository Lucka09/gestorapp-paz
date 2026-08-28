// scripts/cargarPhoneNumberIds.mjs
// Carga los phone_number_id REALES de Meta en configuracion/gestor → ruteoWhatsApp,
// matcheando cada línea por su displayPhone. Deja el ruteo apuntando por ID real
// (lo confiable) y de paso borra el TEST_PNID de la prueba.
//
// Uso:
//   node scripts/cargarPhoneNumberIds.mjs           → dry-run (muestra cómo quedaría)
//   node scripts/cargarPhoneNumberIds.mjs --apply    → escribe

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const APPLY = process.argv.includes('--apply')

// phone_number_id real de Meta por número (dígitos puros)
const PNID_POR_NUMERO = {
  '5491161859697': '1172510519288643', // Florencia
  '5491157037764': '1199738123231039', // Gonzalo
  '5491149470249': '1277711862072644', // Alexia
  '5491136141431': '1231932023339615', // Jessica
}

const norm = (s) => String(s ?? '').replace(/\D/g, '')

async function main() {
  const ref  = db.doc('configuracion/gestor')
  const snap = await ref.get()
  const lineas = snap.data()?.ruteoWhatsApp?.lineas ?? []
  if (lineas.length === 0) {
    console.error('❌ No hay ruteoWhatsApp.lineas en configuracion/gestor')
    process.exit(1)
  }

  const nuevas = lineas.map(l => {
    const pnid = PNID_POR_NUMERO[norm(l.displayPhone)]
    if (pnid) {
      const antes = l.phoneNumberId || '(vacío)'
      console.log(`✅ ${l.nombre.padEnd(12)} ${antes}  →  ${pnid}`)
      return { ...l, phoneNumberId: pnid }
    }
    console.warn(`⚠️  ${l.nombre}: sin phone_number_id en el mapa (queda como está)`)
    return l
  })

  console.log('\n=== ruteoWhatsApp.lineas resultante ===')
  console.log(JSON.stringify({ ruteoWhatsApp: { lineas: nuevas } }, null, 2))

  if (!APPLY) {
    console.log('\n(dry-run) No se escribió nada. Corré con --apply cuando esté OK.\n')
    return
  }
  await ref.set({ ruteoWhatsApp: { lineas: nuevas } }, { merge: true })
  console.log('\n✅ Escrito en configuracion/gestor\n')
}

main().catch(e => { console.error(e); process.exit(1) })
