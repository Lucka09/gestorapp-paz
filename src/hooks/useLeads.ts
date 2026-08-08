import { useEffect, useState, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeLeads } from '@/lib/firestore/leads'
import type { Lead } from '@/types'
import { ESTADOS_LEAD_ACTIVOS } from '@/types'

export function useLeads() {
  const gestoriaId = useGestoriaId()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId || gestoriaId === 'default') {
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeLeads(gestoriaId, items => {
      setLeads(items)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  // Métricas derivadas para la bandeja
  const metricas = useMemo(() => {
    const nuevos      = leads.filter(l => l.estado === 'nuevo').length
    const activos     = leads.filter(l => ESTADOS_LEAD_ACTIVOS.includes(l.estado)).length
    const convertidos = leads.filter(l => l.estado === 'convertido').length
    const perdidos    = leads.filter(l => l.estado === 'perdido').length
    const sinAsignar  = leads.filter(l => ESTADOS_LEAD_ACTIVOS.includes(l.estado) && !l.asignadoA).length
    return { total: leads.length, nuevos, activos, convertidos, perdidos, sinAsignar }
  }, [leads])

  return { leads, loading, metricas }
}