import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, DollarSign, User,
  Car, Clock, FileText, CheckCircle, XCircle
} from 'lucide-react'
import { useTramite } from '@/hooks/useTramites'
import { useCliente } from '@/hooks/useClientes'
import { useVehiculo } from '@/hooks/useVehiculos'
import { cambiarEstado, actualizarTramite, marcarPagado } from '@/lib/firestore/tramites'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, Spinner, Badge } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import { EstadoBadge, EstadoSelector } from './EstadoBadge'
import { BotonQR }        from './BotonQR'
import BotonComprobante   from './BotonComprobante'
import { PanelNotas }  from '@/components/shared/PanelNotas'
import { TIPO_TRAMITE_LABELS, type EstadoTramite } from '@/types'
import { formatFecha, formatFechaHora, formatPesos, nombreCompleto } from '@/utils'
import toast from 'react-hot-toast'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function TramiteDetallePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const { tramite, loading } = useTramite(id)
  usePageTitle(tramite ? `${tramite.numero} · ${tramite.patente}` : 'Trámite')
  const { cliente } = useCliente(tramite?.clienteId)
  const { vehiculo } = useVehiculo(tramite?.vehiculoId)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ descripcion: '', observacionesInternas: '', honorarios: 0 })

  const handleCambiarEstado = async (nuevo: EstadoTramite, nota: string) => {
    if (!tramite || !user) return
    try {
      await cambiarEstado(id!, nuevo, nota, user.uid, tramite.estado)
      toast.success(`Estado actualizado → ${nuevo.replace(/_/g, ' ')}`)
    } catch {
      toast.error('Error al cambiar el estado')
    }
  }

  const handlePago = async () => {
    if (!tramite) return
    try {
      await marcarPagado(id!, !tramite.pagado)
      toast.success(tramite.pagado ? 'Marcado como pendiente de pago' : '¡Pago registrado!')
    } catch {
      toast.error('Error al actualizar el pago')
    }
  }

  const abrirEdicion = () => {
    if (!tramite) return
    setEditForm({
      descripcion:           tramite.descripcion,
      observacionesInternas: tramite.observacionesInternas,
      honorarios:            tramite.honorarios,
    })
    setEditOpen(true)
  }

  const handleGuardar = async () => {
    if (!id) return
    try {
      await actualizarTramite(id, editForm)
      toast.success('Trámite actualizado')
      setEditOpen(false)
    } catch {
      toast.error('Error al guardar')
    }
  }

  if (loading) return <Spinner />
  if (!tramite) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Trámite no encontrado.</p>
      <button onClick={() => navigate('/admin/tramites')} className="text-[#D4621A] text-sm mt-2 hover:underline">
        Volver a Trámites
      </button>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-4">

      {/* Topbar */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/admin/tramites')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Volver a Trámites
        </button>
        <Button variant="secondary" size="sm" onClick={abrirEdicion}>
          <Pencil size={14} /> Editar
        </Button>
      </div>

      {/* Header principal */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-xs text-gray-400 mb-1">{tramite.numero}</p>
            <h1 className="text-xl font-bold text-gray-900">
              {TIPO_TRAMITE_LABELS[tramite.tipo]}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-lg tracking-widest font-bold">
                {tramite.patente}
              </span>
              <span className="text-xs text-gray-400">
                Creado: {formatFecha(tramite.creadoEn)}
              </span>
              <span className="text-xs text-gray-400">
                Actualizado: {formatFecha(tramite.actualizadoEn)}
              </span>
            </div>
          </div>
          {/* Acciones */}
          <div className="shrink-0 flex items-start gap-2">
            <BotonComprobante tramite={tramite} cliente={cliente} vehiculo={vehiculo} />
            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Estado</p>
              <EstadoSelector estadoActual={tramite.estado} onCambiar={handleCambiarEstado} />
            </div>
          </div>
        </div>

        {tramite.descripcion && (
          <p className="mt-4 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
            {tramite.descripcion}
          </p>
        )}
      </Card>

      {/* Honorarios */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Honorarios</p>
            <p className="text-2xl font-bold text-gray-900">
              {tramite.honorarios > 0 ? formatPesos(tramite.honorarios) : '—'}
            </p>
            {tramite.pagado && tramite.fechaPago && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Pagado el {formatFecha(tramite.fechaPago)}
              </p>
            )}
          </div>
          <button
            onClick={handlePago}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tramite.pagado
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
            }`}
          >
            {tramite.pagado
              ? <><CheckCircle size={16} /> Pagado</>
              : <><DollarSign size={16} /> Marcar pagado</>
            }
          </button>
        </div>
      </Card>

      {/* Cliente y Vehículo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
          </div>
          {cliente ? (
            <button
              onClick={() => navigate(`/admin/clientes/${tramite.clienteId}`)}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-[#D4621A]/5
                         rounded-xl border border-gray-100 hover:border-[#D4621A]/20 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[#D4621A]/10 flex items-center justify-center
                              text-[#D4621A] font-bold text-xs shrink-0">
                {cliente.nombre[0]}{cliente.apellido[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {nombreCompleto(cliente.nombre, cliente.apellido)}
                </p>
                <p className="text-xs text-gray-400">DNI {cliente.dni} · {cliente.telefono}</p>
              </div>
            </button>
          ) : <p className="text-sm text-gray-400">Cargando...</p>}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Car size={14} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vehículo</p>
          </div>
          {vehiculo ? (
            <button
              onClick={() => navigate(`/admin/vehiculos/${tramite.vehiculoId}`)}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-[#D4621A]/5
                         rounded-xl border border-gray-100 hover:border-[#D4621A]/20 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                <Car size={16} className="text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-bold font-mono text-gray-800 tracking-widest">{vehiculo.patente}</p>
                <p className="text-xs text-gray-400">{vehiculo.marca} {vehiculo.modelo} · {vehiculo.anio}</p>
              </div>
            </button>
          ) : <p className="text-sm text-gray-400">Cargando...</p>}
        </Card>
      </div>

      {/* Notas internas */}
      {tramite && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <PanelNotas entidad="tramite" entidadId={tramite.id} />
        </div>
      )}

      {/* Historial de estados */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={14} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Historial de estados
          </p>
        </div>
        {!tramite.historialEstados?.length ? (
          <p className="text-sm text-gray-400 text-center py-3">Sin cambios de estado registrados.</p>
        ) : (
          <div className="space-y-3">
            {[...tramite.historialEstados].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#D4621A] mt-2 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EstadoBadge estado={h.estadoAnterior} />
                    <span className="text-gray-300 text-xs">→</span>
                    <EstadoBadge estado={h.estadoNuevo} />
                    <span className="text-xs text-gray-400">
                      {h?.fecha ? formatFechaHora(h.fecha as any) : ''}
                    </span>
                  </div>
                  {h.nota && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{h.nota}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Observaciones internas */}
      {tramite.observacionesInternas && (
        <Card className="p-5 border-l-4 border-l-amber-400">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">
            Observaciones internas
          </p>
          <p className="text-sm text-gray-600">{tramite.observacionesInternas}</p>
        </Card>
      )}

      {/* Modal editar */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Trámite" size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Descripción
            </label>
            <textarea
              value={editForm.descripcion}
              onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A] resize-none placeholder-gray-400"
              placeholder="Detalle del trámite..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Honorarios ($)
            </label>
            <input
              type="number"
              min={0}
              value={editForm.honorarios}
              onChange={e => setEditForm(p => ({ ...p, honorarios: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Observaciones internas
            </label>
            <textarea
              value={editForm.observacionesInternas}
              onChange={e => setEditForm(p => ({ ...p, observacionesInternas: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A] resize-none placeholder-gray-400"
              placeholder="Solo visible para el equipo..."
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleGuardar} className="flex-1">Guardar cambios</Button>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}