import { useState, useEffect } from 'react'
import { subscribeAlertas, type Alerta, type NivelAlerta } from '@/lib/firestore/alertas'

export function useAlertas(soloNoLeidas = false) {
  const [alertas,  setAlertas]  = useState<Alerta[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const unsub = subscribeAlertas(data => {
      setAlertas(data)
      setLoading(false)
    }, soloNoLeidas)
    return () => unsub()
  }, [soloNoLeidas])

  const noLeidas  = alertas.filter(a => !a.leida).length
  const criticas  = alertas.filter(a => a.nivel === 'critica').length
  const urgentes  = alertas.filter(a => a.nivel === 'urgente').length

  // Nivel más alto para el badge
  const nivelMax: NivelAlerta | null =
    criticas  > 0 ? 'critica'  :
    urgentes  > 0 ? 'urgente'  :
    alertas.filter(a => a.nivel === 'advertencia').length > 0 ? 'advertencia' :
    alertas.length > 0 ? 'info' : null

  return { alertas, loading, noLeidas, criticas, urgentes, nivelMax }
}
