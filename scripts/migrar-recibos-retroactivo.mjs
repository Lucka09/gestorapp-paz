import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

// ─── ARGS ────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2)
const APPLY    = args.includes('--apply')
const DRY      = !APPLY
const GESTORIA = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply. Nunca corre sin bandera explícita.')
  process.exit(1)
}

// ─── INIT ────────────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ─── 1. CARGAR RECIBOS ───────────────────────────────────────────────────────

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  APLICANDO CAMBIOS'}${GESTORIA ? ` · gestoría ${GESTORIA}` : ''}\n`)

let recibosQuery = db.collection('recibos')
if (GESTORIA) recibosQuery = recibosQuery.where('gestoriaId', '==', GESTORIA)

const recibosSnap = await recibosQuery.get()
console.log(`Recibos encontrados: ${recibosSnap.size}`)

if (recibosSnap.empty) {
  console.log('Nada que migrar.')
  process.exit(0)
}

// Agrupar por trámite
const porTramite = new Map()
recibosSnap.forEach(doc => {
  const r = { id: doc.id, ...doc.data() }
  if (!r.tramiteId) return
  if (!porTramite.has(r.tramiteId)) porTramite.set(r.tramiteId, [])
  porTramite.get(r.tramiteId).push(r)
})

console.log(`Trámites involucrados: ${porTramite.size}\n`)

// ─── 2. TRAER LAS DEDUCCIONES DE CADA TRÁMITE ────────────────────────────────

const tramiteIds = [...porTramite.keys()]
const deducciones = new Map()   // tramiteId → { suats, informe, fuente }

console.log('Leyendo multaWorkflow y tramites...')

for (let i = 0; i < tramiteIds.length; i += 300) {
  const lote = tramiteIds.slice(i, i + 300)

  const [wfSnaps, trSnaps] = await Promise.all([
    db.getAll(...lote.map(id => db.collection('multaWorkflow').doc(id))),
    db.getAll(...lote.map(id => db.collection('tramites').doc(id))),
  ])

  lote.forEach((id, idx) => {
    const wf = wfSnaps[idx].exists ? wfSnaps[idx].data() : null
    const tr = trSnaps[idx].exists ? trSnaps[idx].data() : null

    // Fuente de verdad: el paso 7. Es lo que el operador declaró al cerrar.
    const p7 = wf?.paso7
    if (p7) {
      deducciones.set(id, {
        suats:   p7.suatsAbonado ? num(p7.montoSUATS) : 0,
        informe: p7.informePersonaRealizado ? num(p7.montoInformePersona) : 0,
        fuente:  'paso7',
      })
      return
    }

    // Fallback: los campos del trámite. Pueden estar afectados por el bug de
    // crearRecibo, por eso son segunda opción.
    if (tr && (tr.costosSUATS || tr.costosInformePersona)) {
      deducciones.set(id, {
        suats:   num(tr.costosSUATS),
        informe: num(tr.costosInformePersona),
        fuente:  'tramite',
      })
      return
    }

    deducciones.set(id, { suats: 0, informe: 0, fuente: 'sin-deducciones' })
  })

  process.stdout.write(`  ${Math.min(i + 300, tramiteIds.length)}/${tramiteIds.length}\r`)
}
console.log(`  ${tramiteIds.length}/${tramiteIds.length} ✓\n`)

// ─── 3. CALCULAR EL BACKFILL ─────────────────────────────────────────────────

const updates = []
const filasCsv = [[
  'reciboId', 'numeroRecibo', 'tramiteId', 'tipo', 'monto',
  'montoSUATS', 'montoInformePersona', 'netoGestoria',
  'atribuidoA', 'fuenteDeduccion', 'nota',
].join(',')]

const stats = {
  total: 0, conDeduccion: 0, sinCambio: 0,
  atribucionRellenada: 0, derrames: 0, alertas: 0,
}

const ts = r => r.creadoEn?.toMillis?.() ?? 0

