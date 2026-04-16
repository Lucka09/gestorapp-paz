import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, FunnelChart, Funnel, LabelList,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus,
  Target, Clock, Users, DollarSign,
  BarChart2, Activity, ArrowUpRight, ArrowDownRight,
  Calendar, Zap, RefreshCw,
} from 'lucide-react'
import { calcularAnalytics, type DatosAnalytics } from '@/lib/firestore/analytics'
import { PageHeader, Card, Spinner } from '@/components/ui'
import { formatPesos } from '@/utils'

// ─── COLORES ──────────────────────────────────────────────────────────────────

const NARANJA = '#D4621A'
const AZUL    = '#3B82F6'
const VERDE   = '#22C55E'
const AMBER   = '#F59E0B'
const PURP    = '#8B5CF6'
const GRIS    = '#9CA3AF'

// ─── COMPARATIVA CARD ────────────────────────────────────────────────────────

function ComparativaCard({
  label, comp, formato = 'numero', icon: Icon, color = NARANJA,
}: {
  label:    string
  comp:     { actual: number; anterior: number; variacion: number; tendencia: string }
  formato?: 'numero' | 'pesos' | 'pct'
  icon:     React.ElementType
  color?:   string
}) {
  const fmt = (n: number) =>
    formato === 'pesos'  ? formatPesos(n) :
    formato === 'pct'    ? `${n}%`        : String(n)

  const iconTend = comp.tendencia === 'up'
    ? <ArrowUpRight size={13} className="text-emerald-500" />
    : comp.tendencia === 'down'
    ? <ArrowDownRight size={13} className="text-red-500" />
    : <Minus size={13} className="text-gray-400" />

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full
                         ${comp.tendencia === 'up'   ? 'bg-emerald-100 text-emerald-700' :
                           comp.tendencia === 'down'  ? 'bg-red-100 text-red-600' :
                           'bg-gray-100 text-gray-500'}`}>
          {iconTend}
          {comp.variacion > 0 ? '+' : ''}{comp.variacion}%
        </div>
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
        {fmt(comp.actual)}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        vs mes ant.: {fmt(comp.anterior)}
      </p>
    </div>
  )
}

// ─── TOOLTIP PERSONALIZADO ────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-xl px-4 py-3 text-sm"
         style={{ fontFamily: 'var(--font-body)' }}>
      <p className="text-xs font-bold text-gray-500 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600 capitalize">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>
            {p.name === 'ingresos' || p.name === 'proyeccion' || p.name === 'ticketPromedio'
              ? formatPesos(p.value)
              : p.name === 'tasaCierre' ? `${p.value}%`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── SKELETON LOADING ────────────────────────────────────────────────────────

function SkeletonChart({ h = 200 }: { h?: number }) {
  return (
    <div className="skeleton rounded-xl w-full animate-pulse"
         style={{ height: h }} />
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [datos,     setDatos]     = useState<DatosAnalytics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [ventana,   setVentana]   = useState<6 | 12>(12)
  const [recargando,setRecargando]= useState(false)

  const cargar = async (m: 6 | 12) => {
    setRecargando(true)
    try {
      const d = await calcularAnalytics(m)
      setDatos(d)
    } catch (err) {
      console.error('[Analytics]', err)
    } finally {
      setLoading(false)
      setRecargando(false)
    }
  }

  useEffect(() => { cargar(ventana) }, [ventana])

  if (loading) return <Spinner label="Calculando analytics..." />

  if (!datos) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
      <BarChart2 size={40} className="mb-3 opacity-40" />
      <p className="text-sm text-gray-400">Sin datos suficientes para mostrar</p>
    </div>
  )

  const { tendencia, comparativa, proyeccion, tiempoResolucion,
          embudio, retencion, topDiaSemana, topHoraTurno, distribucionTicket } = datos

  // Combinar tendencia + proyección para el gráfico de área
  const datosProyeccion = [
    ...tendencia.slice(-4).map(t => ({
      mes: t.mes, ingresos: t.ingresos, proyeccion: null as number|null,
    })),
    ...proyeccion.map(p => ({
      mes: p.mes, ingresos: null as number|null, proyeccion: p.proyeccion,
    })),
  ]

  return (
    <div className="space-y-6 animate-fadein">

      <PageHeader
        title="Analytics"
        subtitle="Tendencias, proyecciones y análisis de negocio"
        action={
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-xl p-1">
              {([6, 12] as const).map(m => (
                <button key={m} onClick={() => setVentana(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                              ${ventana === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {m} meses
                </button>
              ))}
            </div>
            <button onClick={() => cargar(ventana)}
              className={`w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center
                          justify-center text-gray-400 hover:text-gray-700 transition-colors
                          ${recargando ? 'animate-spin' : ''}`}
              aria-label="Actualizar analytics">
              <RefreshCw size={15} />
            </button>
          </div>
        }
      />

      {/* ── COMPARATIVA MES ACTUAL ── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Este mes vs mes anterior
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ComparativaCard label="Ingresos"       comp={comparativa.ingresos}       formato="pesos"  icon={DollarSign} color={NARANJA} />
          <ComparativaCard label="Trámites"       comp={comparativa.tramites}       formato="numero" icon={Activity}   color={AZUL}    />
          <ComparativaCard label="Tasa de cierre" comp={comparativa.tasaCierre}     formato="pct"    icon={Target}     color={VERDE}   />
          <ComparativaCard label="Ticket promedio"comp={comparativa.ticketPromedio} formato="pesos"  icon={TrendingUp} color={PURP}    />
        </div>
      </div>

      {/* ── GRÁFICO TENDENCIA + PROYECCIÓN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Área de ingresos con proyección */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Ingresos históricos + proyección
              </p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">
                Últimos {ventana} meses y próximos 3
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ background: NARANJA }}/>
                Real
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded border-dashed border border-gray-300"/>
                Proyección
              </span>
            </div>
          </div>
          {recargando ? <SkeletonChart h={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={datosProyeccion} margin={{ top:4,right:0,left:0,bottom:0 }}>
                <defs>
                  <linearGradient id="gradNaranja" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={NARANJA} stopOpacity={0.15}/>
                    <stop offset="95%" stopColor={NARANJA} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradProy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={AZUL} stopOpacity={0.1}/>
                    <stop offset="95%" stopColor={AZUL} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
                <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}/>
                <Tooltip content={<CustomTooltip />}/>
                <Area type="monotone" dataKey="ingresos"   name="ingresos"
                  stroke={NARANJA} fill="url(#gradNaranja)" strokeWidth={2.5}
                  dot={{ fill: NARANJA, r: 3 }} connectNulls={false}/>
                <Area type="monotone" dataKey="proyeccion" name="proyeccion"
                  stroke={AZUL} fill="url(#gradProy)" strokeWidth={2}
                  strokeDasharray="5 4" dot={false} connectNulls={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
          {/* Confianza de proyección */}
          {proyeccion.length > 0 && (
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {proyeccion.map(p => (
                <div key={p.mes} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={`w-2 h-2 rounded-full ${
                    p.confianza === 'alta'  ? 'bg-emerald-400' :
                    p.confianza === 'media' ? 'bg-amber-400'   : 'bg-red-400'
                  }`}/>
                  {p.mes}: {formatPesos(p.proyeccion)}
                  <span className="text-gray-300">({p.confianza})</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Retención de clientes */}
        <Card className="p-5">
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Retención de clientes
            </p>
          </div>
          {recargando ? <SkeletonChart h={160} /> : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={[
                    { name: 'Recurrentes', value: retencion.recurrentes, color: VERDE   },
                    { name: 'Nuevos',      value: retencion.nuevos,      color: NARANJA },
                    { name: 'Inactivos',   value: retencion.perdidos,    color: GRIS    },
                  ]} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3}
                    dataKey="value">
                    {[VERDE, NARANJA, GRIS].map((c, i) => <Cell key={i} fill={c}/>)}
                  </Pie>
                  <Tooltip formatter={(v:any, n:any) => [v, n]}
                    contentStyle={{ borderRadius:12, border:'1px solid #E5E7EB', fontSize:12 }}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {[
                  { label: 'Recurrentes',  val: retencion.recurrentes, color: VERDE,   sub: '+1 trámite' },
                  { label: 'Nuevos',       val: retencion.nuevos,      color: NARANJA, sub: '1 trámite'  },
                  { label: 'Sin actividad',val: retencion.perdidos,    color: GRIS,    sub: '+90 días'   },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }}/>
                      <span className="text-xs text-gray-600">{r.label}</span>
                      <span className="text-xs text-gray-400">({r.sub})</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900">{r.val}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── SEGUNDA FILA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Multilinea: trámites + tasa cierre */}
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Volumen de trámites y tasa de cierre
          </p>
          {recargando ? <SkeletonChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tendencia} margin={{ top:4, right:10, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
                <XAxis dataKey="mes" tick={{ fontSize:10, fill:'#9CA3AF' }}
                  axisLine={false} tickLine={false}/>
                <YAxis yAxisId="vol" tick={{ fontSize:10, fill:'#9CA3AF' }}
                  axisLine={false} tickLine={false} width={28}/>
                <YAxis yAxisId="pct" orientation="right"
                  tick={{ fontSize:10, fill:'#9CA3AF' }}
                  axisLine={false} tickLine={false} width={30}
                  tickFormatter={v => `${v}%`}/>
                <Tooltip content={<CustomTooltip />}/>
                <Line yAxisId="vol" type="monotone" dataKey="tramites" name="trámites"
                  stroke={AZUL} strokeWidth={2.5} dot={{ fill:AZUL, r:3 }}/>
                <Line yAxisId="pct" type="monotone" dataKey="tasaCierre" name="tasaCierre"
                  stroke={VERDE} strokeWidth={2} strokeDasharray="4 3"
                  dot={{ fill:VERDE, r:2 }}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Tiempo promedio de resolución */}
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Tiempo promedio de resolución (días)
          </p>
          {tiempoResolucion.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300">
              <p className="text-sm">Sin trámites entregados todavía</p>
            </div>
          ) : recargando ? <SkeletonChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tiempoResolucion} layout="vertical"
                barSize={14} margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" hide/>
                <YAxis type="category" dataKey="label" width={115}
                  tick={{ fontSize:11, fill:'#6B7280' }} axisLine={false} tickLine={false}/>
                <Tooltip cursor={{ fill:'#F9FAFB' }}
                  formatter={(v:any, n:any) => [`${v} días`, 'Promedio']}
                  contentStyle={{ borderRadius:12, border:'1px solid #E5E7EB', fontSize:12 }}/>
                <Bar dataKey="promediosDias" name="promedio" radius={[0,6,6,0]}>
                  {tiempoResolucion.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? NARANJA : i < 3 ? AZUL : GRIS}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── TERCERA FILA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Embudo de conversión */}
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Embudo de conversión
          </p>
          {embudio.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300">
              <p className="text-sm">Sin datos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {embudio.map((e, i) => (
                <div key={e.etapa}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{e.etapa}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900">{e.cantidad}</span>
                      <span className="text-xs text-gray-400">({e.pct}%)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width:`${e.pct}%`, background: e.color }}/>
                  </div>
                  {i < embudio.length - 1 && (
                    <p className="text-xs text-gray-400 text-right mt-0.5">
                      ↓ {embudio[i+1].pct > 0
                        ? `${Math.round((embudio[i+1].cantidad/e.cantidad)*100)}% pasa`
                        : '—'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Distribución de ticket */}
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Distribución por monto cobrado
          </p>
          {recargando ? <SkeletonChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distribucionTicket} barSize={28}
                margin={{ top:4, right:0, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
                <XAxis dataKey="rango" tick={{ fontSize:9.5, fill:'#9CA3AF' }}
                  axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip cursor={{ fill:'#F9FAFB' }}
                  formatter={(v:any) => [v, 'trámites']}
                  contentStyle={{ borderRadius:12, border:'1px solid #E5E7EB', fontSize:12 }}/>
                <Bar dataKey="cantidad" name="trámites" fill={PURP} radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Día de la semana con más turnos */}
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Turnos por día de la semana
          </p>
          {recargando ? <SkeletonChart /> : topDiaSemana.every(d => d.cantidad === 0) ? (
            <div className="flex items-center justify-center h-48 text-gray-300">
              <p className="text-sm">Sin turnos todavía</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topDiaSemana} barSize={24}
                margin={{ top:4, right:0, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
                <XAxis dataKey="dia" tick={{ fontSize:11, fill:'#9CA3AF' }}
                  axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip cursor={{ fill:'#F9FAFB' }}
                  formatter={(v:any) => [v, 'turnos']}
                  contentStyle={{ borderRadius:12, border:'1px solid #E5E7EB', fontSize:12 }}/>
                <Bar dataKey="cantidad" fill={AMBER} radius={[6,6,0,0]}>
                  {topDiaSemana.map((d, i) => (
                    <Cell key={i} fill={d.cantidad === Math.max(...topDiaSemana.map(x=>x.cantidad))
                      ? NARANJA : AMBER}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── TICKET PROMEDIO HISTÓRICO ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Evolución del ticket promedio
            </p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">
              Ingreso promedio por trámite cobrado — últimos {ventana} meses
            </p>
          </div>
          <Zap size={16} className="text-gray-300"/>
        </div>
        {recargando ? <SkeletonChart h={160} /> : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={tendencia} margin={{ top:4, right:0, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="gradPurp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PURP} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={PURP} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#9CA3AF' }}
                axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}
                width={55} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Area type="monotone" dataKey="ticketPromedio" name="ticketPromedio"
                stroke={PURP} fill="url(#gradPurp)" strokeWidth={2.5}
                dot={{ fill:PURP, r:3 }}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Nota de datos */}
      <p className="text-xs text-center text-gray-400">
        Analytics calculado sobre todos los trámites en Firestore.
        Las proyecciones usan regresión lineal sobre los últimos 6 meses.
      </p>
    </div>
  )
}
