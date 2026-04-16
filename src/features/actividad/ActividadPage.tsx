import { useState } from 'react'
import {
  Activity, Clock, Users, Filter,
} from 'lucide-react'
import { useActividad }   from '@/hooks/useActividad'
import { useEquipo }      from '@/hooks/useEquipo'
import { FeedActividad }  from '@/components/shared/FeedActividad'
import { PageHeader, Spinner } from '@/components/ui'
import { ENTIDAD_CONFIG } from '@/lib/firestore/audit'
import type { EntidadAudit } from '@/types'

const ENTIDADES: { id: EntidadAudit | 'todas'; label: string; emoji: string }[] = [
  { id: 'todas',         label: 'Todo',         emoji: '📌' },
  { id: 'tramite',       label: 'Trámites',      emoji: '📋' },
  { id: 'cliente',       label: 'Clientes',      emoji: '👤' },
  { id: 'vehiculo',      label: 'Vehículos',     emoji: '🚗' },
  { id: 'turno',         label: 'Turnos',        emoji: '📅' },
  { id: 'usuario',       label: 'Equipo',        emoji: '👥' },
  { id: 'configuracion', label: 'Config',        emoji: '⚙️' },
]

export default function ActividadPage() {
  const { entradas, loading } = useActividad(100)
  const { equipo }            = useEquipo()
  const [filtroEntidad, setFiltroEntidad] = useState<EntidadAudit | 'todas'>('todas')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('todos')

  // Filtrar
  const filtradas = entradas.filter(e => {
    if (filtroEntidad !== 'todas' && e.entidad !== filtroEntidad) return false
    if (filtroUsuario !== 'todos' && e.usuarioId !== filtroUsuario) return false
    return true
  })

  // Métricas rápidas
  const hoy       = new Date(); hoy.setHours(0,0,0,0)
  const hoy_count = entradas.filter(e => {
    const d = e.timestamp?.toDate?.()
    return d && d >= hoy
  }).length

  const usuarios_activos = new Set(
    entradas.filter(e => {
      const d = e.timestamp?.toDate?.()
      return d && d >= hoy
    }).map(e => e.usuarioId)
  ).size

  if (loading) return <Spinner label="Cargando historial..." />

  return (
    <div className="space-y-5 animate-fadein max-w-3xl">

      <PageHeader
        title="Historial de actividad"
        subtitle="Quién hizo qué y cuándo en toda la plataforma"
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Acciones hoy',    value: hoy_count,         icon: Activity, color: '#D4621A' },
          { label: 'Usuarios activos hoy', value: usuarios_activos, icon: Users,    color: '#3B82F6' },
          { label: 'Total registros', value: entradas.length,   icon: Clock,    color: '#6B7280' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                 style={{ background: `${k.color}18` }}>
              <k.icon size={15} style={{ color: k.color }} />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-gray-900"
               style={{ fontFamily: 'var(--font-display)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">

        {/* Por entidad */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">
            <Filter size={11} className="inline mr-1" />
            Módulo:
          </span>
          {ENTIDADES.map(e => (
            <button
              key={e.id}
              onClick={() => setFiltroEntidad(e.id as any)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                          ${filtroEntidad === e.id
                            ? 'text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
              style={filtroEntidad === e.id ? { background: 'var(--gp-orange)' } : undefined}
            >
              {e.emoji} {e.label}
            </button>
          ))}
        </div>

        {/* Por usuario */}
        {equipo.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">
              <Users size={11} className="inline mr-1" />
              Usuario:
            </span>
            <button
              onClick={() => setFiltroUsuario('todos')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                          ${filtroUsuario === 'todos' ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
              style={filtroUsuario === 'todos' ? { background: 'var(--gp-orange)' } : undefined}
            >
              Todos
            </button>
            {equipo.map(m => (
              <button
                key={m.uid}
                onClick={() => setFiltroUsuario(m.uid)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                            ${filtroUsuario === m.uid ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                style={filtroUsuario === m.uid ? { background: 'var(--gp-orange)' } : undefined}
              >
                {m.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Contador */}
        <p className="text-xs text-gray-400">
          {filtradas.length} registro{filtradas.length !== 1 ? 's' : ''}
          {(filtroEntidad !== 'todas' || filtroUsuario !== 'todos') && ' (filtrado)'}
        </p>
      </div>

      {/* Feed */}
      <FeedActividad
        entradas={filtradas}
        loading={false}
        mostrarEntidad={filtroEntidad === 'todas'}
        mostrarFiltros={false}
        limite={30}
      />

    </div>
  )
}
