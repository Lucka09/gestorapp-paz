import { useState, useEffect } from 'react'
import { subscribeActividad } from '@/lib/firestore/audit'
import type { EntradaAudit, EntidadAudit } from '@/types'

// Feed general — últimas N actividades
export function useActividad(limite = 50) {
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const unsub = subscribeActividad(data => {
      setEntradas(data)
      setLoading(false)
    }, { limite })
    return () => unsub()
  }, [limite])

  return { entradas, loading }
}

// Historial de una entidad específica (ej: un trámite)
export function useActividadEntidad(entidadId: string, limite = 30) {
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!entidadId) return
    const unsub = subscribeActividad(data => {
      setEntradas(data)
      setLoading(false)
    }, { entidadId, limite })
    return () => unsub()
  }, [entidadId, limite])

  return { entradas, loading }
}

// Actividad de un usuario específico
export function useActividadUsuario(usuarioId: string, limite = 30) {
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!usuarioId) return
    const unsub = subscribeActividad(data => {
      setEntradas(data)
      setLoading(false)
    }, { usuarioId, limite })
    return () => unsub()
  }, [usuarioId, limite])

  return { entradas, loading }
}
