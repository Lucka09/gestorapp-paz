import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeProspectos, calcularMetricasPipeline, type Prospecto, type EtapaPipeline } from '@/lib/firestore/pipeline'

export function useProspectos() {
  const gestoriaId                  = useGestoriaId()
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    // Guard: evita permission-denied antes de que auth resuelva el tenant.
    if (!gestoriaId) return
    const unsub = subscribeProspectos(gestoriaId, data => {
      setProspectos(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  const metricas = useMemo(() => calcularMetricasPipeline(prospectos), [prospectos])

  const porEtapa = useMemo(() => {
    const map: Record<EtapaPipeline, Prospecto[]> = {
      nuevo: [], contactado: [], interesado: [],
      presupuestado: [], cerrado: [], perdido: [],
    }
    prospectos.forEach(p => {
      if (map[p.etapa]) map[p.etapa].push(p)
    })
    return map
  }, [prospectos])

  // Tareas que vencen hoy o están vencidas
  const tareasUrgentes = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0]
    return prospectos.flatMap(p =>
      p.tareas
        .filter(t => !t.completada && t.fechaAlerta <= hoy)
        .map(t => ({ ...t, prospecto: p }))
    ).sort((a, b) => a.fechaAlerta.localeCompare(b.fechaAlerta))
  }, [prospectos])

  return { prospectos, porEtapa, metricas, tareasUrgentes, loading }
}