import { useState, useEffect } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeTurnos,
  subscribeTurnosPorFecha,
  subscribeTurnosPorCliente,
  subscribeTurnosProximos,
} from '@/lib/firestore/turnos'
import type { Turno } from '@/types'

// ─── TODOS LOS TURNOS DEL TENANT ─────────────────────────────────────────────

export function useTurnos() {
  const gestoriaId = useGestoriaId()
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeTurnos(gestoriaId, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { turnos, loading }
}

// ─── TURNOS DE UN DÍA ESPECÍFICO ─────────────────────────────────────────────

export function useTurnosPorFecha(fecha: Date) {
  const gestoriaId = useGestoriaId()
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const fechaString = fecha.toDateString()

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeTurnosPorFecha(fecha, gestoriaId, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  // fechaString evita re-renders por referencia en cada render padre
  }, [fechaString, gestoriaId])

  return { turnos, loading }
}

// ─── TURNOS DE UN CLIENTE ────────────────────────────────────────────────────

export function useTurnosPorCliente(clienteId: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId || !gestoriaId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeTurnosPorCliente(clienteId, gestoriaId, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId, gestoriaId])

  return { turnos, loading }
}

// ─── TURNOS PRÓXIMOS (hoy en adelante, estado activo) ────────────────────────

export function useTurnosProximos() {
  const gestoriaId = useGestoriaId()
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeTurnosProximos(gestoriaId, data => {
      setTurnos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { turnos, loading }
}