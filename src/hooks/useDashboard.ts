import { useState, useEffect } from 'react'
import { useGestoriaId }  from '@/context/GestoriaContext'
import {
  subscribeMetricas, subscribeUltimosTramites,
  subscribeTurnosHoy, subscribeDistribucionEstados,
  type MetricasDashboard, type EstadoCount,
} from '@/lib/firestore/dashboard'
import type { Tramite, Turno } from '@/types'

export function useMetricas() {
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null)
  const [loading, setLoading]   = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeMetricas(gestoriaId, data => { setMetricas(data); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { metricas, loading }
}

export function useUltimosTramites() {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeUltimosTramites(gestoriaId, data => { setTramites(data); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { tramites, loading }
}

export function useTurnosHoy() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeTurnosHoy(gestoriaId, data => { setTurnos(data); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { turnos, loading }
}

export function useDistribucionEstados() {
  const [data, setData]       = useState<EstadoCount[]>([])
  const [loading, setLoading] = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeDistribucionEstados(gestoriaId, d => { setData(d); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { data, loading }
}