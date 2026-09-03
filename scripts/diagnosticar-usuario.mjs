// scripts/diagnosticar-usuario.mjs
// Solo lectura:  node scripts/diagnosticar-usuario.mjs alexia@gestoriapaz.com
// Aplicar fix:   node scripts/diagnosticar-usuario.mjs alexia@gestoriapaz.com --apply
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const EMAIL = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!EMAIL) { console.error('Falta el email.'); process.exit(1) }

const ROLES_STAFF = [
  'propietario','admin_gral','admin','gestor',
  'operador','vendedor','asesor_comercial','asistente_multas',
]

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

const uq = await db.collection('users').where('email', '==', EMAIL).limit(1).get()
if (uq.empty) { console.error(`❌ No hay usuario con email ${EMAIL}`); process.exit(1) }
const uDoc = uq.docs[0]; const u = uDoc.data()

const pq  = await db.collection('users').where('rol','==','propietario').limit(1).get()
const gestoriaCanonica = pq.empty ? null : (pq.docs[0].data().gestoriaId ?? null)
const cfg = await db.doc('configuracion/gestor').get()
const cfgGestoria = cfg.exists ? (cfg.data().gestoriaId ?? null) : null

console.log('\n──── USUARIO ────')
console.log('uid        :', uDoc.id)
console.log('rol        :', JSON.stringify(u.rol))
console.log('gestoriaId :', JSON.stringify(u.gestoriaId ?? null))
console.log('activo     :', u.activo)
console.log('\n──── REFERENCIA ────')
console.log('gestoriaId propietario   :', JSON.stringify(gestoriaCanonica))
console.log('gestoriaId configuracion :', JSON.stringify(cfgGestoria))

const rolOk  = ROLES_STAFF.includes(u.rol)
const gestOk = !!u.gestoriaId
console.log('\n──── DIAGNÓSTICO isStaff() ────')
console.log(rolOk  ? '✅ rol OK' : `❌ rol "${u.rol}" NO está en la lista de staff`)
console.log(gestOk ? '✅ gestoriaId presente' : '❌ gestoriaId ausente/null')
if (gestOk && gestoriaCanonica && u.gestoriaId !== gestoriaCanonica)
  console.log('⚠️  gestoriaId del usuario ≠ del propietario')
if (cfgGestoria && u.gestoriaId && cfgGestoria !== u.gestoriaId)
  console.log('⚠️  configuracion/gestor.gestoriaId ≠ gestoriaId del usuario')
console.log((rolOk && gestOk)
  ? '\n=> isStaff() PASA (revisá los ⚠️ de gestoriaId/config).'
  : '\n=> isStaff() FALLA. Esta es la causa del permission-denied y del workflow colgado.')

if (!APPLY) { console.log('\n(Solo lectura. Corré con --apply para corregir.)'); process.exit(0) }

const patch = {}
if (!rolOk)  patch.rol = 'asesor_comercial'                    // confirmá que este es el rol correcto
if (!gestOk && gestoriaCanonica) patch.gestoriaId = gestoriaCanonica
if (!Object.keys(patch).length) { console.log('\nNada para corregir automáticamente.'); process.exit(0) }
console.log('\nAplicando patch:', patch)
await uDoc.ref.set(patch, { merge: true })
console.log('✅ Listo. Que recargue la app.')