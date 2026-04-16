import { useState } from 'react'
import {
  FileText, Download, MessageCircle,
  Eye, CheckCircle, Loader2, ChevronDown, ChevronUp,
  DollarSign, Car,
} from 'lucide-react'
import Modal from '@/components/shared/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import {
  generarPresupuestoPDF, descargarPDF,
  previsualizarPDF, mensajeWhatsAppPresupuesto,
  type DatosPresupuesto,
} from '@/utils/presupuesto'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import type { Cliente } from '@/types'
import type { Vehiculo } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  open:       boolean
  onClose:    () => void
  cliente?:   Cliente
  vehiculo?:  Vehiculo
  tipoInicial?: TipoTramite
}

const NUMERO_NUEVO = () => {
  const now = new Date()
  return `PRES-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`
}

export default function ModalPresupuesto({
  open, onClose, cliente, vehiculo, tipoInicial,
}: Props) {
  const numero = NUMERO_NUEVO()

  // Formulario
  const [tipo,         setTipo]         = useState<TipoTramite>(tipoInicial ?? 'transferencia')
  const [descripcion,  setDescripcion]  = useState('')
  const [honorarios,   setHonorarios]   = useState('')
  const [incluyeGastos,setIncluyeGastos]= useState(false)
  const [gastos,       setGastos]       = useState('')
  const [formaPago,    setFormaPago]     = useState('')
  const [vencimiento,  setVencimiento]   = useState('')
  const [observaciones,setObservaciones] = useState('')

  // Cliente manual (si no se pasa un cliente)
  const [nombreM,   setNombreM]   = useState('')
  const [apellidoM, setApellidoM] = useState('')
  const [dniM,      setDniM]      = useState('')
  const [telM,      setTelM]      = useState('')
  const [emailM,    setEmailM]    = useState('')
  const [patenteM,  setPatenteM]  = useState('')
  const [marcaM,    setMarcaM]    = useState('')
  const [anioM,     setAnioM]     = useState('')

  // Estado
  const [generando, setGenerando] = useState(false)
  const [pdfBlob,   setPdfBlob]   = useState<Blob | null>(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [listo,     setListo]     = useState(false)

  const nombreCliente   = cliente ? `${cliente.nombre}`        : nombreM
  const apellidoCliente = cliente ? `${cliente.apellido}`       : apellidoM
  const dniCliente      = cliente ? cliente.dni                 : dniM
  const telCliente      = cliente ? cliente.telefono            : telM
  const emailCliente    = cliente ? (cliente.email ?? '')       : emailM
  const patenteVeh      = vehiculo ? vehiculo.patente           : patenteM
  const marcaVeh        = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : marcaM
  const anioVeh         = vehiculo ? String(vehiculo.anio)      : anioM
  const telWA           = telCliente.replace(/\D/g,'')
  const numWA           = telWA.startsWith('54') ? telWA : `549${telWA}`

  const datos = (): DatosPresupuesto => ({
    clienteNombre:     nombreCliente,
    clienteApellido:   apellidoCliente,
    clienteDni:        dniCliente,
    clienteTelefono:   telCliente,
    clienteEmail:      emailCliente || undefined,
    patente:           patenteVeh  || undefined,
    marcaModelo:       marcaVeh    || undefined,
    anio:              anioVeh     || undefined,
    tipoTramite:       tipo,
    descripcion:       descripcion || undefined,
    honorarios:        parseFloat(honorarios) || 0,
    incluyeGastos,
    gastosAdicionales: incluyeGastos ? (parseFloat(gastos) || 0) : undefined,
    formaPago:         formaPago   || undefined,
    numero,
    fechaVencimiento:  vencimiento || undefined,
    observaciones:     observaciones || undefined,
  })

  const handleGenerar = async () => {
    if (!apellidoCliente || !nombreCliente) {
      toast.error('Completá el nombre del cliente')
      return
    }
    if (!honorarios || parseFloat(honorarios) <= 0) {
      toast.error('Ingresá el importe de honorarios')
      return
    }
    setGenerando(true)
    try {
      const { blob, nombre } = await generarPresupuestoPDF(datos())
      setPdfBlob(blob)
      setPdfNombre(nombre)
      setListo(true)
      toast.success('PDF generado correctamente')
    } catch (err: any) {
      console.error(err)
      toast.error('Error al generar el PDF')
    } finally {
      setGenerando(false)
    }
  }

  const handleDescargar = () => {
    if (pdfBlob) descargarPDF(pdfBlob, pdfNombre)
  }

  const handlePrevisualizar = () => {
    if (pdfBlob) previsualizarPDF(pdfBlob)
  }

  const handleWhatsApp = () => {
    if (!pdfBlob) return
    // Descargamos el PDF y abrimos WhatsApp
    descargarPDF(pdfBlob, pdfNombre)
    const msg = mensajeWhatsAppPresupuesto(datos(), numero)
    setTimeout(() => {
      window.open(`https://wa.me/${numWA}?text=${msg}`, '_blank')
    }, 500)
  }

  const handleNuevo = () => {
    setListo(false); setPdfBlob(null); setPdfNombre('')
    setHonorarios(''); setGastos(''); setDescripcion('')
    setObservaciones(''); setFormaPago(''); setVencimiento('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generar presupuesto"
      subtitle={cliente
        ? `Para ${cliente.apellido}, ${cliente.nombre}`
        : 'Nuevo presupuesto'
      }
      size="lg"
    >
      {!listo ? (
        // ── FORMULARIO ────────────────────────────────────────────────────
        <div className="space-y-5">

          {/* Cliente manual si no viene del contexto */}
          {!cliente && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Datos del cliente
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Apellido *" value={apellidoM} onChange={e => setApellidoM(e.target.value)} placeholder="García" />
                <Input label="Nombre *"   value={nombreM}   onChange={e => setNombreM(e.target.value)}   placeholder="Juan" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="DNI"      value={dniM}   onChange={e => setDniM(e.target.value)}   placeholder="20123456" />
                <Input label="Teléfono" value={telM}   onChange={e => setTelM(e.target.value)}   placeholder="1145678901" />
              </div>
              <Input label="Email" value={emailM} onChange={e => setEmailM(e.target.value)} placeholder="juan@mail.com" />
            </div>
          )}

          {/* Vehículo manual si no viene del contexto */}
          {!vehiculo && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Car size={12} /> Vehículo (opcional)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Patente"   value={patenteM} onChange={e => setPatenteM(e.target.value.toUpperCase())} placeholder="AB123CD" />
                <Input label="Marca/Modelo" value={marcaM} onChange={e => setMarcaM(e.target.value)} placeholder="VW Gol" />
                <Input label="Año"       value={anioM}    onChange={e => setAnioM(e.target.value)}    placeholder="2019" />
              </div>
            </div>
          )}

          {/* Tipo de trámite */}
          <Select
            label="Tipo de trámite *"
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoTramite)}
          >
            {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>

          <Textarea
            label="Descripción del servicio"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Describí brevemente el trabajo a realizar..."
            rows={2}
          />

          {/* Honorarios */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Honorarios * ($)"
              type="number"
              min={0}
              value={honorarios}
              onChange={e => setHonorarios(e.target.value)}
              placeholder="45000"
              hint="Solo números, sin el signo $"
            />
            <Select
              label="Forma de pago"
              value={formaPago}
              onChange={e => setFormaPago(e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="mixto">Mixto</option>
            </Select>
          </div>

          {/* Gastos adicionales */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={incluyeGastos}
                onChange={e => setIncluyeGastos(e.target.checked)}
                className="w-4 h-4 rounded accent-[#D4621A]"
              />
              <span className="text-sm text-gray-700">Incluir gastos y sellados adicionales</span>
            </label>
            {incluyeGastos && (
              <Input
                label="Monto gastos adicionales ($)"
                type="number"
                min={0}
                value={gastos}
                onChange={e => setGastos(e.target.value)}
                placeholder="5000"
              />
            )}
          </div>

          {/* Vencimiento */}
          <Input
            label="Válido hasta (opcional)"
            type="date"
            value={vencimiento}
            onChange={e => setVencimiento(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            hint="Si no se completa, el presupuesto no tiene fecha de vencimiento"
          />

          <Textarea
            label="Observaciones (opcional)"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Condiciones especiales, notas importantes, etc."
            rows={2}
          />

          {/* Preview de importes */}
          {honorarios && parseFloat(honorarios) > 0 && (
            <div className="bg-[var(--gp-orange-pale)] border border-orange-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Honorarios</span>
                <span className="text-sm font-semibold">
                  ${parseFloat(honorarios).toLocaleString('es-AR')}
                </span>
              </div>
              {incluyeGastos && gastos && parseFloat(gastos) > 0 && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Gastos y sellados</span>
                  <span className="text-sm font-semibold">
                    ${parseFloat(gastos).toLocaleString('es-AR')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-orange-100">
                <span className="text-sm font-bold" style={{ color: 'var(--gp-orange)' }}>
                  TOTAL
                </span>
                <span className="text-base font-bold" style={{ color: 'var(--gp-orange)' }}>
                  ${(parseFloat(honorarios) + (incluyeGastos && gastos ? parseFloat(gastos) : 0)).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button
              onClick={handleGenerar}
              loading={generando}
              className="flex-1"
            >
              <FileText size={15} /> Generar PDF
            </Button>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      ) : (
        // ── PANTALLA DE ÉXITO ─────────────────────────────────────────────
        <div className="space-y-5">
          {/* Éxito */}
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200
                          rounded-xl px-4 py-3">
            <CheckCircle size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700">PDF generado correctamente</p>
              <p className="text-xs text-emerald-600 mt-0.5">{pdfNombre}</p>
            </div>
          </div>

          {/* Resumen del presupuesto */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Número</span>
              <span className="font-mono font-semibold text-gray-800">{numero}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cliente</span>
              <span className="font-semibold text-gray-800">
                {apellidoCliente}, {nombreCliente}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Servicio</span>
              <span className="font-semibold text-gray-800">{TIPO_TRAMITE_LABELS[tipo]}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
              <span className="font-bold" style={{ color: 'var(--gp-orange)' }}>Total</span>
              <span className="font-bold text-base" style={{ color: 'var(--gp-orange)' }}>
                ${(parseFloat(honorarios) + (incluyeGastos && gastos ? parseFloat(gastos) : 0)).toLocaleString('es-AR')}
              </span>
            </div>
          </div>

          {/* Acciones */}
          <div className="space-y-3">
            {/* WhatsApp — acción principal */}
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-3 rounded-xl py-3.5
                         font-semibold text-white transition-colors"
              style={{
                background: '#25D366',
                boxShadow: '0 4px 16px rgba(37,211,102,0.30)',
              }}
            >
              <MessageCircle size={18} />
              Descargar PDF y abrir WhatsApp
            </button>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={handlePrevisualizar}>
                <Eye size={15} /> Previsualizar
              </Button>
              <Button variant="secondary" onClick={handleDescargar}>
                <Download size={15} /> Solo descargar
              </Button>
            </div>

            <button
              onClick={handleNuevo}
              className="w-full text-center text-sm font-medium"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-4)', padding: '8px',
                fontFamily: 'var(--font-body)',
              }}
            >
              Generar otro presupuesto
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
