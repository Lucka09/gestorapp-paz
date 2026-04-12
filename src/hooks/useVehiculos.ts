import { useState, useEffect, useMemo } from 'react'
import { subscribeVehiculos, subscribeVehiculosPorCliente, subscribeVehiculo } from '@/lib/firestore/vehiculos'
import type { Vehiculo } from '@/types'

export function useVehiculos() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const unsub = subscribeVehiculos(data => {
      setVehiculos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { vehiculos, loading }
}

export function useVehiculosPorCliente(clienteId: string | undefined) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeVehiculosPorCliente(clienteId, data => {
      setVehiculos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId])

  return { vehiculos, loading }
}

export function useVehiculo(id: string | undefined) {
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [loading, setLoading]   = useState(true)

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
