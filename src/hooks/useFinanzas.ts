import { useEffect, useState } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  cargarRecibos,
  getDesglose,
  getDesglosePorSecretario,
  proyectarMes,
} from '@/lib/firestore/finanzas'
import type { DesgloseFinanciero, Proyeccion } from '@/lib/firestore/finanzas'

export function useFinanzas(desde?: Date, hasta?: Date) {
  const gestoriaId = useGestoriaId()
  const [data, setData] = useState<{
    gestoria: DesgloseFinanciero
    porSecretario: Record<string, DesgloseFinanciero>
    proyeccion: Proyeccion
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gestoriaId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let vivo = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const recibos = await cargarRecibos(gestoriaId)
        const d  = await getDesglose(gestoriaId, desde, hasta, recibos)
        const ps = await getDesglosePorSecretario(gestoriaId, desde, hasta, recibos)
        if (vivo) {
          setData({
            gestoria: d,
            porSecretario: ps,
            proyeccion: proyectarMes(d.netoGestoria),
          })
        }
      } catch (e) {
        if (vivo) {
          setData(null)
          setError(e instanceof Error ? e.message : 'No se pudieron cargar las finanzas')
        }
      } finally { if (vivo) setLoading(false) }
    })()
    return () => { vivo = false }
  }, [gestoriaId, desde?.getTime(), hasta?.getTime()])

  return { ...data, loading, error }
}