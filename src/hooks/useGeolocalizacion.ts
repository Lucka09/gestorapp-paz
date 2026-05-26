// src/hooks/useGeolocalizacion.ts
import { useState, useCallback, useEffect } from 'react'
import { Timestamp }                        from 'firebase/firestore'
import type { GeoRegistro }                 from '@/torre_types'

export type EstadoGeo =
  | 'idle'        // sin acción aún
  | 'solicitando' // pidiendo permiso al sistema
  | 'capturando'  // esperando coordenadas del GPS
  | 'ok'          // coordenadas obtenidas
  | 'error'       // timeout o GPS apagado
  | 'denegado'    // usuario negó el permiso
  | 'offline'     // sin internet (geo local igual, reverse geocode no)

// ─── REVERSE GEOCODING ────────────────────────────────────────────────────────

async function obtenerDireccionAprox(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return undefined
    const data = await res.json()
    const a    = data.address ?? {}
    const partes = [
      a.road || a.pedestrian || a.footway || a.street,
      a.house_number,
      a.city || a.town || a.village || a.suburb || a.municipality,
      a.state,
    ].filter(Boolean)
    if (partes.length >= 2) return partes.slice(0, 3).join(', ')
    return data.display_name?.split(',').slice(0, 2).join(',').trim()
  } catch {
    return undefined
  }
}

// ─── VERIFICAR PERMISO (Permissions API) ─────────────────────────────────────

export type EstadoPermiso = 'granted' | 'denied' | 'prompt' | 'unknown'

async function checkPermisoGeo(): Promise<EstadoPermiso> {
  try {
    if (!navigator?.permissions) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state as EstadoPermiso
  } catch {
    return 'unknown'
  }
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

interface UseGeolocalizacionReturn {
  estado:        EstadoGeo
  estadoPermiso: EstadoPermiso
  ubicacion:     GeoRegistro | null
  error:         string | null
  capturar:      () => Promise<GeoRegistro | null>
  solicitarPermiso: () => Promise<EstadoPermiso>
  limpiar:       () => void
}

export function useGeolocalizacion(): UseGeolocalizacionReturn {
  const [estado,        setEstado]        = useState<EstadoGeo>('idle')
  const [estadoPermiso, setEstadoPermiso] = useState<EstadoPermiso>('unknown')
  const [ubicacion,     setUbicacion]     = useState<GeoRegistro | null>(null)
  const [error,         setError]         = useState<string | null>(null)

  // Verificar el estado del permiso al montar
  useEffect(() => {
    checkPermisoGeo().then(setEstadoPermiso)

    // Escuchar cambios de permiso (Chrome/Edge soportan esto)
    if (navigator?.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        status.onchange = () => setEstadoPermiso(status.state as EstadoPermiso)
      }).catch(() => {})
    }
  }, [])

  // ── Solicitar permiso explícitamente (llamar antes de capturar) ──────────────
  const solicitarPermiso = useCallback(async (): Promise<EstadoPermiso> => {
    if (!navigator?.geolocation) return 'denied'
    setEstado('solicitando')

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setEstado('idle')
          setEstadoPermiso('granted')
          resolve('granted')
        },
        err => {
          const denegado = err.code === 1
          setEstado(denegado ? 'denegado' : 'idle')
          const ep: EstadoPermiso = denegado ? 'denied' : 'prompt'
          setEstadoPermiso(ep)
          resolve(ep)
        },
        { timeout: 3000, maximumAge: 300_000, enableHighAccuracy: false },
      )
    })
  }, [])

  // ── Captura principal ────────────────────────────────────────────────────────
  const capturar = useCallback((): Promise<GeoRegistro | null> => {
    if (!navigator?.geolocation) {
      setEstado('error')
      setError('Tu dispositivo no soporta geolocalización.')
      return Promise.resolve(null)
    }

    const isOffline = !navigator.onLine
    setEstado('capturando')
    setError(null)

    return new Promise(resolve => {
      const timeout = window.setTimeout(() => {
        // Si hay timeout pero tenemos ubicación cacheada, usarla
        if (ubicacion) {
          setEstado(isOffline ? 'offline' : 'ok')
          resolve(ubicacion)
        } else {
          setEstado('error')
          setError('No se pudo obtener la ubicación en tiempo. Verificá que el GPS esté activo.')
          resolve(null)
        }
      }, 12_000)

      navigator.geolocation.getCurrentPosition(
        async pos => {
          clearTimeout(timeout)
          const { latitude: lat, longitude: lng, accuracy } = pos.coords

          // Reverse geocode solo si hay internet
          const direccionAprox = navigator.onLine
            ? await obtenerDireccionAprox(lat, lng)
            : undefined

          const geo: GeoRegistro = {
            lat,
            lng,
            precisionM:    Math.round(accuracy),
            capturadaEn:   Timestamp.now(),
            direccionAprox,
          }
          setUbicacion(geo)
          setEstado(isOffline ? 'offline' : 'ok')
          if (isOffline) {
            setError('Sin conexión — la ubicación se registró localmente (sin dirección exacta).')
          }
          resolve(geo)
        },
        err => {
          clearTimeout(timeout)
          const denegado = err.code === 1 // PERMISSION_DENIED
          const timeout_ = err.code === 3 // TIMEOUT

          if (denegado) {
            setEstado('denegado')
            setEstadoPermiso('denied')
            setError(
              'Permiso de ubicación denegado. Para habilitarlo:\n' +
              '• Chrome/Android: Configuración → Sitios → Ubicación → Permitir\n' +
              '• Safari/iOS: Configuración → Safari → Ubicación → Permitir'
            )
          } else if (timeout_) {
            setEstado('error')
            setError('El GPS tardó demasiado. Asegurate de tener señal y GPS activo.')
          } else {
            setEstado('error')
            setError('No se pudo obtener la ubicación. Verificá que el GPS esté activo.')
          }
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout:            10_000,
          maximumAge:         60_000,
        },
      )
    })
  }, [ubicacion])

  const limpiar = useCallback(() => {
    setEstado('idle')
    setUbicacion(null)
    setError(null)
  }, [])

  return { estado, estadoPermiso, ubicacion, error, capturar, solicitarPermiso, limpiar }
}