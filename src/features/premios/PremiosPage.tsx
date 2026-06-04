// src/features/premios/PremiosPage.tsx
// Panel de Premios & Objetivos — tema claro, branding GestorApp
// v2 — Segmentación Moto/Auto · Desglose SUATS/Informe · JAH-NISSI Digital Studio
// ─────────────────────────────────────────────────────────────────────────────
//
// CORRECCIONES v2 vs v1 del usuario:
// [FIX-01] CicloCard estaba definido DENTRO del return() de PremiosPage — movido afuera
// [FIX-02] PanelDesgloseMultas estaba mezclado con comentarios como código muerto — limpiado
// [FIX-03] CicloStep obsoleto eliminado (reemplazado por CicloCard)
// [FIX-04] Imports no usados eliminados: Flame, Target, TrendingUp, ArrowLeftRight
// [FIX-05] textC auto para fondo claro: text-[#B45316] (ratio 5:1 sobre blanco)
// [FIX-06] Iconos Car/Bike de Lucide en lugar de emojis (design system consistente)
// [FIX-07] hitosOrdenados/totalGanado calculados DESPUÉS del guard if(!data)
// [FIX-08] KPI "Trámites": subtexto corregido a "Cobrados este mes" (incluye inscripción)
// [FIX-09] Nota explicativa de diferencia de montos Moto/Auto presente
// [FIX-10] KPI "Total ganado": color naranja aplicado condicionalmente
// ─────────────────────────────────────────────────────────────────────────────

import {
  Trophy, Star, CheckCircle2, Lock,
  ChevronRight, FileText, AlertCircle,
  Sparkles, Settings, Calendar, Car, Bike,
} from 'lucide-react'
import { useNavigate }       from 'react-router-dom'
import { usePageTitle }      from '@/hooks/usePageTitle'
import { useAuth }           from '@/hooks/useAuth'
import { Spinner }           from '@/components/ui'
import {
  usePremios,
  HITO_VISUAL,
  formatPesos,
  formatPesosCompacto,
  type HitoMultaConfig,
  type CicloTramites,
  type PremiosData,
} from '@/hooks/usePremios'
import { useCierreMensual }  from '@/hooks/useCierreMensual'

// ─── BARRA DE PROGRESO ────────────────────────────────────────────────────────

