import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import {
  FileText, Users, CalendarDays,
  TrendingUp, DollarSign, Clock,
  ArrowRight, Target, Zap, Activity, Bell,
  ChevronUp, ChevronDown, Megaphone, Handshake,
} from 'lucide-react'
import {
  useMetricas, useUltimosTramites,
  useTurnosHoy, useDistribucionEstados,
  useIngresosPorMes, useTiposTramiteFrecuentes, useTopClientes,
  useClientesPorOrigen,
} from '@/hooks/useDashboard'
import type { IngresoMes, TipoCount, TopCliente } from '@/lib/firestore/dashboard'
import { useAuth }    from '@/hooks/useAuth'
import { useClientes } from '@/hooks/useClientes'
import { useProspectos } from '@/hooks/usePipeline'

import { ejecutarMotorAlertas }  from '@/lib/firestore/alertas'
import { BannerPushNotifications } from '@/components/shared/PushNotifications'
import { WidgetTareasHoy }          from '@/features/tareas/WidgetTareasHoy'
import { programarRecordatorio } from '@/lib/firestore/push'
import { TIPO_TRAMITE_LABELS as TTL } from '@/types'
import { useAlertas }             from '@/hooks/useAlertas'
import { NIVEL_CONFIG }            from '@/lib/firestore/alertas'
import { Card, Spinner } from '@/components/ui'
import { EstadoBadge } from '@/features/tramites/EstadoBadge'
import { TIPO_TRAMITE_LABELS } from '@/types'
import { formatPesos } from '@/utils'
import { format } from 'date-fns/format'
import { es } from 'date-fns/locale/es'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePermisos } from '@/hooks/usePermisos'

interface Alerta {
  id: string
  titulo: string
  detalle: string
  nivel?: string
  tipo?: string
  link?: string
}

const COLORES_ESTADO: Record<string, string> = {
  pendiente: '#EAB308', en_proceso: '#3B82F6',
  documentacion_requerida: '#EF4444', en_organismo: '#F97316',
  listo_para_retirar: '#10B981', entregado: '#22C55E', cancelado: '#9CA3AF',
}

