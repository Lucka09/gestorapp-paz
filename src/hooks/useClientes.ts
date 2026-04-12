import { useState, useEffect, useMemo } from 'react'
import { subscribeClientes, subscribeCliente } from '@/lib/firestore/clientes'
import type { Cliente } from '@/types'

// Lista completa en tiempo real
export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const unsub = subscribeClientes((data) => {
      setClientes(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { clientes, loading }
}

// Un cliente en tiempo real
export function useCliente(id: string | undefined) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    const unsub = subscribeCliente(id, (data) => {
      setCliente(data)
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  return { cliente, loading }
}

// Lista filtrada por búsqueda (cliente-side)
export function useClientesFiltrados(search: string) {
  const { clientes, loading } = useClientes()

  const filtrados = useMemo(() => {
    if (!search.trim()) return clientes
    const q = search.toLowerCase()
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q)   ||
      c.apellido.toLowerCase().includes(q) ||
      c.dni.includes(q)                    ||
      c.telefono.includes(q)               ||
      c.email.toLowerCase().includes(q)
    )
  }, [clientes, search])

  return { clientes: filtrados, total: clientes.length, loading }
}