function ProgressBar({
  value, max, color = '#D4621A', height = 8,
}: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full rounded-full bg-gray-100 overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width:      `${pct}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          boxShadow:  pct > 0 ? `0 0 8px ${color}44` : undefined,
        }}
      />
    </div>
  )
}

// ─── CICLO CARD (Moto / Auto) ─────────────────────────────────────────────────
// [FIX-01] Este componente debe estar FUERA de PremiosPage para que React no lo
//          re-monte en cada render ni viole las Rules of Hooks.

function CicloCard({ ciclo }: { ciclo: CicloTramites }) {
  const {
    tipo, tipoLabel, montoPremio, tramitesPorCiclo,
    tramitesCalificantes, premiosGanados, premiosPesos,
    tramitesEnCiclo, tramitesFaltan,
  } = ciclo

  const esMoto = tipo === 'moto'
  // [FIX-05] Colores de texto con ratio ≥ 5:1 sobre blanco
  const color   = esMoto ? '#7C3AED' : '#D4621A'
  const bgLight = esMoto ? 'bg-violet-50'      : 'bg-orange-50'
  const border  = esMoto ? 'border-violet-200' : 'border-orange-200'
  const textC   = esMoto ? 'text-violet-700'   : 'text-[#B45316]'
  // [FIX-06] Lucide icons en lugar de emojis
  const Icon    = esMoto ? Bike : Car

  return (
    <div className={`rounded-2xl border ${border} ${bgLight} p-5`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${color}15`, border: `1.5px solid ${color}30` }}
          >
            <Icon size={18} style={{ color }} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
              {tipoLabel}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Premio: <strong className={textC}>{formatPesos(montoPremio)}</strong>
              {' '}cada {tramitesPorCiclo} trámites
            </p>
          </div>
        </div>
        {premiosGanados > 0 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400 mb-0.5">Ganado</p>
            <p className="text-lg font-extrabold" style={{ color, fontFamily: 'var(--font-display)' }}>
              {formatPesosCompacto(premiosPesos)}
            </p>
          </div>
        )}
      </div>

      {/* Ciclo visual — casillas numeradas */}
      <div className="flex gap-2 mb-3">
        {Array.from({ length: tramitesPorCiclo }).map((_, i) => {
          const done = i < tramitesEnCiclo
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all"
                style={
                  done
                    ? { background: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
                    : { border: `2px dashed ${color}40`, background: '#fff', color: '#9CA3AF' }
                }
              >
                {done ? <CheckCircle2 size={16} className="text-white" /> : i + 1}
              </div>
              <span
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: done ? color : '#9CA3AF' }}
              >
                {done ? 'OK' : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Progreso */}
      <ProgressBar value={tramitesEnCiclo} max={tramitesPorCiclo} color={color} height={6} />
      <p className={`text-xs font-semibold mt-2 ${tramitesFaltan < tramitesPorCiclo ? textC : 'text-gray-500'}`}>
        {tramitesFaltan === tramitesPorCiclo
          ? `Completá ${tramitesPorCiclo} trámites para ganar ${formatPesos(montoPremio)}`
          : tramitesFaltan === 1
            ? `¡Solo 1 trámite más para ganar ${formatPesos(montoPremio)}! 🔥`
            : `${tramitesFaltan} trámites más para ganar ${formatPesos(montoPremio)}`}
      </p>

      {/* Tipos que califican */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-200/60">
        <span className="text-[10px] text-gray-400 font-medium self-center">Califican:</span>
        {(['Transferencia', 'Baja', 'Inscripción Inicial'] as const).map(t => (
          <span key={t} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${border} ${bgLight} ${textC}`}>
            {t}
          </span>
        ))}
        <span className="text-[10px] text-gray-400 self-center">· pagados</span>
      </div>

      {/* Acumulado del mes */}
      {premiosGanados > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-center justify-between">
          <span className="text-xs text-gray-500">Este mes:</span>
          <span className="text-sm font-extrabold" style={{ color }}>
            {premiosGanados} × {formatPesos(montoPremio)} = {formatPesos(premiosPesos)}
          </span>
        </div>
      )}

      {tramitesCalificantes === 0 && (
        <p className="text-[11px] text-gray-400 mt-3 text-center italic">
          Todavía no hay trámites {esMoto ? 'de moto' : 'de auto'} cobrados este mes.
        </p>
      )}
    </div>
  )
}

// ─── CARD DE HITO (Facturación Multas) ───────────────────────────────────────

function HitoCard({
  hito, alcanzado, facturacion,
}: { hito: HitoMultaConfig; alcanzado: boolean; facturacion: number }) {
  const visual = HITO_VISUAL[hito.id] ?? HITO_VISUAL[1]
  const pct    = Math.min(100, (facturacion / hito.montoUmbral) * 100)
  const esProx = !alcanzado && facturacion < hito.montoUmbral
  const tieneP = hito.premioMonto > 0

  return (
    <div className={`
      rounded-2xl border p-5 transition-all
      ${alcanzado ? 'bg-white border-gray-200 shadow-md'
      : esProx    ? 'bg-white border-gray-200 shadow-sm'
      :             'bg-gray-50 border-gray-100'}
    `}>
      <div className="flex items-start gap-4 mb-4">

        {/* Ícono */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
          style={{
            background: alcanzado ? `${visual.color}20` : '#F3F4F6',
            border:     alcanzado ? `2px solid ${visual.color}40` : '2px solid #E5E7EB',
          }}
        >
          {alcanzado ? visual.icon : <Lock size={20} className="text-gray-400" />}
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`font-bold text-base ${alcanzado ? 'text-gray-900' : esProx ? 'text-gray-800' : 'text-gray-400'}`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {visual.label}
            </span>
            {alcanzado && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${visual.color}15`, color: visual.color }}>
                ✓ Alcanzado
              </span>
            )}
            {!alcanzado && !esProx && (
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Bloqueado
              </span>
            )}
          </div>
          <p className={`text-sm ${alcanzado ? 'text-gray-500' : 'text-gray-400'}`}>{hito.descripcion}</p>
        </div>

        {/* Umbral + Premio */}
        <div className="text-right shrink-0 space-y-1">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Umbral</div>
            <div className="text-sm font-bold text-gray-700 font-mono">{formatPesosCompacto(hito.montoUmbral)}</div>
          </div>
          {tieneP ? (
            <div className="mt-1.5 px-2.5 py-1.5 rounded-xl"
              style={{
                background: alcanzado ? `${visual.color}12` : '#F3F4F6',
                border:     alcanzado ? `1px solid ${visual.color}30` : '1px solid #E5E7EB',
              }}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Premio</div>
              <div className="text-sm font-bold" style={{ color: alcanzado ? visual.color : '#6B7280' }}>
                {formatPesosCompacto(hito.premioMonto)}
              </div>
            </div>
          ) : (
            <div className="mt-1.5 px-2.5 py-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50">
              <div className="text-[10px] font-semibold text-gray-400">Sin definir</div>
            </div>
          )}
        </div>
      </div>

      {/* Progreso */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-400 font-medium">Progreso</span>
          <span className="font-bold" style={{ color: alcanzado ? visual.color : '#6B7280' }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <ProgressBar
          value={facturacion}
          max={hito.montoUmbral}
          color={alcanzado ? visual.color : esProx ? '#D4621A' : '#9CA3AF'}
          height={7}
        />
        {!alcanzado && esProx && (
          <p className="text-xs font-semibold text-[#B45316] mt-1.5">
            Faltan {formatPesosCompacto(hito.montoUmbral - facturacion)} para desbloquear
          </p>
        )}
        {alcanzado && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Sparkles size={11} style={{ color: visual.color }} />
            <p className="text-xs font-semibold" style={{ color: visual.color }}>
              {tieneP
                ? `Premio: ${formatPesos(hito.premioMonto)} — coordiná la acreditación con el propietario`
                : 'Premio desbloqueado — el propietario definirá el monto'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PANEL DESGLOSE COBROS MULTAS ─────────────────────────────────────────────
// [FIX-02] Componente limpio, fuera del return() de PremiosPage.

function PanelDesgloseMultas({ data }: { data: PremiosData }) {
  if (data.desgloseMultas.length === 0) return null

  const hayDetalle = data.desgloseMultas.some(d => d.montoSUATS > 0 || d.montoInformePersona > 0)

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-1.5 h-6 rounded-full bg-blue-500" />
        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          Desglose de Cobros — Multas
        </h2>
      </div>

      {/* Nota explicativa */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
        <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          Para el cálculo de premios solo se contabilizan los{' '}
          <strong>honorarios de gestoría</strong>. El costo de{' '}
          <strong>SUATS</strong> y <strong>Informe de Persona</strong> son gastos del trámite
          repercutidos al cliente, no honorarios propios.
        </p>
      </div>

      {/* Tres cards resumen */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Honorarios Gestoría', value: data.facturacionMultas,      color: '#D4621A', bg: 'bg-orange-50', border: 'border-orange-200', nota: '→ Cuenta para premios'  },
          { label: 'Costos SUATS',         value: data.totalSUATS,             color: '#6B7280', bg: 'bg-gray-50',   border: 'border-gray-200',   nota: 'No cuenta para premios' },
          { label: 'Informe de Persona',   value: data.totalInformePersona,    color: '#6B7280', bg: 'bg-gray-50',   border: 'border-gray-200',   nota: 'No cuenta para premios' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-4`}>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
            <p className="text-xl font-extrabold" style={{ color: item.color, fontFamily: 'var(--font-display)' }}>
              {formatPesosCompacto(item.value)}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">{item.nota}</p>
          </div>
        ))}
      </div>

      {/* Total cobrado al cliente */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between shadow-sm">
        <span className="text-sm font-semibold text-gray-600">Total cobrado al cliente</span>
        <span className="text-xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          {formatPesosCompacto(data.facturacionBrutaMultas)}
        </span>
      </div>

      {/* Tabla por trámite — solo si hay SUATS o informe */}
      {hayDetalle && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Detalle por trámite</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Trámite', 'Honor. Gestoría', 'SUATS', 'Inf. Persona', 'Total Cliente'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-bold text-gray-400 uppercase tracking-wider text-[9px] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.desgloseMultas.map(d => (
                  <tr key={d.tramiteId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-gray-500">{d.tramiteId.slice(-8)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#B45316]">{formatPesos(d.honorariosGestoria)}</td>
                    <td className="px-4 py-2.5 text-gray-400">{d.montoSUATS > 0 ? formatPesos(d.montoSUATS) : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{d.montoInformePersona > 0 ? formatPesos(d.montoInformePersona) : '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-gray-700">{formatPesos(d.totalCobradoCliente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function PremiosPage() {
  usePageTitle('Mis Premios & Objetivos')
  const { user }                   = useAuth()
  const { data, isLoading, error } = usePremios()
  const navigate                   = useNavigate()
  const esPropietario              = user?.rol === 'propietario'

  const { mesActual: periodoActivo } = useCierreMensual()
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const periodoLabel = `${MESES[periodoActivo.mes]} ${periodoActivo.anio}`

  const nombreAsesor = user?.nombre
    ? `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}`
    : 'Asesor'

  if (isLoading) return <Spinner label="Cargando premios..." />

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-gray-500 text-sm">No se pudo cargar la información de premios.</p>
      </div>
    )
  }

  // [FIX-07] Calculados DESPUÉS del guard para no acceder a data undefined
  const { cfg } = data
  const hitosOrdenados = [...cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
  const maxUmbral      = hitosOrdenados[hitosOrdenados.length - 1]?.montoUmbral ?? 20_000_000
  const hayPendientes  = hitosOrdenados.some(h => h.premioMonto === 0)
  const totalGanado    = data.premiosA_pesos + data.premiosB_pesos

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Badge período activo */}
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
        <Calendar size={14} className="text-[#D4621A] shrink-0" />
        <p className="text-xs font-bold text-[#D4621A]">Período activo: {periodoLabel}</p>
        <span className="text-xs text-gray-400 ml-1">· Se calcula sobre los trámites de este mes</span>
      </div>

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#D4621A18' }}>
              <Trophy size={20} style={{ color: '#D4621A' }} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
              Mis Premios & Objetivos
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-[52px]">
            {nombreAsesor} · seguí tu progreso en tiempo real
          </p>
        </div>
        {esPropietario && (
          <button
            onClick={() => navigate('/admin/configuracion?tab=premios')}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600
                       bg-white border border-gray-200 hover:border-gray-300 px-4 py-2
                       rounded-xl transition-all shadow-sm hover:shadow-md"
          >
            <Settings size={14} /> Configurar premios
          </button>
        )}
      </div>

      {/* Banner premios sin definir */}
      {hayPendientes && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            {esPropietario
              ? <>Algunos hitos no tienen monto definido.{' '}
                  <button onClick={() => navigate('/admin/configuracion?tab=premios')} className="font-bold underline hover:no-underline">
                    Configurar ahora →
                  </button>
                </>
              : 'El propietario aún no definió el monto de algunos premios por hito.'
            }
          </p>
        </div>
      )}

      {/* ─── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

        {/* Total ganado — [FIX-10] color naranja condicional */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#D4621A18' }}>
            <Trophy size={22} style={{ color: '#D4621A' }} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total ganado</p>
            <p
              className="text-3xl font-extrabold"
              style={{ fontFamily: 'var(--font-display)', color: totalGanado > 0 ? '#D4621A' : '#111827' }}
            >
              {formatPesosCompacto(totalGanado)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.premiosA_ganados} premios trámites · {data.hitosAlcanzados.length} hitos facturación
            </p>
          </div>
        </div>

        {/* Trámites calificantes — [FIX-08] subtexto correcto */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: '#D4621A12' }}>
            <FileText size={16} style={{ color: '#D4621A' }} />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Trámites</p>
          <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            {data.tramitesCalificantes}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Cobrados este mes</p>
        </div>

        {/* Logros */}
        <div className={`bg-white border rounded-2xl p-4 shadow-sm ${data.hitosAlcanzados.length > 0 ? 'border-yellow-200' : 'border-gray-100'}`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
            style={{ background: data.hitosAlcanzados.length > 0 ? '#FDE04720' : '#F3F4F6' }}>
            <Star size={16} className={data.hitosAlcanzados.length > 0 ? 'text-yellow-500' : 'text-gray-400'} />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Logros</p>
          <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            {data.hitosAlcanzados.length}
            <span className="text-sm font-medium text-gray-400 ml-1">/ {hitosOrdenados.length}</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Hitos de facturación</p>
        </div>
      </div>

      {/* ─── SECCIÓN A: PREMIOS POR TRÁMITES ────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-1.5 h-6 rounded-full bg-[#D4621A]" />
          <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            Premios por Trámites
          </h2>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
            Transferencia · Baja · Inscripción
          </span>
        </div>

        {/* [FIX-09] Nota diferencia de montos Moto vs Auto */}
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-4">
          <AlertCircle size={13} className="text-gray-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Los premios se diferencian por tipo de vehículo:{' '}
            <strong className="text-[#B45316]">{formatPesos(cfg.montoPremioAuto)}</strong>{' '}
            por cada {cfg.tramitesPorPremioAuto} trámites de auto,{' '}
            <strong className="text-violet-700">{formatPesos(cfg.montoPremioMoto)}</strong>{' '}
            por cada {cfg.tramitesPorPremioMoto} trámites de moto.
          </p>
        </div>

        {/* Dos CicloCards en grilla */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <CicloCard ciclo={data.cicloAuto} />
          <CicloCard ciclo={data.cicloMoto} />
        </div>

        {/* Resumen total si hay premios */}
        {(data.cicloAuto.premiosPesos + data.cicloMoto.premiosPesos) > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total premios por trámites este mes</p>
              <p className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPesos(data.cicloAuto.premiosPesos + data.cicloMoto.premiosPesos)}
              </p>
            </div>
            <div className="text-right space-y-1">
              {data.cicloAuto.premiosPesos > 0 && (
                <p className="text-sm font-semibold text-[#B45316]">🚗 Autos: {formatPesos(data.cicloAuto.premiosPesos)}</p>
              )}
              {data.cicloMoto.premiosPesos > 0 && (
                <p className="text-sm font-semibold text-violet-700">🏍️ Motos: {formatPesos(data.cicloMoto.premiosPesos)}</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ─── SECCIÓN B: HITOS DE FACTURACIÓN ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-1.5 h-6 rounded-full bg-yellow-400" />
          <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            Objetivos de Facturación
          </h2>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
            Honorarios de multas gestionadas
          </span>
        </div>

        {/* Barra maestra */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex justify-between items-end mb-3 flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Honorarios acumulados en multas
              </p>
              <p className="text-3xl font-extrabold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPesosCompacto(data.facturacionMultas)}
                <span className="text-sm font-medium text-gray-400 ml-2">ARS</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{data.totalMultasCreadas} multas gestionadas</p>
            </div>
            {data.proximoHito && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">Próxima meta</p>
                <p className="text-lg font-bold flex items-center gap-1.5" style={{ color: '#D4621A' }}>
                  {HITO_VISUAL[data.proximoHito.id]?.icon}
                  {formatPesosCompacto(data.proximoHito.montoUmbral)}
                </p>
              </div>
            )}
          </div>

          {/* Barra con hitos superpuestos */}
          <div className="relative mb-1">
            <ProgressBar value={data.facturacionMultas} max={maxUmbral} color="#EAB308" height={12} />
            {hitosOrdenados.map(h => {
              const pos     = (h.montoUmbral / maxUmbral) * 100
              const reached = data.hitosAlcanzados.includes(h.id)
              const vis     = HITO_VISUAL[h.id] ?? HITO_VISUAL[1]
              return (
                <div
                  key={h.id}
                  className="absolute -top-1.5 -translate-x-1/2 text-lg"
                  style={{
                    left:       `${pos}%`,
                    filter:     !reached ? 'grayscale(1) opacity(0.4)' : undefined,
                    transition: 'all 0.3s ease',
                  }}
                  title={`${vis.label} — ${formatPesosCompacto(h.montoUmbral)}`}
                >
                  {reached ? vis.icon : '◆'}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">$0</span>
            <span className="text-xs text-gray-400">{formatPesosCompacto(maxUmbral)}</span>
          </div>

          {data.proximoHito && (
            <div className="flex items-center gap-2 mt-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
              <ChevronRight size={14} style={{ color: '#D4621A' }} />
              <span className="text-sm text-gray-700">
                <span className="font-semibold" style={{ color: '#D4621A' }}>
                  {HITO_VISUAL[data.proximoHito.id]?.label}
                </span>
                {' '}— faltan{' '}
                <strong style={{ color: '#D4621A' }}>{formatPesosCompacto(data.proximoHitoFalta)}</strong>
                {data.proximoHito.premioMonto > 0 && (
                  <> · Premio: <strong className="text-yellow-600">{formatPesos(data.proximoHito.premioMonto)}</strong></>
                )}
              </span>
            </div>
          )}
          {!data.proximoHito && (
            <div className="flex items-center gap-2 mt-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5">
              <Trophy size={14} className="text-yellow-500" />
              <span className="text-sm font-bold text-yellow-700">¡Máximo nivel alcanzado! 🏆</span>
            </div>
          )}
        </div>

        {/* Cards individuales */}
        <div className="space-y-3">
          {hitosOrdenados.map(h => (
            <HitoCard
              key={h.id}
              hito={h}
              alcanzado={data.hitosAlcanzados.includes(h.id)}
              facturacion={data.facturacionMultas}
            />
          ))}
        </div>
      </section>

      {/* ─── SECCIÓN C: DESGLOSE COBROS MULTAS ──────────────────────────── */}
      <PanelDesgloseMultas data={data} />

      {/* ─── NOTA FINAL ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
        <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Acreditación:</strong>{' '}
          Los premios por trámites se calculan automáticamente al registrar el pago.
          Los premios por hitos de facturación son definidos y acreditados por el propietario
          al alcanzar cada umbral. Para consultas, contactar a la dirección de la gestoría.
        </p>
      </div>

    </div>
  )
}