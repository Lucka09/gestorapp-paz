import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Phone, Mail,
  MapPin, FileText, Car, User, AlertTriangle, KeyRound, CheckCircle, Target, Receipt
} from 'lucide-react'
import { useCliente } from '@/hooks/useClientes'
import { useTramitesPorCliente } from '@/hooks/useTramites'
import { PanelDocumentacion } from '@/components/shared/PanelDocumentacion'
import { usePermisos } from '@/hooks/usePermisos'
import { useEquipo }   from '@/hooks/useEquipo'
import { actualizarCliente, eliminarCliente } from '@/lib/firestore/clientes'
import { Button, Card, Spinner, Badge } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import ClienteForm, { type ClienteFormData } from './ClienteForm'
import ModalAccesoPortal from './ModalAccesoPortal'
import ModalPresupuesto from '@/features/presupuestos/ModalPresupuesto'
import { PanelNotas }   from '@/components/shared/PanelNotas'
import SeguimientoPanel from './SeguimientoPanel'
import { initiales, formatFecha, nombreCompleto } from '@/utils'
import toast from 'react-hot-toast'

export default function ClienteDetallePage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { cliente, loading } = useCliente(id)

  const [editOpen,   setEditOpen]   = useState(false)
  const { tramites: tramitesCliente } = useTramitesPorCliente(id)
  const { puede } = usePermisos()
  const puedeVerDocs = puede('verObsInternas')
  const [tramiteDocAbierto, setTramiteDocAbierto] = useState<string | null>(null)
  const { equipo } = useEquipo()

  // Resolver nombre de un uid buscando en el equipo
  const resolverNombre = (uid: string): string => {
    const m = equipo.find(e => e.uid === uid)
    return m ? `${m.nombre} ${m.apellido}`.trim() : 'Usuario'
  }
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [accesoOpen, setAccesoOpen] = useState(false)
  const [presupOpen, setPresupOpen] = useState(false)
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
          <Button variant="secondary" size="sm" onClick={() => setPresupOpen(true)}>
            <Receipt size={14} /> Presupuesto
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

      {/* Trámites + Documentación */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trámites</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/tramites')}>
            <FileText size={13} /> Ver todos
          </Button>
        </div>
        {!tramitesCliente.length ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Este cliente no tiene trámites registrados.
          </p>
        ) : (
          <div className="space-y-2">
            {tramitesCliente.map(t => {
              const tieneWorkflow = ['inscripcion_inicial','descargo_multa','transferencia'].includes(t.tipo)
              const abierto = tramiteDocAbierto === t.id
              return (
                <div key={t.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* Fila del trámite */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/50">
                    <div
                      onClick={() => navigate(`/admin/tramites/${t.id}`)}
                      className="flex-1 flex items-center gap-2 cursor-pointer min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <span className="font-mono text-[11px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded tracking-wider shrink-0">
                        {t.patente || '—'}
                      </span>
                      <span className="text-sm font-semibold text-gray-700 truncate">
                        {t.tipo === 'inscripcion_inicial' ? 'Inscripción Inicial'
                         : t.tipo === 'descargo_multa'   ? 'Descargo de Multa'
                         : t.tipo === 'transferencia'     ? 'Transferencia'
                         : t.tipo}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        t.estado === 'entregado' || t.estado === 'completado'
                          ? 'bg-emerald-100 text-emerald-700'
                          : t.estado === 'cancelado'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-orange-100 text-orange-600'
                      }`}>
                        {t.estado.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {/* Creado por / Asignado a */}
                    <div className="flex items-center gap-3 px-4 pb-2.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <span className="font-medium text-gray-500">Creado por:</span>
                        {resolverNombre(t.creadoPor)}
                      </span>
                      {(t as any).asignadoNombre && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <span className="font-medium text-gray-500">Asignado:</span>
                          {(t as any).asignadoNombre}
                        </span>
                      )}
                      {!(t as any).asignadoNombre && t.asignadoA && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <span className="font-medium text-gray-500">Asignado:</span>
                          {resolverNombre(t.asignadoA)}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-300 ml-auto">
                        {t.creadoEn?.toDate?.()?.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' }) ?? '—'}
                      </span>
                    </div>
                    {/* Botón ver documentos */}
                    {puedeVerDocs && tieneWorkflow && (
                      <button
                        onClick={() => setTramiteDocAbierto(prev => prev === t.id ? null : t.id)}
                        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5
                                    rounded-lg border transition-all shrink-0 ${
                          abierto
                            ? 'bg-[#D4621A] border-[#D4621A] text-white'
                            : 'border-gray-200 text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
                        }`}
                      >
                        <FileText size={11} />
                        {abierto ? 'Ocultar docs' : 'Ver docs'}
                      </button>
                    )}
                  </div>
                  {/* Panel de documentación expandible */}
                  {puedeVerDocs && abierto && tieneWorkflow && (
                    <div className="border-t border-gray-100 p-3">
                      <PanelDocumentacion
                        tramiteId={t.id}
                        tipo={t.tipo}
                        defaultOpen={true}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
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

      {/* Notas internas */}
      {cliente && (
        <div className="mt-6 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <PanelNotas entidad="cliente" entidadId={cliente.id} />
        </div>
      )}

      {/* Modal presupuesto */}
      {cliente && (
        <ModalPresupuesto
          open={presupOpen}
          onClose={() => setPresupOpen(false)}
          cliente={cliente}
        />
      )}

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