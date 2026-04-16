// ─────────────────────────────────────────────────────────────────────────────
// usePlanLimites — hook de uso de plan
// Expone conteos actuales y porcentajes para mostrar indicadores en la UI.
// Usa getCountFromServer → 2 lecturas al montar o al cambiar de gestoriaId.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useGestoria } from '@/context/GestoriaContext'
import { contarClientes, contarUsuariosActivos } from '@/lib/firestore/planLimits'
import { PLAN_CONFIG } from '@/types'

export interface PlanLimitesState {
  // Conteos actuales
  totalClientes:  number
  totalUsuarios:  number
  // Límites del plan
  maxClientes:    number
  maxUsuarios:    number
  // Porcentajes (0–100)
  pctClientes:    number
  pctUsuarios:    number
  // Banderas de estado
  enLimiteClientes:  boolean   // alcanzó el 100%
  enLimiteUsuarios:  boolean
  casiFull:          boolean   // ≥ 80% de alguno de los dos
  // Plan
  planLabel:      string
  // Control
  loading:        boolean
  refetch:        () => void  // forzar recarga manual (útil post-creación)
}

export function usePlanLimites(): PlanLimitesState {
  const { gestoria, gestoriaId } = useGestoria()

  const [totalClientes, setTotalClientes] = useState(0)
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [tick,          setTick]          = useState(0)   // trigger para refetch

  const refetch = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)

    Promise.all([
      contarClientes(gestoriaId),
      contarUsuariosActivos(gestoriaId),
    ])
      .then(([c, u]) => {
        setTotalClientes(c)
        setTotalUsuarios(u)
      })
      .catch(console.warn)
      .finally(() => setLoading(false))
  }, [gestoriaId, tick])

  const plan       = gestoria?.plan ?? 'starter'
  const maxClientes = gestoria?.maxClientes ?? PLAN_CONFIG[plan].maxClientes
  const maxUsuarios = gestoria?.maxUsuarios ?? PLAN_CONFIG[plan].maxUsuarios
  const planLabel   = PLAN_CONFIG[plan].label

  const pctClientes = maxClientes > 0 ? Math.round((totalClientes / maxClientes) * 100) : 0
  const pctUsuarios = maxUsuarios > 0 ? Math.round((totalUsuarios / maxUsuarios) * 100) : 0

  return {
    totalClientes,
    totalUsuarios,
    maxClientes,
    maxUsuarios,
    pctClientes,
    pctUsuarios,
    enLimiteClientes: totalClientes >= maxClientes,
    enLimiteUsuarios: totalUsuarios >= maxUsuarios,
    casiFull:         pctClientes >= 80 || pctUsuarios >= 80,
    planLabel,
    loading,
    refetch,
  }
}