import { useState, useEffect } from 'react'
import {
  subscribeTurnos,
  subscribeTurnosPorFecha,
  subscribeTurnosPorCliente,
  subscribeTurnosProximos,
} from '@/lib/firestore/turnos'
import type { Turno } from '@/types'

export function useTurnos() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = subscribeTurnos(data => { setTurnos(data); setLoading(false) })
    return () => unsub()
  }, [])
  return { turnos, loading }
}

export function useTurnosPorFecha(fecha: Date) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = subscribeTurnosPorFecha(fecha, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [fecha.toDateString()])
  return { turnos, loading }
}

export function useTurnosPorCliente(clienteId: string | undefined) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!clienteId) { setLoading(false); return }
    const unsub = subscribeTurnosPorCliente(clienteId, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId])
  return { turnos, loading }
}

export function useTurnosProximos() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = subscribeTurnosProximos(data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])
  return { turnos, loading }
}
