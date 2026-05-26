// src/components/shared/AlertaGeoPermiso.tsx
// Componente que muestra el estado del permiso de geolocalización
// y guía al usuario a habilitarlo si está denegado.

import { useState } from 'react'
import type { EstadoPermiso } from '@/hooks/useGeolocalizacion'

interface Props {
  estadoPermiso: EstadoPermiso
  onSolicitar:   () => Promise<EstadoPermiso>
}

export default function AlertaGeoPermiso({ estadoPermiso, onSolicitar }: Props) {
  const [solicitando, setSolicitando] = useState(false)

  if (estadoPermiso === 'granted') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
        <span>📍</span>
        <span>Ubicación habilitada — el sistema registrará tu presencia en cada paso.</span>
      </div>
    )
  }

  if (estadoPermiso === 'denied') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
          <span>🚫</span> Permiso de ubicación bloqueado
        </p>
        <p className="text-xs text-red-600">
          La ubicación es necesaria para verificar tu presencia en el registro automotor.
          Para habilitarla:
        </p>
        <ul className="text-xs text-red-600 list-disc list-inside space-y-1">
          <li><strong>Chrome / Android:</strong> Configuración → Privacidad → Permisos del sitio → Ubicación → Permitir</li>
          <li><strong>Safari / iOS:</strong> Configuración del iPhone → Safari → Ubicación → Permitir</li>
          <li><strong>Firefox:</strong> Menú → Más opciones → Permisos → Usar tu ubicación</li>
        </ul>
        <p className="text-xs text-red-500 italic">
          Después de habilitarlo, recargá la página.
        </p>
      </div>
    )
  }

  if (estadoPermiso === 'prompt' || estadoPermiso === 'unknown') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-amber-700 flex items-center gap-2">
          <span>📍</span> Ubicación requerida para este workflow
        </p>
        <p className="text-xs text-amber-600">
          Para verificar tu presencia en el registro, GestorApp necesita acceder a tu ubicación.
          Tu posición solo se registra en los pasos que lo requieren (Paso 5 y Paso 6).
        </p>
        <button
          onClick={async () => {
            setSolicitando(true)
            await onSolicitar()
            setSolicitando(false)
          }}
          disabled={solicitando}
          className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold
                     rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {solicitando ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Solicitando permiso...
            </>
          ) : (
            '📍 Habilitar ubicación'
          )}
        </button>
        <p className="text-xs text-amber-500 text-center">
          Podés continuar sin ubicación, pero quedará registrado como no verificado.
        </p>
      </div>
    )
  }

  return null
}