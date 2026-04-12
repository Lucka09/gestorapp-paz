import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTramitesPortal } from '@/hooks/usePortal'
import { Card, Spinner, EmptyState } from '@/components/ui'
import { EstadoBadge } from './EstadoBadge'
import { TIPO_TRAMITE_LABELS, type Tramite } from '@/types'
import { formatFecha, formatFechaHora, formatPesos } from '@/utils'

// Flujo visual de estados
const FLUJO_ESTADOS = [
  { key: 'pendiente',               label: 'Pendiente'       },
  { key: 'en_proceso',              label: 'En Proceso'      },
  { key: 'documentacion_requerida', label: 'Docs. Requerida' },
  { key: 'en_organismo',            label: 'En Organismo'    },
  { key: 'listo_para_retirar',      label: 'Para Retirar'    },
  { key: 'entregado',               label: 'Entregado'       },
]

function ProgresoTramite({ estado }: { estado: string }) {
  const idx = FLUJO_ESTADOS.findIndex(e => e.key === estado)
  if (idx < 0 || estado === 'cancelado') return null
  return (
    <div className="mt-4">
      <div className="flex items-center gap-0">
        {FLUJO_ESTADOS.map((e, i) => {
          const done    = i < idx
          const current = i === idx
          const last    = i === FLUJO_ESTADOS.length - 1
          return (
            <div key={e.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                                 transition-all ${
                  current ? 'border-[#D4621A] bg-[#D4621A]' :
                  done    ? 'border-[#D4621A] bg-[#D4621A]/20' :
                            'border-gray-200 bg-white'
                }`}>
                  {done && <div className="w-2 h-2 rounded-full bg-[#D4621A]" />}
                  {current && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className={`text-xs mt-1 text-center leading-tight max-w-[52px] ${
                  current ? 'text-[#D4621A] font-semibold' :
                  done    ? 'text-[#D4621A]/70' : 'text-gray-300'
                }`}>
                  {e.label}
                </span>
              </div>
              {!last && (
                <div className={`h-0.5 flex-1 mb-4 mx-0.5 transition-all ${
                  i < idx ? 'bg-[#D4621A]/40' : 'bg-gray-100'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TramiteCard({ tramite }: { tramite: Tramite }) {
  const [expandido, setExpandido] = useState(false)
  const activo = !['entregado', 'cancelado'].includes(tramite.estado)

  return (
    <Card className="overflow-hidden">
      {/* Header clickeable */}
      <button
        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-gray-900 text-sm">
                {TIPO_TRAMITE_LABELS[tramite.tipo]}
              </span>
              {activo && (
                <span className="w-2 h-2 rounded-full bg-[#D4621A] animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-gray-100 text-gray-600
                               px-2 py-0.5 rounded-lg tracking-wider">
                {tramite.patente}
              </span>
              <span className="text-xs text-gray-400 font-mono">{tramite.numero}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <EstadoBadge estado={tramite.estado} />
            {expandido
              ? <ChevronUp size={14} className="text-gray-400" />
              : <ChevronDown size={14} className="text-gray-400" />
            }
          </div>
        </div>

        {/* Barra de progreso mini cuando está colapsado */}
        {!expandido && activo && tramite.estado !== 'documentacion_requerida' && (
          <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D4621A] rounded-full transition-all"
              style={{
                width: `${Math.max(8, (FLUJO_ESTADOS.findIndex(e => e.key === tramite.estado) + 1) / FLUJO_ESTADOS.length * 100)}%`
              }}
            />
          </div>
        )}

        {/* Aviso documentación */}
        {tramite.estado === 'documentacion_requerida' && !expandido && (
          <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg">
            ⚠️ Se requiere documentación — expandí para ver los detalles.
          </div>
        )}
      </button>

      {/* Detalle expandido */}
      {expandido && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">

          {/* Progreso */}
          {tramite.estado !== 'cancelado' && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Progreso del trámite
              </p>
              <ProgresoTramite estado={tramite.estado} />
            </div>
          )}

          {/* Datos */}
          <div className="grid grid-cols-2 gap-3 text-sm pt-2">
            <div>
              <p className="text-xs text-gray-400">Inicio</p>
              <p className="font-medium text-gray-700">{formatFecha(tramite.creadoEn)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Última actualización</p>
              <p className="font-medium text-gray-700">{formatFecha(tramite.actualizadoEn)}</p>
            </div>
            {tramite.honorarios > 0 && (
              <div>
                <p className="text-xs text-gray-400">Honorarios</p>
                <p className={`font-semibold ${tramite.pagado ? 'text-emerald-600' : 'text-orange-500'}`}>
                  {formatPesos(tramite.honorarios)} {tramite.pagado ? '· Pagado ✓' : '· Pendiente'}
                </p>
              </div>
            )}
          </div>

          {/* Descripción */}
          {tramite.descripcion && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Detalle</p>
              <p className="text-sm text-gray-700">{tramite.descripcion}</p>
            </div>
          )}

          {/* Historial de estados */}
          {tramite.historialEstados?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock size={11} /> Historial
              </p>
              <div className="space-y-2">
                {[...tramite.historialEstados].reverse().slice(0, 4).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#D4621A]/50 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-gray-700">
                        → {h.estadoNuevo?.replace(/_/g, ' ')}
                      </span>
                      {h.nota && <span className="text-gray-400 italic"> · "{h.nota}"</span>}
                      {h.fecha && (
                        <span className="text-gray-400 block">
                          {formatFechaHora(h.fecha as any)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function MisTramitesPage() {
  const { user }   = useAuth()
  const { tramites, loading } = useTramitesPortal(user?.clienteId ?? undefined)
  const [filtro, setFiltro]   = useState<'todos' | 'activos' | 'finalizados'>('todos')

  const activos     = tramites.filter(t => !['entregado','cancelado'].includes(t.estado))
  const finalizados = tramites.filter(t =>  ['entregado','cancelado'].includes(t.estado))

  const visibles = filtro === 'activos'     ? activos
                 : filtro === 'finalizados' ? finalizados
                 : tramites

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mis Trámites</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {activos.length} activo{activos.length !== 1 ? 's' : ''} · {finalizados.length} finalizado{finalizados.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filtros */}
      {tramites.length > 0 && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['todos', 'activos', 'finalizados'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                filtro === f ? 'bg-white text-[#D4621A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f === 'todos' ? `Todos (${tramites.length})` :
               f === 'activos' ? `Activos (${activos.length})` :
               `Finalizados (${finalizados.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {visibles.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} />}
          title={filtro === 'activos' ? 'Sin trámites activos' : 'Sin trámites todavía'}
          description="Cuando Gestoría Paz registre un trámite, aparecerá aquí con el estado actualizado."
        />
      ) : (
        <div className="space-y-3">
          {visibles.map(t => <TramiteCard key={t.id} tramite={t} />)}
        </div>
      )}
    </div>
  )
}

