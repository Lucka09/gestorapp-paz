// src/features/campanas/CampanasPage.tsx
import { useState }           from 'react'
import { useNavigate }        from 'react-router-dom'
import {
  Megaphone, Plus, Users, CheckCircle2,
  Clock, Send, BarChart3, Trash2,
  Play, ChevronRight, Calendar,
} from 'lucide-react'
import { useCampanas, useAccionesCampana } from '@/hooks/useCampanas'
import { usePageTitle }       from '@/hooks/usePageTitle'
import { Spinner }            from '@/components/ui'
import Modal                  from '@/components/shared/Modal'
import ModalNuevaCampana      from './ModalNuevaCampana'
import {
  ESTADO_CAMPANA_LABELS, ESTADO_CAMPANA_COLORS,
  COSTO_CONVERSACION_USD,
} from '@/campana_types'
import type { Campana }       from '@/campana_types'
import toast                  from 'react-hot-toast'

// ─── CARD DE CAMPAÑA ──────────────────────────────────────────────────────────

function CampanaCard({
  campana, onSimular, onEliminar, onVer,
}: {
  campana: Campana
  onSimular: () => void
  onEliminar: () => void
  onVer: () => void
}) {
  const colorClass = ESTADO_CAMPANA_COLORS[campana.estado]
  const esBorrador = campana.estado === 'borrador'
  const costoEstimado = (campana.totalAudiencia * COSTO_CONVERSACION_USD).toFixed(2)

  return (
    <div
      className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer group"
      onClick={onVer}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#D4621A]/10 flex items-center justify-center shrink-0">
            <Megaphone size={18} className="text-[#D4621A]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{campana.nombre}</p>
            <p className="text-xs text-gray-400 truncate">{campana.descripcion || campana.template.nombreMeta}</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-2 ${colorClass}`}>
          {ESTADO_CAMPANA_LABELS[campana.estado]}
        </span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Audiencia',  val: campana.totalAudiencia || campana.metricas.totalContactos, icon: <Users size={11} /> },
          { label: 'Enviados',   val: campana.metricas.enviados,   icon: <Send size={11} /> },
          { label: 'Leídos',     val: `${campana.metricas.tasaApertura}%`, icon: <CheckCircle2 size={11} /> },
          { label: 'Respuestas', val: campana.metricas.respondidos, icon: <BarChart3 size={11} /> },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
              {m.icon}
              <span className="text-[9px] uppercase tracking-wider">{m.label}</span>
            </div>
            <p className="text-sm font-bold text-gray-800">{m.val}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {campana.programadaPara ? (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {campana.programadaPara.toDate().toLocaleDateString('es-AR')}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              Costo est. ~${costoEstimado} USD
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {esBorrador && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onSimular() }}
                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                title="Simular envío (dev)"
              >
                <Play size={13} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onEliminar() }}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
          <ChevronRight size={14} className="text-gray-300" />
        </div>
      </div>
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function CampanasPage() {
  usePageTitle('Campañas WhatsApp')
  const navigate                         = useNavigate()
  const { campanas, loading }            = useCampanas()
  const { simular, eliminar, saving }    = useAccionesCampana()
  const [modalNueva, setModalNueva]      = useState(false)
  const [eliminando, setEliminando]      = useState<string | null>(null)

  const totalEnviados   = campanas.reduce((s, c) => s + c.metricas.enviados, 0)
  const totalLeidos     = campanas.reduce((s, c) => s + c.metricas.leidos, 0)
  const totalRespuestas = campanas.reduce((s, c) => s + c.metricas.respondidos, 0)
  const totalCosto      = campanas.reduce((s, c) => s + (c.costoUSD ?? 0), 0)

  const handleEliminar = async (id: string) => {
    setEliminando(id)
    await eliminar(id)
    setEliminando(null)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {campanas.length} campaña{campanas.length !== 1 ? 's' : ''} · Meta Cloud API
          </p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D4621A] hover:bg-[#b8541a] text-white
                     text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={16} /> Nueva campaña
        </button>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Mensajes enviados',  val: totalEnviados.toLocaleString('es-AR'),   color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Mensajes leídos',    val: totalLeidos.toLocaleString('es-AR'),     color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Respuestas / leads', val: totalRespuestas.toLocaleString('es-AR'), color: 'text-[#D4621A]',   bg: 'bg-orange-50' },
          { label: 'Gasto total (USD)',  val: `$${totalCosto.toFixed(2)}`,             color: 'text-purple-600',  bg: 'bg-purple-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-white`}>
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <Spinner />
      ) : campanas.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <Megaphone size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Sin campañas todavía</p>
          <p className="text-sm text-gray-400 mb-4">
            Creá tu primera campaña de WhatsApp para captación o reactivación de clientes.
          </p>
          <button
            onClick={() => setModalNueva(true)}
            className="px-4 py-2 bg-[#D4621A] text-white text-sm font-semibold rounded-xl hover:bg-[#b8541a] transition-colors"
          >
            <Plus size={14} className="inline mr-1" /> Nueva campaña
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {campanas.map(c => (
            <CampanaCard
              key={c.id}
              campana={c}
              onVer={() => navigate(`/admin/campanas/${c.id}`)}
              onSimular={() => {
                toast.promise(simular(c.id), {
                  loading: 'Simulando envíos...',
                  success: 'Simulación completada',
                  error:   'Error en la simulación',
                })
              }}
              onEliminar={() => handleEliminar(c.id)}
            />
          ))}
        </div>
      )}

      {/* Modal nueva campaña */}
      <Modal
        open={modalNueva}
        onClose={() => setModalNueva(false)}
        title="Nueva campaña"
        subtitle="Configurá la audiencia, el template y el momento de envío"
        size="lg"
      >
        <ModalNuevaCampana
          onClose={() => setModalNueva(false)}
          onCreada={id => {
            setModalNueva(false)
            navigate(`/admin/campanas/${id}`)
          }}
        />
      </Modal>
    </div>
  )
}