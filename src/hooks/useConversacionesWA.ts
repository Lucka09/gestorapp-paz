import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  type ScopeBandeja,
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

// ─── HELPER: scope según permisos ─────────────────────────────────────────────
// Roles de control ven todo; el resto ve lo propio + el pool sin asignar.
function calcularScope(verTodo: boolean, uid: string | undefined): ScopeBandeja | null {
  if (verTodo) return { tipo: 'todas' }
  if (!uid)    return null          // sin uid no se puede armar 'propiasYPool'
  return { tipo: 'propiasYPool', uid }
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useConversacionesWA() {
  const { gestoriaId }   = useGestoria()
  const { user }         = useAuth()
  const { puede }        = usePermisos()
  const verBandejaWA     = puede('verBandejaWA')
  const verTodo          = puede('verTodaLaBandejaWA')
  const puedeReasignar   = puede('reasignarWA')
  const { setConversaciones: setStore } = useConversacionesStore()
  const [conversaciones, setLocal] = useState<ConversacionWA[]>([])
  const [loading, setLoading]      = useState(true)
  const [error, setError]          = useState<string | null>(null)

  const scope = useMemo(
    () => calcularScope(verTodo, user?.uid),
    [verTodo, user?.uid],
  )

  useEffect(() => {
    // ⛔ No suscribir si no tiene acceso, o si falta el scope (sin uid todavía)
    if (!gestoriaId || !verBandejaWA || !scope) {
      setLoading(false)
      return
    }
    setLoading(true)

    const unsub = subscribeConversaciones(
      gestoriaId,
      data => {
        setLocal(data)
        setStore(data, gestoriaId)
        setLoading(false)
        setError(null)
      },
      true,           // soloActivas
      err => {
        setLoading(false)
        setError(
          (err as any).code === 'permission-denied'
            ? 'Sin permisos para ver la Bandeja. Verificá las reglas de Firestore.'
            : `Error al cargar conversaciones: ${(err as any).code}`
        )
      },
      scope,
    )
    return unsub
  }, [gestoriaId, verBandejaWA, scope, setStore])

  const metricas: MetricasBandeja = calcularMetricasBandeja(conversaciones)

  const marcarLeida  = useCallback((id: string) => marcarConversacionLeida(id), [])
  const cambiarEstado = useCallback((id: string, estado: EstadoConversacion) =>
    cambiarEstadoConversacion(id, estado), [])
  // Reasignar a OTRO agente — la UI debe gatearlo con `puedeReasignar`;
  // las reglas lo imponen del lado servidor.
  const asignar      = useCallback((id: string, uid: string) => asignarAgente(id, uid), [])
  // Autoasignarse una del pool — permitido para cualquiera con acceso.
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
    puedeReasignar, verTodo,
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

export function useNoLeidosWA(): number {
  const { gestoriaId }     = useGestoria()
  const { user }           = useAuth()
  const { puede: puedeWA } = usePermisos()
  const verBandejaWA = puedeWA('verBandejaWA')
  const verTodo      = puedeWA('verTodaLaBandejaWA')
  const { conversaciones, gestoriaActiva, setConversaciones } = useConversacionesStore()

  const scope = useMemo(
    () => calcularScope(verTodo, user?.uid),
    [verTodo, user?.uid],
  )

  const yaActivo = gestoriaActiva === gestoriaId && gestoriaId !== null

  useEffect(() => {
    // ⛔ No suscribir si no tiene permiso, falta scope, o ya hay una suscripción activa
    if (!gestoriaId || !verBandejaWA || !scope || yaActivo) return

    const unsub = subscribeConversaciones(
      gestoriaId,
      data => setConversaciones(data, gestoriaId),
      true,
      err => {
        if ((err as any).code !== 'permission-denied') {
          console.warn('[useNoLeidosWA]', (err as any).code)
        }
      },
      scope,
    )
    return unsub
  }, [gestoriaId, verBandejaWA, scope, yaActivo, setConversaciones])

  if (!verBandejaWA || gestoriaActiva !== gestoriaId) return 0
  return conversaciones.reduce((acc, c) => acc + (c.noLeidos ?? 0), 0)
}