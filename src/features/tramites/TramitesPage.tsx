import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight, Clock, DollarSign, User } from 'lucide-react'
import { useTramitesFiltrados, type TramitesFiltros } from '@/hooks/useTramites'
import { crearTramite } from '@/lib/firestore/tramites'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, PageHeader, Spinner } from '@/components/ui'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'
import Modal from '@/components/shared/Modal'
import TramiteForm from './TramiteForm'
import { EstadoBadge } from './EstadoBadge'
import NumeroBadge from '@/components/shared/NumeroBadge'
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
import { usePageTitle }  from '@/hooks/usePageTitle'
import { useGestoriaId } from '@/context/GestoriaContext'

const ESTADOS: EstadoTramite[] = [
  'pendiente','en_proceso','documentacion_requerida',
  'en_organismo','listo_para_retirar','entregado','cancelado',
]

export default function TramitesPage() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const gestoriaId = useGestoriaId()
  usePageTitle('Trámites')
  // Vista única mobile-first — no requiere toggle
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

      {/* Lista / Tabla */}
      {loading ? (
        <SkeletonTramites />
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
        /* ── LISTA UNIFICADA mobile-first ── */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm animate-fadein">

          {/* Cabecera desktop */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100
                          text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <span className="w-[76px] shrink-0">N°</span>
            <span className="flex-1">Trámite</span>
            <span className="w-[160px] shrink-0">Cliente</span>
            <span className="w-[110px] shrink-0">Estado</span>
            <span className="w-[90px] shrink-0 text-right">Honorarios</span>
            <span className="w-[80px] shrink-0">Fecha</span>
            <span className="w-4 shrink-0" />
          </div>

          {tramites.map((t, idx) => {
            const cli = clientes.find(c => c.id === t.clienteId)
            return (
              <div
                key={t.id}
                onClick={() => navigate(`/admin/tramites/${t.id}`)}
                className={`group cursor-pointer transition-colors hover:bg-[#D4621A]/[0.03] active:bg-[#D4621A]/[0.06]
                  ${idx !== 0 ? 'border-t border-gray-50' : ''}`}
              >
                {/* ── MÓVIL ─────────────────────────────────────────────── */}
                <div className="md:hidden px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <NumeroBadge numero={t.numero} tipo={t.tipo} size="sm" />
                    <span className="font-semibold text-gray-900 text-sm flex-1 truncate">
                      {TIPO_TRAMITE_LABELS[t.tipo]}
                    </span>
                    <EstadoBadge estado={t.estado} />
                    <ChevronRight size={14} className="text-gray-300 shrink-0 group-hover:text-[#D4621A]/50" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.patente && (
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg tracking-wider">
                        {t.patente}
                      </span>
                    )}
                    {cli && (
                      <span className="text-xs font-medium text-[#D4621A] truncate">
                        {cli.nombre} {cli.apellido}
                      </span>
                    )}
                    {cli && (cli as any).origenNombre && ['concesionaria','agencia','reventa','encargado_multas'].includes((cli as any).origenCanal) && (
                      <span className="text-[10px] font-semibold bg-orange-50 text-[#D4621A] px-1.5 py-0 rounded-full shrink-0">
                        {(cli as any).origenNombre}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">{formatFecha(t.creadoEn)}</span>
                    {t.honorarios > 0 && (
                      <span className={`text-xs font-semibold ${t.pagado ? 'text-emerald-600' : 'text-orange-500'}`}>
                        {formatPesos(t.honorarios)} {t.pagado ? '· Pagado' : '· Pendiente'}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── DESKTOP ───────────────────────────────────────────── */}
                <div className="hidden md:flex items-center gap-4 px-4 py-3.5">
                  <div className="w-[76px] shrink-0">
                    <NumeroBadge numero={t.numero} tipo={t.tipo} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{TIPO_TRAMITE_LABELS[t.tipo]}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.patente && (
                        <span className="font-mono text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded tracking-wider">
                          {t.patente}
                        </span>
                      )}
                      {t.descripcion && (
                        <span className="text-[11px] text-gray-400 truncate max-w-[180px]">{t.descripcion}</span>
                      )}
                    </div>
                  </div>
                  <div className="w-[160px] shrink-0 min-w-0">
                    {cli ? (
                      <p className="text-xs font-semibold text-[#D4621A] truncate">{cli.nombre} {cli.apellido}</p>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                    {cli && (cli as any).origenNombre && ['concesionaria','agencia','reventa','encargado_multas'].includes((cli as any).origenCanal) && (
                      <p className="text-[10px] font-semibold text-[#D4621A] truncate mt-0.5 opacity-70">
                        {(cli as any).origenNombre}
                      </p>
                    )}
                    {(t as any).asignadoNombre && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{(t as any).asignadoNombre}</p>
                    )}
                  </div>
                  <div className="w-[110px] shrink-0">
                    <EstadoBadge estado={t.estado} />
                  </div>
                  <p className={`w-[90px] shrink-0 text-sm font-semibold text-right ${
                    !t.honorarios ? 'text-gray-300' : t.pagado ? 'text-emerald-600' : 'text-orange-500'
                  }`}>
                    {t.honorarios > 0 ? formatPesos(t.honorarios) : '—'}
                  </p>
                  <p className="w-[80px] shrink-0 text-xs text-gray-400">{formatFecha(t.creadoEn)}</p>
                  <ChevronRight size={13} className="text-gray-200 group-hover:text-[#D4621A]/40 transition-colors w-4 shrink-0" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModal(false)} title="Nuevo Trámite" subtitle="Completá los datos del trámite" size="lg">
        <TramiteForm gestoriaId={gestoriaId} onSubmit={handleCrear} onCancel={() => setModal(false)} />
      </Modal>
    </div>
  )
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function SkeletonTramites() {
  const n = Array.from({ length: 5 })
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      {n.map((_,i) => (
        <div key={i} className="px-4 py-4 border-b border-gray-50 last:border-0">
          <div className="md:hidden space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-4 flex-1 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="h-3.5 w-16 bg-gray-100 rounded animate-pulse" />
              <div className="h-3.5 w-28 bg-gray-100 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="h-5 w-[76px] bg-gray-200 rounded-lg animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-3.5 w-[140px] bg-gray-100 rounded-full animate-pulse shrink-0" />
            <div className="h-5 w-[100px] bg-gray-100 rounded-full animate-pulse shrink-0" />
            <div className="h-3.5 w-[80px] bg-gray-100 rounded-full animate-pulse shrink-0 ml-auto" />
            <div className="h-3 w-[70px] bg-gray-100 rounded-full animate-pulse shrink-0" />
            <div className="h-3 w-4 bg-gray-100 rounded animate-pulse shrink-0" />
          </div>
        </div>
      ))}
    </div>
  )
}