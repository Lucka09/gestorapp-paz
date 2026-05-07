import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth }       from 'firebase/auth'
import { getFirestore, initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
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

// Firestore principal — con long polling para redes inestables
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    })
  } catch {
    return getFirestore(app)
  }
})()

// ⚡ Offline persistence — lecturas repetidas sirven del cache IndexedDB local.
// Reduce lecturas al servidor cuando el usuario navega entre páginas ya visitadas.
// Se ignora silenciosamente si ya está habilitada (HMR) o si el browser no lo soporta.
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Múltiples tabs abiertas — persistence solo funciona en una a la vez. Ignorar.
  } else if (err.code === 'unimplemented') {
    // Browser no soporta IndexedDB. Ignorar.
  }
})

// Firestore secundario — usa la sesión del secondaryAuth (nuevo usuario recién creado).
// Se usa exclusivamente en crearMiembro para que el doc se escriba con el UID del nuevo usuario.
export const secondaryDb = (() => {
  try {
    return initializeFirestore(secondaryApp, {
      experimentalAutoDetectLongPolling: true,
    })
  } catch {
    return getFirestore(secondaryApp)
  }
})()

export const storage = getStorage(app)
export default app