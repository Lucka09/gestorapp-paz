import { useState, useEffect } from 'react'
import {
  subscribeSeguimientos,
  subscribeProximoContacto,
  type Seguimiento,
  type ProximoContacto,
} from '@/lib/firestore/seguimientos'

export function useSeguimientos(clienteId: string | undefined) {
  const [items, setItems]     = useState<Seguimiento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeSeguimientos(clienteId, data => {
      setItems(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId])

  return { seguimientos: items, loading }
}

export function useProximoContacto(clienteId: string | undefined) {
  const [pc, setPc]           = useState<ProximoContacto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeProximoContacto(clienteId, data => {
      setPc(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId])

  return { proximoContacto: pc, loading }
}
