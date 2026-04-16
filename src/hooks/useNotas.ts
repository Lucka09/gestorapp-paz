import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeNotas } from '@/lib/firestore/notas'
import type { NotaInterna } from '@/types'

export function useNotas(
  entidad:   'cliente' | 'tramite',
  entidadId: string
) {
  const gestoriaId = useGestoriaId()
  const [notas,   setNotas]   = useState<NotaInterna[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entidadId || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeNotas(entidad, entidadId, gestoriaId, data => {
      setNotas(data)
      setLoading(false)
    })
    return () => unsub()
  }, [entidad, entidadId, gestoriaId])

  const importantes = useMemo(() => notas.filter(n => n.importante),  [notas])
  const normales    = useMemo(() => notas.filter(n => !n.importante), [notas])

  return { notas, loading, importantes, normales }
}