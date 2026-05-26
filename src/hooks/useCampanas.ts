// src/hooks/useCampanas.ts
import { useState, useEffect, useCallback } from 'react'
import { useGestoriaId }   from '@/context/GestoriaContext'
import { useAuth }         from '@/hooks/useAuth'
import {
  subscribeCampanas, subscribeEnvios,
  crearCampana, actualizarCampana, cambiarEstadoCampana,
  eliminarCampana, estimarAudiencia, simularEnvioCampana,
  calcularMetricas,
} from '@/lib/firestore/campanas'
import type {
  Campana, CampanaInput, EnvioCampana, FiltroAudiencia,
} from '@/campana_types'
import toast from 'react-hot-toast'

// ─── HOOK LISTADO ─────────────────────────────────────────────────────────────

export function useCampanas() {
  const gestoriaId              = useGestoriaId()
  const [campanas, setCampanas] = useState<Campana[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (!gestoriaId) return
    return subscribeCampanas(
      gestoriaId,
      data => { setCampanas(data); setLoading(false) },
      err  => { setError(err.message); setLoading(false) },
    )
  }, [gestoriaId])

  return { campanas, loading, error }
}

// ─── HOOK DETALLE + ENVÍOS ────────────────────────────────────────────────────

export function useCampanaDetalle(campanaId: string | undefined) {
  const gestoriaId            = useGestoriaId()
  const [campana, setCampana] = useState<Campana | null>(null)
  const [envios,  setEnvios]  = useState<EnvioCampana[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gestoriaId || !campanaId) return
    // Suscribir a la campaña padre
    const unsubC = subscribeCampanas(gestoriaId, list => {
      const found = list.find(c => c.id === campanaId)
      if (found) setCampana(found)
    })
    // Suscribir a los envíos
    const unsubE = subscribeEnvios(gestoriaId, campanaId, data => {
      setEnvios(data)
      setLoading(false)
    }, () => setLoading(false))
    return () => { unsubC(); unsubE() }
  }, [gestoriaId, campanaId])

  const metricas = calcularMetricas(envios, campana?.costoUSD ?? 0)

  return { campana, envios, metricas, loading }
}

// ─── HOOK ACCIONES ────────────────────────────────────────────────────────────

export function useAccionesCampana() {
  const gestoriaId        = useGestoriaId()
  const { user }          = useAuth()
  const [saving, setSaving] = useState(false)
  const [estimando, setEstimando] = useState(false)
  const [audienciaEstimada, setAudienciaEstimada] = useState<number | null>(null)

  const crear = useCallback(async (input: Omit<CampanaInput, 'creadoPor' | 'creadoPorNombre'>): Promise<string | null> => {
    if (!gestoriaId || !user) return null
    setSaving(true)
    try {
      const id = await crearCampana(gestoriaId, {
        ...input,
        creadoPor:       user.uid,
        creadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success('Campaña creada correctamente')
      return id
    } catch {
      toast.error('Error al crear la campaña')
      return null
    } finally {
      setSaving(false)
    }
  }, [gestoriaId, user])

  const actualizar = useCallback(async (id: string, data: Partial<Campana>): Promise<void> => {
    if (!gestoriaId) return
    await actualizarCampana(gestoriaId, id, data).catch(() => toast.error('Error al actualizar'))
  }, [gestoriaId])

  const cambiarEstado = useCallback(async (id: string, estado: Campana['estado']): Promise<void> => {
    if (!gestoriaId) return
    await cambiarEstadoCampana(gestoriaId, id, estado).catch(() => toast.error('Error al cambiar estado'))
  }, [gestoriaId])

  const eliminar = useCallback(async (id: string): Promise<void> => {
    if (!gestoriaId) return
    setSaving(true)
    try {
      await eliminarCampana(gestoriaId, id)
      toast.success('Campaña eliminada')
    } catch {
      toast.error('Error al eliminar la campaña')
    } finally {
      setSaving(false)
    }
  }, [gestoriaId])

  const simular = useCallback(async (id: string): Promise<void> => {
    if (!gestoriaId) return
    setSaving(true)
    try {
      await simularEnvioCampana(gestoriaId, id)
      toast.success('Simulación completada — los envíos aparecerán en el reporte')
    } catch {
      toast.error('Error en la simulación')
    } finally {
      setSaving(false)
    }
  }, [gestoriaId])

  const estimar = useCallback(async (filtro: FiltroAudiencia): Promise<void> => {
    if (!gestoriaId) return
    setEstimando(true)
    try {
      const n = await estimarAudiencia(gestoriaId, filtro)
      setAudienciaEstimada(n)
    } catch {
      setAudienciaEstimada(null)
    } finally {
      setEstimando(false)
    }
  }, [gestoriaId])

  return {
    saving, estimando, audienciaEstimada,
    crear, actualizar, cambiarEstado, eliminar, simular, estimar,
  }
}