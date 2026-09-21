// scripts/migrar-encargados.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Convierte los referidos que hoy viven como TEXTO LIBRE en `cliente.origenNombre`
// en fichas de la colección `encargados`, y les vincula sus clientes.
//
// EL PROBLEMA QUE RESUELVE
//   "Julian Zeiss", "JULIAN ZEISS" y "julian zeiss" son tres entidades distintas
//   en las métricas de Referidos. Además no hay dónde guardar el teléfono, y si
//   el secretario que los trajo se va, el contacto se pierde.
//
// CÓMO AGRUPA
//   Normaliza el texto (minúsculas, sin tildes, sin espacios dobles) y junta
//   todas las variantes bajo una misma ficha. El nombre que queda es la variante
//   más frecuente, respetando mayúsculas y minúsculas.
//
// A QUIÉN SE LO ASIGNA
//   Al secretario que más clientes le cargó. En empate, al que cargó el más
//   reciente: es el que probablemente mantenga la relación viva.
//
// EL TELÉFONO
//   Es obligatorio en el modelo, pero el texto libre no lo tiene. Se intenta
//   deducir así:
//     1. si hay un cliente cuyo nombre coincide con el del referido, se usa su
//        teléfono (el encargado suele estar también cargado como cliente)
//     2. si no, queda vacío y la ficha se marca `datosIncompletos: true`
//   Las fichas incompletas se listan aparte para completarlas a mano.
//
// USO
//   node scripts/migrar-encargados.mjs --dry-run
//   node scripts/migrar-encargados.mjs --dry-run --min-clientes=2
//   node scripts/migrar-encargados.mjs --apply
//
//   --min-clientes=N   ignora los que trajeron menos de N clientes (default 1)
//   --solo-comercial   solo concesionarias, agencias, reventas y encargados
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args   = process.argv.slice(2)
const APPLY  = args.includes('--apply')
const DRY    = !APPLY
const MIN    = Number(args.find(a => a.startsWith('--min-clientes='))?.split('=')[1] ?? 1)
const SOLO_C = args.includes('--solo-comercial')
const GEST   = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.')
  process.exit(1)
}

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

// Normaliza para agrupar: minúsculas, sin tildes, sin espacios de más
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

const soloDig = s => String(s ?? '').replace(/\D/g, '')

// origenCanal → tipo de encargado
const TIPO = {
  encargado_multas: 'encargado_multas',
  concesionaria:    'concesionaria',
  agencia:          'agencia',
  reventa:          'reventa',
  referido_persona: 'referido_persona',
}
const COMERCIALES = ['encargado_multas','concesionaria','agencia','reventa']

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO'}`)
console.log(`   Mínimo de clientes: ${MIN}`)
console.log(`   Solo comerciales: ${SOLO_C ? 'SÍ' : 'no'}\n`)

// ─── 1 · CARGAR ──────────────────────────────────────────────────────────────

const col = n => GEST
  ? db.collection(n).where('gestoriaId', '==', GEST)
  : db.collection(n)

console.log('Cargando...')
const [cliS, encS, usrS] = await Promise.all([
  col('clientes').get(),
  col('encargados').get().catch(() => ({ docs: [], size: 0, forEach: () => {} })),
  db.collection('users').get(),
])
console.log(`  clientes ${cliS.size} · encargados ya existentes ${encS.size ?? 0}\n`)

// Los que ya migraste, para no duplicar si corrés el script dos veces
const yaExisten = new Set()
const telYaUsado = new Set()
;(encS.docs ?? []).forEach(d => {
  const e = d.data()
  yaExisten.add(norm(`${e.nombre} ${e.apellido}`))
  const t = soloDig(e.telefono).slice(-10)
  if (t) telYaUsado.add(t)
})

