import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight } from 'lucide-react'
import { useVehiculosFiltrados } from '@/hooks/useVehiculos'
import { useCliente } from '@/hooks/useClientes'
import { crearVehiculo } from '@/lib/firestore/vehiculos'
import { Button, Card, PageHeader, Spinner, Badge } from '@/components/ui'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'
import Modal from '@/components/shared/Modal'
import VehiculoForm, { type VehiculoFormData } from './VehiculoForm'
import { TIPO_VEHICULO_LABELS } from '@/types'
import toast from 'react-hot-toast'

// Subcomponente: muestra el nombre del titular
function TitularNombre({ clienteId }: { clienteId: string }) {
  const { cliente } = useCliente(clienteId)
  if (!cliente) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className="text-xs text-gray-500">
      {cliente.apellido}, {cliente.nombre}
    </span>
  )
}

const TIPO_COLORS: Record<string, string> = {
  auto:       'bg-blue-100 text-blue-700',
  moto:       'bg-orange-100 text-orange-700',
  camion:     'bg-purple-100 text-purple-700',
  utilitario: 'bg-emerald-100 text-emerald-700',
  otro:       'bg-gray-100 text-gray-600',
}

export default function VehiculosPage() {
  const navigate              = useNavigate()
  const [search, setSearch]   = useState('')
  const [modalOpen, setModal] = useState(false)
  const { vehiculos, total, loading } = useVehiculosFiltrados(search)

  const handleCrear = async (data: VehiculoFormData) => {
    try {
      // TODO: Replace with actual gestoriaId from auth context or props
      const gestoriaId = '' // Get from your auth/context
      const id = await crearVehiculo({ ...data, gestoriaId })
      toast.success('Vehículo registrado correctamente')
      setModal(false)
      navigate(`/admin/vehiculos/${id}`)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.message === 'YA_EXISTE')
        toast.error('Ya existe un vehículo con esa patente')
      else
        toast.error('Error al registrar el vehículo')
    }
  }

  return (
    <div>
      <PageHeader
        title="Vehículos"
        subtitle={`${total} vehículo${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={16} /> Nuevo vehículo
          </Button>
        }
      />

      {/* Buscador */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por patente, marca, modelo, color o año..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                     bg-white outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15
                     transition-all placeholder-gray-400"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : vehiculos.length === 0 ? (
        <EmptyStateIllustrated
          tipo={search ? 'busqueda' : 'vehiculos'}
          titulo={search ? 'Sin resultados' : 'Sin vehículos'}
          descripcion={search ? `No encontramos vehículos con "${search}"` : undefined}
          accion={!search ? <Button onClick={() => setModal(true)}><Plus size={15} /> Nuevo vehículo</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {vehiculos.map(v => (
            <Card key={v.id} onClick={() => navigate(`/admin/vehiculos/${v.id}`)} className="p-0 overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                {/* Ícono tipo */}
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                </div>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Patente destacada */}
                    <span className="font-mono font-bold text-gray-900 text-sm bg-gray-100 px-2.5 py-0.5 rounded-lg tracking-widest">
                      {v.patente}
                    </span>
                    <Badge className={TIPO_COLORS[v.tipo] ?? 'bg-gray-100 text-gray-600'}>
                      {TIPO_VEHICULO_LABELS[v.tipo]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-gray-700 font-medium">
                      {v.marca} {v.modelo}
                    </span>
                    <span className="text-xs text-gray-400">{v.anio}</span>
                    {v.color && <span className="text-xs text-gray-400">{v.color}</span>}
                    <span className="text-xs text-gray-400">
                      Titular: <TitularNombre clienteId={v.clienteId} />
                    </span>
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModal(false)} title="Nuevo Vehículo" subtitle="Completá los datos del vehículo" size="lg">
        <VehiculoForm
          onSubmit={handleCrear}
          onCancel={() => setModal(false)}
          submitLabel="Registrar vehículo"
        />
      </Modal>
    </div>
  )
}
