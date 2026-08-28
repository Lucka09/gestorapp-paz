// scripts/cargarRuteoWhatsApp.mjs
// Descubre el uid de cada dueño de línea y escribe configuracion/gestor → ruteoWhatsApp.
// Uso:
//   node scripts/cargarRuteoWhatsApp.mjs            → dry-run (lista usuarios, resuelve, NO escribe)
//   node scripts/cargarRuteoWhatsApp.mjs --apply    → escribe la config
//
// Corré primero SIN --apply, verificá que cada línea resolvió el uid correcto,
// y recién ahí corré con --apply.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const APPLY = process.argv.includes('--apply')

// ── EDITÁ ACÁ ─────────────────────────────────────────────────────────────────
// Clave = número visible en dígitos puros (sin +, sin espacios).
// Poné `email` si lo sabés (match más confiable). Si no, con `nombre` alcanza:
// matchea por coincidencia parcial en nombre + apellido.
const MAPEO = {
  '5491161859697': { email: 'florchiperez1987@gmail.com',  nombre: 'Florencia' },
  '5491157037764': { email: 'gonzalonicolas948@gmail.com', nombre: 'Gonzalo'   },
  '5491149470249': { email: 'Alexiapini.t@gmail.com',      nombre: 'Alexia'    },
  '5491136141431': { email: 'Jessjoker1@gmail.com',        nombre: 'Jessica'   },
}

// ──────────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s ?? '').replace(/\D/g, '')

async function main() {
  const snap  = await db.collection('users').get()
  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }))

  console.log('\n=== USUARIOS EN /users ===')
  for (const u of users) {
    const nom = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim()
    console.log(`${u.uid}  |  ${nom.padEnd(24)} |  ${(u.email ?? '').padEnd(28)} |  ${u.rol ?? ''}  |  activo:${u.activo}`)
  }

  const lineas = []
  let faltan = false

  console.log('\n=== RESOLUCIÓN POR LÍNEA ===')
  for (const [displayPhone, cfg] of Object.entries(MAPEO)) {
    let u = null
    if (cfg.email) {
      u = users.find(x => (x.email ?? '').toLowerCase() === cfg.email.toLowerCase())
    }
    if (!u && cfg.nombre) {
      const matches = users.filter(x =>
        `${x.nombre ?? ''} ${x.apellido ?? ''}`.toLowerCase().includes(cfg.nombre.toLowerCase())
      )
      if (matches.length === 1) u = matches[0]
      else if (matches.length > 1) {
        console.warn(`⚠️  "${cfg.nombre}" matchea ${matches.length} usuarios — usá email para desambiguar:`)
        matches.forEach(m => console.warn(`     ${m.uid} · ${m.email}`))
        faltan = true
        continue
      }
    }
    if (!u) {
      console.warn(`⚠️  Sin match para ${cfg.nombre || displayPhone} — revisá el MAPEO`)
      faltan = true
      continue
    }
    lineas.push({ displayPhone: norm(displayPhone), uid: u.uid, nombre: cfg.nombre || u.nombre })
    console.log(`✅ ${(cfg.nombre || u.nombre).padEnd(12)} → ${u.uid}  (${u.email})`)
  }

  console.log('\n=== ruteoWhatsApp.lineas RESULTANTE ===')
  console.log(JSON.stringify({ ruteoWhatsApp: { lineas } }, null, 2))

  if (!APPLY) {
    console.log('\n(dry-run) No se escribió nada. Corré con --apply cuando esté OK.\n')
    return
  }
  if (faltan) {
    console.error('\n❌ Hay líneas sin resolver. Completá el MAPEO y reintentá.\n')
    process.exit(1)
  }

  await db.doc('configuracion/gestor').set({ ruteoWhatsApp: { lineas } }, { merge: true })
  console.log('\n✅ Escrito en configuracion/gestor → ruteoWhatsApp\n')
}

main().catch(e => { console.error(e); process.exit(1) })
