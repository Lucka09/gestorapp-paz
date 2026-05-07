import { useQuery }            from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useGestoriaId }       from '@/context/GestoriaContext'
import {
  getMetricas, getDistribucionEstados,
  subscribeTurnosHoy, subscribeUltimosTramites,
  type MetricasDashboard, type EstadoCount,
} from '@/lib/firestore/dashboard'
import type { Tramite, Turno } from '@/types'

// ─── MÉTRICAS — caché 5 min, una sola lectura ────────────────────────────────
export function useMetricas() {
  const gestoriaId = useGestoriaId()
  const { data: metricas, isLoading: loading, refetch } = useQuery<MetricasDashboard>({
    queryKey:  ['metricas', gestoriaId],
    queryFn:   () => getMetricas(gestoriaId),
    staleTime: 1000 * 60 * 5,
    enabled:   !!gestoriaId,
  })
  return { metricas: metricas ?? null, loading, refetch }
}

// ─── DISTRIBUCIÓN ESTADOS — caché 5 min ──────────────────────────────────────
export function useDistribucionEstados() {
  const gestoriaId = useGestoriaId()
  const { data = [], isLoading: loading, refetch } = useQuery<EstadoCount[]>({
    queryKey:  ['distribucion-estados', gestoriaId],
    queryFn:   () => getDistribucionEstados(gestoriaId),
    staleTime: 1000 * 60 * 5,
    enabled:   !!gestoriaId,
  })
  return { data, loading, refetch }
}

// ─── ÚLTIMOS TRÁMITES — onSnapshot acotado (8 docs) ──────────────────────────
export function useUltimosTramites() {
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading,  setLoading]  = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeUltimosTramites(gestoriaId, data => { setTramites(data); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { tramites, loading }
}

// ─── TURNOS HOY — onSnapshot acotado por fecha ───────────────────────────────
export function useTurnosHoy() {
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    const unsub = subscribeTurnosHoy(gestoriaId, data => { setTurnos(data); setLoading(false) })
    return () => unsub()
  }, [gestoriaId])
  return { turnos, loading }
}