import { useState, useEffect, useCallback, useRef } from 'react'
import { getFunctions, httpsCallable }              from 'firebase/functions'
import { create }        from 'zustand'
import { useGestoria }   from '@/context/GestoriaContext'
import { useAuth }       from '@/hooks/useAuth'
import { usePermisos }   from '@/hooks/usePermisos'
import {
  subscribeConversaciones,
  subscribeMensajes,
  marcarConversacionLeida,
  cambiarEstadoConversacion,
  asignarAgente,
  vincularCliente,
  vincularProspecto,
  desvincularEntidad,
  actualizarNombreContacto,
  guardarMensajeSaliente,
  calcularMetricasBandeja,
} from '@/lib/firestore/conversacionesWA'
import type {
  ConversacionWA, MensajeWA,
  EstadoConversacion, MetricasBandeja,
} from '@/wa_types'

// ─── STORE COMPARTIDO ─────────────────────────────────────────────────────────

interface ConversacionesStore {
  conversaciones: ConversacionWA[]
  gestoriaActiva: string | null
  setConversaciones: (items: ConversacionWA[], gestoriaId: string) => void
}

const useConversacionesStore = create<ConversacionesStore>((set) => ({
  conversaciones: [],
  gestoriaActiva: null,
  setConversaciones: (conversaciones, gestoriaActiva) =>
    set({ conversaciones, gestoriaActiva }),
}))

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useConversacionesWA() {
  const { gestoriaId }       = useGestoria()
  const { user }             = useAuth()
  const { puede }         = usePermisos()
  const verBandejaWA     = puede('verBandejaWA')
  const { setConversaciones: setStore } = useConversacionesStore()
  const [conversaciones, setLocal] = useState<ConversacionWA[]>([])
  const [loading, setLoading]      = useState(true)
  const [error, setError]          = useState<string | null>(null)

  useEffect(() => {
    // ⛔ No suscribir si el usuario no tiene acceso a la bandeja WA
    if (!gestoriaId || !verBandejaWA) {
      setLoading(false)
      return
    }
    setLoading(true)

    // FIX: soloActivas=true explícito, onError como 4to parámetro
    const unsub = subscribeConversaciones(
      gestoriaId,
      data => {
        setLocal(data)
        setStore(data, gestoriaId)
        setLoading(false)
        setError(null)
      },
      true,           // soloActivas
      err => {        // onError — 4to parámetro correcto
        setLoading(false)
        setError(
          (err as any).code === 'permission-denied'
            ? 'Sin permisos para ver la Bandeja. Verificá las reglas de Firestore.'
            : `Error al cargar conversaciones: ${(err as any).code}`
        )
      },
    )
    return unsub
  }, [gestoriaId, verBandejaWA, setStore])

  const metricas: MetricasBandeja = calcularMetricasBandeja(conversaciones)

  const marcarLeida  = useCallback((id: string) => marcarConversacionLeida(id), [])
  const cambiarEstado = useCallback((id: string, estado: EstadoConversacion) =>
    cambiarEstadoConversacion(id, estado), [])
  const asignar      = useCallback((id: string, uid: string) => asignarAgente(id, uid), [])
  const asignarseYo  = useCallback((id: string) => {
    if (!user?.uid) return Promise.resolve()
    return asignarAgente(id, user.uid)
  }, [user?.uid])
  const linkCliente    = useCallback((convId: string, clienteId: string) =>
    vincularCliente(convId, clienteId), [])
  const linkProspecto  = useCallback((convId: string, prospectoId: string) =>
    vincularProspecto(convId, prospectoId), [])
  const desvincular    = useCallback((convId: string) => desvincularEntidad(convId), [])
  const editarNombre   = useCallback((convId: string, nombre: string) =>
    actualizarNombreContacto(convId, nombre), [])

  return {
    conversaciones, loading, error, metricas,
    marcarLeida, cambiarEstado, asignar, asignarseYo,
    linkCliente, linkProspecto, desvincular, editarNombre,
  }
}

// ─── HOOK MENSAJES DE UNA CONVERSACIÓN ───────────────────────────────────────

export function useMensajesWA(conversacionId: string | null) {
  const [mensajes, setMensajes] = useState<MensajeWA[]>([])
  const [loading,  setLoading]  = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const { gestoriaId }          = useGestoria()
  const { user }                = useAuth()
  const bottomRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  useEffect(() => {
    if (!conversacionId) { setMensajes([]); return }
    setLoading(true)
    const unsub = subscribeMensajes(
      conversacionId,
      data => {
        setMensajes(data)
        setLoading(false)
        setError(null)
      },
      err => {
        setError('No se pudieron cargar los mensajes')
        setLoading(false)
        console.error('[mensajesWA]', err)
      },
    )
    return unsub
  }, [conversacionId])

  const enviar = useCallback(async (texto: string): Promise<void> => {
    if (!texto.trim() || !conversacionId || !gestoriaId || !user?.uid) return
    setEnviando(true)
    setError(null)
    try {
      const fns    = getFunctions()
      const sendFn = httpsCallable<
        { conversacionId: string; texto: string; gestoriaId: string },
        { waMessageId: string }
      >(fns, 'whatsappSend')
      const result = await sendFn({ conversacionId, texto, gestoriaId })
      await guardarMensajeSaliente(
        conversacionId, gestoriaId, texto, user.uid, result.data.waMessageId,
      )
    } catch (e: any) {
      setError(e?.message ?? 'Error al enviar el mensaje')
    } finally {
      setEnviando(false)
    }
  }, [conversacionId, gestoriaId, user?.uid])

  return { mensajes, loading, enviando, error, enviar, bottomRef }
}

// ─── HOOK CONTADOR GLOBAL (badge en el nav) ───────────────────────────────────
// FIX: verifica permisos antes de suscribir → elimina el permission-denied para
// roles sin acceso WA (gestor, cliente, operador sin permiso, etc.)

export function useNoLeidosWA(): number {
  const { gestoriaId }  = useGestoria()
  const { puede: puedeWA } = usePermisos()
  const verBandejaWA = puedeWA('verBandejaWA')
  const { conversaciones, gestoriaActiva, setConversaciones } = useConversacionesStore()

  const yaActivo = gestoriaActiva === gestoriaId && gestoriaId !== null

  useEffect(() => {
    // ⛔ No suscribir si no tiene permiso o si useConversacionesWA ya está activo
    if (!gestoriaId || !verBandejaWA || yaActivo) return

    const unsub = subscribeConversaciones(
      gestoriaId,
      data => setConversaciones(data, gestoriaId),
      true,         // soloActivas
      err => {
        // Silenciar — es el badge del nav, no crítico
        if ((err as any).code !== 'permission-denied') {
          console.warn('[useNoLeidosWA]', (err as any).code)
        }
      },
    )
    return unsub
  }, [gestoriaId, verBandejaWA, yaActivo, setConversaciones])

  if (!verBandejaWA || gestoriaActiva !== gestoriaId) return 0
  return conversaciones.reduce((acc, c) => acc + (c.noLeidos ?? 0), 0)
}