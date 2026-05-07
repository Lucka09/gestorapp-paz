// src/features/tramites/BotonComprobante.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Botón para generar y descargar el comprobante PDF de un trámite.
// Se integra en TramiteDetallePage.
// ─────────────────────────────────────────────────────────────────────────────

import { useState }           from 'react'
import { FileDown, Loader2 }  from 'lucide-react'
import { generarComprobantePDF, descargarComprobante } from '@/utils/comprobanteTramite'
import { useGestoria }        from '@/context/GestoriaContext'
import { useConfiguracion }   from '@/hooks/useConfiguracion'
import type { Tramite, Cliente, Vehiculo } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  tramite:  Tramite
  cliente:  Cliente | null
  vehiculo: Vehiculo | null
  size?:    'sm' | 'md'
  variant?: 'button' | 'icon'   // 'icon' = solo ícono sin texto
}

export default function BotonComprobante({
  tramite, cliente, vehiculo,
  size = 'sm', variant = 'button',
}: Props) {
  const [generando, setGenerando] = useState(false)
  const { nombreComercial, colorPrimario, logoUrl } = useGestoria()
  const { config } = useConfiguracion()

  const handleGenerar = async () => {
    if (generando) return
    setGenerando(true)
    const toastId = toast.loading('Generando comprobante...')
    try {
      const { blob, nombre } = await generarComprobantePDF({
        tramite,
        cliente,
        vehiculo,
        // Datos de la gestoría desde configuración
        gestoriaNombre:       config.nombreComercial  ?? nombreComercial,
        gestoriaResponsable:  config.responsable      ?? undefined,
        gestoriaTelefono1:    config.telefono1        ?? '',
        gestoriaTelefono2:    config.telefono2        ?? undefined,
        gestoriaEmail:        config.email            ?? '',
        gestoriaWeb:          config.redesSociales?.web ?? undefined,
        gestoriaDireccion:    config.direccion        ?? undefined,
        gestoriaLocalidad:    config.localidad        ?? undefined,
        bancoCbu:             config.datosBancarios?.cbu     ?? undefined,
        bancoAlias:           config.datosBancarios?.alias   ?? undefined,
        bancoTitular:         config.datosBancarios?.titular ?? undefined,
        // Branding
        colorPrimario,
        logoUrl,
      })
      descargarComprobante(blob, nombre)
      toast.success('Comprobante descargado', { id: toastId })
    } catch (err) {
      console.error('[Comprobante]', err)
      toast.error('Error al generar el comprobante', { id: toastId })
    } finally {
      setGenerando(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleGenerar}
        disabled={generando}
        aria-label="Descargar comprobante PDF"
        title="Descargar comprobante PDF"
        className={`flex items-center justify-center rounded-xl border border-gray-200
                    bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700
                    transition-all disabled:opacity-50 ${
          size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
        }`}
      >
        {generando
          ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" />
          : <FileDown size={size === 'sm' ? 14 : 16} />
        }
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleGenerar}
      disabled={generando}
      className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-white
                  text-gray-600 font-medium hover:border-gray-300 hover:text-gray-800
                  transition-all disabled:opacity-50 ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      }`}
    >
      {generando
        ? <Loader2 size={14} className="animate-spin" />
        : <FileDown size={14} />
      }
      {generando ? 'Generando...' : 'Comprobante PDF'}
    </button>
  )
}