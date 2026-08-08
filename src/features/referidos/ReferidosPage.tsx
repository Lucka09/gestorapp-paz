// src/features/referidos/ReferidosPage.tsx
// ─── MÉTRICAS DE CANALES COMERCIALES ──────────────────────────────────────────
// Dashboard para registrar y analizar el rendimiento de concesionarias,
// agencias, reventas y encargados de multas como fuentes de captación.
// Datos en tiempo real desde clientes + trámites — sin colección extra.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import {
  Building2, Car, Store, ShieldAlert,
  TrendingUp, Users, FileText, DollarSign,
  ChevronDown, ChevronUp, ArrowUpRight,
  BarChart3, Clock, CheckCircle2, Search, Globe,
} from 'lucide-react'
import { useNavigate }         from 'react-router-dom'
import { usePageTitle }        from '@/hooks/usePageTitle'
import { usePermisos }         from '@/hooks/usePermisos'
import { PageHeader, Spinner } from '@/components/ui'
import {
  useReferidosMetricas,
  type MetricaReferente, type MetricaCanal,
} from '@/hooks/useReferidosMetricas'
import type { OrigenCanal }  from '@/types'
import { ORIGEN_CANAL_LABELS } from '@/types'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fp(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR')}`
}

function formatFechaCorta(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function formatRelativo(d: Date | null): string {
  if (!d) return '—'
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30)  return `hace ${dias} días`
  if (dias < 365) return `hace ${Math.floor(dias / 30)} meses`
  return `hace ${Math.floor(dias / 365)} años`
}

// ─── ICONO POR CANAL ──────────────────────────────────────────────────────────

const CANAL_ICON: Record<OrigenCanal, React.ElementType> = {
  concesionaria:    Building2,
  agencia:          Car,
  reventa:          Store,
  encargado_multas: ShieldAlert,
  referido_persona: Users,
  instagram: TrendingUp, facebook: TrendingUp, google: TrendingUp,
  cartel_local: TrendingUp, whatsapp: TrendingUp,
  web: Globe, otro: TrendingUp,
}

const CANAL_COLOR: Partial<Record<OrigenCanal, { bg: string; text: string; border: string; accent: string }>> = {
  concesionaria:    { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   accent: '#3B82F6' },
  agencia:          { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200', accent: '#7C3AED' },
  reventa:          { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',accent: '#059669' },
  encargado_multas: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  accent: '#D97706' },
}

const DEFAULT_CANAL_COLOR = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', accent: '#6B7280' }

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, accent = '#D4621A',
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)', color: accent }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── BARRA DE PROGRESO ────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ─── TABLA DE REFERENTES ──────────────────────────────────────────────────────

