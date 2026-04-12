import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Phone, Mail, ChevronRight } from 'lucide-react'
import { useClientesFiltrados } from '@/hooks/useClientes'
import { crearCliente } from '@/lib/firestore/clientes'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, PageHeader, EmptyState, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import ClienteForm, { type ClienteFormData } from './ClienteForm'
import { initiales, formatFecha } from '@/utils'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'
import toast from 'react-hot-toast'
import { exportarClientes } from '@/utils/exportar'
import { Download } from 'lucide-react'

export default function ClientesPage() {
  const navigate              = useNavigate()
  const { user }              = useAuth()
  const [search, setSearch]   = useState('')
  const [modalOpen, setModal] = useState(false)
  const { clientes, total, loading } = useClientesFiltrados(search)
  // Para exportar siempre el total, no solo los filtrados
  const { clientes: todosClientes } = useClientesFiltrados('')

  const handleCrear = async (data: ClienteFormData) => {
    if (!user) return
    try {
      const id = await crearCliente(data, user.uid)
      toast.success('Cliente creado correctamente')
      setModal(false)
      navigate(`/admin/clientes/${id}`)
    } catch {
      toast.error('Error al crear el cliente')
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${total} cliente${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => exportarClientes(todosClientes)}
              title="Exportar a Excel"
            >
              <Download size={15} /> Excel
            </Button>
            <Button onClick={() => setModal(true)}>
              <Plus size={16} /> Nuevo cliente
            </Button>
          </div>
        }
      />

      {/* Buscador */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, apellido, DNI, teléfono o email..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                     bg-white outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15
                     transition-all placeholder-gray-400"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : clientes.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'No hay clientes todavía'}
          description={search ? `No encontramos clientes con "${search}"` : 'Registrá el primer cliente para empezar.'}
          action={!search ? <Button onClick={() => setModal(true)}><Plus size={15} /> Nuevo cliente</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {clientes.map(c => (
            <Card key={c.id} onClick={() => navigate(`/admin/clientes/${c.id}`)} className="p-0 overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-[#D4621A]/10 flex items-center justify-center text-[#D4621A] font-bold text-sm shrink-0">
                  {initiales(c.nombre, c.apellido)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{c.apellido}, {c.nombre}</p>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">DNI {c.dni}</span>
                    {c.vehiculosIds?.length > 0 && (
                      <span className="text-xs text-[#D4621A] bg-[#D4621A]/10 px-2 py-0.5 rounded-full">
                        {c.vehiculosIds.length} vehículo{c.vehiculosIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    {c.telefono && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{c.telefono}</span>}
                    {c.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail size={11} />{c.email}</span>}
                    <span className="text-xs text-gray-400">Alta: {formatFecha(c.creadoEn)}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModal(false)} title="Nuevo Cliente" subtitle="Completá los datos del cliente" size="lg">
        <ClienteForm onSubmit={handleCrear} onCancel={() => setModal(false)} submitLabel="Crear cliente" />
      </Modal>
    </div>
  )
}
