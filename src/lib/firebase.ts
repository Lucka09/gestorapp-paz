import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth }       from 'firebase/auth'
import { getFunctions }  from 'firebase/functions'
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore'
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

// Firestore principal — persistence offline + multi-tab + long polling
// API moderna (Firebase 10+) — reemplaza enableIndexedDbPersistence deprecada
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
    })
  } catch {
    return getFirestore(app)
  }
})()

// Firestore secundario — usa la sesión del secondaryAuth (nuevo usuario recién creado).
// Se usa exclusivamente en crearMiembro para que el doc se escriba con el UID del nuevo usuario.
export const secondaryDb = (() => {
  try {
    return initializeFirestore(secondaryApp, {
      experimentalForceLongPolling: true,
    })
  } catch {
    return getFirestore(secondaryApp)
  }
})()

export const storage = getStorage(app)
export default app