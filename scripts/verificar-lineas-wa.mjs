// scripts/verificar-lineas-wa.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Revisa TODAS las líneas de WhatsApp configuradas y dice cuáles están en
// Coexistence. Solo las que dan is_on_biz_app: true pueden mandar ecos.
//
// Si los secretarios escriben desde una línea que NO está en Coexistence, sus
// mensajes no van a aparecer nunca en GestorApp, por más que los campos estén
// suscritos.
//
// USO
//   node scripts/verificar-lineas-wa.mjs --token=EAAxxxx
//
// El token sale de Meta App Dashboard → WhatsApp → Configuración de la API,
// o del mismo que usás en las Cloud Functions.
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'

const TOKEN = process.argv.slice(2)
  .find(a => a.startsWith('--token='))?.split('=')[1]

if (!TOKEN) {
  console.error('Falta --token=<ACCESS_TOKEN>')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// ─── LÍNEAS CONFIGURADAS ─────────────────────────────────────────────────────

const cfg = (await db.doc('configuracion/gestor').get()).data() ?? {}
const lineas = cfg.ruteoWhatsApp?.lineas ?? []

console.log(`\nLíneas configuradas en ruteoWhatsApp: ${lineas.length}\n`)

if (lineas.length === 0) {
  console.log('No hay ninguna. Los mensajes entrantes caen al pool sin dueño.\n')
  process.exit(0)
}

// ─── CONSULTAR CADA UNA ──────────────────────────────────────────────────────

const V = 'v23.0'
let conCoexistencia = 0

for (const l of lineas) {
  const pnid = l.phoneNumberId
  const etiqueta = `${l.nombre ?? '(sin nombre)'} · ${l.displayPhone ?? '?'}`

  if (!pnid) {
    console.log(`  ⚠️  ${etiqueta}`)
    console.log(`      sin phoneNumberId — se autocompleta cuando entre un mensaje\n`)
    continue
  }

  try {
    const url = `https://graph.facebook.com/${V}/${pnid}` +
                `?fields=is_on_biz_app,display_phone_number,verified_name,quality_rating` +
                `&access_token=${TOKEN}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.error) {
      console.log(`  ✗  ${etiqueta}`)
      console.log(`      ${data.error.message}\n`)
      continue
    }

    const coex = data.is_on_biz_app === true
    if (coex) conCoexistencia++

    console.log(`  ${coex ? '✅' : '❌'}  ${etiqueta}`)
    console.log(`      phone_number_id: ${pnid}`)
    console.log(`      número Meta:     ${data.display_phone_number ?? '?'}`)
    console.log(`      nombre:          ${data.verified_name ?? '?'}`)
    console.log(`      calidad:         ${data.quality_rating ?? '?'}`)
    console.log(`      Coexistence:     ${coex ? 'SÍ — manda ecos' : 'NO — no hay ecos posibles'}`)

    // El display_phone_number de Meta tiene que coincidir con el configurado
    const dpMeta = String(data.display_phone_number ?? '').replace(/\D/g, '')
    const dpCfg  = String(l.displayPhone ?? '').replace(/\D/g, '')
    if (dpMeta && dpCfg && !dpMeta.endsWith(dpCfg.slice(-8))) {
      console.log(`      ⚠️  el displayPhone configurado (${l.displayPhone}) no coincide`)
    }
    console.log()
  } catch (e) {
    console.log(`  ✗  ${etiqueta} — ${e.message}\n`)
  }
}

// ─── RESUMEN ─────────────────────────────────────────────────────────────────

console.log('─'.repeat(58))
console.log(`Líneas en Coexistence: ${conCoexistencia} de ${lineas.length}`)
console.log('─'.repeat(58))

if (conCoexistencia === 0) {
  console.log('\nNinguna línea puede mandar ecos. Los mensajes que escriben los')
  console.log('secretarios desde el celular no van a aparecer en GestorApp hasta')
  console.log('que se haga el onboarding en modo Coexistence.\n')
} else if (conCoexistencia < lineas.length) {
  console.log('\nSolo algunas líneas mandan ecos. Averiguá desde cuál escriben los')
  console.log('secretarios: si es una de las marcadas con ❌, ahí está el problema.\n')
} else {
  console.log('\nTodas las líneas están en Coexistence. Si igual no llegan ecos,')
  console.log('el problema es de despliegue o de parsing:')
  console.log('  firebase deploy --only functions:whatsappWebhook')
  console.log('  firebase functions:log --only whatsappWebhook\n')
}

process.exit(0)
