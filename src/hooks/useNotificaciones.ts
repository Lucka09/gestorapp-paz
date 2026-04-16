import { useState, useEffect } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeNotificaciones,
  subscribeNoLeidas,
} from '@/lib/firestore/notificaciones'
import type { Notificacion } from '@/types'

// ─── NOTIFICACIONES DEL USUARIO ACTUAL ───────────────────────────────────────

export function useNotificaciones(uid: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [notifs,  setNotifs]  = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeNotificaciones(uid, gestoriaId, data => {
      setNotifs(data)
      setLoading(false)
    })
    return () => unsub()
  }, [uid, gestoriaId])

  const noLeidas = notifs.filter(n => !n.leida).length
  return { notifs, noLeidas, loading }
}

// ─── CONTADOR DE NO LEÍDAS ────────────────────────────────────────────────────

export function useNoLeidas(uid: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!uid || !gestoriaId) return
    const unsub = subscribeNoLeidas(uid, gestoriaId, setCount)
    return () => unsub()
  }, [uid, gestoriaId])

  return count
}