for (const [tramiteId, recibos] of porTramite) {
  const ded = deducciones.get(tramiteId) ?? { suats: 0, informe: 0, fuente: 'desconocida' }

  // Orden cronológico ascendente
  recibos.sort((a, b) => ts(a) - ts(b))

  // ¿A qué recibo se le imputan las deducciones?
  const idxCierre = (() => {
    const i = recibos.findIndex(r => r.tipo === 'total')
    return i >= 0 ? i : recibos.length - 1
  })()

  // Reparto: arranca todo en el recibo de cierre y derrama hacia atrás
  const reparto = recibos.map(() => ({ suats: 0, informe: 0 }))
  let restaSuats   = ded.suats
  let restaInforme = ded.informe

  for (let i = idxCierre; i >= 0 && (restaSuats > 0 || restaInforme > 0); i--) {
    const capacidad = num(recibos[i].monto)
    let libre = capacidad

    const aplicaSuats = Math.min(restaSuats, libre)
    reparto[i].suats = aplicaSuats
    restaSuats -= aplicaSuats
    libre      -= aplicaSuats

    const aplicaInforme = Math.min(restaInforme, libre)
    reparto[i].informe = aplicaInforme
    restaInforme -= aplicaInforme

    if (i < idxCierre && (aplicaSuats > 0 || aplicaInforme > 0)) stats.derrames++
  }

  const sobrante = restaSuats + restaInforme
  if (sobrante > 0) stats.alertas++

  recibos.forEach((r, i) => {
    stats.total++

    const suats   = reparto[i].suats
    const informe = reparto[i].informe
    const monto   = num(r.monto)
    const neto    = Math.max(0, monto - suats - informe)

    const faltaAtribucion = !r.atribuidoA
    const faltaDesglose   = r.netoGestoria === undefined

    if (!faltaAtribucion && !faltaDesglose) { stats.sinCambio++; return }
    if (faltaAtribucion) stats.atribucionRellenada++
    if (suats > 0 || informe > 0) stats.conDeduccion++

    const patch = {
      montoSUATS:          suats,
      montoInformePersona: informe,
      comisionReferido:    num(r.comisionReferido),
      costoFinanciero:     num(r.costoFinanciero),
      netoGestoria:        neto,
      migradoEn:           admin.firestore.FieldValue.serverTimestamp(),
      migradoDesde:        ded.fuente,
    }
    if (faltaAtribucion) {
      patch.atribuidoA       = r.emitidoPor       ?? ''
      patch.atribuidoANombre = r.emitidoPorNombre ?? ''
    }

    updates.push({ id: r.id, patch })

    const nota = sobrante > 0 && i === 0
      ? `SOBRANTE ${sobrante} no imputado`
      : (i !== idxCierre && (suats + informe) > 0 ? 'derrame' : '')

    filasCsv.push([
      r.id, r.numeroRecibo ?? '', tramiteId, r.tipo ?? '', monto,
      suats, informe, neto,
      patch.atribuidoA ?? r.atribuidoA ?? '', ded.fuente, nota,
    ].join(','))
  })
}

// ─── 4. REPORTE ──────────────────────────────────────────────────────────────

writeFileSync('./migracion-recibos-preview.csv', filasCsv.join('\n'), 'utf8')

console.log('─'.repeat(58))
console.log(`Recibos analizados        ${stats.total}`)
console.log(`  a actualizar            ${updates.length}`)
console.log(`  ya migrados (sin tocar) ${stats.sinCambio}`)
console.log(`  con deducción imputada  ${stats.conDeduccion}`)
console.log(`  atribución rellenada    ${stats.atribucionRellenada}`)
console.log(`  derrames a parciales    ${stats.derrames}`)
console.log(`  ⚠️  con sobrante         ${stats.alertas}`)
console.log('─'.repeat(58))
console.log('\n📄 Detalle en ./migracion-recibos-preview.csv')

if (stats.alertas > 0) {
  console.log(
    `\n⚠️  ${stats.alertas} trámite(s) tienen deducciones mayores a la suma de ` +
    'sus recibos. Revisalos a mano en el CSV (columna nota = SOBRANTE) antes ' +
    'de aplicar: probablemente sean multas cerradas con el bug de crearRecibo ' +
    'donde el total quedó truncado.',
  )
}

if (DRY) {
  console.log('\n🔍 DRY-RUN — no se escribió nada. Revisá el CSV y corré --apply.\n')
  process.exit(0)
}

// ─── 5. APLICAR ──────────────────────────────────────────────────────────────

console.log(`\n⚠️  Escribiendo ${updates.length} recibos...\n`)

let escritos = 0
for (let i = 0; i < updates.length; i += 400) {
  const batch = db.batch()
  updates.slice(i, i + 400).forEach(u => {
    batch.update(db.collection('recibos').doc(u.id), u.patch)
  })
  await batch.commit()
  escritos += Math.min(400, updates.length - i)
  process.stdout.write(`  ${escritos}/${updates.length}\r`)
}

console.log(`  ${escritos}/${updates.length} ✓`)
console.log('\n✅ Migración completa.')
console.log('   Verificá el Panel de Mando: el neto del mes debería coincidir')
console.log('   con Σ(monto) − Σ(SUATS) − Σ(informes) del período.\n')
process.exit(0)
