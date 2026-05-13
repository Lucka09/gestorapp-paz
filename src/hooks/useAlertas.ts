import { useState, useEffect } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeAlertas, type Alerta, type NivelAlerta } from '@/lib/firestore/alertas'

export function useAlertas(soloNoLeidas = false) {
  const gestoriaId = useGestoriaId()
  const [alertas,  setAlertas]  = useState<Alerta[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    // Guard: no suscribir hasta tener gestoriaId — evita permission-denied
    // antes de que Firebase Auth resuelva el usuario autenticado.
    if (!gestoriaId) return
    const unsub = subscribeAlertas(gestoriaId, data => {
      setAlertas(data)
      setLoading(false)
    }, soloNoLeidas)
    return () => unsub()
  }, [gestoriaId, soloNoLeidas])

  const noLeidas  = alertas.filter(a => !a.leida).length
  const criticas  = alertas.filter(a => a.nivel === 'critica').length
  const urgentes  = alertas.filter(a => a.nivel === 'urgente').length

  const nivelMax: NivelAlerta | null =
    criticas  > 0 ? 'critica'  :
    urgentes  > 0 ? 'urgente'  :
    alertas.filter(a => a.nivel === 'advertencia').length > 0 ? 'advertencia' :
    alertas.length > 0 ? 'info' : null

  return { alertas, loading, noLeidas, criticas, urgentes, nivelMax }
}