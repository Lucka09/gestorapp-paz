import { useQuery }            from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useGestoriaId }       from '@/context/GestoriaContext'
import {
  getMetricas, getDistribucionEstados,
  getIngresosPorMes, getTiposTramiteFrecuentes, getTopClientes,
  getClientesPorOrigen,
  subscribeTurnosHoy, subscribeUltimosTramites,
  type MetricasDashboard, type EstadoCount, type IngresoMes,
  type TipoCount, type TopCliente, type ClientesPorOrigen,
} from '@/lib/firestore/dashboard'
import type { Tramite, Turno } from '@/types'

export function useMetricas() {
  const gestoriaId = useGestoriaId()
  const { data: metricas, isLoading: loading, refetch } = useQuery<MetricasDashboard>({
    queryKey:  ['metricas', gestoriaId],
    queryFn:   () => getMetricas(gestoriaId),
    staleTime: 1000 * 60 * 5,                 // dato considerado "fresco" 5 min
    refetchInterval: 1000 * 60 * 5,            // auto-refetch cada 5 min
    refetchIntervalInBackground: false,        // no refetch si la pestaña no está activa
    refetchOnWindowFocus: true,                // al volver a la pestaña, refresca al toque
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
    if (!gestoriaId) return
    let unsub: (() => void) | null = null
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      unsub = subscribeUltimosTramites(gestoriaId, data => {
        if (alive) { setTramites(data); setLoading(false) }
      })
    }, 200)
    return () => { alive = false; clearTimeout(t); try { unsub?.() } catch {} }
  }, [gestoriaId])
  return { tramites, loading }
}

// ─── TURNOS HOY — onSnapshot acotado por fecha ───────────────────────────────
export function useTurnosHoy() {
  const [turnos,  setTurnos]  = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const gestoriaId = useGestoriaId()
  useEffect(() => {
    if (!gestoriaId) return
    let unsub: (() => void) | null = null
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      unsub = subscribeTurnosHoy(gestoriaId, data => {
        if (alive) { setTurnos(data); setLoading(false) }
      })
    }, 200)
    return () => { alive = false; clearTimeout(t); try { unsub?.() } catch {} }
  }, [gestoriaId])
  return { turnos, loading }
}

// ─── ANALYTICS — caché larga, se refresca al volver al tab ───────────────────
// Estos datos cambian poco — staleTime de 10 min evita re-reads en cada
// navegación. En una gestoría como Gestoría Paz ahorra ~60K reads/mes.

export function useIngresosPorMes(meses = 6) {
  const gestoriaId = useGestoriaId()
  const { data = [], isLoading: loading } = useQuery<IngresoMes[]>({
    queryKey:  ['ingresos-mes', gestoriaId, meses],
    queryFn:   () => getIngresosPorMes(gestoriaId, meses),
    staleTime: 1000 * 60 * 10,
    enabled:   !!gestoriaId,
  })
  return { data, loading }
}

export function useTiposTramiteFrecuentes() {
  const gestoriaId = useGestoriaId()
  const { data = [], isLoading: loading } = useQuery<TipoCount[]>({
    queryKey:  ['tipos-tramite', gestoriaId],
    queryFn:   () => getTiposTramiteFrecuentes(gestoriaId),
    staleTime: 1000 * 60 * 10,
    enabled:   !!gestoriaId,
  })
  return { data, loading }
}

export function useTopClientes(cantidad = 5) {
  const gestoriaId = useGestoriaId()
  const { data = [], isLoading: loading } = useQuery<TopCliente[]>({
    queryKey:  ['top-clientes', gestoriaId, cantidad],
    queryFn:   () => getTopClientes(gestoriaId, cantidad),
    staleTime: 1000 * 60 * 10,
    enabled:   !!gestoriaId,
  })
  return { data, loading }
}

// ─── CLIENTES POR ORIGEN — referidos comerciales + canal digital ─────────────
// Misma política de caché que el resto de analytics (10 min, sin onSnapshot).
export function useClientesPorOrigen() {
  const gestoriaId = useGestoriaId()
  const { data, isLoading: loading } = useQuery<ClientesPorOrigen>({
    queryKey:  ['clientes-origen', gestoriaId],
    queryFn:   () => getClientesPorOrigen(gestoriaId),
    staleTime: 1000 * 60 * 10,
    enabled:   !!gestoriaId,
  })
  return {
    comercial: data?.comercial ?? [],
    digital:   data?.digital ?? [],
    sinDato:   data?.sinDato ?? 0,
    loading,
  }
}