/**
 * useEventos — Suscripción en tiempo real al event stream del tenant
 * ─────────────────────────────────────────────────────────────────
 * Uso:
 *   const { eventos, loading } = useEventos()                    // todos
 *   const { eventos } = useEventos({ tipos: ['lead.creado'] })   // filtrado
 *   const { eventos } = useEventos({ limite: 100 })              // top 100
 */
import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, limit, onSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useGestoriaId } from '@/context/GestoriaContext'
import type { Evento, TipoEvento } from '@/types'

interface UseEventosOpts {
  /** Filtrar por tipos específicos (opcional) */
  tipos?: TipoEvento[]
  /** Máximo de eventos a traer (default 50) */
  limite?: number
}

export function useEventos(opts: UseEventosOpts = {}) {
  const { tipos, limite = 50 } = opts
  const gestoriaId = useGestoriaId()

  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Si aún no hay tenant válido, no suscribir
    if (!gestoriaId || gestoriaId === 'default') {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const constraints: QueryConstraint[] = [
      where('gestoriaId', '==', gestoriaId),
      orderBy('timestamp', 'desc'),
      limit(limite),
    ]

    // Filtro opcional por tipos — requiere índice compuesto
    if (tipos && tipos.length > 0) {
      constraints.splice(1, 0, where('tipo', 'in', tipos))
    }

    const q = query(collection(db, 'eventos'), ...constraints)

    const unsub = onSnapshot(
      q,
      snap => {
        setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Evento))
        setLoading(false)
      },
      err => {
        console.error('[useEventos]', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestoriaId, limite, tipos?.join(',')])

  return { eventos, loading, error }
}