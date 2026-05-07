import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronDown, ExternalLink, Clock } from 'lucide-react'
import {
  ACCION_CONFIG, ENTIDAD_CONFIG,
} from '@/lib/firestore/audit'
import type { EntradaAudit, AccionAudit, EntidadAudit } from '@/types'
import { Spinner } from '@/components/ui'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: { toDate(): Date } | Date | number | null | undefined): string {
  if (!ts) return '—'
  const d = typeof ts === 'object' && 'toDate' in ts ? ts.toDate() : new Date(ts)
  const ahora = new Date()
  const diff  = Math.floor((ahora.getTime() - d.getTime()) / 1000)

  if (diff < 60)     return 'Hace un momento'
  if (diff < 3600)   return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400)  return `Hace ${Math.floor(diff / 3600)} hs`
  if (diff < 172800) return 'Ayer'

  return d.toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatTimestampCompleto(ts: { toDate(): Date } | Date | number | null | undefined): string {
  if (!ts) return '—'
  const d = typeof ts === 'object' && 'toDate' in ts ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── ROL BADGE ────────────────────────────────────────────────────────────────

const ROL_CLS: Record<string, string> = {
  propietario: 'bg-purple-100 text-purple-700',
  admin:       'bg-orange-100 text-orange-700',
  vendedor:    'bg-blue-100 text-blue-700',
  operador:    'bg-emerald-100 text-emerald-700',
  cliente:     'bg-gray-100 text-gray-600',
}

// ─── DIFF DE CAMBIOS ──────────────────────────────────────────────────────────

function DiffCambios({
  antes,
  despues,
}: {
  antes?:   Record<string, unknown>
  despues?: Record<string, unknown>
}) {
  if (!antes || !despues) return null

  const camposIgnorar = ['actualizadoEn', 'creadoEn', 'id', 'uid']
  const camposCambiados = Object.keys(despues).filter(k => {
    if (camposIgnorar.includes(k)) return false
    return JSON.stringify(antes[k]) !== JSON.stringify(despues[k])
  })

  if (camposCambiados.length === 0) return null

  const LABEL_CAMPO: Record<string, string> = {
    nombre: 'Nombre', apellido: 'Apellido', telefono: 'Teléfono',
    email: 'Email', rol: 'Rol', estado: 'Estado',
    honorarios: 'Honorarios', pagado: 'Pagado',
    formaPago: 'Forma de pago', descripcion: 'Descripción',
    patente: 'Patente', localidad: 'Localidad', activo: 'Activo',
  }

  return (
    <div className="mt-2 space-y-1">
      {camposCambiados.slice(0, 4).map(campo => (
        <div key={campo}
          className="flex items-start gap-2 text-xs bg-white/60 rounded-lg px-2.5 py-1.5">
          <span className="font-semibold text-gray-500 shrink-0 w-24">
            {LABEL_CAMPO[campo] ?? campo}
          </span>
          <span className="text-red-500 line-through truncate max-w-25">
            {String(antes[campo] ?? '—')}
          </span>
          <span className="text-gray-400">→</span>
          <span className="text-emerald-600 font-medium truncate max-w-25">
            {String(despues[campo] ?? '—')}
          </span>
        </div>
      ))}
      {camposCambiados.length > 4 && (
        <p className="text-xs text-gray-400 px-2.5">
          +{camposCambiados.length - 4} cambios más
        </p>
      )}
    </div>
  )
}

// ─── ENTRADA DE ACTIVIDAD ─────────────────────────────────────────────────────

function EntradaItem({
  entrada,
  mostrarEntidad = true,
}: {
  entrada:        EntradaAudit
  mostrarEntidad?: boolean
}) {
  const navigate = useNavigate()
  const [expandido, setExpandido] = useState(false)

  const accionCfg  = ACCION_CONFIG[entrada.accion]  ?? ACCION_CONFIG.editar
  const entidadCfg = ENTIDAD_CONFIG[entrada.entidad] ?? { label: entrada.entidad, emoji: '📌' }

  const tieneDiff  = !!(entrada.antes || entrada.despues)
  const tieneNota  = !!entrada.nota

  const LINK_MAP: Partial<Record<EntidadAudit, (id: string) => string>> = {
    cliente:  id => `/admin/clientes/${id}`,
    tramite:  id => `/admin/tramites/${id}`,
    vehiculo: () => `/admin/vehiculos`,
    turno:    () => `/admin/turnos`,
  }
  const link = LINK_MAP[entrada.entidad]?.(entrada.entidadId)

  return (
    <div className={`rounded-xl border p-3.5 ${accionCfg.bg} border-transparent
                     transition-all`}>
      <div className="flex items-start gap-3">

        {/* Emoji acción */}
        <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center
                        justify-center text-base shrink-0 shadow-sm">
          <span aria-hidden="true">{accionCfg.emoji}</span>
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">

          {/* Línea principal */}
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-gray-900">
              {entrada.usuarioNombre}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                              ${ROL_CLS[entrada.usuarioRol] ?? 'bg-gray-100 text-gray-600'}`}>
              {entrada.usuarioRol}
            </span>
            <span className={`text-sm font-medium ${accionCfg.color}`}>
              {accionCfg.label}
            </span>
            {mostrarEntidad && (
              <span className="text-sm text-gray-500">
                {entidadCfg.emoji} {entidadCfg.label.toLowerCase()}
              </span>
            )}
          </div>

          {/* Entidad label */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {entrada.entidadLabel}
            </p>
            {link && (
              <button
                onClick={() => navigate(link)}
                aria-label={`Ver ${entidadCfg.label}`}
                className="text-gray-400 hover:text-gp-orange transition-colors shrink-0"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>

          {/* Nota */}
          {tieneNota && (
            <p className="text-xs text-gray-500 mt-1 italic">
              "{entrada.nota}"
            </p>
          )}

          {/* Diff expandible */}
          {tieneDiff && (
            <div className="mt-2">
              <button
                onClick={() => setExpandido(!expandido)}
                className={`flex items-center gap-1 text-xs font-medium transition-colors
                            ${accionCfg.color}`}
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${expandido ? 'rotate-180' : ''}`}
                />
                {expandido ? 'Ocultar cambios' : 'Ver cambios'}
              </button>
              {expandido && (
                <DiffCambios antes={entrada.antes} despues={entrada.despues} />
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-400" title={formatTimestampCompleto(entrada.timestamp)}>
            {formatTimestamp(entrada.timestamp)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── FEED COMPLETO ────────────────────────────────────────────────────────────

interface FeedActividadProps {
  entradas:       EntradaAudit[]
  loading:        boolean
  mostrarEntidad?: boolean
  mostrarFiltros?: boolean
  limite?:        number
}

export function FeedActividad({
  entradas, loading,
  mostrarEntidad = true,
  mostrarFiltros = false,
  limite         = 20,
}: FeedActividadProps) {

  const [verTodos,  setVerTodos]  = useState(false)
  const [filtroAcc, setFiltroAcc] = useState<AccionAudit | 'todas'>('todas')

  const filtradas = filtroAcc === 'todas'
    ? entradas
    : entradas.filter(e => e.accion === filtroAcc)

  const visibles = verTodos ? filtradas : filtradas.slice(0, limite)

  if (loading) return <Spinner label="Cargando actividad..." />

  if (entradas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-300">
        <Activity size={32} className="mb-3 opacity-40" />
        <p className="text-sm text-gray-400 font-medium">Sin actividad registrada</p>
        <p className="text-xs text-gray-300 mt-1">
          Las acciones aparecerán aquí en tiempo real
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      {mostrarFiltros && (
        <div className="flex gap-1.5 flex-wrap">
          {(['todas', 'crear', 'editar', 'cambiar_estado', 'registrar_pago'] as const).map(a => (
            <button
              key={a}
              onClick={() => setFiltroAcc(a)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                          ${filtroAcc === a
                            ? 'text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
              style={filtroAcc === a ? { background: 'var(--gp-orange)' } : undefined}
            >
              {a === 'todas' ? 'Todas'
               : a === 'crear' ? '✨ Creaciones'
               : a === 'editar' ? '✏️ Ediciones'
               : a === 'cambiar_estado' ? '🔄 Estados'
               : '💰 Cobros'}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {visibles.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Sin actividad con este filtro
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map(e => (
            <EntradaItem
              key={e.id}
              entrada={e}
              mostrarEntidad={mostrarEntidad}
            />
          ))}
        </div>
      )}

      {/* Ver más */}
      {filtradas.length > limite && !verTodos && (
        <button
          onClick={() => setVerTodos(true)}
          className="w-full text-sm font-medium py-2.5 text-gray-400
                     hover:text-gp-orange transition-colors flex items-center
                     justify-center gap-1.5"
        >
          <ChevronDown size={15} />
          Ver {filtradas.length - limite} más
        </button>
      )}
    </div>
  )
}
