import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight, ChevronLeft, Download, Loader2 } from 'lucide-react'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useTramitesPaginados } from '@/hooks/useTramites'
import { crearTramite } from '@/lib/firestore/tramites'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, PageHeader, Spinner } from '@/components/ui'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'
import Modal from '@/components/shared/Modal'
import TramiteForm, { type TramiteFormData } from './TramiteForm'
import { EstadoBadge } from './EstadoBadge'
import {
  TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS,
  type EstadoTramite, type TipoTramite,
} from '@/types'
import { formatFecha, formatPesos } from '@/utils'
import toast from 'react-hot-toast'

const ESTADOS: EstadoTramite[] = [
  'pendiente', 'en_proceso', 'documentacion_requerida',
  'en_organismo', 'listo_para_retirar', 'entregado', 'cancelado',
]

// ─── BARRA DE PAGINACIÓN ─────────────────────────────────────────────────────

function PaginacionBar({
  page, hasPrev, hasNext, loading, count, total, isSearching,
  onPrev, onNext,
}: {
  page:        number
  hasPrev:     boolean
  hasNext:     boolean
  loading:     boolean
  count:       number
  total:       number
  isSearching: boolean
  onPrev:      () => void
  onNext:      () => void
}) {
  if (isSearching) {
    return (
      <p className="text-center text-xs text-gp-text-4 mt-4 pt-4 border-t border-gp-border">
        {count} resultado{count !== 1 ? 's' : ''} encontrado{count !== 1 ? 's' : ''}
      </p>
    )
  }

  const desde = (page - 1) * 25 + 1
  const hasta = (page - 1) * 25 + count

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gp-border">
      <p className="text-xs text-gp-text-4">
        {total > 0 ? `${desde}–${hasta} de ${total} trámites` : 'Sin trámites'}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary" size="sm"
          onClick={onPrev}
          disabled={!hasPrev || loading}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} /> Anterior
        </Button>
        <span className="text-xs text-gp-text-3 px-1 tabular-nums">{page}</span>
        <Button
          variant="secondary" size="sm"
          onClick={onNext}
          disabled={!hasNext || loading}
          aria-label="Página siguiente"
        >
          Siguiente <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function TramitesPage() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const gestoriaId = useGestoriaId()
  const [modalOpen, setModal] = useState(false)

  // Filtros server-side (estado y tipo)
  const [estado, setEstado] = useState<EstadoTramite | 'todos'>('todos')
  const [tipo,   setTipo]   = useState<TipoTramite   | 'todos'>('todos')

  const {
    tramites, total, loading,
    page, hasPrev, hasNext, goNext, goPrev,
    search, setSearch, isSearching, searchLoading,
    exportar, exportLoading,
  } = useTramitesPaginados({ estado, tipo })

  const handleCrear = async (data: TramiteFormData) => {
    if (!user) return
    try {
      const id = await crearTramite({ ...data, gestoriaId }, user.uid)
      toast.success(`Trámite creado — ${data.patente}`)
      setModal(false)
      navigate(`/admin/tramites/${id}`)
    } catch {
      toast.error('Error al crear el trámite')
    }
  }

  const handleExportar = async () => {
    try {
      await exportar()
      toast.success('Exportación lista')
    } catch {
      toast.error('Error al exportar')
    }
  }

  // Para el header subtitle: muestra activos según la página actual
  const activos = tramites.filter(t =>
    ['pendiente', 'en_proceso', 'documentacion_requerida', 'en_organismo'].includes(t.estado)
  ).length

  const hayFiltros = estado !== 'todos' || tipo !== 'todos' || isSearching

  return (
    <div>
      <PageHeader
        title="Trámites"
        subtitle={
          isSearching
            ? `${tramites.length} resultado${tramites.length !== 1 ? 's' : ''}`
            : `${total} en total${estado !== 'todos' ? ` · filtrado por ${ESTADO_TRAMITE_LABELS[estado as EstadoTramite]}` : ''}`
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary" size="sm"
              onClick={handleExportar}
              loading={exportLoading}
              title="Exportar trámites a Excel (respeta filtros activos)"
            >
              {!exportLoading && <Download size={15} />}
              Excel
            </Button>
            <Button onClick={() => setModal(true)}>
              <Plus size={16} /> Nuevo trámite
            </Button>
          </div>
        }
      />

      {/* Barra de filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">

        {/* Búsqueda de texto */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, patente o descripción..."
            aria-label="Buscar trámites"
            className="w-full pl-10 pr-10 py-2.5 border border-gp-border rounded-gp-xl text-sm bg-white
                       outline-none focus:border-gp-orange focus:ring-2 focus:ring-gp-orange/15
                       transition-all placeholder-gray-400"
          />
          {searchLoading && (
            <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Filtro estado — server-side */}
        <select
          value={estado}
          onChange={e => setEstado(e.target.value as EstadoTramite | 'todos')}
          aria-label="Filtrar por estado"
          className="border border-gp-border rounded-gp-xl px-3 py-2.5 text-sm bg-white
                     outline-none focus:border-gp-orange text-gp-text-2 cursor-pointer"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_TRAMITE_LABELS[e]}</option>
          ))}
        </select>

        {/* Filtro tipo — server-side */}
        <select
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoTramite | 'todos')}
          aria-label="Filtrar por tipo"
          className="border border-gp-border rounded-gp-xl px-3 py-2.5 text-sm bg-white
                     outline-none focus:border-gp-orange text-gp-text-2 cursor-pointer"
        >
          <option value="todos">Todos los tipos</option>
          {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Contexto de búsqueda activa */}
      {isSearching && !searchLoading && (
        <p className="text-xs text-gp-text-4 mb-3">
          {estado !== 'todos' && `Estado: ${ESTADO_TRAMITE_LABELS[estado as EstadoTramite]} · `}
          Buscando en todos los trámites
          {' · '}
          <button
            onClick={() => setSearch('')}
            className="text-gp-orange hover:underline font-medium"
          >
            Limpiar
          </button>
        </p>
      )}

      {/* Lista */}
      {loading ? (
        <Spinner />
      ) : tramites.length === 0 ? (
        <EmptyStateIllustrated
          tipo={hayFiltros ? 'busqueda' : 'tramites'}
          titulo={hayFiltros ? 'Sin resultados' : 'Sin trámites'}
          descripcion={
            hayFiltros
              ? 'No hay trámites que coincidan con los filtros.'
              : undefined
          }
          accion={
            !hayFiltros
              ? <Button onClick={() => setModal(true)}><Plus size={15} />Nuevo trámite</Button>
              : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-2" role="list" aria-label="Lista de trámites">
            {tramites.map(t => (
              <Card
                key={t.id}
                role="listitem"
                onClick={() => navigate(`/admin/tramites/${t.id}`)}
                className="p-0 overflow-hidden"
              >
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
                  <ChevronRight size={16} className="text-gray-300 shrink-0" aria-hidden="true" />
                </div>
              </Card>
            ))}
          </div>

          <PaginacionBar
            page={page}
            hasPrev={hasPrev}
            hasNext={hasNext}
            loading={loading}
            count={tramites.length}
            total={total}
            isSearching={isSearching}
            onPrev={goPrev}
            onNext={goNext}
          />
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModal(false)}
        title="Nuevo Trámite"
        subtitle="Completá los datos del trámite"
        size="lg"
      >
        <TramiteForm onSubmit={handleCrear} onCancel={() => setModal(false)} />
      </Modal>
    </div>
  )
}