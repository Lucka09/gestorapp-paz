// src/features/campanas/CampanaDetallePage.tsx
import { useState }       from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, Send, Eye, MessageCircle,
  DollarSign, TrendingUp, Play, Loader2,
  CheckCircle2, Clock, XCircle, AlertCircle,
} from 'lucide-react'
import { useCampanaDetalle, useAccionesCampana } from '@/hooks/useCampanas'
import { usePageTitle }    from '@/hooks/usePageTitle'
import { Spinner }         from '@/components/ui'
import {
  ESTADO_CAMPANA_LABELS, ESTADO_CAMPANA_COLORS,
  CRITERIO_LABELS,
} from '@/campana_types'
import type { EstadoEnvio, EnvioCampana } from '@/campana_types'
import toast from 'react-hot-toast'

// ─── ESTADO ENVÍO BADGE ───────────────────────────────────────────────────────

const ESTADO_ENVIO_CONFIG: Record<EstadoEnvio, { label: string; icon: React.ReactNode; cls: string }> = {
  pendiente:   { label: 'Pendiente',  icon: <Clock         size={10} />, cls: 'bg-gray-100 text-gray-600' },
  enviado:     { label: 'Enviado',    icon: <Send          size={10} />, cls: 'bg-blue-100 text-blue-700' },
  entregado:   { label: 'Entregado',  icon: <CheckCircle2  size={10} />, cls: 'bg-teal-100 text-teal-700' },
  leido:       { label: 'Leído ✓✓',  icon: <Eye           size={10} />, cls: 'bg-indigo-100 text-indigo-700' },
  respondido:  { label: 'Respondido', icon: <MessageCircle size={10} />, cls: 'bg-emerald-100 text-emerald-700 font-bold' },
  fallido:     { label: 'Fallido',    icon: <XCircle       size={10} />, cls: 'bg-red-100 text-red-700' },
  bloqueado:   { label: 'Bloqueado',  icon: <AlertCircle   size={10} />, cls: 'bg-orange-100 text-orange-700' },
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, val, sub, color }: {
  icon: React.ReactNode; label: string; val: string | number; sub?: string; color: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900">{val}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function CampanaDetallePage() {
  const { id }                    = useParams<{ id: string }>()
  const navigate                  = useNavigate()
  const { campana, envios, metricas, loading } = useCampanaDetalle(id)
  const { simular, saving }       = useAccionesCampana()
  const [tab, setTab]             = useState<'resumen' | 'envios'>('resumen')

  usePageTitle(campana ? campana.nombre : 'Campaña')

  if (loading) return <Spinner />
  if (!campana) return (
    <div className="text-center py-20">
      <p className="text-gray-500">Campaña no encontrada.</p>
    </div>
  )

  const estadoColor = ESTADO_CAMPANA_COLORS[campana.estado]
  const esBorrador  = campana.estado === 'borrador'

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/campanas')}
          className="mt-1 w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors shrink-0"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{campana.nombre}</h1>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${estadoColor}`}>
              {ESTADO_CAMPANA_LABELS[campana.estado]}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {CRITERIO_LABELS[campana.filtro.criterio]} · Template: <span className="font-mono">{campana.template.nombreMeta}</span>
          </p>
        </div>
        {esBorrador && (
          <button
            onClick={() => toast.promise(simular(id!), {
              loading: 'Simulando envíos...',
              success: 'Simulación completada',
              error:   'Error en simulación',
            })}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700
                       text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Simular envío
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <KpiCard icon={<Users size={16} className="text-blue-600" />}       label="Audiencia"    val={campana.totalAudiencia || metricas.totalContactos} color="bg-blue-50" />
        <KpiCard icon={<Send  size={16} className="text-indigo-600" />}     label="Enviados"     val={metricas.enviados}    color="bg-indigo-50" />
        <KpiCard icon={<CheckCircle2 size={16} className="text-teal-600" />} label="Entregados"  val={metricas.entregados}  color="bg-teal-50" />
        <KpiCard icon={<Eye  size={16} className="text-purple-600" />}      label="Leídos"       val={`${metricas.tasaApertura}%`} sub={`${metricas.leidos} mensajes`} color="bg-purple-50" />
        <KpiCard icon={<MessageCircle size={16} className="text-[#D4621A]" />} label="Respondieron" val={`${metricas.tasaRespuesta}%`} sub={`${metricas.respondidos} leads`} color="bg-orange-50" />
        <KpiCard icon={<DollarSign size={16} className="text-emerald-600" />} label="Costo/lead" val={metricas.costoPorLead > 0 ? `$${metricas.costoPorLead}` : '—'} sub="USD" color="bg-emerald-50" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['resumen', 'envios'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'resumen' ? 'Resumen' : `Envíos (${envios.length})`}
          </button>
        ))}
      </div>

      {/* RESUMEN */}
      {tab === 'resumen' && (
        <div className="grid grid-cols-2 gap-5">
          {/* Embudo visual */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Embudo de conversión</p>
            {[
              { label: 'Enviados',    val: metricas.enviados,    max: metricas.totalContactos || 1, color: 'bg-blue-500' },
              { label: 'Entregados',  val: metricas.entregados,  max: metricas.enviados || 1,       color: 'bg-teal-500' },
              { label: 'Leídos',      val: metricas.leidos,      max: metricas.entregados || 1,     color: 'bg-indigo-500' },
              { label: 'Respondidos', val: metricas.respondidos, max: metricas.leidos || 1,         color: 'bg-emerald-500' },
            ].map(e => (
              <div key={e.label} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{e.label}</span>
                  <span className="font-semibold text-gray-800">
                    {e.val} <span className="text-gray-400">({Math.round(e.val / (metricas.totalContactos || 1) * 100)}%)</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${e.color} transition-all`}
                    style={{ width: `${Math.round(e.val / (metricas.totalContactos || 1) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Info campaña */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Configuración</p>
            <div className="space-y-3">
              {[
                { label: 'Segmento',      val: CRITERIO_LABELS[campana.filtro.criterio] },
                { label: 'Template',      val: campana.template.nombreMeta },
                { label: 'Categoría',     val: campana.template.categoria },
                { label: 'Gasto real',    val: campana.costoUSD > 0 ? `$${campana.costoUSD.toFixed(3)} USD` : '$0 USD' },
                { label: 'Creada por',    val: campana.creadoPorNombre },
                { label: 'Creada el',     val: campana.creadoEn?.toDate?.()?.toLocaleDateString('es-AR') ?? '—' },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-gray-800">{r.val}</span>
                </div>
              ))}
            </div>

            {/* Vista previa template */}
            <div className="mt-4 bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Vista previa mensaje</p>
              <div className="bg-white rounded-xl p-3 shadow-sm max-w-[280px]">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {campana.template.cuerpo
                    .replace(/\{\{1\}\}/g, campana.template.variables[0]?.ejemplo ?? '...')
                    .replace(/\{\{2\}\}/g, campana.template.variables[1]?.ejemplo ?? '...')
                    .replace(/\{\{3\}\}/g, campana.template.variables[2]?.ejemplo ?? '...')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ENVÍOS */}
      {tab === 'envios' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {envios.length === 0 ? (
            <div className="py-16 text-center">
              <Send size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">Sin envíos todavía.</p>
              {esBorrador && (
                <p className="text-xs text-gray-400 mt-1">
                  Usá "Simular envío" para ver el flujo completo.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Contacto', 'Teléfono', 'Estado', 'Enviado', 'Leído'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {envios.map((e: EnvioCampana) => {
                  const cfg = ESTADO_ENVIO_CONFIG[e.estado]
                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{e.nombre}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.telefono}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {e.enviadoEn?.toDate?.()?.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {e.leidoEn?.toDate?.()?.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}