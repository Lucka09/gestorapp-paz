// src/features/tramites/BotonComprobantePago.tsx
import { useState }              from 'react'
import { Receipt, Loader2 }      from 'lucide-react'
import { generarComprobantePago, descargarRecibo } from '@/utils/comprobantePago'
import { useConfiguracion }      from '@/hooks/useConfiguracion'
import type { Tramite }          from '@/types'
import type { Cliente }          from '@/types'
import type { Vehiculo }         from '@/types'
import toast                     from 'react-hot-toast'

interface Props {
  tramite:  Tramite
  cliente:  Cliente | null | undefined
  vehiculo: Vehiculo | null | undefined
}

export default function BotonComprobantePago({ tramite, cliente, vehiculo }: Props) {
  const [loading, setLoading]       = useState(false)
  const [modalOpen, setModalOpen]   = useState(false)
  const [metodoPago, setMetodoPago] = useState('Efectivo')
  const [periodo, setPeriodo]       = useState('')
  const [recibe, setRecibe]         = useState('')
  const { config } = useConfiguracion()

  const handleGenerar = async () => {
    setLoading(true)
    try {
      const blob = await generarComprobantePago({
        tramite,
        cliente:             cliente ?? null,
        gestoriaNombre:      config.nombreComercial ?? 'Gestoría Paz',
        gestoriaTelefono:    config.telefono1 ?? '11 3614-1431',
        gestoriaWeb:         (config as any).sitioWeb ?? '',
        gestoriaEmail:       config.email,
        gestoriaDireccion:   config.direccion,
        gestoriaResponsable: config.responsable,
        colorPrimario:       '#D4621A',
        logoUrl:             '/logo-gp.jpg',
        metodoPago,
        periodoServicio:     periodo || undefined,
        recibeConforme:      recibe || config.responsable || config.nombreComercial,
        urlSeguimiento:      `${window.location.origin}/seguimiento/${tramite.id}`,
      })
      descargarRecibo(blob, `recibo-${tramite.numero ?? tramite.id}-${tramite.patente}.pdf`)
      toast.success('Recibo generado')
      setModalOpen(false)
    } catch (e) {
      console.error(e)
      toast.error('Error al generar el recibo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl
                   border border-emerald-300 text-emerald-700 bg-emerald-50
                   hover:bg-emerald-100 transition-colors"
      >
        <Receipt size={14} /> Recibo PDF
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">Generar recibo de pago</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* Info del trámite */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Trámite</span>
                <span className="font-semibold text-gray-800">{tramite.numero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente</span>
                <span className="font-semibold text-gray-800 truncate max-w-[60%]">
                  {cliente ? `${cliente.nombre} ${cliente.apellido}` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Monto</span>
                <span className="font-bold text-emerald-700">
                  {tramite.honorarios > 0
                    ? `$${tramite.honorarios.toLocaleString('es-AR')}`
                    : 'No especificado'}
                </span>
              </div>
            </div>

            {/* Forma de pago */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Forma de pago</label>
              <div className="grid grid-cols-3 gap-1.5">
                {['Efectivo', 'Transferencia', 'Mercado Pago'].map(m => (
                  <button key={m} type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      metodoPago === m
                        ? 'bg-[#D4621A] border-[#D4621A] text-white'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >{m}</button>
                ))}
              </div>
            </div>

            {/* Período */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">
                Período (opcional)
              </label>
              <input value={periodo} onChange={e => setPeriodo(e.target.value)}
                placeholder="Ej: Mayo 2026"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
              />
            </div>

            {/* Recibe conforme */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">
                Recibe conforme (opcional)
              </label>
              <input value={recibe} onChange={e => setRecibe(e.target.value)}
                placeholder="Nombre del responsable"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
              />
            </div>

            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleGenerar}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold
                           transition-colors disabled:opacity-60"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Generando...</>
                  : <><Receipt size={14} /> Descargar recibo</>
                }
              </button>
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}