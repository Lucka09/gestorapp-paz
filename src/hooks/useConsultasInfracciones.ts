// src/hooks/useConsultasInfracciones.ts
// ─── HOOK — CONSULTAS DE INFRACCIONES ───────────────────────────────────────
// Suscribe las consultas de la gestoría, las ordena por fecha y las agrupa por
// estado. Expone `paraEnviar` (cotizadas listas) para la vista de trabajo.

import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { subscribeConsultas } from '@/lib/firestore/consultasInfracciones'
import type { ConsultaInfraccion, EstadoConsulta } from '@/infraccion_types'

function ms(ts: any): number {
  // Timestamp de Firestore → millis; tolera nulls durante la escritura optimista.
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
}

const ESTADOS_VACIO = (): Record<EstadoConsulta, ConsultaInfraccion[]> => ({
  pendiente: [], consultada: [], cotizada: [], enviada: [], sin_deuda: [], descartada: [],
})

export function useConsultasInfracciones() {
  const gestoriaId                = useGestoriaId()
  const [consultas, setConsultas] = useState<ConsultaInfraccion[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    // Guard: evita permission-denied antes de que auth resuelva el tenant.
    if (!gestoriaId) return
    const unsub = subscribeConsultas(gestoriaId, data => {
      const ordenadas = [...data].sort((a, b) => ms(b.creadaEn) - ms(a.creadaEn))
      setConsultas(ordenadas)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  const porEstado = useMemo(() => {
    const map = ESTADOS_VACIO()
    consultas.forEach(c => { if (map[c.estado]) map[c.estado].push(c) })
    return map
  }, [consultas])

  // Cola de trabajo de Jessica: cotizadas listas para revisar y enviar.
  const paraEnviar = useMemo(() => porEstado.cotizada, [porEstado])
  // Recién llegadas / en curso, para el badge del nav.
  const pendientes = useMemo(
    () => porEstado.pendiente.length + porEstado.consultada.length,
    [porEstado],
  )

  return { consultas, porEstado, paraEnviar, pendientes, loading }
}