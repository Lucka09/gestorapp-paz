import { useState, useEffect } from 'react'
import {
  subscribeMetricas, subscribeUltimosTramites,
  subscribeTurnosHoy, subscribeDistribucionEstados,
  type MetricasDashboard, type EstadoCount,
} from '@/lib/firestore/dashboard'
import type { Tramite, Turno } from '@/types'

export function useMetricas() {
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null)
  const [loading, setLoading]   = useState(true)
  useEffect(() => {
    const unsub = subscribeMetricas(data => { setMetricas(data); setLoading(false) })
    return () => unsub()
  }, [])
  return { metricas, loading }
}

export function useUltimosTramites() {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(true)
  useEffect(() => {
    const unsub = subscribeUltimosTramites(data => { setTramites(data); setLoading(false) })
    return () => unsub()
  }, [])
  return { tramites, loading }
}

export function useTurnosHoy() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = subscribeTurnosHoy(data => { setTurnos(data); setLoading(false) })
    return () => unsub()
  }, [])
  return { turnos, loading }
}

export function useDistribucionEstados() {
  const [data, setData]       = useState<EstadoCount[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = subscribeDistribucionEstados(d => { setData(d); setLoading(false) })
    return () => unsub()
  }, [])
  return { data, loading }
}
