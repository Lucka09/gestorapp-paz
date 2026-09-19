// scripts/cruzar-numeros-repesca.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Arma el listado de repesca cruzando una lista manual de teléfonos contra todo
// el CRM. Con --incluir-todos suma además las conversaciones y leads que no
// estaban en la lista, para tener un único listado sin superposición.
//
// QUÉ CRUZA
//   clientes               → ¿ya está en la base?
//   tramites               → ¿se le hizo alguna gestión?
//   recibos                → ¿pagó alguna vez?
//   leads / prospectos     → ¿quedó cargado y sin cerrar?
//   conversacionesWA       → ¿cuándo escribió? ¿le contestaron?
//   consultasInfracciones  → ¿por qué patente consultó?
//
// Aunque falte el historial de WhatsApp, `conversacionesWA` viene guardando los
// mensajes ENTRANTES desde hace meses: alcanza para saber cuándo escribió cada
// uno. Lo que no se ve son las respuestas que salieron del celular, así que un
// "sin responder" puede haber sido atendido igual. Conviene que los secretarios
// revisen esa columna antes de salir a escribir.
//
// PREPARAR
//   Pegá los números en ./numeros.txt, uno por línea. Cualquier formato sirve:
//   1138132438 · 11 6285-4581 · 2236 70-3427 · +54 9 11 3861-6333
//   Las líneas de texto y los encabezados se ignoran solos.
//
// USO
//   node scripts/cruzar-numeros-repesca.mjs
//   node scripts/cruzar-numeros-repesca.mjs --incluir-todos
//   node scripts/cruzar-numeros-repesca.mjs --incluir-todos --dias-max=120
//   node scripts/cruzar-numeros-repesca.mjs --archivo=./otros.txt --gestoria=<id>
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args    = process.argv.slice(2)
const ARCHIVO = args.find(a => a.startsWith('--archivo='))?.split('=')[1] ?? './numeros.txt'
const GEST    = args.find(a => a.startsWith('--gestoria='))?.split('=')[1] ?? null
const TODOS   = args.includes('--incluir-todos')
const DIAS_MAX = Number(args.find(a => a.startsWith('--dias-max='))?.split('=')[1] ?? 180)

const sa = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const DIA = 86_400_000
const ms  = t => t?.toMillis?.() ?? (typeof t === 'number' ? t : 0)
const aFecha = m => m ? new Date(m).toISOString().slice(0, 10) : ''

/**
 * Clave de comparación: los últimos 10 dígitos.
 * En la base los números viven como 5491161859697, 1161859697, 011... o
 * +54 9 11... Los últimos 10 dígitos son lo único estable entre todos.
 */
const clave = s => {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : (d || null)
}

// ─── 1 · LISTA MANUAL ────────────────────────────────────────────────────────

const vistos = new Map()   // clave → { original, veces, deLista }
let descartadas = 0, crudas = []

if (existsSync(ARCHIVO)) {
  crudas = readFileSync(ARCHIVO, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => l.replace(/\D/g, '').length >= 8)

  for (const l of crudas) {
    const k = clave(l)
    if (!k) { descartadas++; continue }
    if (vistos.has(k)) vistos.get(k).veces++
    else vistos.set(k, { original: l, veces: 1, deLista: true })
  }
} else if (!TODOS) {
  console.error(`No existe ${ARCHIVO}. Creá el archivo o corré con --incluir-todos.`)
  process.exit(1)
}

const repetidos = [...vistos.entries()].filter(([, v]) => v.veces > 1)

console.log(`\n📋 LISTA MANUAL`)
console.log(`   Líneas leídas       ${crudas.length}`)
console.log(`   Números únicos      ${vistos.size}`)
console.log(`   Repetidos           ${repetidos.length}`)
if (descartadas) console.log(`   Descartados         ${descartadas} (formato ilegible)`)
if (repetidos.length) {
  console.log(`\n   Aparecían más de una vez:`)
  repetidos.slice(0, 15).forEach(([k, v]) => console.log(`     ${k}  ×${v.veces}`))
  if (repetidos.length > 15) console.log(`     ... y ${repetidos.length - 15} más`)
}
console.log()

