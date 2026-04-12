import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Phone, Mail,
  MapPin, FileText, Car, User, AlertTriangle, KeyRound, CheckCircle, Target
} from 'lucide-react'
import { useCliente } from '@/hooks/useClientes'
import { actualizarCliente, eliminarCliente } from '@/lib/firestore/clientes'
import { Button, Card, Spinner, Badge } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import ClienteForm, { type ClienteFormData } from './ClienteForm'
import ModalAccesoPortal from './ModalAccesoPortal'
import SeguimientoPanel from './SeguimientoPanel'
import { initiales, formatFecha, nombreCompleto } from '@/utils'
import toast from 'react-hot-toast'

export default function ClienteDetallePage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { cliente, loading } = useCliente(id)

  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [accesoOpen, setAccesoOpen] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const handleEditar = async (data: ClienteFormData) => {
    if (!id) return
    try {
      await actualizarCliente(id, data)
      toast.success('Cliente actualizado')
      setEditOpen(false)
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const handleEliminar = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await eliminarCliente(id)
      toast.success('Cliente eliminado')
      navigate('/admin/clientes')
    } catch {
      toast.error('Error al eliminar')
      setDeleting(false)
    }
  }

  if (loading) return <Spinner />
  if (!cliente) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Cliente no encontrado.</p>
      <button onClick={() => navigate('/admin/clientes')} className="text-[#D4621A] text-sm mt-2 hover:underline">
        Volver a Clientes
      </button>
    </div>
  )

  return (
    <div className="max-w-3xl">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/admin/clientes')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} /> Volver a Clientes
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Editar
          </Button>
          {!cliente.userId ? (
            <Button size="sm" onClick={() => setAccesoOpen(true)}>
              <KeyRound size={14} /> Dar acceso
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50
                             border border-emerald-200 px-3 py-1.5 rounded-lg font-medium">
              <CheckCircle size={13} /> Portal activo
            </span>
          )}
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card className="p-6 mb-4">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-[#D4621A]/10 flex items-center justify-center
                          text-[#D4621A] font-bold text-xl shrink-0">
            {initiales(cliente.nombre, cliente.apellido)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {nombreCompleto(cliente.nombre, cliente.apellido)}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-sm text-gray-500">DNI {cliente.dni}</span>
              {cliente.cuit && <span className="text-sm text-gray-500">CUIT {cliente.cuit}</span>}
              <Badge className="bg-[#D4621A]/10 text-[#D4621A]">
                {cliente.vehiculosIds?.length ?? 0} vehículo{cliente.vehiculosIds?.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Datos de contacto */}
      <Card className="p-5 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Datos de Contacto
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={<Phone size={14} />} label="Teléfono" value={cliente.telefono} />
          <InfoRow icon={<Mail size={14} />} label="Email" value={cliente.email} />
          <InfoRow icon={<MapPin size={14} />} label="Dirección" value={cliente.direccion} />
          <InfoRow icon={<MapPin size={14} />} label="Localidad" value={cliente.localidad} />
          <InfoRow icon={<User size={14} />} label="Alta" value={formatFecha(cliente.creadoEn)} />
        </div>
        {cliente.observaciones && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Observaciones</p>
            <p className="text-sm text-gray-600">{cliente.observaciones}</p>
          </div>
        )}
      </Card>

      {/* Vehículos */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vehículos</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/vehiculos')}>
            <Car size={13} /> Ver todos
          </Button>
        </div>
        {!cliente.vehiculosIds?.length ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Este cliente no tiene vehículos registrados.
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            {cliente.vehiculosIds.length} vehículo{cliente.vehiculosIds.length !== 1 ? 's' : ''} asociado{cliente.vehiculosIds.length !== 1 ? 's' : ''}.
            Los detalles se verán en el módulo de Vehículos.
          </p>
        )}
      </Card>

      {/* Seguimiento comercial */}
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Target size={14} className="text-[#D4621A]" />
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Seguimiento Comercial
          </h2>
        </div>
        <SeguimientoPanel
          clienteId={cliente.id}
          telefono={cliente.telefono}
          nombre={cliente.nombre}
        />
      </Card>

      {/* Trámites */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trámites</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/tramites')}>
            <FileText size={13} /> Ver todos
          </Button>
        </div>
        <p className="text-sm text-gray-400 text-center py-4">
          Historial de trámites disponible en el Paso 6.
        </p>
      </Card>

      {/* Modal editar */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente" size="lg">
        <ClienteForm
          initial={cliente}
          onSubmit={handleEditar}
          onCancel={() => setEditOpen(false)}
          submitLabel="Guardar cambios"
        />
      </Modal>

      {/* Modal acceso portal */}
      {cliente && (
        <ModalAccesoPortal
          cliente={cliente}
          open={accesoOpen}
          onClose={() => setAccesoOpen(false)}
        />
      )}

      {/* Modal confirmar eliminación */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar cliente" size="sm">
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <p className="text-gray-700 font-medium mb-1">
            ¿Eliminar a {nombreCompleto(cliente.nombre, cliente.apellido)}?
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Esta acción no se puede deshacer. Los vehículos y trámites asociados no se eliminarán.
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

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  )
}

