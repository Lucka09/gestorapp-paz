import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight } from 'lucide-react'
import { useTramitesFiltrados, type TramitesFiltros } from '@/hooks/useTramites'
import { crearTramite } from '@/lib/firestore/tramites'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, PageHeader, Spinner } from '@/components/ui'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'
import Modal from '@/components/shared/Modal'
import TramiteForm from './TramiteForm'
import { EstadoBadge } from './EstadoBadge'
import {
  TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS,
  type EstadoTramite, type TipoTramite,
} from '@/types'
import { formatFecha, formatPesos } from '@/utils'
import toast from 'react-hot-toast'
import { exportarTramites } from '@/utils/exportar'
import { useClientes } from '@/hooks/useClientes'
import { Download } from 'lucide-react'
import type { TramiteInput } from '@/lib/firestore/tramites'

const ESTADOS: EstadoTramite[] = [
  'pendiente','en_proceso','documentacion_requerida',
  'en_organismo','listo_para_retirar','entregado','cancelado',
]

export default function TramitesPage() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const [modalOpen, setModal] = useState(false)
  const [filtros, setFiltros] = useState<TramitesFiltros>({
    search: '', estado: 'todos', tipo: 'todos',
  })
  const { tramites, total, loading } = useTramitesFiltrados(filtros)
  const { tramites: todosTramites } = useTramitesFiltrados({ search: '', estado: 'todos', tipo: 'todos' })
  const { clientes } = useClientes()

  const handleCrear = async (data: TramiteInput) => {
    if (!user) return
    try {
      const id = await crearTramite(data, user.uid)
      toast.success(`Trámite creado — ${data.patente}`)
      setModal(false)
      navigate(`/admin/tramites/${id}`)
    } catch {
      toast.error('Error al crear el trámite')
    }
  }

  const pendientes = tramites.filter(t =>
    ['pendiente','en_proceso','documentacion_requerida','en_organismo'].includes(t.estado)
  ).length

  return (
    <div>
      <PageHeader
        title="Trámites"
        subtitle={`${total} en total · ${pendientes} activo${pendientes !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => exportarTramites(todosTramites, clientes)}
              title="Exportar a Excel"
            >
              <Download size={15} /> Excel
            </Button>
            <Button onClick={() => setModal(true)}>
              <Plus size={16} /> Nuevo trámite
            </Button>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filtros.search}
            onChange={e => setFiltros(f => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por número, patente o descripción..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white
                       outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15
                       transition-all placeholder-gray-400"
          />
        </div>

        {/* Filtro estado */}
        <select
          value={filtros.estado}
          onChange={e => setFiltros(f => ({ ...f, estado: e.target.value as EstadoTramite | 'todos' }))}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white
                     outline-none focus:border-[#D4621A] text-gray-700 cursor-pointer"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_TRAMITE_LABELS[e]}</option>
          ))}
        </select>

        {/* Filtro tipo */}
        <select
          value={filtros.tipo}
          onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value as TipoTramite | 'todos' }))}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white
                     outline-none focus:border-[#D4621A] text-gray-700 cursor-pointer"
        >
          <option value="todos">Todos los tipos</option>
          {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite,string][]).map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <Spinner />
      ) : tramites.length === 0 ? (
        <EmptyStateIllustrated
          tipo={filtros.search || filtros.estado !== 'todos' || filtros.tipo !== 'todos' ? 'busqueda' : 'tramites'}
          titulo={filtros.search || filtros.estado !== 'todos' || filtros.tipo !== 'todos' ? 'Sin resultados' : 'Sin trámites'}
          descripcion={filtros.search || filtros.estado !== 'todos' || filtros.tipo !== 'todos'
            ? 'No hay trámites que coincidan con los filtros.' : undefined}
          accion={filtros.estado === 'todos' && filtros.tipo === 'todos' && !filtros.search
            ? <Button onClick={() => setModal(true)}><Plus size={15} />Nuevo trámite</Button>
            : undefined}
        />
      ) : (
        <div className="space-y-2">
          {tramites.map(t => (
            <Card key={t.id} onClick={() => navigate(`/admin/tramites/${t.id}`)} className="p-0 overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                {/* Número */}
                <div className="shrink-0 hidden sm:block">
                  <p className="font-mono text-xs text-gray-400">{t.numero}</p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">
                      {TIPO_TRAMITE_LABELS[t.tipo]}
                    </span>
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg tracking-wider">
                      {t.patente}
                    </span>
                    <EstadoBadge estado={t.estado} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {t.descripcion && (
                      <span className="text-xs text-gray-500 truncate max-w-xs">{t.descripcion}</span>
                    )}
                    <span className="text-xs text-gray-400">{formatFecha(t.creadoEn)}</span>
                    {t.honorarios > 0 && (
                      <span className={`text-xs font-medium ${t.pagado ? 'text-emerald-600' : 'text-orange-500'}`}>
                        {formatPesos(t.honorarios)} {t.pagado ? '· Pagado' : '· Pendiente'}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModal(false)} title="Nuevo Trámite" subtitle="Completá los datos del trámite" size="lg">
        <TramiteForm onSubmit={handleCrear} onCancel={() => setModal(false)} />
      </Modal>
    </div>
  )
}
