import { useNavigate } from 'react-router-dom'
import { Search, Plus, Phone, Mail, ChevronRight, Download, ChevronLeft, Loader2 } from 'lucide-react'
import { useGestoria, useGestoriaId } from '@/context/GestoriaContext'
import { useClientesPaginados } from '@/hooks/useClientes'
import { crearCliente } from '@/lib/firestore/clientes'
import { verificarLimiteClientes, LimitePlanError } from '@/lib/firestore/planlimits'
import { usePlanLimites } from '@/hooks/usePlanLimites'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, PageHeader, EmptyState, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import ClienteForm, { type ClienteFormData } from './ClienteForm'
import { initiales, formatFecha } from '@/utils'
import toast from 'react-hot-toast'
import { useState } from 'react'

// ─── BARRA DE PAGINACIÓN ─────────────────────────────────────────────────────

function PaginacionBar({
  page, hasPrev, hasNext, loading, count, total, isSearching,
  onPrev, onNext,
}: {
  page:        number
  hasPrev:     boolean
  hasNext:     boolean
  loading:     boolean
  count:       number      // ítems en la página actual
  total:       number      // total en el tenant
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
        {total > 0
          ? `${desde}–${hasta} de ${total} clientes`
          : 'Sin clientes'}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary" size="sm"
          onClick={onPrev}
          disabled={!hasPrev || loading}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
          Anterior
        </Button>
        <span className="text-xs text-gp-text-3 px-1 tabular-nums">
          {page}
        </span>
        <Button
          variant="secondary" size="sm"
          onClick={onNext}
          disabled={!hasNext || loading}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

// ─── INDICADOR DE USO DEL PLAN ────────────────────────────────────────────────

function IndicadorUso({ actual, maximo, planLabel }: { actual: number; maximo: number; planLabel: string }) {
  const pct = maximo > 0 ? Math.round((actual / maximo) * 100) : 0
  if (pct < 70) return null
  const enLimite = pct >= 100
  const wrap  = enLimite ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
  const bar   = enLimite ? 'bg-red-500' : 'bg-amber-400'
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-gp-xl border mb-4 ${wrap}`}>
      <span aria-hidden="true">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-xs">
          {enLimite ? `Límite de clientes alcanzado — Plan ${planLabel}` : `Acercándote al límite — Plan ${planLabel}`}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-xs font-mono shrink-0">{actual} / {maximo}</span>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const gestoriaId   = useGestoriaId()
  const { gestoria } = useGestoria()
  const [modalOpen, setModal] = useState(false)

    const {
    clientes, total, loading,
    page, hasPrev, hasNext, goNext, goPrev,
    search, setSearch, isSearching, searchLoading,
    exportar, exportLoading,
    verProspectos, setVerProspectos,
  } = useClientesPaginados()

  const {
    totalClientes, maxClientes, planLabel, enLimiteClientes, refetch,
  } = usePlanLimites()

  const handleCrear = async (data: ClienteFormData) => {
    if (!user || !gestoria) return
    try {
      await verificarLimiteClientes(gestoriaId, gestoria.maxClientes, gestoria.plan)
      const id = await crearCliente({ ...data, gestoriaId }, user.uid)
      toast.success('Cliente creado correctamente')
      refetch()
      setModal(false)
      navigate(`/admin/clientes/${id}`)
    } catch (err: unknown) {
      if (err instanceof LimitePlanError) {
        toast.error(err.mensajeUpgrade, { duration: 6000, icon: '🔒' })
      } else {
        toast.error('Error al crear el cliente')
      }
    }
  }

  const abrirModal = () => {
    if (enLimiteClientes) {
      toast.error(`Límite de ${maxClientes} clientes (Plan ${planLabel}). Actualizá tu plan.`, { icon: '🔒' })
      return
    }
    setModal(true)
  }

  const handleExportar = async () => {
    try {
      await exportar()
      toast.success('Exportación lista')
    } catch {
      toast.error('Error al exportar')
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={
          isSearching
            ? `${clientes.length} resultado${clientes.length !== 1 ? 's' : ''}`
            : `${total} cliente${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary" size="sm"
              onClick={handleExportar}
              loading={exportLoading}
              title="Exportar todos los clientes a Excel"
            >
              {!exportLoading && <Download size={15} />}
              Excel
            </Button>
            <Button onClick={abrirModal}>
              <Plus size={16} /> Nuevo cliente
            </Button>
          </div>
        }
      />

      <IndicadorUso actual={totalClientes} maximo={maxClientes} planLabel={planLabel} />

      {/* Buscador */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, apellido, DNI, teléfono o email..."
          aria-label="Buscar clientes"
          className="w-full pl-10 pr-4 py-2.5 border border-gp-border rounded-gp-xl text-sm
                     bg-white outline-none focus:border-gp-orange focus:ring-2 focus:ring-gp-orange/15
                     transition-all placeholder-gray-400"
        />
        {/* Spinner durante carga de búsqueda */}
        {searchLoading && (
          <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Nota de contexto cuando hay búsqueda activa */}
      {isSearching && !searchLoading && (
        <p className="text-xs text-gp-text-4 mb-3">
          Buscando en todos los clientes
          {' · '}
          <button
            onClick={() => setSearch('')}
            className="text-gp-orange hover:underline font-medium"
          >
            Limpiar
          </button>
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : clientes.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'No hay clientes todavía'}
          description={
            search
              ? `No encontramos clientes con "${search}"`
              : 'Registrá el primer cliente para empezar.'
          }
          action={
            !search && !enLimiteClientes
              ? <Button onClick={abrirModal}><Plus size={15} /> Nuevo cliente</Button>
              : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-2" role="list" aria-label="Lista de clientes">
            {clientes.map(c => (
              <div key={c.id} role="listitem">
                <Card
                  onClick={() => navigate(`/admin/clientes/${c.id}`)}
                  className="p-0 overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-gp-orange/10 flex items-center
                                  justify-center text-gp-orange font-bold text-sm shrink-0"
                       aria-hidden="true">
                    {initiales(c.nombre, c.apellido)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{c.apellido}, {c.nombre}</p>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                       {c.dni ? (
  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
    DNI {c.dni}
  </span>
) : (
  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
    Sin DNI
  </span>
)}
{c.creadoAutomaticamente && (
  <span className="text-xs text-gp-orange bg-gp-orange/10 px-2 py-0.5 rounded-full"
        title="Registro creado automáticamente desde un lead">
    ⚡ Auto
  </span>
)}
                      </span>
                      {c.vehiculosIds?.length > 0 && (
                        <span className="text-xs text-gp-orange bg-gp-orange/10 px-2 py-0.5 rounded-full">
                          {c.vehiculosIds.length} vehículo{c.vehiculosIds.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {c.telefono && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={11} aria-hidden="true" /> {c.telefono}
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail size={11} aria-hidden="true" /> {c.email}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">Alta: {formatFecha(c.creadoEn)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" aria-hidden="true" />
                  </div>
                </Card>
              </div>
            ))}
          </div>
  <label className="flex items-center gap-2 mb-3 text-xs text-gp-text-3 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={verProspectos}
      onChange={e => setVerProspectos(e.target.checked)}
      className="accent-gp-orange"
    />
    Ver prospectos (registros de leads sin convertir)
  </label>
          <PaginacionBar
            page={page}
            hasPrev={hasPrev}
            hasNext={hasNext}
            loading={loading}
            count={clientes.length}
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
        title="Nuevo Cliente"
        subtitle="Completá los datos del cliente"
        size="lg"
      >
        <ClienteForm
          onSubmit={handleCrear}
          onCancel={() => setModal(false)}
          submitLabel="Crear cliente"
        />
      </Modal>
    </div>
  )
}