import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase'
import { userDoc } from '@/lib/firestore/collections'
import { useAuthStore } from '@/store/authStore'

// ⚡ Throttle de ultimoAcceso — máximo 1 escritura por hora por sesión.
// Sin esto, onSnapshot dispara updateDoc en cada carga de página → miles de escrituras/día.
const ULTIMO_ACCESO_INTERVAL_MS = 60 * 60 * 1000 // 1 hora
const ultimoAccesoCache = new Map<string, number>()

function actualizarUltimoAccesoSiCorresponde(uid: string) {
  const ahora       = Date.now()
  const ultima      = ultimoAccesoCache.get(uid) ?? 0
  if (ahora - ultima < ULTIMO_ACCESO_INTERVAL_MS) return
  ultimoAccesoCache.set(uid, ahora)
  updateDoc(userDoc(uid), { ultimoAcceso: serverTimestamp() }).catch(() => {})
}

export function useAuthListener() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      const ref = userDoc(firebaseUser.uid)
      const unsubscribeDoc = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            setUser({ ...snap.data(), uid: snap.id })
            actualizarUltimoAccesoSiCorresponde(firebaseUser.uid)
          } else {
            setUser(null)
          }
          setLoading(false)
        },
        () => {
          setUser(null)
          setLoading(false)
        }
      )

      return () => unsubscribeDoc()
    })

    return () => unsubscribeAuth()
  }, [setUser, setLoading])
}

export function useAuth() {
  return useAuthStore()
}