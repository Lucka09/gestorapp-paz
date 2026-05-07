import { useState } from 'react'
import { useNavigate }    from 'react-router-dom'
import {
  Bell, CheckCheck, RefreshCw,
  ChevronRight, X, Filter,
  AlertTriangle, AlertCircle, Info, Zap,
} from 'lucide-react'
import { useAlertas }     from '@/hooks/useAlertas'
import {
  marcarAlertaLeida, resolverAlerta,
  marcarTodasLeidas, ejecutarMotorAlertas,
  NIVEL_CONFIG, CATEGORIA_CONFIG,
  type Alerta, type NivelAlerta, type CategoriaAlerta,
} from '@/lib/firestore/alertas'
import { PageHeader, Button, Spinner } from '@/components/ui'
import { formatRelativo }  from '@/utils'
import toast from 'react-hot-toast'

// ─── ÍCONO POR NIVEL ─────────────────────────────────────────────────────────

function IconoNivel({ nivel, size = 16 }: { nivel: NivelAlerta; size?: number }) {
  const props = { size, className: 'shrink-0' }
  if (nivel === 'critica')     return <AlertCircle   {...props} className={`${props.className} text-red-500`} />
  if (nivel === 'urgente')     return <Zap           {...props} className={`${props.className} text-orange-500`} />
  if (nivel === 'advertencia') return <AlertTriangle {...props} className={`${props.className} text-amber-500`} />
  return                              <Info          {...props} className={`${props.className} text-blue-500`} />
}

// ─── CARD DE ALERTA ───────────────────────────────────────────────────────────

