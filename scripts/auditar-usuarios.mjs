// scripts/auditar-usuarios.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Audita rol + gestoriaId de todos los usuarios y marca los que romperían las
// reglas (gestoriaId null/ausente, o rol fuera de la lista de isStaff()).
//
// Uso:
//   node scripts/auditar-usuarios.mjs
//     → solo lista y diagnostica (READ-ONLY, no escribe nada).
//
//   node scripts/auditar-usuarios.mjs --fix <uid> --gestoria <gestoriaId> [--rol asesor_comercial]
//     → dry-run: muestra qué cambiaría, SIN escribir.
//
//   ...mismo comando + --apply
//     → escribe el merge en users/<uid>.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore }        from 'firebase-admin/firestore'
import { readFileSync }        from 'node:fs'

// Roles válidos para staff — DEBE coincidir con isStaff() en firestore.rules
const ROLES_STAFF = [
  'propietario', 'admin_gral', 'admin', 'gestor',
  'operador', 'vendedor', 'asesor_comercial', 'asistente_multas',
]
const ROLES_VALIDOS = [...ROLES_STAFF, 'superadmin'] // superadmin se maneja aparte pero es válido

// ─── ARGS ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has  = (f) => args.includes(f)
const val  = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

const APPLY    = has('--apply')
const fixUid   = val('--fix')
const fixGest  = val('--gestoria')
const fixRol   = val('--rol') // opcional

// ─── INIT ────────────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ─── AUDITORÍA (siempre corre) ───────────────────────────────────────────────
async function auditar() {
  const snap = await db.collection('users').get()
  console.log(`\n📋 ${snap.size} usuarios en 'users'\n`)

  const problemas = []

  snap.forEach((d) => {
    const u    = d.data()
    const rol  = u.rol ?? '(sin rol)'
    const gest = u.gestoriaId ?? null
    const mail = u.email ?? u.correo ?? '—'
    const nom  = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || '—'

    const gestOk = gest !== null && gest !== undefined && gest !== '' && gest !== 'default'
    const rolOk  = ROLES_VALIDOS.includes(u.rol)

    const flags = []
    if (!gestOk) flags.push('❌ gestoriaId')
    if (!rolOk)  flags.push(`❌ rol="${rol}" no está en la lista de staff`)

    const marca = flags.length ? ` ⚠️  ${flags.join(' | ')}` : ' ✅'
    console.log(`${marca}`)
    console.log(`   ${nom}  <${mail}>`)
    console.log(`   uid=${d.id}  rol=${rol}  gestoriaId=${gest}\n`)

    if (flags.length) problemas.push({ uid: d.id, nom, mail, rol, gest, flags })
  })

  if (problemas.length) {
    console.log(`\n🔴 ${problemas.length} usuario(s) con problema:`)
    problemas.forEach((p) =>
      console.log(`   • ${p.nom} (uid=${p.uid}) → ${p.flags.join(' | ')}`),
    )
    console.log(
      `\n💡 Para corregir uno:\n` +
      `   node scripts/auditar-usuarios.mjs --fix <uid> --gestoria <gestoriaId> --rol asesor_comercial --apply\n` +
      `   (probá primero SIN --apply para ver el dry-run)\n`,
    )
  } else {
    console.log('\n🟢 Ningún usuario con rol/gestoriaId inválido.\n')
  }

  return problemas
}

// ─── FIX (solo si se pasa --fix) ─────────────────────────────────────────────
async function fix() {
  if (!fixGest) {
    console.error('\n❌ Falta --gestoria <gestoriaId>. Usá el mismo gestoriaId que tienen los usuarios ✅ del listado.\n')
    process.exit(1)
  }
  if (fixGest === 'default') {
    console.error('\n❌ "default" no es un gestoriaId real — es el fallback de useGestoriaId(). Pasá el id real de la gestoría.\n')
    process.exit(1)
  }
  if (fixRol && !ROLES_VALIDOS.includes(fixRol)) {
    console.error(`\n❌ rol "${fixRol}" no es válido. Válidos: ${ROLES_VALIDOS.join(', ')}\n`)
    process.exit(1)
  }

  const ref  = db.collection('users').doc(fixUid)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`\n❌ No existe users/${fixUid}\n`)
    process.exit(1)
  }
  const antes = snap.data()

  const merge = { gestoriaId: fixGest }
  if (fixRol) merge.rol = fixRol

  console.log(`\n🔧 users/${fixUid}`)
  console.log(`   antes:  rol=${antes.rol ?? '—'}  gestoriaId=${antes.gestoriaId ?? null}`)
  console.log(`   merge:  ${JSON.stringify(merge)}`)

  if (!APPLY) {
    console.log('\n🟡 DRY-RUN — no se escribió nada. Agregá --apply para confirmar.\n')
    return
  }

  await ref.set(merge, { merge: true })
  console.log('\n✅ Merge aplicado.\n')
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
;(async () => {
  await auditar()
  if (fixUid) await fix()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