// Paletas para las tortas de origen — un tono por posición (ya vienen ordenadas
// de mayor a menor cantidad), distintas entre sí para no confundir con Estados.
const COLORES_COMERCIAL = ['#7C3AED', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE']
const COLORES_DIGITAL   = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE', '#F0F9FF']

function KpiCard({ label, value, icon: Icon, color = '#D4621A', sub, onClick }: {
  label: string; value: string | number; icon: React.ElementType
  color?: string; sub?: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter') onClick() } : undefined}
      className={`bg-white border border-gray-100 rounded-2xl p-5 shadow-sm
                  ${onClick ? 'cursor-pointer hover:shadow-md hover:border-orange-100 transition-all' : ''}`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
           style={{ background: `${color}18` }}>
        <Icon size={19} style={{ color }} />
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function AlertaCard({ alerta, onClick }: { alerta: Alerta; onClick?: () => void }) {
  const nivel = alerta.nivel ?? alerta.tipo
  const base  = NIVEL_CONFIG[nivel as keyof typeof NIVEL_CONFIG] ?? NIVEL_CONFIG.info
  const s     = { bg: base.bg, border: base.border, dot: base.dot, text: base.color }
  return (
    <button onClick={onClick}
      className={`w-full text-left ${s.bg} border ${s.border} rounded-xl p-3.5 hover:brightness-95 transition-all`}>
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${s.text}`}>{alerta.titulo}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{alerta.detalle}</p>
        </div>
        <ArrowRight size={14} className="text-gray-400 shrink-0 mt-0.5" />
      </div>
    </button>
  )
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ color: string; name: string; value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3">
      <p className="text-xs font-bold text-gray-500 mb-1">{label}</p>
      {payload.map((p, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name === 'ingresos' ? formatPesos(p.value) : p.value}
          {' '}<span className="text-xs font-normal text-gray-400">{p.name}</span>
        </p>
      ))}
    </div>
  )
}

// Card reutilizable para las tortas de origen (comercial / digital)
function OrigenPieCard({
  titulo, subtitulo, icon: Icon, data, colores,
}: {
  titulo: string; subtitulo: string; icon: React.ElementType
  data: { canal: string; label: string; cantidad: number }[]
  colores: string[]
}) {
  const total = data.reduce((a, d) => a + d.cantidad, 0)
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{titulo}</p>
          <p className="text-sm font-semibold text-gray-700 mt-0.5">{subtitulo}</p>
        </div>
        <Icon size={16} className="text-gray-300" />
      </div>
      {total === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-gray-300">
          <Icon size={28} className="mb-2 opacity-40" />
          <p className="text-sm">Sin datos todavía</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={data} dataKey="cantidad" nameKey="label"
                cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                {data.map((_, i) => (
                  <Cell key={i} fill={colores[i % colores.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => {
                const n = typeof v === 'number' ? v : 0
                return [n, 'clientes']
              }} contentStyle={{ borderRadius:12,border:'1px solid #E5E7EB',fontSize:12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {data.slice(0, 5).map((d, i) => (
              <div key={d.canal} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colores[i % colores.length] }} />
                  <span className="text-xs text-gray-600">{d.label}</span>
                </div>
                <span className="text-xs font-bold text-gray-900">{d.cantidad}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { verFinanzas } = usePermisos()
  usePageTitle('Panel de Mando')
  const { metricas, loading: loadM } = useMetricas()
  const { tramites }                 = useUltimosTramites()
  const { turnos: turnosHoy }        = useTurnosHoy()
  const { data: distribucion }       = useDistribucionEstados()
  const { metricas: metPipeline }    = useProspectos()
  const { alertas, nivelMax } = useAlertas()

    // Los recibos/cobranzas no van al feed del Panel de Mando: tienen su propia
  // bandeja de supervisión. Filtramos para no inundar el dashboard.
  const alertasFeed = alertas.filter(a => a.categoria !== 'cobranzas')

  // Programar recordatorios para turnos del día
  useEffect(() => {
    if (!turnosHoy.length) return
    turnosHoy.forEach(t => {
      const fecha = t.fecha?.toDate?.()
      if (!fecha) return
      const enMs = fecha.getTime() - Date.now() - 15 * 60 * 1000  // 15 min antes
      if (enMs < 0) return
      programarRecordatorio(`turno-${t.id}`, enMs, {
        titulo:  `⏰ Turno en 15 minutos`,
        cuerpo:  `${TTL[t.tipoTramite]} a las ${t.horaInicio} hs`,
        url:     '/admin/turnos',
        tag:     `turno-${String(t.id)}`,
      })
    })
  }, [turnosHoy])

  // Analytics — usando hooks con TanStack Query (staleTime 10 min)
  const { data: ingresosMes,  loading: loadIngr  } = useIngresosPorMes(6)
  const { data: tiposTramite, loading: loadTipos } = useTiposTramiteFrecuentes()
  const { data: topClientes,  loading: loadTop   } = useTopClientes(5)
  const { comercial: origenComercial, digital: origenDigital, loading: loadOrigen } = useClientesPorOrigen()
  const { clientes } = useClientes()

  // Mapa rápido clienteId → cliente (para trámites recientes)
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const loadAnalytics = loadIngr || loadTipos || loadTop

  useEffect(() => {
    // Ejecutar motor de alertas en background (sin bloquear analytics)
    ejecutarMotorAlertas().catch(() => {})
  }, [])

  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  if (loadM) return <Spinner label="Cargando panel..." />

  return (
    <div className="space-y-6 animate-fadein">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:22,margin:'0 0 4px' }}>
            Buenos días, {user?.nombre ?? 'Admin'} 👋
          </h1>
          <p className="text-sm text-gray-400 capitalize">{hoy}</p>
        </div>
        {alertas.length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
            <Bell size={14} className="text-red-500" />
            <span className="text-sm font-semibold text-red-700">
              {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Banner push notifications */}
      <BannerPushNotifications />

      {/* Alertas inteligentes */}
      {alertasFeed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alertasFeed.map(a => (
            <AlertaCard key={a.id} alerta={a} onClick={() => a.link && navigate(a.link)} />
          ))}
        </div>
      )}

      {/* KPIs — Operativos */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Hoy</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Trámites hoy"  value={metricas?.tramitesHoy ?? 0}     icon={FileText}    color="#D4621A" onClick={() => navigate('/admin/tramites')} />
          <KpiCard label="Activos"        value={metricas?.tramitesActivos ?? 0}  icon={Clock}       color="#3B82F6" sub={`${metricas?.tramitesPendientes ?? 0} pendientes`} onClick={() => navigate('/admin/tramites')} />
          <KpiCard label="Turnos hoy"     value={metricas?.turnosHoy ?? 0}        icon={CalendarDays} color="#10B981" sub={`${metricas?.turnosProximos ?? 0} próx. 7 días`} onClick={() => navigate('/admin/turnos')} />
          {verFinanzas && (
            <KpiCard label="Sin cobrar" value={metricas?.sinPagar ?? 0} icon={DollarSign} color="#EF4444" sub="trámites con saldo" onClick={() => navigate('/admin/tramites')} />
          )}
        </div>
      </div>

      {/* KPIs — Financiero — solo propietario */}
      {verFinanzas && (
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Financiero</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Ingresos hoy"     value={formatPesos(metricas?.ingresosHoy ?? 0)}    icon={TrendingUp} color="#D4621A" />
          <KpiCard label="Ingresos semana" value={formatPesos(metricas?.ingresosSemana ?? 0)} icon={Activity} color="#0EA5E9" sub="lunes a hoy"
  onClick={() => navigate('/admin/cobranzas?periodo=semana')} />
          <KpiCard label="Ingresos del mes" value={formatPesos(metricas?.ingresosMes ?? 0)}    icon={Activity}   color="#059669" />
          <KpiCard label="Clientes"         value={metricas?.totalClientes ?? 0}                icon={Users}      color="#7C3AED" onClick={() => navigate('/admin/clientes')} />
          <KpiCard label="Prospectos"         value={`${metPipeline.conversion}%`}               icon={Target}     color="#F97316" sub={`${metPipeline.cerrados} cerrados`} onClick={() => navigate('/admin/pipeline')} />
        </div>
      </div>
      )}

      {/* Gráficos financieros — solo propietario */}
      {verFinanzas && <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Ingresos por mes */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ingresos por mes</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">Últimos 6 meses</p>
            </div>
            <TrendingUp size={16} className="text-gray-300" />
          </div>
          {loadAnalytics ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : ingresosMes.every(m => m.ingresos === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-300">
              <Activity size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Sin datos de ingresos todavía</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ingresosMes} barSize={28} margin={{ top:4,right:0,left:0,bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="mes" tick={{ fontSize:11,fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11,fill:'#9CA3AF' }} axisLine={false} tickLine={false} width={52}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill:'#F9FAFB' }} />
                <Bar dataKey="ingresos" name="ingresos" fill="#D4621A" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Distribución de estados */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estados</p>
            <FileText size={16} className="text-gray-300" />
          </div>
          {distribucion.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-300">
              <FileText size={28} className="mb-2 opacity-40" />
              <p className="text-sm">Sin trámites</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={distribucion} dataKey="cantidad" nameKey="label"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                    {distribucion.map((e, i) => (
                      <Cell key={i} fill={COLORES_ESTADO[e.estado] ?? '#E5E7EB'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => {
  const n = typeof v === 'number' ? v : 0;
  return [n, 'Cantidad'];
}}
                    contentStyle={{ borderRadius:12,border:'1px solid #E5E7EB',fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {distribucion.slice(0,5).map((d,i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: COLORES_ESTADO[d.estado] ?? '#E5E7EB' }} />
                      <span className="text-xs text-gray-600">{d.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900">{d.cantidad}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Gráficos comerciales — de dónde vienen los clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OrigenPieCard
          titulo="Origen comercial"
          subtitulo="Referidos, multas, reventa y compañías"
          icon={Handshake}
          data={origenComercial}
          colores={COLORES_COMERCIAL}
        />
        <OrigenPieCard
          titulo="Canal de captación"
          subtitulo="Meta, Google, página, etc."
          icon={Megaphone}
          data={origenDigital}
          colores={COLORES_DIGITAL}
        />
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Tipos de trámite */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trámites por tipo</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">Los más frecuentes</p>
            </div>
            <Zap size={16} className="text-gray-300" />
          </div>
          {loadAnalytics ? (
            <div className="space-y-3">{[1,2,3,4].map(i=><div key={i} className="skeleton h-8 rounded-lg"/>)}</div>
          ) : tiposTramite.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-300">
              <p className="text-sm">Sin datos todavía</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tiposTramite} layout="vertical" barSize={16}
                margin={{ top:0,right:16,left:0,bottom:0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={110}
                  tick={{ fontSize:11,fill:'#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill:'#F9FAFB' }} formatter={(v) => [v,'trámites']}
                  contentStyle={{ borderRadius:12,border:'1px solid #E5E7EB',fontSize:12 }} />
                <Bar dataKey="cantidad" fill="#D4621A" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top clientes */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top clientes</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">Por volumen de ingresos</p>
            </div>
            <Users size={16} className="text-gray-300" />
          </div>
          {loadAnalytics ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i=>(
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-8 h-8 rounded-full shrink-0"/>
                <div className="flex-1 space-y-1.5"><div className="skeleton h-3 w-32 rounded"/><div className="skeleton h-2.5 w-20 rounded"/></div>
              </div>
            ))}</div>
          ) : topClientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-300">
              <Users size={28} className="mb-2 opacity-40"/>
              <p className="text-sm">Sin datos todavía</p>
            </div>
          ) : (
            <div className="space-y-0">
              {topClientes.map((c,i) => (
                <div key={c.clienteId} onClick={() => navigate(`/admin/clientes/${c.clienteId}`)}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0
                             cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                       style={{ background:i===0?'#FEF3EC':'#F3F4F6', color:i===0?'#D4621A':'#6B7280' }}>
                    {i+1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</p>
                    <p className="text-xs text-gray-400">{c.tramites} trámite{c.tramites!==1?'s':''}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-700 shrink-0">
                    {c.ingresos>0?formatPesos(c.ingresos):'—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </>} {/* fin verFinanzas */}

      {/* Agenda + Últimos trámites + Tareas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Agenda de hoy</p>
            <button onClick={() => navigate('/admin/turnos')}
              className="text-xs font-medium flex items-center gap-1"
              style={{ color:'var(--gp-orange)',background:'none',border:'none',cursor:'pointer' }}>
              Ver agenda <ArrowRight size={12}/>
            </button>
          </div>
          {turnosHoy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-300">
              <CalendarDays size={28} className="mb-2 opacity-40"/>
              <p className="text-sm">Sin turnos para hoy</p>
            </div>
          ) : (
            <div className="space-y-0">
              {turnosHoy.slice(0,6).map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-sm font-bold" style={{ color:'var(--gp-orange)' }}>{t.horaInicio}</p>
                    <p className="text-xs text-gray-400">{t.horaFin}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {TIPO_TRAMITE_LABELS[t.tipoTramite]}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{t.clienteNombre ?? 'cliente'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    t.estado==='confirmado'?'bg-emerald-100 text-emerald-700':'bg-yellow-100 text-yellow-700'}`}>
                    {t.estado==='confirmado'?'Confirmado':'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trámites recientes</p>
            <button onClick={() => navigate('/admin/tramites')}
              className="text-xs font-medium flex items-center gap-1"
              style={{ color:'var(--gp-orange)',background:'none',border:'none',cursor:'pointer' }}>
              Ver todos <ArrowRight size={12}/>
            </button>
          </div>
          {tramites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-300">
              <FileText size={28} className="mb-2 opacity-40"/>
              <p className="text-sm">Sin trámites registrados</p>
            </div>
          ) : (
            <div className="space-y-0">
              {tramites.slice(0,6).map(t => {
                const cli = clienteMap[t.clienteId]
                return (
                  <div key={t.id} onClick={() => navigate(`/admin/tramites/${t.id}`)}
                    className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0
                               cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                    {/* Icono tipo */}
                    <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: '#FEF3EC', color: '#D4621A' }}>
                      {t.tipo === 'inscripcion_inicial' ? 'INS' : t.tipo === 'transferencia' ? 'TRF' : 'MUL'}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Nombre cliente */}
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {cli ? `${cli.nombre} ${cli.apellido}`.trim() : TIPO_TRAMITE_LABELS[t.tipo]}
                      </p>
                      {/* Tipo + patente + origen referido */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[10px] text-gray-400">{TIPO_TRAMITE_LABELS[t.tipo]}</span>
                        {t.patente && (
                          <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0 rounded tracking-wider">
                            {t.patente}
                          </span>
                        )}
                        {cli && (cli as any).origenCanal && ['concesionaria','agencia','reventa','encargado_multas'].includes((cli as any).origenCanal) && (
                          <span className="text-[10px] font-semibold text-[#D4621A] bg-orange-50 px-1.5 py-0 rounded-full">
                            {(cli as any).origenNombre ?? (cli as any).origenCanal}
                          </span>
                        )}
                      </div>
                    </div>
                    <EstadoBadge estado={t.estado}/>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
          <WidgetTareasHoy />
    </div>

    </div>
  )
}