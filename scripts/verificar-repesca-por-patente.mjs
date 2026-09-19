// scripts/verificar-repesca-por-patente.mjs
// ─────────────────────────────────────────────────────────────────────────────
// El cruce anterior comparó por TELÉFONO. Falta el cruce por PATENTE, que
// atrapa un caso real: el cliente pide presupuesto desde un número, después
// viene a la oficina y el trámite se carga con otro teléfono o con un cliente
// nuevo. Por teléfono figura "prospecto abierto"; por patente ya está operado.
//
// QUÉ VERIFICA, patente por patente:
//   tramites.patente      → ¿ya hay una gestión sobre ese dominio?
//   vehiculos.patente     → ¿el auto está cargado en la base?
//   recibos.patente       → ¿se cobró algo por ese dominio?
//   multaWorkflow         → ¿hay un workflow de multas en curso?
//   duplicados internos   → ¿la misma patente aparece en varios prospectos?
//
// SALIDA
//   repesca-verificada.csv con una columna `veredicto`:
//     LIMPIO          → nadie lo tocó. Repescable.
//     YA-GESTIONADO   → hay trámite. NO repescar.
//     YA-COBRADO      → hay recibo. NO repescar.
//     VEHICULO-CARGADO→ el auto está en la base pero sin trámite. Revisar.
//     DUPLICADO       → la patente se repite entre los candidatos.
//     SIN-PATENTE     → no hay con qué cruzar (los SIN-RASTRO).
//
// USO
//   node scripts/verificar-repesca-por-patente.mjs
//   node scripts/verificar-repesca-por-patente.mjs --archivo=./repesca-cruzada.csv
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync } from 'node:fs'

const args    = process.argv.slice(2)
const ARCHIVO = args.find(a => a.startsWith('--archivo='))?.split('=')[1] ?? './repesca-cruzada.csv'
const GEST    = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const pat = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const tel = s => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d }

// ─── 1 · LEER EL CSV ─────────────────────────────────────────────────────────

function parseCSV(txt) {
  const lineas = txt.trim().split('\n')
  const cab = lineas[0].split(',').map(s => s.trim())
  return lineas.slice(1).map(l => {
    // Parser simple que respeta comillas
    const celdas = []; let act = '', dentro = false
    for (const ch of l) {
      if (ch === '"') dentro = !dentro
      else if (ch === ',' && !dentro) { celdas.push(act); act = '' }
      else act += ch
    }
    celdas.push(act)
    return Object.fromEntries(cab.map((c, i) => [c, (celdas[i] ?? '').trim()]))
  })
}

const filas = parseCSV(readFileSync(ARCHIVO, 'utf8'))
console.log(`\nCandidatos leídos: ${filas.length}\n`)

// ─── 2 · CARGAR LO GESTIONADO ────────────────────────────────────────────────

const col = n => GEST ? db.collection(n).where('gestoriaId', '==', GEST) : db.collection(n)

console.log('Cargando CRM...')
const [traS, vehS, recS, wfS] = await Promise.all([
  col('tramites').get(),
  col('vehiculos').get(),
  col('recibos').get(),
  col('multaWorkflow').get(),
])
console.log(`  tramites ${traS.size} · vehiculos ${vehS.size} · recibos ${recS.size} · workflows ${wfS.size}\n`)

const enTramites = new Map()   // patente → [{numero, estado, fecha, cliente}]
traS.forEach(d => {
  const t = d.data(); const p = pat(t.patente); if (!p) return
  if (!enTramites.has(p)) enTramites.set(p, [])
  enTramites.get(p).push({
    numero: t.numero ?? d.id,
    estado: t.estado ?? '',
    tipo:   t.tipo ?? '',
    fecha:  t.creadoEn?.toDate?.()?.toISOString?.().slice(0, 10) ?? '',
  })
})

const enVehiculos = new Map()
vehS.forEach(d => {
  const v = d.data(); const p = pat(v.patente); if (!p) return
  enVehiculos.set(p, { id: d.id, marca: v.marca ?? '', modelo: v.modelo ?? '' })
})

const enRecibos = new Map()
recS.forEach(d => {
  const r = d.data(); const p = pat(r.patente); if (!p) return
  enRecibos.set(p, (enRecibos.get(p) ?? 0) + Number(r.monto ?? 0))
})

const enWorkflow = new Map()
wfS.forEach(d => {
  const w = d.data(); const p = pat(w.paso1?.patente); if (!p) return
  enWorkflow.set(p, { paso: w.pasoActual ?? 0, estado: w.estadoWorkflow ?? '' })
})

// ─── 3 · DUPLICADOS INTERNOS ─────────────────────────────────────────────────
// Una patente que aparece en varios candidatos: puede ser la misma persona con
// dos números, o un dato mal cargado. En cualquier caso, no hay que contactar
// dos veces por el mismo auto.

const cuentaPat = new Map()
filas.forEach(f => {
  for (const p of String(f.patentes ?? '').split(/\s+/).filter(Boolean)) {
    const k = pat(p); if (!k) continue
    cuentaPat.set(k, (cuentaPat.get(k) ?? 0) + 1)
  }
})
const dupes = [...cuentaPat.entries()].filter(([, n]) => n > 1)

