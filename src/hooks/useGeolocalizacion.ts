// src/hooks/useGeolocalizacion.ts
// ─── HOOK DE GEOLOCALIZACIÓN ──────────────────────────────────────────────────
// Wrapper sobre la API nativa del browser.
// Usado en el workflow de inscripción inicial para registrar la presencia del
// gestor en el registro (P5 presentación, P6 retiro/postergar chapa patente).
//
// Principios de diseño:
// - No bloquea el workflow: si falla, devuelve null y el paso igual avanza.
// - No requiere APIs externas para funcionar (reverse geocode es opcional).
// - Solo debe usarse desde GestorTramitePage (celular, GPS activo).

import { useState, useCallback } from 'react'
import { Timestamp }             from 'firebase/firestore'
import type { GeoRegistro }      from '@/types/torre.types'

export type EstadoGeo =
  | 'idle'       // sin acción
  | 'capturando' // esperando respuesta del GPS
  | 'ok'         // coordenadas obtenidas
  | 'error'      // error técnico (timeout, GPS apagado)
  | 'denegado'   // el usuario negó el permiso

// ─── REVERSE GEOCODING (Nominatim / OpenStreetMap) ────────────────────────────
// Gratuito, sin API key, 1 req/segundo de límite (más que suficiente).
// Si falla por cualquier motivo, no rompe el flujo — simplemente no hay dirección.

async function obtenerDireccionAprox(lat: number, lng: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`
    const res  = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(5000),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    const a    = data.address ?? {}
    // Construir dirección legible: Calle, Localidad, Provincia
    const partes = [
      a.road || a.pedestrian || a.footway || a.street,
      a.house_number,
      a.city || a.town || a.village || a.suburb || a.municipality,
      a.state,
    ].filter(Boolean)
    if (partes.length >= 2) return partes.slice(0, 3).join(', ')
    // Fallback: primeras 2 partes del display_name
    return data.display_name?.split(',').slice(0, 2).join(',').trim()
  } catch {
    return undefined  // silencioso — la geo sigue siendo válida sin dirección
  }
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

interface UseGeolocalizacionReturn {
  estado:    EstadoGeo
  ubicacion: GeoRegistro | null
  error:     string | null
  /** Captura la posición actual. Resuelve con GeoRegistro o null si falla. */
  capturar:  () => Promise<GeoRegistro | null>
  limpiar:   () => void
}

export function useGeolocalizacion(): UseGeolocalizacionReturn {
  const [estado,    setEstado]    = useState<EstadoGeo>('idle')
  const [ubicacion, setUbicacion] = useState<GeoRegistro | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  const capturar = useCallback((): Promise<GeoRegistro | null> => {
    // Si el browser no soporta geo (muy raro en móvil, posible en desktop viejo)
    if (!navigator?.geolocation) {
      setEstado('error')
      setError('Tu dispositivo no soporta geolocalización.')
      return Promise.resolve(null)
    }

    setEstado('capturando')
    setError(null)

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords
          // Reverse geocode en paralelo — timeout propio de 5s
          const direccionAprox = await obtenerDireccionAprox(lat, lng)
          const geo: GeoRegistro = {
            lat,
            lng,
            precisionM:   Math.round(accuracy),
            capturadaEn:  Timestamp.now(),
            direccionAprox,
          }
          setUbicacion(geo)
          setEstado('ok')
          resolve(geo)
        },
        err => {
          const denegado = err.code === 1  // GeolocationPositionError.PERMISSION_DENIED
          setEstado(denegado ? 'denegado' : 'error')
          setError(
            denegado
              ? 'Permiso de ubicación denegado. Activalo en la configuración del navegador.'
              : 'No se pudo obtener la ubicación. Verificá que el GPS esté activo.',
          )
          resolve(null)  // no bloquea — el caller decide si continuar igual
        },
        {
          enableHighAccuracy: true,
          timeout:            10_000,  // 10 segundos máximo
          maximumAge:         60_000,  // acepta cache de hasta 1 minuto
        },
      )
    })
  }, [])

  const limpiar = useCallback(() => {
    setEstado('idle')
    setUbicacion(null)
    setError(null)
  }, [])

  return { estado, ubicacion, error, capturar, limpiar }
}