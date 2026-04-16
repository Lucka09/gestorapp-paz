import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeTareas,
  subscribeTareasUsuario,
  subscribeTareasEntidad,
  estaVencida,
  venceHoy,
} from '@/lib/firestore/tareas'
import type { Tarea } from '@/types'

// ─── TODAS LAS TAREAS ACTIVAS DEL TENANT (admin ve todo) ─────────────────────

export function useTareas() {
  const gestoriaId = useGestoriaId()
  const [tareas,  setTareas]  = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeTareas(gestoriaId, data => {
      setTareas(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  const vencidas  = useMemo(() => tareas.filter(t => estaVencida(t)),         [tareas])
  const vencenHoy = useMemo(() => tareas.filter(t => venceHoy(t)),            [tareas])
  const urgentes  = useMemo(() => tareas.filter(t => t.prioridad === 'urgente'), [tareas])

  return { tareas, loading, vencidas, vencenHoy, urgentes }
}

// ─── MIS TAREAS (usuario logueado) ───────────────────────────────────────────

export function useMisTareas(uid: string) {
  const gestoriaId = useGestoriaId()
  const [tareas,  setTareas]  = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || !gestoriaId) return
    setLoading(true)
    const unsub = subscribeTareasUsuario(uid, gestoriaId, data => {
      setTareas(data)
      setLoading(false)
    })
    return () => unsub()
  }, [uid, gestoriaId])

  const hoy       = new Date()

  const inicioHoy = useMemo(() =>
    new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), [])

  const finHoy = useMemo(() =>
    new Date(inicioHoy.getTime() + 86_400_000), [inicioHoy])

  const manana = useMemo(() =>
    new Date(inicioHoy.getTime() + 86_400_000), [inicioHoy])

  const finManana = useMemo(() =>
    new Date(manana.getTime() + 86_400_000), [manana])

  const paraHoy = useMemo(() =>
    tareas.filter(t => {
      const v = t.vencimiento?.toDate?.()
      return v && v >= inicioHoy && v < finHoy
    }), [tareas, inicioHoy, finHoy])

  const paraManana = useMemo(() =>
    tareas.filter(t => {
      const v = t.vencimiento?.toDate?.()
      return v && v >= manana && v < finManana
    }), [tareas, manana, finManana])

  const vencidas = useMemo(() => tareas.filter(t => estaVencida(t)), [tareas])
  const sinFecha = useMemo(() => tareas.filter(t => !t.vencimiento), [tareas])

  return { tareas, loading, paraHoy, paraManana, vencidas, sinFecha }
}

// ─── TAREAS DE UNA ENTIDAD (cliente o trámite) ────────────────────────────────

export function useTareasEntidad(
  campo: 'clienteId' | 'tramiteId',
  id:    string
) {
  const gestoriaId = useGestoriaId()
  const [tareas,  setTareas]  = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !gestoriaId) return
    setLoading(true)
    const unsub = subscribeTareasEntidad(campo, id, gestoriaId, data => {
      setTareas(data)
      setLoading(false)
    })
    return () => unsub()
  }, [campo, id, gestoriaId])

  const activas     = useMemo(() =>
    tareas.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada'), [tareas])
  const completadas = useMemo(() =>
    tareas.filter(t => t.estado === 'completada'), [tareas])

  return { tareas, activas, completadas, loading }
}