function AlertaCard({
  alerta, onResolver, onMarcarLeida, onNavegar,
}: {
  alerta:        Alerta
  onResolver:    (id: string) => void
  onMarcarLeida: (id: string) => void
  onNavegar:     (link: string) => void
}) {
  const cfg = NIVEL_CONFIG[alerta.nivel]
  const cat = CATEGORIA_CONFIG[alerta.categoria]

  return (
    <div
      className={`rounded-2xl border-l-4 p-4 transition-all
                  ${alerta.leida ? 'opacity-70' : ''}
                  ${cfg.bg} ${cfg.border.replace('border-', 'border-l-')}`}
      style={{ borderLeftWidth: 4 }}
    >
      <div className="flex items-start gap-3">

        {/* Ícono */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
          <IconoNivel nivel={alerta.nivel} size={18} />
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-gray-400">
              {cat.emoji} {cat.label}
            </span>
            {!alerta.leida && (
              <span className="w-2 h-2 rounded-full bg-gp-orange inline-block" />
            )}
          </div>

          <p className={`text-sm font-semibold mb-0.5 ${cfg.color}`}>
            {alerta.titulo}
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            {alerta.detalle}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <span className="text-xs text-gray-400">
              {formatRelativo(alerta.creadaEn)}
            </span>
            <div className="flex items-center gap-2">
              {alerta.link && (
                <button
                  onClick={() => { onNavegar(alerta.link!); onMarcarLeida(alerta.id) }}
                  className={`text-xs font-semibold flex items-center gap-1
                              ${cfg.color} hover:underline`}
                >
                  Ver detalle <ChevronRight size={12} />
                </button>
              )}
              {!alerta.leida && (
                <button
                  onClick={() => onMarcarLeida(alerta.id)}
                  aria-label="Marcar como leída"
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Marcar leída
                </button>
              )}
              <button
                onClick={() => onResolver(alerta.id)}
                aria-label="Resolver alerta"
                className="w-6 h-6 rounded-lg bg-white/70 hover:bg-white flex items-center
                           justify-center text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function AlertasPage() {
  const navigate    = useNavigate()
  const { alertas, loading, noLeidas, criticas } = useAlertas()
  const [filtroCat,    setFiltroCat]    = useState<CategoriaAlerta | 'todas'>('todas')
  const [filtroNivel,  setFiltroNivel]  = useState<NivelAlerta | 'todos'>('todos')
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [ejecutando,   setEjecutando]  = useState(false)

  const handleResolver = async (id: string) => {
    try {
      await resolverAlerta(id)
      toast.success('Alerta resuelta')
    } catch { toast.error('Error') }
  }

  const handleMarcarLeida = async (id: string) => {
    try { await marcarAlertaLeida(id) } catch { /* silencioso */ }
  }

  const handleMarcarTodasLeidas = async () => {
    try {
      await marcarTodasLeidas()
      toast.success('Todas marcadas como leídas')
    } catch { toast.error('Error') }
  }

  const handleEjecutarMotor = async () => {
    setEjecutando(true)
    try {
      const n = await ejecutarMotorAlertas()
      toast.success(`Motor ejecutado — ${n} alerta${n !== 1 ? 's' : ''} procesada${n !== 1 ? 's' : ''}`)
    } catch { toast.error('Error al ejecutar el motor') }
    finally { setEjecutando(false) }
  }

  // Filtrar
  const alertasFiltradas = alertas.filter(a => {
    if (filtroCat   !== 'todas' && a.categoria !== filtroCat)   return false
    if (filtroNivel !== 'todos' && a.nivel      !== filtroNivel) return false
    if (soloNoLeidas && a.leida)                                 return false
    return true
  })

  // Agrupar por nivel para el resumen
  const resumen = {
    critica:     alertas.filter(a => a.nivel === 'critica').length,
    urgente:     alertas.filter(a => a.nivel === 'urgente').length,
    advertencia: alertas.filter(a => a.nivel === 'advertencia').length,
    info:        alertas.filter(a => a.nivel === 'info').length,
  }

  if (loading) return <Spinner label="Cargando alertas..." />

  return (
    <div className="space-y-5 animate-fadein max-w-3xl">

      <PageHeader
        title="Centro de alertas"
        subtitle={noLeidas > 0
          ? `${noLeidas} alerta${noLeidas > 1 ? 's' : ''} sin leer`
          : 'Todo al día'
        }
        action={
          <div className="flex gap-2">
            {noLeidas > 0 && (
              <Button variant="secondary" size="sm" onClick={handleMarcarTodasLeidas}>
                <CheckCheck size={14} /> Marcar todas leídas
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={ejecutando}
              onClick={handleEjecutarMotor}
            >
              <RefreshCw size={14} /> Actualizar alertas
            </Button>
          </div>
        }
      />

      {/* Resumen por nivel */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(resumen) as [NivelAlerta, number][]).map(([nivel, n]) => {
          const cfg = NIVEL_CONFIG[nivel]
          return (
            <button
              key={nivel}
              onClick={() => setFiltroNivel(filtroNivel === nivel ? 'todos' : nivel)}
              className={`rounded-2xl p-3.5 text-left border-2 transition-all
                          ${filtroNivel === nivel
                            ? `${cfg.bg} ${cfg.border}`
                            : 'bg-white border-transparent shadow-sm hover:shadow'
                          }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <IconoNivel nivel={nivel} size={15} />
                <span className={`text-xl font-bold ${cfg.color}`}
                      style={{ fontFamily: 'var(--font-display)' }}>
                  {n}
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-500">{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Filtrar
          </span>
        </div>

        {/* Categorías */}
        <div className="flex gap-1.5 flex-wrap">
          {(['todas', 'tramites', 'turnos', 'cobranzas', 'clientes', 'sistema'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFiltroCat(cat)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                          ${filtroCat === cat
                            ? 'text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
              style={filtroCat === cat ? { background: 'var(--gp-orange)' } : undefined}
            >
              {cat === 'todas' ? 'Todas' : CATEGORIA_CONFIG[cat].emoji + ' ' + CATEGORIA_CONFIG[cat].label}
            </button>
          ))}
        </div>

        {/* Solo no leídas */}
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={soloNoLeidas}
            onChange={e => setSoloNoLeidas(e.target.checked)}
            className="w-4 h-4 rounded accent-[#D4621A]"
          />
          <span className="text-xs text-gray-500">Solo no leídas</span>
        </label>
      </div>

      {/* Lista de alertas */}
      {alertasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center
                          justify-center mb-4">
            <CheckCheck size={28} className="text-emerald-400" />
          </div>
          <p className="text-base font-semibold text-gray-400">
            {filtroCat !== 'todas' || filtroNivel !== 'todos' || soloNoLeidas
              ? 'Sin alertas con estos filtros'
              : '¡Todo en orden! Sin alertas activas.'}
          </p>
          <p className="text-sm text-gray-300 mt-1">
            El motor se ejecuta automáticamente al entrar.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEjecutarMotor}
            loading={ejecutando}
            className="mt-4"
          >
            <RefreshCw size={13} /> Verificar ahora
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Agrupa críticas primero */}
          {alertasFiltradas
            .sort((a, b) => {
              const orden: Record<NivelAlerta, number> = { critica:0, urgente:1, advertencia:2, info:3 }
              return orden[a.nivel] - orden[b.nivel]
            })
            .map(alerta => (
              <AlertaCard
                key={alerta.id}
                alerta={alerta}
                onResolver={handleResolver}
                onMarcarLeida={handleMarcarLeida}
                onNavegar={navigate}
              />
            ))
          }
        </div>
      )}

      {/* Info del motor */}
      <p className="text-xs text-center text-gray-400 pt-2">
        Las alertas se actualizan automáticamente con el botón "Actualizar alertas".
        Las alertas resueltas desaparecen de esta vista.
      </p>
    </div>
  )
}
