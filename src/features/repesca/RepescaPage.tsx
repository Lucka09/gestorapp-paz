import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, UserPlus, X, Phone, ExternalLink } from 'lucide-react'
import { useRepesca, descartarDeRepesca, tomarDeRepesca } from '@/hooks/useRepesca'
import type { ItemRepesca, MotivoRepesca } from '@/hooks/useRepesca'
import { useAuth } from '@/hooks/useAuth'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Button } from '@/components/ui'
import { EmptyStateIllustrated } from '@/components/shared/EmptyStateIllustrated'

const MOTIVO_CONFIG: Record<MotivoRepesca, {
  label: string; desc: string; color: string; dot: string
}> = {
  sin_responder: {
    label: 'Sin responder',
    desc:  'El cliente escribió y nadie contestó',
    color: 'bg-red-50 text-red-700 border-red-100',
    dot:   'bg-red-500',
  },
  sin_cerrar: {
    label: 'No cerró',
    desc:  'Hubo conversación pero no se concretó',
    color: 'bg-amber-50 text-amber-700 border-amber-100',
    dot:   'bg-amber-500',
  },
  lead_frio: {
    label: 'Lead frío',
    desc:  'Cargado y nunca avanzó',
    color: 'bg-sky-50 text-sky-700 border-sky-100',
    dot:   'bg-sky-500',
  },
}

export default function RepescaPage() {
  usePageTitle('Repesca')
  const navigate = useNavigate()
  const { user } = useAuth()

  const [motivos, setMotivos]           = useState<MotivoRepesca[]>([])
  const [soloSinDueno, setSoloSinDueno] = useState(false)
  const [diasMin, setDiasMin]           = useState(1)
  const [procesando, setProcesando]     = useState<string | null>(null)

  const { items, resumen, loading, error, avisos } = useRepesca({
    diasMin,
    diasMax: 90,
    motivos: motivos.length ? motivos : undefined,
    soloSinDueno,
  })

  const toggleMotivo = (m: MotivoRepesca) =>
    setMotivos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const handleTomar = async (item: ItemRepesca) => {
    if (!user) return
    setProcesando(item.id)
    try {
      await tomarDeRepesca(item, user.uid, `${user.nombre} ${user.apellido}`.trim())
      if (item.conversacionId) navigate(`/admin/bandeja?conv=${item.conversacionId}`)
      else if (item.leadId)    navigate(`/admin/leads?lead=${item.leadId}`)
    } finally {
      setProcesando(null)
    }
  }

  const handleDescartar = async (item: ItemRepesca) => {
    if (!user) return
    setProcesando(item.id)
    try { await descartarDeRepesca(item, user.uid) }
    finally { setProcesando(null) }
  }

  const abrirWhatsApp = (tel: string) => {
    window.open(`https://wa.me/${tel.replace(/\D/g, '')}`, '_blank')
  }

  return (
    <div className="space-y-5">

      {/* Cabecera */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Repesca</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Clientes que quedaron sin respuesta y operaciones que no se cerraron.
          Ordenado por prioridad: arriba lo que más chance tiene de recuperarse.
        </p>
      </div>

      {avisos.length > 0 && !error && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <p className="text-xs text-amber-800">
            Listado parcial: no se pudo leer {avisos.join(', ')}. Los contadores
            pueden estar incompletos.
          </p>
        </div>
      )}

      {/* Contadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          ['Total',          resumen.total,        'text-gray-900'],
          ['Sin responder',  resumen.sinResponder, 'text-red-600'],
          ['No cerraron',    resumen.sinCerrar,    'text-amber-600'],
          ['Sin dueño',      resumen.sinDueno,     'text-[#D4621A]'],
        ] as const).map(([label, valor, color]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${color}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MOTIVO_CONFIG) as MotivoRepesca[]).map(m => (
          <button
            key={m}
            onClick={() => toggleMotivo(m)}
            title={MOTIVO_CONFIG[m].desc}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              motivos.includes(m)
                ? 'bg-[#D4621A] border-[#D4621A] text-white'
                : 'border-gray-200 bg-white text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
            }`}
          >
            {MOTIVO_CONFIG[m].label}
          </button>
        ))}

        <span className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={() => setSoloSinDueno(v => !v)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            soloSinDueno
              ? 'bg-[#D4621A] border-[#D4621A] text-white'
              : 'border-gray-200 bg-white text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
          }`}
        >
          Solo sin dueño
        </button>

        <span className="w-px h-5 bg-gray-200 mx-1" />

        <select
          value={diasMin}
          onChange={e => setDiasMin(Number(e.target.value))}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600
                     focus:outline-none focus:border-[#D4621A]"
        >
          <option value={1}>Más de 1 día</option>
          <option value={3}>Más de 3 días</option>
          <option value={7}>Más de 1 semana</option>
          <option value={15}>Más de 15 días</option>
          <option value={30}>Más de 1 mes</option>
        </select>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyStateIllustrated
          tipo="general"
          titulo="No hay nada para repescar"
          descripcion="Todos los chats fueron respondidos y no hay leads colgados con los filtros actuales."
        />
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const cfg = MOTIVO_CONFIG[item.motivo]
            const busy = procesando === item.id

            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-4
                           hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start gap-3">

                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${cfg.dot}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">
                        {item.nombre}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {!item.asignadoA && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium
                                         bg-orange-50 text-[#D4621A] border border-orange-100">
                          Sin dueño
                        </span>
                      )}
                      <span className="text-xs text-gray-400 tabular-nums">
                        {item.diasSinMov} {item.diasSinMov === 1 ? 'día' : 'días'}
                      </span>
                    </div>

                    {item.ultimoMensaje && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {item.ultimoMensaje}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />{item.telefono}
                      </span>
                      {item.asignadoNombre && <span>· {item.asignadoNombre}</span>}
                      <span>· {item.origen === 'whatsapp' ? 'WhatsApp' : 'Lead'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => abrirWhatsApp(item.telefono)}
                      title="Abrir en WhatsApp Web"
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600
                                 hover:bg-emerald-50 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <Button
                      size="sm"
                      onClick={() => handleTomar(item)}
                      loading={busy}
                      disabled={busy}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Tomar
                    </Button>
                    <button
                      onClick={() => handleDescartar(item)}
                      disabled={busy}
                      title="Sacar del listado (no cambia el estado del lead)"
                      className="p-2 rounded-lg text-gray-300 hover:text-gray-500
                                 hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}