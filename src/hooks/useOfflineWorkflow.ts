// src/hooks/useOfflineWorkflow.ts
// Maneja el modo offline para el workflow del gestor.
// Si no hay internet, guarda los datos en localStorage y los sincroniza
// cuando vuelve la conexión.

import { useState, useEffect, useCallback } from 'react'


const CACHE_KEY = (tramiteId: string) => `workflow_offline_${tramiteId}`

interface PendingUpdate {
  tramiteId: string
  data:      Record<string, unknown>
  timestamp: number
}

export function useOfflineWorkflow(tramiteId: string) {
  const [isOnline,  setIsOnline]  = useState(navigator.onLine)
  const [pendiente, setPendiente] = useState<PendingUpdate | null>(null)
  const [sincronizando, setSinc]  = useState(false)

  // Detectar cambios de conectividad
  useEffect(() => {
    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Recuperar pendientes del localStorage al montar
  useEffect(() => {
    if (!tramiteId) return
    try {
      const raw = localStorage.getItem(CACHE_KEY(tramiteId))
      if (raw) setPendiente(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [tramiteId])

  // Auto-sincronizar cuando vuelve la conexión
  useEffect(() => {
    if (!isOnline || !pendiente || sincronizando) return
    sincronizar()
  }, [isOnline, pendiente]) // eslint-disable-line

  const guardarOffline = useCallback((data: Record<string, unknown>) => {
    const update: PendingUpdate = { tramiteId, data, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY(tramiteId), JSON.stringify(update))
    setPendiente(update)
  }, [tramiteId])

  const sincronizar = useCallback(async () => {
    if (!pendiente || sincronizando) return
    setSinc(true)
    try {
      // actualizarWorkflowDoc removed — handled by individual workflow modules
      // tramite: pendiente.tramiteId, pendiente.data
      localStorage.removeItem(CACHE_KEY(pendiente.tramiteId))
      setPendiente(null)
    } catch (err) {
      console.warn('[useOfflineWorkflow] Error al sincronizar:', err)
    } finally {
      setSinc(false)
    }
  }, [pendiente, sincronizando])

  return {
    isOnline,
    pendiente:    pendiente !== null,
    sincronizando,
    guardarOffline,
    sincronizar,
  }
}