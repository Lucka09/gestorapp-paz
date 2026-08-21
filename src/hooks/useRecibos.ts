// src/hooks/useRecibos.ts
// Suscribe todos los recibos emitidos de la gestoría (bandeja de supervisión).
import { useEffect, useState } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeRecibos, type Recibo } from '@/lib/firestore/recibos'

export function useRecibos() {
  const gestoriaId = useGestoriaId()
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeRecibos(gestoriaId, data => {
      setRecibos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { recibos, loading }
}