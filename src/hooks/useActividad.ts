import { useState, useEffect } from 'react'
import { subscribeActividad } from '@/lib/firestore/audit'
import { useGestoriaId }      from '@/context/GestoriaContext'
import type { EntradaAudit, EntidadAudit } from '@/types'
 
// ─── FEED GENERAL ─────────────────────────────────────────────────────────────
 
export function useActividad(limite = 50) {
  const gestoriaId = useGestoriaId()
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)
 
  useEffect(() => {
    if (!gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeActividad(gestoriaId, data => {
      setEntradas(data)
      setLoading(false)
    }, { limite })
    return () => unsub()
  }, [gestoriaId, limite])
 
  return { entradas, loading }
}
 
// ─── HISTORIAL DE UNA ENTIDAD (ej: un trámite, un cliente, un vehículo) ──────
 
export function useActividadEntidad(entidadId: string, limite = 30) {
  const gestoriaId = useGestoriaId()
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)
 
  useEffect(() => {
    if (!gestoriaId || !entidadId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeActividad(gestoriaId, data => {
      setEntradas(data)
      setLoading(false)
    }, { entidadId, limite })
    return () => unsub()
  }, [gestoriaId, entidadId, limite])
 
  return { entradas, loading }
}
 
// ─── ACTIVIDAD DE UN USUARIO ──────────────────────────────────────────────────
 
export function useActividadUsuario(usuarioId: string, limite = 30) {
  const gestoriaId = useGestoriaId()
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)
 
  useEffect(() => {
    if (!gestoriaId || !usuarioId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeActividad(gestoriaId, data => {
      setEntradas(data)
      setLoading(false)
    }, { usuarioId, limite })
    return () => unsub()
  }, [gestoriaId, usuarioId, limite])
 
  return { entradas, loading }
}
 
// ─── ACTIVIDAD POR TIPO DE ENTIDAD ────────────────────────────────────────────
 
export function useActividadPorEntidad(entidad: EntidadAudit, limite = 50) {
  const gestoriaId = useGestoriaId()
  const [entradas, setEntradas] = useState<EntradaAudit[]>([])
  const [loading,  setLoading]  = useState(true)
 
  useEffect(() => {
    if (!gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeActividad(gestoriaId, data => {
      setEntradas(data)
      setLoading(false)
    }, { entidad, limite })
    return () => unsub()
  }, [gestoriaId, entidad, limite])
 
  return { entradas, loading }
}
 