// ─── 4 · VERIFICAR ───────────────────────────────────────────────────────────

const stats = {
  limpio: 0, yaGestionado: 0, yaCobrado: 0,
  vehiculoCargado: 0, duplicado: 0, sinPatente: 0,
}

const salida = filas.map(f => {
  const patentes = String(f.patentes ?? '').split(/\s+/).filter(Boolean).map(pat)

  if (patentes.length === 0) {
    stats.sinPatente++
    return { ...f, veredicto: 'SIN-PATENTE', detalle: 'No hay patente para cruzar', repescable: 'SI' }
  }

  const hits = { tramite: [], recibo: 0, vehiculo: null, wf: null, dup: false }
  for (const p of patentes) {
    if (enTramites.has(p))  hits.tramite.push(...enTramites.get(p))
    if (enRecibos.has(p))   hits.recibo += enRecibos.get(p)
    if (enVehiculos.has(p)) hits.vehiculo = enVehiculos.get(p)
    if (enWorkflow.has(p))  hits.wf = enWorkflow.get(p)
    if ((cuentaPat.get(p) ?? 0) > 1) hits.dup = true
  }

  // El orden importa: lo más concluyente primero.
  if (hits.recibo > 0) {
    stats.yaCobrado++
    return {
      ...f, veredicto: 'YA-COBRADO', repescable: 'NO',
      detalle: `Se cobraron $${hits.recibo.toLocaleString('es-AR')} por esta patente`,
    }
  }
  if (hits.tramite.length > 0) {
    stats.yaGestionado++
    const t = hits.tramite[0]
    return {
      ...f, veredicto: 'YA-GESTIONADO', repescable: 'NO',
      detalle: `Trámite ${t.numero} · ${t.tipo} · ${t.estado} · ${t.fecha}`,
    }
  }
  if (hits.wf) {
    stats.yaGestionado++
    return {
      ...f, veredicto: 'YA-GESTIONADO', repescable: 'NO',
      detalle: `Workflow de multas en paso ${hits.wf.paso} (${hits.wf.estado})`,
    }
  }
  if (hits.vehiculo) {
    stats.vehiculoCargado++
    return {
      ...f, veredicto: 'VEHICULO-CARGADO', repescable: 'REVISAR',
      detalle: `${hits.vehiculo.marca} ${hits.vehiculo.modelo} está en la base, sin trámite`,
    }
  }
  if (hits.dup) {
    stats.duplicado++
    return {
      ...f, veredicto: 'DUPLICADO', repescable: 'REVISAR',
      detalle: 'La patente aparece en más de un candidato',
    }
  }

  stats.limpio++
  return { ...f, veredicto: 'LIMPIO', repescable: 'SI', detalle: 'Sin rastro en trámites, vehículos ni recibos' }
})

// ─── 5 · SALIDA ──────────────────────────────────────────────────────────────

const PRIO = { 'LIMPIO': 0, 'SIN-PATENTE': 1, 'DUPLICADO': 2, 'VEHICULO-CARGADO': 3, 'YA-GESTIONADO': 4, 'YA-COBRADO': 5 }
salida.sort((a, b) =>
  (PRIO[a.veredicto] - PRIO[b.veredicto]) || (Number(b.score || 0) - Number(a.score || 0)))

const cab = ['veredicto','repescable','detalle', ...Object.keys(filas[0])]
const csv = [cab.join(',')]
salida.forEach(f => csv.push(cab.map(c => {
  const v = f[c] ?? ''
  return /[,"]/.test(String(v)) ? `"${String(v).replace(/"/g, "'")}"` : v
}).join(',')))
writeFileSync('./repesca-verificada.csv', csv.join('\n'), 'utf8')

console.log('─'.repeat(60))
console.log(`LIMPIO (repescable)          ${stats.limpio}`)
console.log(`SIN-PATENTE (repescable)     ${stats.sinPatente}`)
console.log(`DUPLICADO (revisar)          ${stats.duplicado}`)
console.log(`VEHICULO-CARGADO (revisar)   ${stats.vehiculoCargado}`)
console.log(`YA-GESTIONADO (NO repescar)  ${stats.yaGestionado}`)
console.log(`YA-COBRADO (NO repescar)     ${stats.yaCobrado}`)
console.log('─'.repeat(60))
console.log(`REPESCABLES                  ${stats.limpio + stats.sinPatente}`)
console.log(`DESCARTADOS                  ${stats.yaGestionado + stats.yaCobrado}`)
console.log('─'.repeat(60))

if (dupes.length) {
  console.log(`\n⚠️  ${dupes.length} patentes repetidas entre los candidatos:`)
  dupes.slice(0, 15).forEach(([p, n]) => {
    const quienes = filas
      .filter(f => String(f.patentes ?? '').toUpperCase().includes(p))
      .map(f => `${f.nombre || 's/n'} (${f.telefonoFmt ?? f.telefono})`)
    console.log(`   ${p} ×${n}  →  ${quienes.join(' · ')}`)
  })
  if (dupes.length > 15) console.log(`   ... y ${dupes.length - 15} más`)
}

console.log('\n📄 ./repesca-verificada.csv\n')
process.exit(0)
