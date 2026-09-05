// setCorsStorage.mjs
// Aplica la configuración de CORS al bucket de Firebase Storage
// usando el Admin SDK, sin necesidad de instalar gsutil/gcloud.
//
// Uso:
//   1. npm install @google-cloud/storage --save-dev   (si no lo tenés ya)
//   2. node setCorsStorage.mjs
//
// Requiere que serviceAccount.json esté en la raíz del proyecto
// (el mismo que ya usás para el Admin SDK).

import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'fs';

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
  process.exit(1);
});

console.log('▶ Iniciando script...');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync('./serviceAccount.json', 'utf8'));
  console.log('✅ serviceAccount.json leído correctamente. project_id:', serviceAccount.project_id);
} catch (err) {
  console.error('❌ No se pudo leer serviceAccount.json:', err.message);
  process.exit(1);
}

const BUCKET_NAME = 'gestorapp-paz.firebasestorage.app';

const storage = new Storage({
  projectId: serviceAccount.project_id,
  credentials: serviceAccount,
});

const corsConfiguration = [
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://gestorapp-paz.web.app',
      'https://gestorapp-paz.firebaseapp.com',
      'https://gestorapp-tau.vercel.app',
      'https://panel.gestoriapaz.com',
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
];

async function aplicarCors() {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    await bucket.setMetadata({ cors: corsConfiguration });
    console.log(`✅ CORS aplicado correctamente al bucket: ${BUCKET_NAME}`);

    const [metadata] = await bucket.getMetadata();
    console.log('Configuración actual de CORS:');
    console.log(JSON.stringify(metadata.cors, null, 2));
  } catch (err) {
    console.error('❌ Error aplicando CORS:', err.message);
    process.exit(1);
  }
}

aplicarCors();
