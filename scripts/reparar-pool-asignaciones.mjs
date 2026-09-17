import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args     = process.argv.slice(2)
const APPLY    = args.includes('--apply')
const DRY      = !APPLY
const GESTORIA = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply. No corre sin bandera explícita.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO'}${GESTORIA ? ` · gestoría ${GESTORIA}` : ''}\n`)

// ─── 1. RASTRO DE LIBERACIONES ───────────────────────────────────────────────

console.log('Buscando notificaciones de liberación...')

let notiQuery = db.collection('notificaciones')
  .where('titulo', '==', 'Chat liberado al pool')
if (GESTORIA) notiQuery = notiQuery.where('gestoriaId', '==', GESTORIA)

const notiSnap = await notiQuery.get()
console.log(`  ${notiSnap.size} liberaciones registradas`)

// convId → { uid, cuando }. Si una conversación fue liberada varias veces,
// nos quedamos con el dueño de la liberación MÁS ANTIGUA: es el dueño real,
// antes de que la función empezara a rebotarla.
const dueñoOriginal = new Map()

notiSnap.forEach(doc => {
  const n = doc.data()
  const convId = String(n.entidadId ?? '')
  const uid    = String(n.destinatarioId ?? '')
  if (!convId || !uid) return
  if (n.entidadTipo && n.entidadTipo !== 'conversacionWA') return

  const ms = n.creadoEn?.toMillis?.() ?? 0
  const previo = dueñoOriginal.get(convId)
  if (!previo || ms < previo.cuando) {
    dueñoOriginal.set(convId, { uid, cuando: ms, gestoriaId: n.gestoriaId })
  }
})

console.log(`  ${dueñoOriginal.size} conversaciones con dueño identificable\n`)

if (dueñoOriginal.size === 0) {
  console.log('No hay nada que reparar por esta vía.')
  console.log('Alternativa: reasignar por ruteo de línea (ver nota al pie).\n')
  process.exit(0)
}

// ─── 2. NOMBRES DE LOS AGENTES ───────────────────────────────────────────────

const uids = [...new Set([...dueñoOriginal.values()].map(v => v.uid))]
const nombres = new Map()
const activos = new Map()

for (let i = 0; i < uids.length; i += 30) {
  const lote = uids.slice(i, i + 30)
  const snaps = await db.getAll(...lote.map(u => db.collection('users').doc(u)))
  snaps.forEach((s, idx) => {
    if (!s.exists) return
    const u = s.data()
    nombres.set(lote[idx], `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim())
    activos.set(lote[idx], u.activo !== false)
  })
}

// ─── 3. ESTADO ACTUAL DE CADA CONVERSACIÓN ───────────────────────────────────

console.log('Leyendo conversaciones...')

const convIds = [...dueñoOriginal.keys()]
const updates = []
const filas = [[
  'conversacionId', 'telefono', 'nombre',
  'asignadoActual', 'dueñoARestaurar', 'nombreDueño',
  'ultimoMensajeDireccion', 'noLeidos', 'accion',
].join(',')]

const stats = {
  restaurar: 0, yaTieneDueno: 0, agenteInactivo: 0,
  noExiste: 0, respondida: 0,
}

for (let i = 0; i < convIds.length; i += 300) {
  const lote = convIds.slice(i, i + 300)
  const snaps = await db.getAll(
    ...lote.map(id => db.collection('conversacionesWA').doc(id)),
  )

  snaps.forEach((snap, idx) => {
    const convId = lote[idx]
    const info   = dueñoOriginal.get(convId)

    if (!snap.exists) { stats.noExiste++; return }
    const c = snap.data()

    if (GESTORIA && c.gestoriaId !== GESTORIA) return

    let accion = ''

    // Ya tiene dueño: alguien la tomó después. No tocar.
    if (c.asignadoA) {
      stats.yaTieneDueno++
      accion = 'ya-tiene-dueño'
    }
    // El dueño original ya no trabaja acá: dejarla en el pool a propósito.
    else if (!activos.get(info.uid)) {
      stats.agenteInactivo++
      accion = 'agente-inactivo'
    }
    else {
      stats.restaurar++
      accion = 'RESTAURAR'
      updates.push({
        id: convId,
        patch: {
          asignadoA:      info.uid,
          asignadoNombre: nombres.get(info.uid) ?? '',
          // Rastro de la reparación, por si hay que revisarlo después
          reparadoEn:     admin.firestore.FieldValue.serverTimestamp(),
          reparadoMotivo: 'liberacion-erronea-sin-ecos-coexistence',
          // Se limpia para que no vuelva a dispararse sobre esta conversación
          alertaSinRespuestaEn: admin.firestore.FieldValue.delete(),
        },
      })
    }

    filas.push([
      convId,
      c.telefono ?? '',
      `"${String(c.nombre ?? '').replace(/"/g, "'")}"`,
      c.asignadoA ?? '',
      info.uid,
      `"${nombres.get(info.uid) ?? ''}"`,
      c.ultimoMensajeDireccion ?? '',
      c.noLeidos ?? 0,
      accion,
    ].join(','))
  })

  process.stdout.write(`  ${Math.min(i + 300, convIds.length)}/${convIds.length}\r`)
}
console.log(`  ${convIds.length}/${convIds.length} ✓\n`)

