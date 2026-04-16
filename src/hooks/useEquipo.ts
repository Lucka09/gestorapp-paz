import { useState, useEffect } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeEquipo, type MiembroEquipo } from '@/lib/firestore/equipo'

export function useEquipo() {
  const gestoriaId = useGestoriaId()
  const [equipo,  setEquipo]  = useState<MiembroEquipo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
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