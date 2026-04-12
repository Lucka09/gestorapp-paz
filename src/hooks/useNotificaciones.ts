import { useState, useEffect } from 'react'
import { subscribeNotificaciones, subscribeNoLeidas } from '@/lib/firestore/notificaciones'
import type { Notificacion } from '@/types'

export function useNotificaciones(uid: string | undefined) {
  const [notifs, setNotifs]   = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) { setLoading(false); return }
    const unsub = subscribeNotificaciones(uid, data => {
      setNotifs(data)
      setLoading(false)
    })
    return () => unsub()
  }, [uid])

  const noLeidas = notifs.filter(n => !n.leida).length
  return { notifs, noLeidas, loading }
}

export function useNoLeidas(uid: string | undefined) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!uid) return
    const unsub = subscribeNoLeidas(uid, setCount)
    return () => unsub()
  }, [uid])
  return count
}
