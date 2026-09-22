// scripts/aplicar-encargados.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Carga en `encargados` lo que completó Jessica en la planilla.
//
// Lee ./encargados-jessica.json (generado desde su planilla) y, por cada ficha:
//   1. busca si ya existe (por teléfono o por cualquiera de sus alias)
//   2. si existen VARIAS que son la misma persona (ej. "luca" y
//      "luca di tomasso" creadas por separado), conserva una, le pasa los
//      datos y desactiva las otras — no las borra
//   3. si no existe, la crea
//   4. vincula por `encargadoId` todos los clientes cuyo `origenNombre`
//      coincide con alguno de sus alias
//
// Funciona tanto si ya corriste migrar-encargados.mjs como si no.
// Es idempotente: se puede correr dos veces sin duplicar.
//
// USO
//   node scripts/aplicar-encargados.mjs --dry-run
//   node scripts/aplicar-encargados.mjs --apply
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args  = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY   = !APPLY
const JSONF = args.find(a => a.startsWith('--archivo='))?.split('=')[1] ?? './encargados-jessica.json'

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.')
  process.exit(1)
}

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })
const FV = admin.firestore.FieldValue

const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()
const tel10 = s => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }

const fichas = JSON.parse(readFileSync(JSONF, 'utf8'))
console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO'} · ${fichas.length} fichas desde ${JSONF}\n`)

// ─── 1 · CARGAR ──────────────────────────────────────────────────────────────

const [usrS, encS, cliS] = await Promise.all([
  db.collection('users').get(),
  db.collection('encargados').get(),
  db.collection('clientes').get(),
])

// Secretarios por nombre de pila
const SEC = {}
usrS.forEach(d => {
  const u = d.data()
  const nom = `${u.nombre ?? ''} ${u.apellido ?? ''}`.replace(/\s+/g, ' ').trim()
  const k = norm(u.nombre).split(' ')[0]
  if (k && !SEC[k]) SEC[k] = { uid: d.id, nombre: nom, gestoriaId: u.gestoriaId }
})

for (const s of ['jessica', 'florencia', 'gonzalo']) {
  if (!SEC[s]) {
    console.error(`✗ No encontré al usuario "${s}" en users. Revisá el nombre.`)
    process.exit(1)
  }
}
const gestoriaId = SEC.jessica.gestoriaId
console.log(`Gestoría: ${gestoriaId}`)
console.log(`Secretarios: ${Object.entries(SEC).filter(([k]) => ['jessica','florencia','gonzalo'].includes(k)).map(([, v]) => v.nombre).join(' · ')}\n`)

const existentes = encS.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(e => e.gestoriaId === gestoriaId)
console.log(`Encargados ya en la base: ${existentes.length}`)

// ─── 2 · RESOLVER CADA FICHA ─────────────────────────────────────────────────

const plan = []   // { ficha, keeperId|null, absorbe: [ids], clientes: [ids] }

for (const f of fichas) {
  const aliases = new Set(f.alias.map(norm))
  aliases.add(norm(`${f.nombre} ${f.apellido}`))
  const tels = new Set([tel10(f.telefono), tel10(f.telefonoAlt)].filter(Boolean))

  // Existentes que corresponden a esta persona
  const match = existentes.filter(e => {
    if (e._usado) return false
    if (tels.size && tels.has(tel10(e.telefono))) return true
    return aliases.has(norm(e.migradoDeTexto))
        || aliases.has(norm(`${e.nombre} ${e.apellido}`))
  })
  // El que queda: el que más clientes tenía; los demás se absorben
  match.sort((a, b) => (b.clientesAportados ?? 0) - (a.clientesAportados ?? 0))
  match.forEach(e => { e._usado = true })

  // Clientes a vincular: por alias de texto, o ya vinculados a cualquier match
  const idsMatch = new Set(match.map(e => e.id))
  const clientes = []
  cliS.forEach(d => {
    const c = d.data()
    if (c.gestoriaId !== gestoriaId) return
    if (aliases.has(norm(c.origenNombre)) || idsMatch.has(c.encargadoId)) clientes.push(d.id)
  })

  plan.push({
    ficha: f,
    keeperId: match[0]?.id ?? null,
    absorbe: match.slice(1).map(e => e.id),
    clientes,
  })
}

// ─── 3 · REPORTE ─────────────────────────────────────────────────────────────

