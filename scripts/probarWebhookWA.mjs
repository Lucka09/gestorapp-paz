// scripts/probarWebhookWA.mjs
// Simula un mensaje entrante de Meta contra tu whatsappWebhook YA DESPLEGADO,
// para verificar toda la cadena (ruteo → lead → asignación → evento) sin tocar
// nada de producción de Meta ni depender del cutover.
//
// Uso:
//   1) Pegá la Trigger URL de la función en WEBHOOK_URL.
//   2) Elegí qué número simular en NUMERO_SIMULADO (uno de los del ruteo).
//   3) node scripts/probarWebhookWA.mjs
//
// Node 18+ trae fetch global. Cada corrida usa un waMessageId único, así que
// podés correrlo varias veces sin chocar con la deduplicación.

const WEBHOOK_URL = 'https://whatsappwebhook-jgbhipicma-uc.a.run.app'

// Número de la gestoría que "recibe" (para probar a quién se asigna).
// Poné el display_phone_number de la línea que quieras testear:
const NUMERO_SIMULADO = '5491149470249'   // ← Alexia, por ejemplo

// Teléfono del "cliente" que escribe. Si ponés tu propio celular, vas a
// recibir el mensaje de bienvenida real (si el token de Meta ya está activo).
const CLIENTE_FROM = '5491133334444'
const CLIENTE_NOMBRE = 'Cliente Prueba'
const TEXTO = 'hola, tengo una multa de la patente ABC456'

// phone_number_id simulado. En producción lo manda Meta; acá inventamos uno
// estable para que el autocompletado lo grabe en la config.
const PHONE_NUMBER_ID = `TEST_PNID_${NUMERO_SIMULADO}`

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_TEST',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: NUMERO_SIMULADO,
          phone_number_id: PHONE_NUMBER_ID,
        },
        contacts: [{ profile: { name: CLIENTE_NOMBRE }, wa_id: CLIENTE_FROM }],
        messages: [{
          id: `wamid.TEST.${Date.now()}`,   // único por corrida
          from: CLIENTE_FROM,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          text: { body: TEXTO },
          // Descomentá para simular un lead que llega desde un anuncio CTWA:
          // referral: {
          //   source_type: 'ad', source_id: 'AD_123',
          //   headline: 'Gestioná tus multas', body: 'Consultá gratis',
          //   ctwa_clid: 'CLID_TEST',
          // },
        }],
      },
    }],
  }],
}

async function main() {
  if (WEBHOOK_URL.includes('REEMPLAZAR')) {
    console.error('❌ Falta pegar la Trigger URL real en WEBHOOK_URL.')
    process.exit(1)
  }
  console.log(`→ POST a ${WEBHOOK_URL}`)
  console.log(`  Simulando entrada por ${NUMERO_SIMULADO} (pnid ${PHONE_NUMBER_ID})`)
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log(`← ${res.status} ${res.statusText}`)
  const txt = await res.text().catch(() => '')
  if (txt) console.log(`  Respuesta: ${txt.slice(0, 200)}`)
  console.log('\nAhora revisá en Firestore: leads / conversacionesWA / eventos / configuracion/gestor')
  console.log('y los logs con: firebase functions:log --only whatsappWebhook\n')
}

main().catch(e => { console.error(e); process.exit(1) })
