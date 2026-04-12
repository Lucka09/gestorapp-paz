import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Car, User,
  Hash, AlertTriangle, FileText, Plus
} from 'lucide-react'
import { useVehiculo } from '@/hooks/useVehiculos'
import { useCliente } from '@/hooks/useClientes'
import { actualizarVehiculo, eliminarVehiculo } from '@/lib/firestore/vehiculos'
import { Button, Card, Badge, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import VehiculoForm, { type VehiculoFormData } from './VehiculoForm'
import { TIPO_VEHICULO_LABELS, TIPO_TRAMITE_LABELS } from '@/types'
import { formatFecha } from '@/utils'
import toast from 'react-hot-toast'

const TIPO_COLORS: Record<string, string> = {
  auto: 'bg-blue-100 text-blue-700', moto: 'bg-orange-100 text-orange-700',
  camion: 'bg-purple-100 text-purple-700', utilitario: 'bg-emerald-100 text-emerald-700',
  otro: 'bg-gray-100 text-gray-600',
}

function TitularCard({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate()
  const { cliente } = useCliente(clienteId)
  if (!cliente) return null
  return (
    <button
      onClick={() => navigate(`/admin/clientes/${clienteId}`)}
      className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-[#D4621A]/5
                 rounded-xl border border-gray-100 hover:border-[#D4621A]/20 transition-all text-left"
    >
      <div className="w-9 h-9 rounded-full bg-[#D4621A]/10 flex items-center justify-center
                      text-[#D4621A] font-bold text-xs shrink-0">
        {cliente.nombre[0]}{cliente.apellido[0]}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800">
          {cliente.apellido}, {cliente.nombre}
        </p>
        <p className="text-xs text-gray-400">DNI {cliente.dni} · {cliente.telefono}</p>
      </div>
    </button>
  )
}

export default function VehiculoDetallePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { vehiculo, loading } = useVehiculo(id)
  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const handleEditar = async (data: VehiculoFormData) => {
    if (!id) return
    try {
      const { clienteId, patente, ...rest } = data
      await actualizarVehiculo(id, rest)
      toast.success('Vehículo actualizado')
      setEditOpen(false)
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const handleEliminar = async () => {
    if (!id || !vehiculo) return
    setDeleting(true)
    try {
      await eliminarVehiculo(id, vehiculo.clienteId)
      toast.success('Vehículo eliminado')
      navigate('/admin/vehiculos')
    } catch {
      toast.error('Error al eliminar')
      setDeleting(false)
    }
  }

  if (loading) return <Spinner />
  if (!vehiculo) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Vehículo no encontrado.</p>
      <button onClick={() => navigate('/admin/vehiculos')} className="text-[#D4621A] text-sm mt-2 hover:underline">
        Volver a Vehículos
      </button>
    </div>
  )

  return (
    <div className="max-w-3xl">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/admin/vehiculos')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Volver a Vehículos
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card className="p-6 mb-4">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
            <Car size={30} className="text-gray-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-bold text-2xl text-gray-900 tracking-widest">
                {vehiculo.patente}
              </span>
              <Badge className={TIPO_COLORS[vehiculo.tipo]}>
                {TIPO_VEHICULO_LABELS[vehiculo.tipo]}
              </Badge>
            </div>
            <p className="text-gray-600 font-medium mt-1">
              {vehiculo.marca} {vehiculo.modelo} · {vehiculo.anio}
              {vehiculo.color && ` · ${vehiculo.color}`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Registrado: {formatFecha(vehiculo.creadoEn)}
            </p>
          </div>
        </div>
      </Card>

      {/* Datos técnicos */}
      <Card className="p-5 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Datos Técnicos
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow icon={<Hash size={14} />} label="Nro. de Motor"  value={vehiculo.nroMotor  || '—'} />
          <InfoRow icon={<Hash size={14} />} label="Nro. de Chasis" value={vehiculo.nroChasis || '—'} />
        </div>
      </Card>

      {/* Titular actual */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Titular Actual</h2>
          <User size={14} className="text-gray-300" />
        </div>
        <TitularCard clienteId={vehiculo.clienteId} />
      </Card>

      {/* Trámites */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trámites</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/tramites')}>
            <Plus size={13} /> Nuevo trámite
          </Button>
        </div>
        {!vehiculo.tramitesIds?.length ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Este vehículo no tiene trámites registrados.
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            {vehiculo.tramitesIds.length} trámite{vehiculo.tramitesIds.length !== 1 ? 's' : ''} asociado{vehiculo.tramitesIds.length !== 1 ? 's' : ''}.
            Disponible en Paso 6.
          </p>
        )}
      </Card>

      {/* Modal editar */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Vehículo" size="lg">
        <VehiculoForm
          initial={{
            patente: vehiculo.patente, tipo: vehiculo.tipo,
            marca: vehiculo.marca, modelo: vehiculo.modelo,
            anio: vehiculo.anio, color: vehiculo.color,
            nroMotor: vehiculo.nroMotor, nroChasis: vehiculo.nroChasis,
            clienteId: vehiculo.clienteId,
          }}
          esEdicion
          onSubmit={handleEditar}
          onCancel={() => setEditOpen(false)}
          submitLabel="Guardar cambios"
        />
      </Modal>

      {/* Modal eliminar */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar vehículo" size="sm">
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <p className="text-gray-700 font-medium mb-1">
            ¿Eliminar {vehiculo.patente}?
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Esta acción no se puede deshacer. Los trámites asociados no se eliminarán.
          </p>
          <div className="flex gap-3">
            <Button variant="danger" loading={deleting} onClick={handleEliminar} className="flex-1">
              Eliminar
            </Button>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} className="flex-1">
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800 font-mono">{value}</p>
      </div>
    </div>
  )
}
