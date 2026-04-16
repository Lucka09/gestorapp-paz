import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import {
  pedirPermiso, obtenerYGuardarToken,
  onMensajeForeground, getPermisoActual,
  pushSoportado, esIOS, esInstalada,
} from '@/lib/firestore/push'
import toast from 'react-hot-toast'

export type EstadoPush =
  | 'no-soportado'
  | 'ios-sin-instalar'
  | 'pendiente'
  | 'activo'
  | 'denegado'

export function usePushNotifications() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<EstadoPush>('pendiente')
  const [token,  setToken]  = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  // Determinar estado inicial
  useEffect(() => {
    if (!pushSoportado()) {
      setEstado('no-soportado')
      return
    }
    if (esIOS() && !esInstalada()) {
      setEstado('ios-sin-instalar')
      return
    }
    const perm = getPermisoActual()
    if (perm === 'granted')  setEstado('activo')
    if (perm === 'denied')   setEstado('denegado')
    if (perm === 'default')  setEstado('pendiente')
  }, [])

  // Escuchar mensajes en foreground
  useEffect(() => {
    if (estado !== 'activo') return
    const unsub = onMensajeForeground(payload => {
      const { title, body } = payload.notification ?? {}
      if (title) {
        toast(body ?? title, {
          icon: '🔔',
          duration: 5000,
          style: {
            background: 'var(--gp-black)',
            color:      'white',
            fontFamily: 'var(--font-body)',
          },
        })
      }
    })
    return unsub
  }, [estado])

  // Activar notificaciones
  const activar = useCallback(async () => {
    if (!user || cargando) return
    setCargando(true)
    try {
      const perm = await pedirPermiso()
      if (perm === 'granted') {
        const t = await obtenerYGuardarToken(user.uid)
        setToken(t)
        setEstado('activo')
        toast.success('Notificaciones activadas ✅')
      } else {
        setEstado('denegado')
        toast.error('Permiso denegado. Habilitá las notificaciones desde la configuración del browser.')
      }
    } catch (err) {
      console.error('[Push] Error al activar:', err)
      toast.error('Error al activar notificaciones')
    } finally {
      setCargando(false)
    }
  }, [user, cargando])

  return { estado, token, cargando, activar }
}