// ─── 4. REPORTE ──────────────────────────────────────────────────────────────

writeFileSync('./reparacion-pool-preview.csv', filas.join('\n'), 'utf8')

console.log('─'.repeat(56))
console.log(`Conversaciones analizadas  ${convIds.length}`)
console.log(`  a restaurar              ${stats.restaurar}`)
console.log(`  ya tienen dueño          ${stats.yaTieneDueno}`)
console.log(`  dueño ya no está activo  ${stats.agenteInactivo}`)
console.log(`  no existen               ${stats.noExiste}`)
console.log('─'.repeat(56))
console.log('\n📄 Detalle en ./reparacion-pool-preview.csv')

if (DRY) {
  console.log('\n🔍 DRY-RUN — no se escribió nada.')
  console.log('Revisá el CSV y corré con --apply.\n')
  process.exit(0)
}

// ─── 5. APLICAR ──────────────────────────────────────────────────────────────

console.log(`\n⚠️  Restaurando ${updates.length} asignaciones...\n`)

let hechos = 0
for (let i = 0; i < updates.length; i += 400) {
  const batch = db.batch()
  updates.slice(i, i + 400).forEach(u => {
    batch.update(db.collection('conversacionesWA').doc(u.id), u.patch)
  })
  await batch.commit()
  hechos += Math.min(400, updates.length - i)
  process.stdout.write(`  ${hechos}/${updates.length}\r`)
}

console.log(`  ${hechos}/${updates.length} ✓`)
console.log('\n✅ Pool reparado.')
console.log('   Verificá en la Bandeja que los filtros por secretario vuelvan')
console.log('   a tener sus conversaciones antes de reactivar alertasSinRespuesta.\n')
process.exit(0)

// ─────────────────────────────────────────────────────────────────────────────
// SI EL RASTRO NO ALCANZA
// ─────────────────────────────────────────────────────────────────────────────
// Las conversaciones liberadas antes de que existiera la notificación, o
// aquellas donde nunca hubo dueño, no se pueden reconstruir por acá. Dos
// caminos:
//
//   a) Ruteo por línea: Webhook.ts asigna dueño según el phone_number_id que
//      recibió (ver RuteoWhatsAppEditor). Se puede reasignar en masa por
//      `waPhoneNumberId` si cada secretario tiene su línea.
//
//   b) Por último mensaje saliente: una vez que los ecos funcionen, el campo
//      `enviadoPor` de los mensajes salientes va a decir quién atendió. Para
//      los que vienen del celular queda vacío (origenEnvio: 'celular'), así
//      que esto solo sirve para los respondidos desde GestorApp.
//
// Para el resto, lo más limpio es dejarlos en el pool y que los secretarios se
// los vayan tomando: es trabajo manual una sola vez, contra el riesgo de
// asignar mal a 300 conversaciones.
