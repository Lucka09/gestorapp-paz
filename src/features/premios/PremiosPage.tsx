// src/features/premios/PremiosPage.tsx
// Panel de Premios & Objetivos — tema claro, máxima legibilidad
// ─────────────────────────────────────────────────────────────────────────────

import {
  Trophy, Star, Flame, Target, TrendingUp,
  CheckCircle2, Lock, ChevronRight, FileText,
  ArrowLeftRight, AlertCircle, Sparkles, Settings, Calendar,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAuth }      from '@/hooks/useAuth'
import { Spinner }      from '@/components/ui'
import {
  usePremios,
  HITO_VISUAL,
  formatPesos,
  formatPesosCompacto,
  type HitoMultaConfig,
} from '@/hooks/usePremios'
import { useCierreMensual } from '@/hooks/useCierreMensual'

// ─── BARRA DE PROGRESO ───────────────────────────────────────────────────────

function ProgressBar({
  value, max, color = '#D4621A', height = 8,
}: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full rounded-full bg-gray-100 overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          boxShadow: pct > 0 ? `0 0 8px ${color}44` : undefined,
        }}
      />
    </div>
  )
}

// ─── PASO DEL CICLO ──────────────────────────────────────────────────────────

function CicloStep({ index, filled }: { index: number; filled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className={`
        w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300
        ${filled
          ? 'bg-[#D4621A] shadow-md'
          : 'bg-gray-100 border-2 border-dashed border-gray-300'
        }
      `}>
        {filled
          ? <CheckCircle2 size={20} className="text-white" />
          : <span className="text-sm font-bold text-gray-400">{index + 1}</span>
        }
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wide
        ${filled ? 'text-[#D4621A]' : 'text-gray-400'}`}>
        {filled ? 'Listo' : 'Pendiente'}
      </span>
    </div>
  )
}

// ─── CARD DE HITO ────────────────────────────────────────────────────────────

function HitoCard({
  hito, alcanzado, facturacion,
}: { hito: HitoMultaConfig; alcanzado: boolean; facturacion: number }) {
  const visual  = HITO_VISUAL[hito.id] ?? HITO_VISUAL[1]
  const pct     = Math.min(100, (facturacion / hito.montoUmbral) * 100)
  const esProx  = !alcanzado && facturacion < hito.montoUmbral
  const tieneP  = hito.premioMonto > 0

  return (
    <div className={`
      rounded-2xl border p-5 transition-all
      ${alcanzado
        ? 'bg-white border-gray-200 shadow-md'
        : esProx
          ? 'bg-white border-gray-200 shadow-sm'
          : 'bg-gray-50 border-gray-100'
      }
    `}>
      <div className="flex items-start gap-4 mb-4">

        {/* Ícono */}
        <div className={`
          w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0
          ${alcanzado ? 'shadow-md' : ''}
        `} style={{
          background: alcanzado ? `${visual.color}20` : '#F3F4F6',
          border: alcanzado ? `2px solid ${visual.color}40` : '2px solid #E5E7EB',
        }}>
          {alcanzado
            ? visual.icon
            : <Lock size={20} className="text-gray-400" />
          }
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`font-bold text-base ${alcanzado ? 'text-gray-900' : esProx ? 'text-gray-800' : 'text-gray-400'}`}
              style={{ fontFamily: 'var(--font-display)' }}>
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
          <p className={`text-sm ${alcanzado ? 'text-gray-500' : 'text-gray-400'}`}>
            {hito.descripcion}
          </p>
        </div>

        {/* Metas & Premio */}
        <div className="text-right shrink-0 space-y-1">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Umbral</div>
            <div className="text-sm font-bold text-gray-700 font-mono">
              {formatPesosCompacto(hito.montoUmbral)}
            </div>
          </div>
          {tieneP ? (
            <div className="mt-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: alcanzado ? `${visual.color}12` : '#F3F4F6', border: alcanzado ? `1px solid ${visual.color}30` : '1px solid #E5E7EB' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
                Premio
              </div>
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
          <span className={`font-bold ${alcanzado ? '' : 'text-gray-500'}`}
            style={{ color: alcanzado ? visual.color : undefined }}>
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
          <p className="text-xs font-semibold text-[#D4621A] mt-1.5">
            Faltan {formatPesosCompacto(hito.montoUmbral - facturacion)} para desbloquear este logro
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

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function PremiosPage() {
  usePageTitle('Mis Premios & Objetivos')
  const { user }                   = useAuth()
  const { data, isLoading, error } = usePremios()
  const navigate                   = useNavigate()
  const esPropietario              = user?.rol === 'propietario'

  // Período activo (mes corriente) — cambia al primer día del mes nuevo
  const { mesActual: periodoActivo } = useCierreMensual()
  const MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const periodoLabel = `${MESES_LABEL[periodoActivo.mes]} ${periodoActivo.anio}`

  const nombreAsesor = user?.nombre
    ? `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}`
    : 'Asesor'

  const hitosOrdenados = data
    ? [...data.cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
    : []
  const maxUmbral      = hitosOrdenados[hitosOrdenados.length - 1]?.montoUmbral ?? 20_000_000
  const hayPendientes  = hitosOrdenados.some(h => h.premioMonto === 0)
  const totalGanado    = (data?.premiosA_pesos ?? 0) + (data?.premiosB_pesos ?? 0)

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) return <Spinner label="Cargando premios..." />

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-gray-500 text-sm">No se pudo cargar la información de premios.</p>
      </div>
    )
  }

  const { cfg } = data

  return (
    <div className="space-y-6 max-w-3xl animate-fadein">

      {/* Badge período activo */}
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
        <Calendar size={14} className="text-[#D4621A] shrink-0" />
        <p className="text-xs font-bold text-[#D4621A]">Período activo: {periodoLabel}</p>
        <span className="text-xs text-gray-400 ml-1">· Los premios se calculan sobre los trámites de este mes</span>
      </div>

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: '#D4621A18' }}>
              <Trophy size={20} style={{ color: '#D4621A' }} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900"
              style={{ fontFamily: 'var(--font-display)' }}>
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
                       rounded-xl transition-colors shadow-sm hover:shadow-md"
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
              ? <>Algunos hitos no tienen monto de premio definido.{' '}
                  <button onClick={() => navigate('/admin/configuracion?tab=premios')}
                    className="font-bold underline hover:no-underline">
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

        {/* Total ganado */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm
                        flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: '#D4621A18' }}>
            <Trophy size={22} style={{ color: '#D4621A' }} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              Total ganado
            </p>
            <p className="text-3xl font-extrabold text-gray-900"
              style={{ fontFamily: 'var(--font-display)', color: totalGanado > 0 ? '#D4621A' : undefined }}>
              {formatPesosCompacto(totalGanado)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.premiosA_ganados} premios A · {data.hitosAlcanzados.length} hitos B
            </p>
          </div>
        </div>

        {/* Trámites calificantes */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
            style={{ background: '#D4621A12' }}>
            <FileText size={16} style={{ color: '#D4621A' }} />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
            Trámites
          </p>
          <p className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: 'var(--font-display)' }}>
            {data.tramitesCalificantes}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Bajas + Transf. cobradas</p>
        </div>

        {/* Logros */}
        <div className={`bg-white border rounded-2xl p-4 shadow-sm
          ${data.hitosAlcanzados.length > 0 ? 'border-yellow-200' : 'border-gray-100'}`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
            style={{ background: data.hitosAlcanzados.length > 0 ? '#FDE04720' : '#F3F4F6' }}>
            <Star size={16} className={data.hitosAlcanzados.length > 0 ? 'text-yellow-500' : 'text-gray-400'} />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
            Logros
          </p>
          <p className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: 'var(--font-display)' }}>
            {data.hitosAlcanzados.length}
            <span className="text-sm font-medium text-gray-400 ml-1">
              / {hitosOrdenados.length}
            </span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Hitos de facturación</p>
        </div>
      </div>

      {/* ─── SECCIÓN A: PREMIO POR TRÁMITES ────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-1.5 h-6 rounded-full" style={{ background: '#D4621A' }} />
          <h2 className="text-base font-bold text-gray-900"
            style={{ fontFamily: 'var(--font-display)' }}>
            Premio por Trámites
          </h2>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
            Baja + Transferencia
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

          {/* Monto y acumulado */}
          <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                Cada {cfg.tramitesPorPremioA} trámites completados y pagados recibís
              </p>
              <p className="text-4xl font-extrabold"
                style={{ fontFamily: 'var(--font-display)', color: '#D4621A' }}>
                {formatPesos(cfg.montoPremioA)}
              </p>
              <p className="text-xs text-gray-400 mt-1">de premio por cierre</p>
            </div>
            <div className="text-right bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Premios ganados
              </p>
              <p className="text-3xl font-extrabold text-gray-900"
                style={{ fontFamily: 'var(--font-display)' }}>
                {data.premiosA_ganados}
              </p>
              <p className="text-sm font-bold" style={{ color: '#D4621A' }}>
                = {formatPesos(data.premiosA_pesos)}
              </p>
            </div>
          </div>

          {/* Ciclo actual */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={14} style={{ color: '#D4621A' }} />
              <span className="text-sm font-bold text-gray-700">
                Ciclo actual — {data.tramitesEnCicloActual} de {cfg.tramitesPorPremioA} trámites
              </span>
              {data.tramitesEnCicloActual > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: '#D4621A18', color: '#D4621A' }}>
                  ¡En racha!
                </span>
              )}
            </div>

            <div className="flex gap-3 mb-4">
              {Array.from({ length: cfg.tramitesPorPremioA }, (_, i) => (
                <CicloStep key={i} index={i} filled={i < data.tramitesEnCicloActual} />
              ))}
            </div>

            <ProgressBar
              value={data.tramitesEnCicloActual}
              max={cfg.tramitesPorPremioA}
              height={9}
            />
            <p className={`text-sm font-semibold mt-2
              ${data.tramitesFaltanProximo === 1 ? 'text-emerald-600' : 'text-gray-500'}`}>
              {data.tramitesFaltanProximo === cfg.tramitesPorPremioA
                ? `Cerrá ${cfg.tramitesPorPremioA} trámites para ganar tu próximo premio`
                : data.tramitesFaltanProximo === 1
                  ? `¡Solo 1 trámite más para ganar ${formatPesos(cfg.montoPremioA)}! 🔥`
                  : `${data.tramitesFaltanProximo} trámites más para ganar ${formatPesos(cfg.montoPremioA)}`
              }
            </p>
          </div>

          {/* Tipos que califican */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400 font-medium">Tipos que califican:</span>
            {[
              { icon: <ArrowLeftRight size={11} />, label: 'Transferencia Vehículo' },
              { icon: <ArrowLeftRight size={11} />, label: 'Transferencia Moto' },
              { icon: <FileText size={11} />,        label: 'Baja' },
            ].map(t => (
              <span key={t.label}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-600
                           bg-gray-100 px-3 py-1 rounded-full">
                {t.icon}{t.label}
              </span>
            ))}
            <span className="text-xs text-gray-400">* marcados como pagados</span>
          </div>
        </div>
      </section>

      {/* ─── SECCIÓN B: HITOS DE FACTURACIÓN ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-1.5 h-6 rounded-full bg-yellow-400" />
          <h2 className="text-base font-bold text-gray-900"
            style={{ fontFamily: 'var(--font-display)' }}>
            Objetivos de Facturación
          </h2>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
            Multas gestionadas
          </span>
        </div>

        {/* Barra maestra */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex justify-between items-end mb-3 flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Facturación acumulada en multas
              </p>
              <p className="text-3xl font-extrabold text-gray-900"
                style={{ fontFamily: 'var(--font-display)' }}>
                {formatPesosCompacto(data.facturacionMultas)}
                <span className="text-sm font-medium text-gray-400 ml-2">ARS</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {data.totalMultasCreadas} multas gestionadas
              </p>
            </div>
            {data.proximoHito && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">Próxima meta</p>
                <p className="text-lg font-bold flex items-center gap-1.5"
                  style={{ color: '#D4621A' }}>
                  {HITO_VISUAL[data.proximoHito.id]?.icon}
                  {formatPesosCompacto(data.proximoHito.montoUmbral)}
                </p>
              </div>
            )}
          </div>

          {/* Barra con hitos */}
          <div className="relative mb-1">
            <ProgressBar value={data.facturacionMultas} max={maxUmbral} color="#EAB308" height={12} />
            {hitosOrdenados.map(h => {
              const pos     = (h.montoUmbral / maxUmbral) * 100
              const reached = data.hitosAlcanzados.includes(h.id)
              const vis     = HITO_VISUAL[h.id] ?? HITO_VISUAL[1]
              return (
                <div key={h.id}
                  className="absolute -top-1.5 -translate-x-1/2 text-lg"
                  style={{
                    left: `${pos}%`,
                    filter: !reached ? 'grayscale(1) opacity(0.4)' : undefined,
                    transition: 'all 0.3s ease',
                  }}
                  title={`${vis.label} — ${formatPesosCompacto(h.montoUmbral)}`}>
                  {reached ? vis.icon : '◆'}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">$0</span>
            <span className="text-xs text-gray-400">{formatPesosCompacto(maxUmbral)}</span>
          </div>

          {/* Mensaje de siguiente hito */}
          {data.proximoHito && (
            <div className="flex items-center gap-2 mt-3 bg-orange-50 border border-orange-100
                            rounded-xl px-4 py-2.5">
              <ChevronRight size={14} style={{ color: '#D4621A' }} />
              <span className="text-sm text-gray-700">
                <span className="font-semibold" style={{ color: '#D4621A' }}>
                  {HITO_VISUAL[data.proximoHito.id]?.label}
                </span>
                {' '}— faltan{' '}
                <strong style={{ color: '#D4621A' }}>
                  {formatPesosCompacto(data.proximoHitoFalta)}
                </strong>
                {data.proximoHito.premioMonto > 0 && (
                  <> · Premio: <strong className="text-yellow-600">
                    {formatPesos(data.proximoHito.premioMonto)}
                  </strong></>
                )}
              </span>
            </div>
          )}
          {!data.proximoHito && (
            <div className="flex items-center gap-2 mt-3 bg-yellow-50 border border-yellow-200
                            rounded-xl px-4 py-2.5">
              <Trophy size={14} className="text-yellow-500" />
              <span className="text-sm font-bold text-yellow-700">
                ¡Máximo nivel alcanzado! Todos los hitos completados 🏆
              </span>
            </div>
          )}
        </div>

        {/* Cards individuales de hitos */}
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

      {/* ─── NOTA ───────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100
                      rounded-2xl px-5 py-4">
        <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Acreditación:</strong>{' '}
          Los premios por trámites se calculan automáticamente.
          Los premios por hitos de facturación son definidos y acreditados por el propietario
          al alcanzar cada umbral. Para consultas, contactar a la dirección de la gestoría.
        </p>
      </div>

    </div>
  )
}