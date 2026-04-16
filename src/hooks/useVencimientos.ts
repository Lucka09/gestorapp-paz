import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeVencimientos,
  subscribeVencimientosVehiculo,
  subscribeVencimientosCliente,
  calcularEstado,
  diasRestantes,
} from '@/lib/firestore/vencimientos'
import type { Vencimiento } from '@/types'

// ─── TODOS LOS VENCIMIENTOS DEL TENANT ───────────────────────────────────────

export function useVencimientos() {
  const gestoriaId = useGestoriaId()
  const [vencimientos, setVencimientos] = useState<Vencimiento[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeVencimientos(gestoriaId, data => {
      setVencimientos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  const vencidos   = useMemo(() => vencimientos.filter(v => calcularEstado(v) === 'vencido'),    [vencimientos])
  const porVencer  = useMemo(() => vencimientos.filter(v => calcularEstado(v) === 'por_vencer'), [vencimientos])
  const proximos30 = useMemo(() =>
    vencimientos.filter(v => { const d = diasRestantes(v); return d >= 0 && d <= 30 }),
  [vencimientos])

  return { vencimientos, loading, vencidos, porVencer, proximos30 }
}

// ─── POR VEHÍCULO ────────────────────────────────────────────────────────────

export function useVencimientosVehiculo(vehiculoId: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [vencimientos, setVencimientos] = useState<Vencimiento[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!vehiculoId || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeVencimientosVehiculo(vehiculoId, gestoriaId, data => {
      setVencimientos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [vehiculoId, gestoriaId])

  return { vencimientos, loading }
}

// ─── POR CLIENTE (todos sus vehículos) ───────────────────────────────────────

export function useVencimientosCliente(clienteId: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [vencimientos, setVencimientos] = useState<Vencimiento[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!clienteId || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeVencimientosCliente(clienteId, gestoriaId, data => {
      setVencimientos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId, gestoriaId])

  const vencidos = useMemo(() => vencimientos.filter(v => calcularEstado(v) === 'vencido'),    [vencimientos])
  const proximos = useMemo(() => vencimientos.filter(v => calcularEstado(v) === 'por_vencer'), [vencimientos])

  return { vencimientos, loading, vencidos, proximos }
}