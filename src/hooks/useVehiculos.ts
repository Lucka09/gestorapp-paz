import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeVehiculos,
  subscribeVehiculosPorCliente,
  subscribeVehiculo,
} from '@/lib/firestore/vehiculos'
import type { Vehiculo } from '@/types'

// ─── TODOS LOS VEHÍCULOS DEL TENANT ─────────────────────────────────────────

export function useVehiculos() {
  const gestoriaId = useGestoriaId()
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeVehiculos(gestoriaId, data => {
      setVehiculos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { vehiculos, loading }
}

// ─── VEHÍCULOS DE UN CLIENTE ─────────────────────────────────────────────────

export function useVehiculosPorCliente(clienteId: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!clienteId || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeVehiculosPorCliente(clienteId, gestoriaId, data => {
      setVehiculos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId, gestoriaId])

  return { vehiculos, loading }
}

// ─── UN VEHÍCULO EN TIEMPO REAL ──────────────────────────────────────────────

export function useVehiculo(id: string | undefined) {
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    const unsub = subscribeVehiculo(id, data => {
      setVehiculo(data)
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  return { vehiculo, loading }
}

// ─── LISTA FILTRADA POR BÚSQUEDA ─────────────────────────────────────────────

export function useVehiculosFiltrados(search: string) {
  const { vehiculos, loading } = useVehiculos()

  const filtrados = useMemo(() => {
    if (!search.trim()) return vehiculos
    const q = search.toLowerCase()
    return vehiculos.filter(v =>
      v.patente.toLowerCase().includes(q) ||
      v.marca.toLowerCase().includes(q)   ||
      v.modelo.toLowerCase().includes(q)  ||
      v.color.toLowerCase().includes(q)   ||
      String(v.anio).includes(q)
    )
  }, [vehiculos, search])

  return { vehiculos: filtrados, total: vehiculos.length, loading }
}