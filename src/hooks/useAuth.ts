import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase'
import { userDoc } from '@/lib/firestore/collections'
import { useAuthStore } from '@/store/authStore'

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
            updateDoc(ref, { ultimoAcceso: serverTimestamp() }).catch(() => {})
          } else {
            // Usuario en Auth pero sin perfil en Firestore
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