// ─── 2 · CARGAR EL CRM ───────────────────────────────────────────────────────

const col = n => GEST
  ? db.collection(n).where('gestoriaId', '==', GEST)
  : db.collection(n)

console.log('Cargando CRM...')

const [cliS, traS, recS, leaS, proS, conS, infS] = await Promise.all([
  col('clientes').get(),
  col('tramites').get(),
  col('recibos').get(),
  col('leads').get(),
  col('prospectos').get(),
  col('conversacionesWA').get(),
  col('consultasInfracciones').get(),
])

console.log(`  clientes ${cliS.size} · tramites ${traS.size} · recibos ${recS.size}`)
console.log(`  leads ${leaS.size} · prospectos ${proS.size} · conversaciones ${conS.size}`)
console.log(`  consultas ${infS.size}\n`)

const porTel = {
  cliente: new Map(), lead: new Map(), prospecto: new Map(),
  conv: new Map(), consulta: new Map(),
}
const idx = (mapa, tel, dato) => {
  const k = clave(tel); if (!k) return
  if (!mapa.has(k)) mapa.set(k, [])
  mapa.get(k).push(dato)
}

cliS.forEach(d => idx(porTel.cliente,   d.data().telefono, { id: d.id, ...d.data() }))
leaS.forEach(d => idx(porTel.lead,      d.data().telefono, { id: d.id, ...d.data() }))
proS.forEach(d => idx(porTel.prospecto, d.data().telefono, { id: d.id, ...d.data() }))
conS.forEach(d => idx(porTel.conv,      d.data().telefono ?? d.id, { id: d.id, ...d.data() }))
infS.forEach(d => idx(porTel.consulta,  d.data().contacto?.whatsapp, { id: d.id, ...d.data() }))

const traPorCli = new Map(), recPorCli = new Map()
traS.forEach(d => {
  const t = d.data(); if (!t.clienteId) return
  if (!traPorCli.has(t.clienteId)) traPorCli.set(t.clienteId, [])
  traPorCli.get(t.clienteId).push({ id: d.id, ...t })
})
recS.forEach(d => {
  const r = d.data(); if (!r.clienteId) return
  if (!recPorCli.has(r.clienteId)) recPorCli.set(r.clienteId, [])
  recPorCli.get(r.clienteId).push({ id: d.id, ...r })
})

// ─── 3 · SUMAR EL RESTO DEL CRM ──────────────────────────────────────────────
// Todo número que haya escrito o esté cargado como lead y NO esté en la lista
// manual. Se descartan los muy viejos: a los 6 meses el cliente ya no se
// acuerda de que consultó.

let sumadosCRM = 0
if (TODOS) {
  const ahora = Date.now()
  const limite = ahora - DIAS_MAX * DIA

  const sumar = (tel, origen, fuente) => {
    const k = clave(tel)
    if (!k || vistos.has(k)) return
    vistos.set(k, { original: origen, veces: 1, deLista: false, fuente })
    sumadosCRM++
  }

  conS.forEach(d => {
    const c = d.data()
    if (ms(c.ultimaActividad) < limite) return
    sumar(c.telefono ?? d.id, c.telefono ?? d.id, 'conversacion')
  })

  leaS.forEach(d => {
    const l = d.data()
    const t = ms(l.actualizadoEn) || ms(l.creadoEn)
    if (t < limite) return
    sumar(l.telefono, l.telefono, 'lead')
  })

  infS.forEach(d => {
    const c = d.data()
    if (ms(c.creadaEn) < limite) return
    sumar(c.contacto?.whatsapp, c.contacto?.whatsapp, 'consulta')
  })

  console.log(`➕ Sumados del CRM (últimos ${DIAS_MAX} días): ${sumadosCRM}`)
  console.log(`   Total a analizar: ${vistos.size}\n`)
}