function TablaReferentes({
  referentes, maxIngresos,
}: { referentes: MetricaReferente[]; maxIngresos: number }) {
  const navigate = useNavigate()
  const [orden, setOrden]   = useState<keyof MetricaReferente>('ingresosGenerados')
  const [asc,   setAsc]     = useState(false)
  const [busq,  setBusq]    = useState('')

  const ordenados = useMemo(() => {
    const filtrados = busq
      ? referentes.filter(r => r.nombre.toLowerCase().includes(busq.toLowerCase()))
      : referentes
    return [...filtrados].sort((a, b) => {
      const va = a[orden] as number
      const vb = b[orden] as number
      return asc ? va - vb : vb - va
    })
  }, [referentes, orden, asc, busq])

  const col = (key: keyof MetricaReferente, label: string) => (
    <th
      className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase
                 tracking-wider cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
      onClick={() => { setOrden(key); setAsc(o => orden === key ? !o : false) }}
    >
      <span className="flex items-center gap-1">
        {label}
        {orden === key && (asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  )

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Buscador */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busq}
            onChange={e => setBusq(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs
                       outline-none focus:border-[#D4621A] bg-gray-50"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-100 bg-gray-50/60">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Entidad / Referente
              </th>
              {col('totalClientes',       'Clientes')}
              {col('totalTramites',       'Trámites')}
              {col('tramitesCompletados', 'Completados')}
              {col('pctConversion',       '% Conversión')}
              {col('ingresosGenerados',   'Ingresos')}
              {col('ticketPromedio',      'Ticket Prom.')}
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Última Act.
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  Sin resultados
                </td>
              </tr>
            ) : ordenados.map((r, i) => {
              const color = CANAL_COLOR[r.canal] ?? DEFAULT_CANAL_COLOR
              return (
                <tr key={`${r.canal}::${r.nombre}`}
                  className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  {/* Entidad */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${color.bg} border ${color.border}`}>
                        {(() => { const Icon = CANAL_ICON[r.canal]; return <Icon size={14} className={color.text} /> })()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800 leading-tight">{r.nombre}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                          {r.canalLabel}
                        </span>
                      </div>
                    </div>
                  </td>
                  {/* Clientes */}
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-gray-800">{r.totalClientes}</span>
                  </td>
                  {/* Trámites */}
                  <td className="px-4 py-3.5">
                    <div>
                      <span className="text-sm font-bold text-gray-800">{r.totalTramites}</span>
                      {r.tramitesActivos > 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          {r.tramitesActivos} activos
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Completados */}
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-semibold text-emerald-600">{r.tramitesCompletados}</span>
                  </td>
                  {/* % Conversión */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <span className="text-sm font-bold text-gray-700 w-8 shrink-0">
                        {r.pctConversion}%
                      </span>
                      <MiniBar value={r.pctConversion} max={100} color={color.accent} />
                    </div>
                  </td>
                  {/* Ingresos */}
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm font-extrabold" style={{ color: color.accent }}>
                        {fp(r.ingresosGenerados)}
                      </p>
                      <MiniBar value={r.ingresosGenerados} max={maxIngresos} color={color.accent} />
                    </div>
                  </td>
                  {/* Ticket promedio */}
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-semibold text-gray-600">
                      {r.ticketPromedio > 0 ? fp(r.ticketPromedio) : '—'}
                    </span>
                  </td>
                  {/* Última actividad */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-gray-400">{formatRelativo(r.ultimaActividad)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── CARD DE CANAL ────────────────────────────────────────────────────────────

function CanalCard({
  canal, expandido, onToggle, maxIngresos,
}: {
  canal: MetricaCanal; expandido: boolean; onToggle: () => void; maxIngresos: number
}) {
  const color = CANAL_COLOR[canal.canal] ?? DEFAULT_CANAL_COLOR
  const Icon  = CANAL_ICON[canal.canal]

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${color.border} bg-white shadow-sm`}>
      {/* Header del canal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color.bg} border-2 ${color.border}`}>
            <Icon size={20} className={color.text} />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-base" style={{ fontFamily: 'var(--font-display)' }}>
              {canal.canalLabel}
            </p>
            <p className="text-xs text-gray-400">
              {canal.referentes.length} entidad{canal.referentes.length !== 1 ? 'es' : ''} ·{' '}
              {canal.totalClientes} cliente{canal.totalClientes !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trámites</p>
            <p className="text-lg font-extrabold text-gray-800">{canal.totalTramites}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ingresos</p>
            <p className="text-lg font-extrabold" style={{ color: color.accent }}>
              {fp(canal.ingresosTotal)}
            </p>
          </div>
          {expandido
            ? <ChevronUp   size={16} className="text-gray-400 shrink-0" />
            : <ChevronDown size={16} className="text-gray-400 shrink-0" />
          }
        </div>
      </button>

      {/* Detalle expandido */}
      {expandido && (
        <div className="border-t border-gray-100">
          {canal.referentes.map(r => (
            <div key={`${r.canal}::${r.nombre}`}
              className="px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <p className="font-bold text-gray-800 text-sm">{r.nombre}</p>
                    {r.tramitesActivos > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        {r.tramitesActivos} activos
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={11} className="text-gray-400" />
                      {r.totalClientes} clientes
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText size={11} className="text-gray-400" />
                      {r.totalTramites} trámites
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-emerald-500" />
                      {r.tramitesCompletados} completados
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} className="text-gray-400" />
                      primer cliente: {formatFechaCorta(r.primerCliente)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Conversión</p>
                    <p className="text-base font-extrabold text-gray-700">{r.pctConversion}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Ticket prom.</p>
                    <p className="text-base font-extrabold text-gray-600">
                      {r.ticketPromedio > 0 ? fp(r.ticketPromedio) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Ingresos</p>
                    <p className="text-lg font-extrabold" style={{ color: color.accent }}>
                      {fp(r.ingresosGenerados)}
                    </p>
                    <div className="w-20">
                      <MiniBar value={r.ingresosGenerados} max={maxIngresos} color={color.accent} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function ReferidosPage() {
  usePageTitle('Métricas de Referidos')
  const { puede }   = usePermisos()
  const navigate    = useNavigate()

  // Solo propietario, admin_gral y admin
  const puedeVer = puede('verCobranzas') || puede('verReportes') || puede('gestionarEquipo')

  const { canales, referentes, totales, loading } = useReferidosMetricas()

  const [vista, setVista]   = useState<'canales' | 'tabla'>('canales')
  const [expandidos, setExp] = useState<Set<string>>(new Set())

  const toggleCanal = (canal: string) =>
    setExp(prev => {
      const next = new Set(prev)
      next.has(canal) ? next.delete(canal) : next.add(canal)
      return next
    })

  const maxIngresos = referentes[0]?.ingresosGenerados ?? 1

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Building2 size={40} className="text-gray-300" />
        <p className="text-gray-500 text-sm">No tenés acceso a este módulo.</p>
      </div>
    )
  }

  if (loading) return <Spinner label="Calculando métricas..." />

  return (
    <div className="space-y-6 animate-fadein max-w-5xl">

      <PageHeader
        title="Métricas de Referidos"
        subtitle="Concesionarias · Agencias · Reventas · Encargados de multas"
      />

      {/* Sin datos */}
      {referentes.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
          <Building2 size={40} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 font-semibold mb-1">Sin datos de canales comerciales</p>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Cuando cargues clientes con origen "Concesionaria", "Agencia", "Reventa" o "Encargado de Multas",
            las métricas aparecerán acá automáticamente.
          </p>
          <button
            onClick={() => navigate('/admin/clientes')}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-[#D4621A] text-white
                       text-sm font-bold rounded-xl hover:bg-[#c05518] transition-colors"
          >
            <Users size={15} /> Ver clientes
          </button>
        </div>
      ) : (
        <>
          {/* KPIs globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Building2}  label="Canales activos"
              value={String(canales.length)}
              sub={`${referentes.length} entidades`}
              accent="#D4621A"
            />
            <KpiCard
              icon={Users}      label="Clientes traídos"
              value={String(totales.clientes)}
              sub="por canales comerciales"
              accent="#3B82F6"
            />
            <KpiCard
              icon={FileText}   label="Trámites generados"
              value={String(totales.tramites)}
              sub="por estos clientes"
              accent="#7C3AED"
            />
            <KpiCard
              icon={DollarSign} label="Ingresos totales"
              value={fp(totales.ingresos)}
              sub="de clientes referidos"
              accent="#059669"
            />
          </div>

          {/* Selector de vista */}
          <div className="flex gap-2">
            {[
              { key: 'canales', icon: Building2, label: 'Por canal' },
              { key: 'tabla',   icon: BarChart3,  label: 'Ranking general' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setVista(v.key as typeof vista)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                            border transition-all ${
                  vista === v.key
                    ? 'bg-[#D4621A] border-[#D4621A] text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <v.icon size={14} />
                {v.label}
              </button>
            ))}
          </div>

          {/* Vista: por canal */}
          {vista === 'canales' && (
            <div className="space-y-4">
              {canales.map(canal => (
                <CanalCard
                  key={canal.canal}
                  canal={canal}
                  expandido={expandidos.has(canal.canal)}
                  onToggle={() => toggleCanal(canal.canal)}
                  maxIngresos={maxIngresos}
                />
              ))}
            </div>
          )}

          {/* Vista: ranking general */}
          {vista === 'tabla' && (
            <TablaReferentes referentes={referentes} maxIngresos={maxIngresos} />
          )}

          {/* Nota */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100
                          rounded-2xl px-5 py-4">
            <ArrowUpRight size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 leading-relaxed">
              <strong>¿Cómo se calculan estas métricas?</strong>{' '}
              Los datos se calculan en tiempo real desde los clientes con origen tipado
              (campo "Referido por" en el formulario de cliente) y sus trámites asociados.
              Para que un cliente aparezca acá, debe tener el campo <em>Concesionaria</em>,{' '}
              <em>Agencia</em>, <em>Reventa</em> o <em>Encargado de Multas</em> en su origen.
            </p>
          </div>
        </>
      )}
    </div>
  )
}