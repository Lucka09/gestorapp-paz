// diagnostico_premios.mjs — SOLO LECTURA, no escribe nada.
// Uso:  node diagnostico_premios.mjs            → mes actual
//       node diagnostico_premios.mjs 2026-08    → mes puntual (YYYY-MM)
//
// Requiere serviceAccount.json en la misma carpeta (el mismo que usás en tus
// otros scripts de migración). Cuenta trámites de gestoria-paz en el mes por
// creadoPor (lo que HOY paga premios) y por asignadoA (responsable real),
// y marca los desvíos.

import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const GESTORIA_ID = 'gestoria-paz'
const TIPOS_CALIFICANTES = ['baja', 'transferencia', 'inscripcion_inicial']

const sa = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

// ── Ventana del mes (idéntica a periodoDesde: mes calendario) ────────────────
const arg = process.argv[2]
const now = new Date()
let anio = now.getFullYear()
let mes  = now.getMonth()            // 0-indexed
if (arg) {
  const [y, m] = arg.split('-').map(Number)
  anio = y; mes = m - 1
}
const inicio = new Date(anio, mes, 1, 0, 0, 0, 0)
const fin    = new Date(anio, mes + 1, 0, 23, 59, 59, 999)
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const esMoto = t => {
  const tv = (t.tipoVehiculo ?? t.vehiculoTipo ?? '').toLowerCase()
  return tv.includes('moto') || tv.includes('ciclomotor') || tv.includes('bike')
}

async function main() {
  // 1. Usuarios: uid → {nombre, rol, activo}
  const usersSnap = await db.collection('users').where('gestoriaId', '==', GESTORIA_ID).get()
  const users = new Map()
  for (const d of usersSnap.docs) {
    const u = d.data()
    users.set(d.id, {
      nombre: `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email || d.id,
      rol:    u.rol ?? '?',
      activo: u.activo === true,
    })
  }
  const nombreDe = uid => (uid && users.get(uid)?.nombre) || (uid ? `⚠ desconocido (${uid.slice(0,6)}…)` : '— sin asignar —')
  const esAsesor = uid => users.get(uid)?.rol === 'asesor_comercial'

  // 2. Trámites del mes
  const tramSnap = await db.collection('tramites')
    .where('gestoriaId', '==', GESTORIA_ID)
    .where('creadoEn', '>=', Timestamp.fromDate(inicio))
    .where('creadoEn', '<=', Timestamp.fromDate(fin))
    .get()

  const tramites = tramSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // 3. Acumuladores por persona
  const stat = () => ({ creados: 0, asignados: 0, califCreados: 0, califAsignados: 0, multasCreadas: 0, multasAsignadas: 0 })
  const porPersona = new Map()
  const get = uid => { if (!porPersona.has(uid)) porPersona.set(uid, stat()); return porPersona.get(uid) }

  const desvios = []

  for (const t of tramites) {
    const cp = t.creadoPor ?? null
    const aa = t.asignadoA ?? null
    const esCalif = TIPOS_CALIFICANTES.includes(t.tipo) && t.pagado === true
    const esMulta = t.tipo === 'descargo_multa' && t.estado !== 'cancelado'

    if (cp) { const s = get(cp); s.creados++; if (esCalif) s.califCreados++; if (esMulta) s.multasCreadas++ }
    if (aa) { const s = get(aa); s.asignados++; if (esCalif) s.califAsignados++; if (esMulta) s.multasAsignadas++ }

    // Desvío: asignado a un asesor pero creado por otra persona
    if (aa && esAsesor(aa) && cp && cp !== aa) {
      desvios.push({ id: t.id, asignadoA: aa, creadoPor: cp, tipo: t.tipo, pagado: !!t.pagado })
    }
  }

  // ── Salida ─────────────────────────────────────────────────────────────────
  console.log(`\n=== Diagnóstico de atribución de premios — ${MESES[mes]} ${anio} ===`)
  console.log(`Ventana: ${inicio.toISOString().slice(0,10)} .. ${fin.toISOString().slice(0,10)}`)
  console.log(`Trámites del mes: ${tramites.length}\n`)

  const asesores = [...users.entries()].filter(([, u]) => u.rol === 'asesor_comercial')
  console.log('── Asesores comerciales (rol asesor_comercial) ──')
  for (const [uid, u] of asesores) {
    const s = porPersona.get(uid) ?? stat()
    console.log(
      `  ${u.activo ? '●' : '○'} ${u.nombre.padEnd(20)} ` +
      `creados: ${String(s.creados).padStart(3)} (calif ${s.califCreados}, multas ${s.multasCreadas})   ` +
      `asignados: ${String(s.asignados).padStart(3)} (calif ${s.califAsignados}, multas ${s.multasAsignadas})`
    )
  }

  console.log('\n── Todos los creadoPor del mes (incluye no-asesores) ──')
  const orden = [...porPersona.entries()].sort((a, b) => b[1].creados - a[1].creados)
  for (const [uid, s] of orden) {
    if (s.creados === 0) continue
    console.log(`  ${nombreDe(uid).padEnd(24)} rol=${(users.get(uid)?.rol ?? '?').padEnd(16)} creados: ${s.creados}`)
  }

  console.log(`\n── Desvíos (asignado a un asesor, pero creado por otra persona): ${desvios.length} ──`)
  if (desvios.length === 0) {
    console.log('  (ninguno — la atribución por creadoPor coincide con asignadoA)')
  } else {
    for (const d of desvios) {
      console.log(`  ${d.id.slice(-8)}  asignadoA=${nombreDe(d.asignadoA).padEnd(18)} creadoPor=${nombreDe(d.creadoPor).padEnd(18)} tipo=${d.tipo}${d.pagado ? ' (pagado)' : ''}`)
    }
    console.log('\n  → Estos trámites HOY no le suman premio al asesor asignado,')
    console.log('    porque Premios cuenta por creadoPor. Ahí está la fuga.')
  }
  console.log('')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