// ─── 4 · CLASIFICAR ──────────────────────────────────────────────────────────

const ahora = Date.now()
const ESTADOS_CERRADOS = ['convertido', 'perdido', 'descartado']

const filas = []
const stats = {
  clienteConTramite: 0, clienteSinTramite: 0, leadAbierto: 0,
  leadCerrado: 0, soloConversacion: 0, soloConsulta: 0, sinRastro: 0,
}

for (const [k, info] of vistos) {
  const cli  = porTel.cliente.get(k)?.[0]
  const lead = porTel.lead.get(k)?.[0]
  const pro  = porTel.prospecto.get(k)?.[0]
  const conv = porTel.conv.get(k)?.[0]
  const cons = porTel.consulta.get(k) ?? []

  const tramites = cli ? (traPorCli.get(cli.id) ?? []) : []
  const recibos  = cli ? (recPorCli.get(cli.id) ?? []) : []
  const pagado   = recibos.reduce((a, r) => a + Number(r.monto ?? 0), 0)

  const ultimo = Math.max(
    ms(conv?.ultimaActividad),
    ms(lead?.actualizadoEn) || ms(lead?.creadoEn),
    ms(pro?.actualizadoEn), ms(cli?.creadoEn),
    ...cons.map(c => ms(c.creadaEn)),
  )
  const dias = ultimo ? Math.floor((ahora - ultimo) / DIA) : null

  const sinResponder = conv
    ? (conv.ultimoMensajeDireccion
        ? conv.ultimoMensajeDireccion === 'entrante'
        : (conv.noLeidos ?? 0) > 0)
    : false

  const patentes = [...new Set(cons.map(c => c.dominio).filter(Boolean))].join(' ')

  let caso, accion, prioridad

  if (cli && tramites.length > 0) {
    caso = 'CLIENTE-CON-TRAMITE'
    accion = pagado > 0 ? 'No repescar — ya operó' : 'Revisar: trámite sin cobro'
    prioridad = pagado > 0 ? 0 : 40
    stats.clienteConTramite++
  } else if (cli) {
    caso = 'CLIENTE-SIN-TRAMITE'
    accion = 'Repescar — cargado pero nunca operó'
    prioridad = 70
    stats.clienteSinTramite++
  } else if (lead && !ESTADOS_CERRADOS.includes(lead.estado)) {
    caso = 'LEAD-ABIERTO'
    accion = `Repescar — lead en ${lead.estado}`
    prioridad = 80
    stats.leadAbierto++
  } else if (pro && !['ganado', 'cerrado', 'perdido'].includes(pro.etapa)) {
    caso = 'PROSPECTO-ABIERTO'
    accion = `Repescar — prospecto en ${pro.etapa}`
    prioridad = 85
    stats.leadAbierto++
  } else if (lead || pro) {
    caso = 'LEAD-CERRADO'
    accion = `No repescar — ${lead?.estado ?? pro?.etapa}`
    prioridad = 10
    stats.leadCerrado++
  } else if (cons.length > 0) {
    caso = 'CONSULTO-PATENTE'
    accion = `Repescar — consultó ${patentes} y no se cargó`
    prioridad = 95
    stats.soloConsulta++
  } else if (conv) {
    caso = 'SOLO-CHATEO'
    accion = sinResponder
      ? 'Repescar URGENTE — escribió y nadie contestó'
      : 'Repescar — hubo chat sin resultado'
    prioridad = sinResponder ? 100 : 75
    stats.soloConversacion++
  } else {
    caso = 'SIN-RASTRO'
    accion = 'Número nuevo — nunca entró al sistema'
    prioridad = 60
    stats.sinRastro++
  }

  // La urgencia cae con el tiempo: uno de hace 3 días se acuerda, uno de hace
  // 90 ya no. Los que no dejaron rastro no decaen.
  const score = dias != null
    ? Math.round(prioridad * (1 / (1 + dias / 45)))
    : prioridad

  const nombre = cli
    ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim()
    : lead ? `${lead.nombre ?? ''} ${lead.apellido ?? ''}`.trim()
    : conv?.nombre ?? ''

  filas.push({
    telefono: k,
    origen: info.deLista ? 'lista' : (info.fuente ?? 'crm'),
    veces: info.veces,
    nombre,
    caso,
    accion,
    ultimoContacto: aFecha(ultimo),
    dias: dias ?? '',
    sinResponder: sinResponder ? 'SI' : '',
    patentes,
    tramites: tramites.length,
    pagado,
    asignadoA: conv?.asignadoNombre ?? lead?.asignadoNombre ?? '',
    ultimoMensaje: (conv?.ultimoMensaje ?? '').slice(0, 60).replace(/[",\n]/g, ' '),
    score,
  })
}

filas.sort((a, b) => b.score - a.score)

// ─── 5 · SALIDA ──────────────────────────────────────────────────────────────

const cab = [
  'telefono','origen','veces','nombre','caso','accion','ultimoContacto',
  'dias','sinResponder','patentes','tramites','pagado','asignadoA',
  'ultimoMensaje','score',
]
const csv = [cab.join(',')]
filas.forEach(f => csv.push(cab.map(c => {
  const v = f[c] ?? ''
  return typeof v === 'string' && /[,"]/.test(v) ? `"${v.replace(/"/g, "'")}"` : v
}).join(',')))

writeFileSync('./repesca-cruzada.csv', csv.join('\n'), 'utf8')

const deLista = filas.filter(f => f.origen === 'lista').length
const delCRM  = filas.length - deLista

console.log('─'.repeat(62))
console.log(`Ya es cliente CON trámite      ${stats.clienteConTramite}`)
console.log(`Ya es cliente SIN trámite      ${stats.clienteSinTramite}   ← repescar`)
console.log(`Lead / prospecto abierto       ${stats.leadAbierto}   ← repescar`)
console.log(`Lead cerrado                   ${stats.leadCerrado}`)
console.log(`Solo consultó patente          ${stats.soloConsulta}   ← repescar`)
console.log(`Solo chateó                    ${stats.soloConversacion}   ← repescar`)
console.log(`Sin rastro en el sistema       ${stats.sinRastro}   ← repescar`)
console.log('─'.repeat(62))
console.log(`De tu lista manual             ${deLista}`)
console.log(`Sumados del CRM                ${delCRM}`)
console.log(`TOTAL ANALIZADO                ${filas.length}`)

const aRepescar = filas.filter(f => f.score >= 40).length
console.log(`A REPESCAR                     ${aRepescar}`)
console.log('─'.repeat(62))

const sinResp = filas.filter(f => f.sinResponder === 'SI').length
if (sinResp) {
  console.log(`\n⚠️  ${sinResp} figuran como "escribió y nadie contestó".`)
  console.log('   Ojo: las respuestas que salieron del celular no están en el')
  console.log('   sistema, así que algunos pueden haber sido atendidos igual.')
  console.log('   Que los secretarios revisen esa columna antes de escribir.')
}

console.log('\n📄 ./repesca-cruzada.csv — ordenado por prioridad\n')
console.log('LOS 20 MÁS URGENTES')
filas.slice(0, 20).forEach(f => {
  console.log(`  ${String(f.score).padStart(3)}  ${f.telefono}  ` +
              `${(f.nombre || '—').padEnd(22).slice(0, 22)}  ` +
              `${f.caso.padEnd(20)}  ${f.dias !== '' ? f.dias + 'd' : ''}`)
})
console.log()

process.exit(0)
