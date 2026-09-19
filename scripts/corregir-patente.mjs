// scripts/corregir-patente.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Cambia una patente mal cargada. El formulario la bloquea en edición
// (VehiculoForm.tsx:126) porque identifica al vehículo en varias colecciones,
// así que hay que actualizarla en todas a la vez o quedan desincronizadas.
//
// Dónde vive copiada la patente:
//   vehiculos.patente
//   tramites.patente
//   recibos.patente
//   multaWorkflow.paso1.patente
//   inscripcionWorkflow / transferenciaWorkflow (según el tipo de trámite)
//   consultasInfracciones.dominio
//
// USO
//   node scripts/corregir-patente.mjs --de=AB123CD --a=AB123CE --dry-run
//   node scripts/corregir-patente.mjs --de=AB123CD --a=AB123CE --apply \
//        --motivo="cargada con error de tipeo el 17/09"
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'

const args   = process.argv.slice(2)
const APPLY  = args.includes('--apply')
const DRY    = !APPLY
const DE     = args.find(a => a.startsWith('--de='))?.split('=')[1]?.toUpperCase()
const A      = args.find(a => a.startsWith('--a='))?.split('=')[1]?.toUpperCase()
const MOTIVO = args.find(a => a.startsWith('--motivo='))?.split('=')[1] ?? ''

if (!DE || !A) {
  console.error('Uso: --de=PATENTEVIEJA --a=PATENTENUEVA [--motivo="..."] --dry-run|--apply')
  process.exit(1)
}
if (!APPLY && !args.includes('--dry-run')) {
  console.error('Pasá --dry-run o --apply.')
  process.exit(1)
}
if (APPLY && MOTIVO.trim().length < 10) {
  console.error('Con --apply el --motivo es obligatorio (mínimo 10 caracteres).')
  process.exit(1)
}

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const norm = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const DE_N = norm(DE), A_N = norm(A)

console.log(`\n${DRY ? '🔍 SIMULACIÓN' : '⚠️  APLICANDO'}`)
console.log(`   ${DE_N}  →  ${A_N}\n`)

// ─── 1 · VERIFICAR QUE LA NUEVA NO EXISTA ────────────────────────────────────

const choque = await db.collection('vehiculos').where('patente', '==', A_N).get()
if (!choque.empty) {
  console.error(`✗ Ya existe un vehículo con la patente ${A_N}.`)
  console.error(`  id: ${choque.docs[0].id}`)
  console.error('  Si son el mismo vehículo duplicado, hay que fusionarlos a mano.\n')
  process.exit(1)
}

// ─── 2 · ENCONTRAR TODO LO AFECTADO ──────────────────────────────────────────

const cambios = []   // { col, id, patch, resumen }

// Vehículo
const vehs = await db.collection('vehiculos').where('patente', '==', DE_N).get()
if (vehs.empty) {
  console.error(`✗ No hay ningún vehículo con la patente ${DE_N}.`)
  console.error('  Revisá el formato: se compara sin espacios ni guiones.\n')
  process.exit(1)
}
vehs.forEach(d => {
  const v = d.data()
  cambios.push({
    col: 'vehiculos', id: d.id,
    patch: { patente: A_N, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() },
    resumen: `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || d.id,
    gestoriaId: v.gestoriaId,
  })
})

// Trámites
const tras = await db.collection('tramites').where('patente', '==', DE_N).get()
tras.forEach(d => {
  const t = d.data()
  cambios.push({
    col: 'tramites', id: d.id,
    patch: { patente: A_N, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() },
    resumen: `${t.numero ?? d.id} · ${t.tipo ?? ''}`,
    gestoriaId: t.gestoriaId,
  })
})

// Recibos — el comprobante ya emitido lleva la patente impresa.
// Se actualiza igual para que los reportes cuadren, pero queda registro.
const recs = await db.collection('recibos').where('patente', '==', DE_N).get()
recs.forEach(d => {
  const r = d.data()
  cambios.push({
    col: 'recibos', id: d.id,
    patch: {
      patente: A_N,
      patenteCorregidaDe: DE_N,
      patenteCorregidaEn: admin.firestore.FieldValue.serverTimestamp(),
    },
    resumen: r.numeroRecibo ?? d.id,
    gestoriaId: r.gestoriaId,
  })
})

// Workflows — la patente vive anidada en paso1
for (const col of ['multaWorkflow', 'inscripcionWorkflow', 'transferenciaWorkflow']) {
  const snap = await db.collection(col).where('paso1.patente', '==', DE_N).get()
  snap.forEach(d => {
    cambios.push({
      col, id: d.id,
      patch: {
        'paso1.patente': A_N,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      resumen: `paso ${d.data().pasoActual ?? '?'}`,
      gestoriaId: d.data().gestoriaId,
    })
  })
}

// Consultas de infracciones — el campo se llama `dominio`
const cons = await db.collection('consultasInfracciones').where('dominio', '==', DE_N).get()
cons.forEach(d => {
  cambios.push({
    col: 'consultasInfracciones', id: d.id,
    patch: { dominio: A_N },
    resumen: d.data().estado ?? d.id,
    gestoriaId: d.data().gestoriaId,
  })
})

// ─── 3 · REPORTE ─────────────────────────────────────────────────────────────

const porCol = {}
cambios.forEach(c => { porCol[c.col] = (porCol[c.col] ?? 0) + 1 })

console.log('Documentos a actualizar:')
for (const [col, n] of Object.entries(porCol)) {
  console.log(`  ${col.padEnd(24)} ${n}`)
}
console.log(`  ${'TOTAL'.padEnd(24)} ${cambios.length}\n`)

cambios.forEach(c => console.log(`  · ${c.col}/${c.id}  ${c.resumen}`))
console.log()

if (DRY) {
  console.log('🔍 No se escribió nada. Revisá la lista y corré con --apply.\n')
  process.exit(0)
}

// ─── 4 · APLICAR ─────────────────────────────────────────────────────────────

const batch = db.batch()
cambios.forEach(c => batch.update(db.collection(c.col).doc(c.id), c.patch))

// Registro en audit_log, para que quede la trazabilidad del cambio
const gestoriaId = cambios.find(c => c.gestoriaId)?.gestoriaId ?? ''
const vehId = cambios.find(c => c.col === 'vehiculos')?.id ?? ''
batch.set(db.collection('audit_log').doc(), {
  gestoriaId,
  accion:        'editar',
  entidad:       'vehiculo',
  entidadId:     vehId,
  entidadLabel:  `${DE_N} → ${A_N}`,
  usuarioId:     'script',
  usuarioNombre: 'Corrección por script',
  usuarioRol:    'propietario',
  antes:   { patente: DE_N },
  despues: { patente: A_N, documentosActualizados: cambios.length },
  nota:    MOTIVO.trim(),
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
})

await batch.commit()

console.log(`✅ ${cambios.length} documentos actualizados.`)
console.log('   El cambio quedó registrado en audit_log con el motivo.\n')
console.log('⚠️  Si ya se emitió algún comprobante en papel o PDF con la patente')
console.log('   vieja, ese archivo no cambia. Los recibos afectados figuran arriba.\n')
process.exit(0)
