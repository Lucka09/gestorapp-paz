import { useState, useEffect, useMemo } from 'react'
import {
  subscribeTramites,
  subscribeTramitesPorCliente,
  subscribeTramite,
} from '@/lib/firestore/tramites'
import type { Tramite, EstadoTramite, TipoTramite } from '@/types'

export function useTramites() {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const unsub = subscribeTramites(data => {
      setTramites(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { tramites, loading }
}

export function useTramitesPorCliente(clienteId: string | undefined) {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeTramitesPorCliente(clienteId, data => {
      setTramites(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId])

  return { tramites, loading }
}

export function useTramite(id: string | undefined) {
  const [tramite, setTramite] = useState<Tramite | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    const unsub = subscribeTramite(id, data => {
      setTramite(data)
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  return { tramite, loading }
}

// Lista con filtros combinados
export type TramitesFiltros = {
  search:  string
  estado:  EstadoTramite | 'todos'
  tipo:    TipoTramite   | 'todos'
}

export function useTramitesFiltrados(filtros: TramitesFiltros) {
  const { tramites, loading } = useTramites()

  const filtrados = useMemo(() => {
    return tramites.filter(t => {
      if (filtros.estado !== 'todos' && t.estado !== filtros.estado) return false
      if (filtros.tipo   !== 'todos' && t.tipo   !== filtros.tipo)   return false
      if (filtros.search.trim()) {
        const q = filtros.search.toLowerCase()
        const match =
          t.numero.toLowerCase().includes(q)  ||
          t.patente.toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [tramites, filtros])

  return { tramites: filtrados, total: tramites.length, loading }
}
