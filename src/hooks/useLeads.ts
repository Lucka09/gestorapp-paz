import { useEffect, useState, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeLeads } from '@/lib/firestore/leads'
import type { Lead } from '@/types'
import { ESTADOS_LEAD_ACTIVOS } from '@/types'

export function calcularMetricasLeads(leads: Lead[]) {
  const nuevos      = leads.filter(l => l.estado === 'nuevo').length
  const activos     = leads.filter(l => ESTADOS_LEAD_ACTIVOS.includes(l.estado)).length
  const convertidos = leads.filter(l => l.estado === 'convertido').length
  const perdidos    = leads.filter(l => l.estado === 'perdido' || l.estado === 'descartado').length
  const sinAsignar  = leads.filter(l => ESTADOS_LEAD_ACTIVOS.includes(l.estado) && !l.asignadoA).length
  return { total: leads.length, nuevos, activos, convertidos, perdidos, sinAsignar }
}

/**
 * Leads de la gestoría (los 300 más recientes).
 * Con `propiosDe` suma una segunda suscripción con TODOS los leads de esa
 * persona (hasta 300), para que un secretario no pierda los suyos más viejos.
 */
export function useLeads(opts: { propiosDe?: string } = {}) {
  const gestoriaId = useGestoriaId()
  const { propiosDe } = opts
  const [generales, setGenerales] = useState<Lead[]>([])
  const [propios,   setPropios]   = useState<Lead[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!gestoriaId || gestoriaId === 'default') {
      setLoading(false)
      return
    }
    setLoading(true)
    const unsubs = [
      subscribeLeads(gestoriaId, items => { setGenerales(items); setLoading(false) }),
    ]
    if (propiosDe) {
      // Si el índice todavía no está desplegado, la query falla y seguimos
      // con la lista general (no rompe la pantalla).
      unsubs.push(subscribeLeads(gestoriaId, setPropios, { asignadoA: propiosDe, onError: () => setPropios([]) }))
    } else {
      setPropios([])
    }
    return () => unsubs.forEach(u => u())
  }, [gestoriaId, propiosDe])

  const leads = useMemo(() => {
    if (!propios.length) return generales
    const porId = new Map<string, Lead>()
    for (const l of generales) porId.set(l.id, l)
    for (const l of propios)   porId.set(l.id, l)
    return [...porId.values()].sort((a, b) =>
      ((b.creadoEn as any)?.toMillis?.() ?? 0) - ((a.creadoEn as any)?.toMillis?.() ?? 0))
  }, [generales, propios])

  const metricas = useMemo(() => calcularMetricasLeads(leads), [leads])

  return { leads, loading, metricas }
}