const usuarios = new Map()
usrS.forEach(d => {
  const u = d.data()
  usuarios.set(d.id, `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim())
})

// ─── 2 · AGRUPAR POR REFERIDO ────────────────────────────────────────────────

const grupos = new Map()   // clave normalizada → datos

cliS.forEach(d => {
  const c = { id: d.id, ...d.data() }
  const nombreRef = String(c.origenNombre ?? '').trim()
  const canal = String(c.origenCanal ?? '')

  if (!nombreRef) return
  if (!TIPO[canal]) return
  if (SOLO_C && !COMERCIALES.includes(canal)) return

  const k = norm(nombreRef)
  if (!k || k.length < 3) return

  if (!grupos.has(k)) {
    grupos.set(k, {
      variantes: new Map(),   // texto original → veces
      canales:   new Map(),
      clientes:  [],
      porSecretario: new Map(),
      ultimo: 0,
      ultimoSecretario: '',
    })
  }
  const g = grupos.get(k)
  g.variantes.set(nombreRef, (g.variantes.get(nombreRef) ?? 0) + 1)
  g.canales.set(canal, (g.canales.get(canal) ?? 0) + 1)
  g.clientes.push(c)

  const sec = String(c.creadoPor ?? '')
  if (sec) {
    g.porSecretario.set(sec, (g.porSecretario.get(sec) ?? 0) + 1)
    const ms = c.creadoEn?.toMillis?.() ?? 0
    if (ms > g.ultimo) { g.ultimo = ms; g.ultimoSecretario = sec }
  }
})

console.log(`Referidos distintos encontrados: ${grupos.size}\n`)

// ─── 3 · ARMAR LAS FICHAS ────────────────────────────────────────────────────

// Índice de clientes por nombre, para buscarles el teléfono al encargado
const cliPorNombre = new Map()
cliS.forEach(d => {
  const c = d.data()
  const k = norm(`${c.nombre ?? ''} ${c.apellido ?? ''}`)
  if (k && c.telefono) cliPorNombre.set(k, String(c.telefono))
})

const masFrecuente = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]

const fichas = []
const stats = { creadas: 0, yaExistian: 0, pocosClientes: 0, sinTelefono: 0, sinSecretario: 0 }

for (const [k, g] of grupos) {
  if (g.clientes.length < MIN) { stats.pocosClientes++; continue }
  if (yaExisten.has(k))        { stats.yaExistian++;    continue }

  const nombreCompleto = masFrecuente(g.variantes)
  const canal = masFrecuente(g.canales)
  const partes = nombreCompleto.split(/\s+/)
  const nombre   = partes[0] ?? nombreCompleto
  const apellido = partes.slice(1).join(' ') || '—'

  // Teléfono: si el encargado también está cargado como cliente, se lo tomamos
  const tel = cliPorNombre.get(k) ?? ''
  const telNorm = soloDig(tel).slice(-10)
  const telOk = telNorm.length >= 8 && !telYaUsado.has(telNorm)
  if (!telOk) stats.sinTelefono++
  if (telOk) telYaUsado.add(telNorm)

  // Secretario: el que más clientes le cargó; empate → el del más reciente
  let sec = '', maxN = 0
  for (const [uid, n] of g.porSecretario) {
    if (n > maxN) { maxN = n; sec = uid }
  }
  if (!sec) sec = g.ultimoSecretario
  if (!sec) stats.sinSecretario++

  fichas.push({
    clave: k,
    doc: {
      gestoriaId: g.clientes[0].gestoriaId,
      nombre, apellido,
      telefono: telOk ? soloDig(tel) : '',
      tipo: TIPO[canal],
      asignadoA:       sec,
      asignadoANombre: usuarios.get(sec) ?? '',
      activo: true,
      // Se marca para poder filtrar después las que hay que completar
      datosIncompletos: !telOk,
      migradoDeTexto:   nombreCompleto,
      clientesAportados: g.clientes.length,
      ultimoAporteEn: g.ultimo
        ? admin.firestore.Timestamp.fromMillis(g.ultimo) : null,
      creadoEn:  admin.firestore.FieldValue.serverTimestamp(),
      creadoPor: 'migracion',
    },
    clienteIds: g.clientes.map(c => c.id),
    variantes: [...g.variantes.keys()],
  })
  stats.creadas++
}

fichas.sort((a, b) => b.doc.clientesAportados - a.doc.clientesAportados)

// ─── 4 · REPORTE ─────────────────────────────────────────────────────────────

const filas = [[
  'nombre','apellido','tipo','telefono','datosIncompletos',
  'clientes','asignadoA','variantesDelTexto',
].join(',')]
fichas.forEach(f => filas.push([
  f.doc.nombre, f.doc.apellido, f.doc.tipo, f.doc.telefono,
  f.doc.datosIncompletos ? 'SI' : '',
  f.doc.clientesAportados, `"${f.doc.asignadoANombre}"`,
  `"${f.variantes.join(' | ')}"`,
].join(',')))
writeFileSync('./migracion-encargados.csv', filas.join('\n'), 'utf8')

console.log('─'.repeat(60))
console.log(`Fichas a crear                ${stats.creadas}`)
console.log(`  sin teléfono (a completar)  ${stats.sinTelefono}`)
console.log(`  sin secretario asignable    ${stats.sinSecretario}`)
console.log(`Ya existían                   ${stats.yaExistian}`)
console.log(`Descartadas (< ${MIN} clientes)     ${stats.pocosClientes}`)
console.log('─'.repeat(60))

const conVariantes = fichas.filter(f => f.variantes.length > 1)
if (conVariantes.length) {
  console.log(`\n📌 ${conVariantes.length} se escribían de varias formas y ahora se unifican:`)
  conVariantes.slice(0, 12).forEach(f =>
    console.log(`   ${f.doc.nombre} ${f.doc.apellido}  ←  ${f.variantes.join(' | ')}`))
  if (conVariantes.length > 12) console.log(`   ... y ${conVariantes.length - 12} más`)
}

console.log('\nLOS 10 QUE MÁS APORTARON')
fichas.slice(0, 10).forEach(f =>
  console.log(`   ${String(f.doc.clientesAportados).padStart(3)} clientes  ` +
              `${`${f.doc.nombre} ${f.doc.apellido}`.padEnd(28).slice(0,28)}  ` +
              `${f.doc.asignadoANombre || '(sin asignar)'}`))

console.log('\n📄 ./migracion-encargados.csv\n')

if (DRY) {
  console.log('🔍 No se escribió nada.')
  console.log('   Revisá el CSV, sobre todo la columna datosIncompletos:')
  console.log('   esas fichas quedan sin teléfono y hay que completarlas a mano.')
  console.log('   Después corré con --apply.\n')
  process.exit(0)
}

// ─── 5 · APLICAR ─────────────────────────────────────────────────────────────

console.log(`\n⚠️  Creando ${fichas.length} fichas y vinculando clientes...\n`)

let creadas = 0, vinculados = 0

for (const f of fichas) {
  // a) crear la ficha
  const ref = await db.collection('encargados').add(f.doc)
  creadas++

  // b) vincular sus clientes por id. Sin esto, las métricas del encargado
  //    seguirían dependiendo del texto libre.
  for (let i = 0; i < f.clienteIds.length; i += 400) {
    const batch = db.batch()
    f.clienteIds.slice(i, i + 400).forEach(cid => {
      batch.update(db.collection('clientes').doc(cid), {
        encargadoId:     ref.id,
        encargadoNombre: `${f.doc.nombre} ${f.doc.apellido}`.trim(),
      })
      vinculados++
    })
    await batch.commit()
  }

  process.stdout.write(`  ${creadas}/${fichas.length}\r`)
}

console.log(`  ${creadas}/${fichas.length} ✓`)
console.log(`\n✅ ${creadas} fichas creadas · ${vinculados} clientes vinculados.`)

if (stats.sinTelefono > 0) {
  console.log(`\n⚠️  ${stats.sinTelefono} quedaron SIN TELÉFONO (datosIncompletos: true).`)
  console.log('   Filtralas en la pantalla de Encargados y pedile a cada secretario')
  console.log('   que complete los suyos. Sin teléfono, si el secretario se va,')
  console.log('   el contacto igual se pierde.\n')
}

console.log('Los trámites NO se vincularon: heredan el encargado del cliente.')
console.log('Si querés propagarlo también a los trámites, decilo y lo agrego.\n')
process.exit(0)
