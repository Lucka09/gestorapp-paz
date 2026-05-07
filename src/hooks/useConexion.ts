// src/hooks/useConexion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Detecta el estado de conexión del navegador.
//
// - Escucha los eventos 'online' / 'offline' de window.
// - navigator.onLine puede tener falsos positivos (WiFi sin internet),
//   por lo que al reconectarse hacemos un ping real a Firebase Firestore.
// - Devuelve: 'online' | 'offline' | 'reconectando'
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

export type EstadoConexion = 'online' | 'offline' | 'reconectando'

const PING_URL = 'https://firestore.googleapis.com/favicon.ico'
const PING_TIMEOUT_MS = 4000

async function pingReal(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
    const res   = await fetch(PING_URL, {
      method: 'HEAD',
      signal: ctrl.signal,
      cache:  'no-store',
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

export function useConexion(): EstadoConexion {
  const [estado, setEstado] = useState<EstadoConexion>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  )

  const handleOffline = useCallback(() => {
    setEstado('offline')
  }, [])

  const handleOnline = useCallback(async () => {
    // navigator.onLine = true, pero verificamos con un ping real antes de celebrar
    setEstado('reconectando')
    const conectado = await pingReal()
    setEstado(conectado ? 'online' : 'offline')
  }, [])

  useEffect(() => {
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [handleOffline, handleOnline])

  return estado
}