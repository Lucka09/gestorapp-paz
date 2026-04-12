import { useState, useEffect } from 'react'
import {
  subscribeTramitesCliente,
  subscribeTurnosCliente,
  subscribeNotificacionesCliente,
} from '@/lib/firestore/portal'
import type { Tramite, Turno, Notificacion } from '@/types'

export function useTramitesPortal(clienteId: string | undefined) {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(true)
  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeTramitesCliente(clienteId, data => {
      setTramites(data); setLoading(false)
    })
    return () => unsub()
  }, [clienteId])
  return { tramites, loading }
}

export function useTurnosPortal(clienteId: string | undefined) {
  const [turnos, setTurnos]   = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeTurnosCliente(clienteId, data => {
      setTurnos(data); setLoading(false)
    })
    return () => unsub()
  }, [clienteId])
  return { turnos, loading }
}

export function useNotificacionesPortal(uid: string | undefined) {
  const [notifs, setNotifs]   = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!uid) { setLoading(false); return }
    const unsub = subscribeNotificacionesCliente(uid, data => {
      setNotifs(data); setLoading(false)
    })
    return () => unsub()
  }, [uid])
  const noLeidas = notifs.filter(n => !n.leida).length
  return { notifs, noLeidas, loading }
}
