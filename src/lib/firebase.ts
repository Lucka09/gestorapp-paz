import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth }       from 'firebase/auth'
import { getFirestore, initializeFirestore }  from 'firebase/firestore'
import { getStorage }    from 'firebase/storage'
import { ENV }           from './env'

const firebaseConfig = {
  apiKey:            ENV.VITE_FIREBASE_API_KEY,
  authDomain:        ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.VITE_FIREBASE_APP_ID,
}

// Evita reinicializar en cada HMR de Vite
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

const secondaryAppName = 'gestorapp-secondary-auth'
const secondaryApp = getApps().find(a => a.name === secondaryAppName)
  ?? initializeApp(firebaseConfig, secondaryAppName)

export const auth          = getAuth(app)
export const secondaryAuth = getAuth(secondaryApp)

// Firestore secundario — usa la sesión del secondaryAuth (nuevo usuario recién creado)
// Se usa exclusivamente en crearMiembro para que el doc se escriba con el UID del nuevo usuario
export const secondaryDb = (() => {
  try {
    return initializeFirestore(secondaryApp, {
      experimentalAutoDetectLongPolling: true,
    })
  } catch {
    return getFirestore(secondaryApp)
  }
})()

// En algunos entornos (localhost/redes inestables), QUIC puede cortar los
// canales de Listen/Write. Esto fuerza un transporte más estable.
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    })
  } catch {
    return getFirestore(app)
  }
})()
export const storage = getStorage(app)

export default app