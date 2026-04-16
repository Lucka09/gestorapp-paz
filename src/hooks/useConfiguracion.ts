import { useState, useEffect } from 'react'
import { subscribeConfiguracion, CONFIG_DEFAULT } from '@/lib/firestore/configuracion'
import type { Configuracion } from '@/types'

export function useConfiguracion() {
  const [config,  setConfig]  = useState<Configuracion>(CONFIG_DEFAULT as Configuracion)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeConfiguracion(cfg => {
      setConfig(cfg)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { config, loading }
}