const filas = [['nombre','apellido','apodo','tipo','telefono','asignado','accion','fusiona','clientesVinculados','notas'].join(',')]
let crear = 0, actualizar = 0, fusionar = 0, vincular = 0

for (const p of plan) {
  const f = p.ficha
  const accion = p.keeperId ? 'actualizar' : 'crear'
  if (p.keeperId) actualizar++; else crear++
  fusionar += p.absorbe.length
  vincular += p.clientes.length
  filas.push([
    f.nombre, f.apellido, f.apodo, f.tipo, f.telefono,
    SEC[f.asignado].nombre, accion, p.absorbe.length,
    p.clientes.length, `"${f.notas}"`,
  ].join(','))
}
writeFileSync('./aplicacion-encargados.csv', filas.join('\n'), 'utf8')

console.log('─'.repeat(58))
console.log(`Fichas a crear                ${crear}`)
console.log(`Fichas a actualizar           ${actualizar}`)
console.log(`Duplicados a desactivar       ${fusionar}`)
console.log(`Clientes a vincular           ${vincular}`)
console.log('─'.repeat(58))
console.log(`Con teléfono                  ${fichas.filter(f => f.telefono).length}`)
console.log(`Sin teléfono (quedan a completar) ${fichas.filter(f => !f.telefono).length}`)
console.log('─'.repeat(58))

const sinClientes = plan.filter(p => p.clientes.length === 0 && p.ficha.clientes > 0)
if (sinClientes.length) {
  console.log(`\n⚠️  ${sinClientes.length} fichas no encontraron sus clientes por nombre:`)
  sinClientes.forEach(p => console.log(`   ${p.ficha.nombre} ${p.ficha.apellido} — esperaba ${p.ficha.clientes}`))
}

console.log('\n📄 ./aplicacion-encargados.csv\n')
if (DRY) {
  console.log('🔍 No se escribió nada. Revisá el CSV y corré con --apply.\n')
  process.exit(0)
}

// ─── 4 · APLICAR ─────────────────────────────────────────────────────────────

let hechos = 0
for (const p of plan) {
  const f = p.ficha
  const sec = SEC[f.asignado]
  const datos = {
    gestoriaId,
    nombre:   f.nombre,
    apellido: f.apellido,
    apodo:    f.apodo || null,
    telefono: f.telefono || '',
    telefonoAlt: f.telefonoAlt || null,
    tipo:     f.tipo,
    notas:    f.notas || null,
    asignadoA:       sec.uid,
    asignadoANombre: sec.nombre,
    activo:   true,
    datosIncompletos: !f.telefono,
    clientesAportados: p.clientes.length,
    alias:    f.alias,
    actualizadoEn: FV.serverTimestamp(),
    fuenteDatos:   'planilla-jessica-2026-09',
  }

  // a) crear o actualizar la ficha que queda
  let id = p.keeperId
  if (id) {
    await db.collection('encargados').doc(id).set(datos, { merge: true })
  } else {
    const ref = await db.collection('encargados').add({
      ...datos, creadoEn: FV.serverTimestamp(), creadoPor: 'migracion',
    })
    id = ref.id
  }

  // b) desactivar los duplicados, apuntando a la que queda. No se borran:
  //    así, si algún cliente quedó apuntando a uno viejo, se puede rastrear.
  for (const dup of p.absorbe) {
    await db.collection('encargados').doc(dup).set({
      activo: false, fusionadoEn: id, actualizadoEn: FV.serverTimestamp(),
    }, { merge: true })
  }

  // c) vincular clientes
  const nombreVisible = `${f.nombre} ${f.apellido}`.trim()
  for (let i = 0; i < p.clientes.length; i += 400) {
    const batch = db.batch()
    p.clientes.slice(i, i + 400).forEach(cid =>
      batch.update(db.collection('clientes').doc(cid), {
        encargadoId: id, encargadoNombre: nombreVisible,
      }))
    await batch.commit()
  }

  hechos++
  process.stdout.write(`  ${hechos}/${plan.length}\r`)
}

console.log(`  ${hechos}/${plan.length} ✓`)
console.log(`\n✅ Encargados cargados. ${fusionar} duplicados desactivados y ${vincular} clientes vinculados.`)
console.log('   Jessica ya debería verlos en el selector (si las reglas están desplegadas).\n')
process.exit(0)
