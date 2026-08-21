// src/hooks/useConsultasInfracciones.ts
// ─── HOOK — CONSULTAS DE INFRACCIONES ───────────────────────────────────────
// Suscribe las consultas de la gestoría, las ordena por fecha y las agrupa por
// estado. Expone `paraEnviar` (cotizadas listas) para la vista de trabajo.
//
// PRIVACIDAD (UI): propietario/admin/admin_gral/superadmin ven TODAS. El resto
// (secretario comercial) ve las suyas (`asignadoA === su uid`) + las libres
// (sin asignar) para poder reclamarlas; nunca ve las asignadas a otro secretario.

import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useAuthStore } from '@/store/authStore'
import { subscribeConsultas } from '@/lib/firestore/consultasInfracciones'
import type { ConsultaInfraccion, EstadoConsulta } from '@/infraccion_types'

function ms(ts: any): number {
  // Timestamp de Firestore → millis; tolera nulls durante la escritura optimista.
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
}

const ESTADOS_VACIO = (): Record<EstadoConsulta, ConsultaInfraccion[]> => ({
  pendiente: [], consultada: [], cotizada: [], enviada: [], sin_deuda: [], descartada: [],
})

// Roles con visibilidad total del pool de consultas.
const ROLES_VEN_TODO = ['propietario', 'admin', 'admin_gral', 'superadmin']

export function useConsultasInfracciones() {
  const gestoriaId                = useGestoriaId()
  const user                      = useAuthStore(s => s.user)
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

  // ── Filtro de privacidad ──────────────────────────────────────────────────
  // Admins ven todo. El resto ve lo asignado a su uid + el pool libre (sin
  // asignar) para poder reclamarlo; nunca ve lo asignado a otro secretario.
  const veTodo = ROLES_VEN_TODO.includes(user?.rol ?? '')
  const visibles = useMemo(
    () => veTodo
      ? consultas
      : consultas.filter(c => c.asignadoA === user?.uid || !c.asignadoA),
    [consultas, veTodo, user?.uid],
  )

  const porEstado = useMemo(() => {
    const map = ESTADOS_VACIO()
    visibles.forEach(c => { if (map[c.estado]) map[c.estado].push(c) })
    return map
  }, [visibles])

  // Cola de trabajo: cotizadas listas para revisar y enviar.
  const paraEnviar = useMemo(() => porEstado.cotizada, [porEstado])
  // Recién llegadas / en curso, para el badge del nav.
  const pendientes = useMemo(
    () => porEstado.pendiente.length + porEstado.consultada.length,
    [porEstado],
  )

  return { consultas: visibles, porEstado, paraEnviar, pendientes, loading }
}