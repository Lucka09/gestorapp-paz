import { useState, useEffect } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeEquipo, subscribeGestores, subscribeGestoresMulta, type MiembroEquipo } from '@/lib/firestore/equipo'

export function useEquipo() {
  const gestoriaId = useGestoriaId()
  const [equipo,  setEquipo]  = useState<MiembroEquipo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    const unsub = subscribeEquipo(gestoriaId, data => {
      setEquipo(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  const activos   = equipo.filter(m => m.activo)
  const inactivos = equipo.filter(m => !m.activo)

  return { equipo, activos, inactivos, loading }
}

export function useGestoresEquipo() {
  const gestoriaId = useGestoriaId()
  const [gestores, setGestores] = useState<MiembroEquipo[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    const unsub = subscribeGestores(gestoriaId, data => {
      setGestores(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { gestores, loading }
}

export function useGestoresMulta() {
  const gestoriaId = useGestoriaId()
  const [gestores, setGestores] = useState<MiembroEquipo[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    const unsub = subscribeGestoresMulta(gestoriaId, data => {
      setGestores(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { gestores, loading }
}