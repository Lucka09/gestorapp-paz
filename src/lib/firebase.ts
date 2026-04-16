import { initializeApp } from 'firebase/app'
import { getAuth }       from 'firebase/auth'
import { getFirestore }  from 'firebase/firestore'
import { getStorage }    from 'firebase/storage'
import { ENV }           from './env'

// ENV valida las variables al importar — si falta alguna, la app falla
// con un mensaje claro antes de llegar aquí.

const firebaseConfig = {
  apiKey:            ENV.VITE_FIREBASE_API_KEY,
  authDomain:        ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.VITE_FIREBASE_APP_ID,
}

export const app     = initializeApp(firebaseConfig)
export const auth    = getAuth(app)
export const db      = getFirestore(app)
export const storage = getStorage(app)

export default app