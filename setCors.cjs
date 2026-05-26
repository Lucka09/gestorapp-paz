const { Storage } = require('@google-cloud/storage')
const path = require('path')

const storage = new Storage({
  keyFilename: path.join(__dirname, 'serviceAccount.json'),
})

const corsConfig = [
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://gestorapp-paz.web.app',
      'https://gestorapp-paz.firebaseapp.com',
    ],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Content-Disposition',
      'Content-Length',
      'Authorization',
      'X-Requested-With',
    ],
    maxAgeSeconds: 3600,
  },
]

// Firebase Storage tiene dos nombres posibles de bucket
const BUCKETS = [
  'gestorapp-paz.firebasestorage.app',
  'gestorapp-paz.appspot.com',
]

async function setCors() {
  for (const bucket of BUCKETS) {
    try {
      console.log(`Probando bucket: ${bucket}`)
      await storage.bucket(bucket).setCorsConfiguration(corsConfig)
      console.log(`✅ CORS configurado en ${bucket}`)
      const [meta] = await storage.bucket(bucket).getMetadata()
      console.log('CORS activo:', JSON.stringify(meta.cors, null, 2))
      return // éxito, salir
    } catch (err) {
      console.log(`   ❌ ${err.message}`)
    }
  }
  console.log('\n👉 Ningún bucket funcionó. Buscá el nombre exacto en:')
  console.log('   Firebase Console → Storage → copiar el nombre que aparece arriba del listado de archivos')
}

setCors()
