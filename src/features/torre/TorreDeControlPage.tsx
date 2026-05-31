// src/features/torre/TorreDeControlPage.tsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate }       from 'react-router-dom'
import {
  Radar, Clock, Lock, CheckCircle2,
  ChevronRight, Search, X,
  RefreshCw, CheckCheck, Eye, Bike, ArrowLeftRight,
  FileWarning, Users, CalendarClock, BarChart3,
  TowerControl, MonitorDot, Bell, ShieldAlert,
} from 'lucide-react'
import { useTorreControl, useEstadisticasMandatarios } from '@/hooks/useTorreControl'
import { useTramites }  from '@/hooks/useTramites'
import { usePermisos } from '@/hooks/usePermisos'
import { useAuth }     from '@/hooks/useAuth'
import { useGestoresEquipo } from '@/hooks/useEquipo'
import { usePageTitle }  from '@/hooks/usePageTitle'
import { formatRelativo, formatFecha } from '@/utils'
import type { TramiteEnriquecido, AlertaTorre, NivelAlerta } from '@/torre_types'
import { PASOS_INSCRIPCION }   from '@/torre_types'
import { PASOS_MULTA_CONFIG }  from '@/multa_types'
import { PASOS_TRANSFERENCIA } from '@/transferencia_types'
import PanelPremiosAsesor      from '@/components/shared/PanelPremiosAsesor'

// ─── HELPERS VISUALES ────────────────────────────────────────────────────────

const NIVEL_STYLE: Record<NivelAlerta, { dot: string; badge: string; text: string; border: string; row: string }> = {
  critico:  { dot:'bg-red-600',    badge:'bg-red-600/20 text-red-400 border-red-600/40',   text:'text-red-400',    border:'border-l-red-600',    row:'bg-red-900/10' },
  rojo:     { dot:'bg-red-500',    badge:'bg-red-500/15 text-red-400 border-red-500/30',   text:'text-red-400',    border:'border-l-red-500',    row:'bg-red-900/5'  },
  naranja:  { dot:'bg-orange-500', badge:'bg-orange-500/15 text-orange-400 border-orange-500/30', text:'text-orange-400', border:'border-l-orange-500', row:'bg-orange-900/5' },
  amarillo: { dot:'bg-yellow-500', badge:'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', text:'text-yellow-400', border:'border-l-yellow-500', row:'' },
  info:     { dot:'bg-gray-500',   badge:'bg-gray-500/10 text-gray-400 border-gray-500/20', text:'text-gray-400',   border:'border-l-gray-600',   row:'' },
}

// Colores raw para style inline — garantizan franja completa sin purge de Tailwind
const NIVEL_RAW = {
  critico:  { bg: 'rgba(220,38,38,0.18)',  border: '#dc2626', text: '#fca5a5', badge: 'rgba(220,38,38,0.25)',  badgeText: '#fca5a5' },
  rojo:     { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#fca5a5', badge: 'rgba(239,68,68,0.18)',  badgeText: '#fca5a5' },
  naranja:  { bg: 'rgba(249,115,22,0.14)', border: '#f97316', text: '#fdba74', badge: 'rgba(249,115,22,0.22)', badgeText: '#fdba74' },
  amarillo: { bg: 'rgba(234,179,8,0.12)',  border: '#eab308', text: '#fde047', badge: 'rgba(234,179,8,0.20)',  badgeText: '#fde047' },
  info:     { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', text: '#93c5fd', badge: 'rgba(59,130,246,0.15)', badgeText: '#93c5fd' },
} as const

const NIVEL_ICON: Record<NivelAlerta, string> = {
  critico: '🚨', rojo: '🔴', naranja: '🟠', amarillo: '⚠️', info: 'ℹ️',
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  inscripcion_inicial: <Bike size={13} className="shrink-0" />,
  transferencia:       <ArrowLeftRight size={13} className="shrink-0" />,
  descargo_multa:      <FileWarning size={13} className="shrink-0" />,
}

const TIPO_LABEL: Record<string, string> = {
  inscripcion_inicial: 'Inscripción',
  transferencia:       'Transferencia',
  descargo_multa:      'Multa',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente:                'bg-gray-500/15 text-gray-400 border-gray-500/25',
  en_proceso:               'bg-blue-500/15 text-blue-400 border-blue-500/25',
  documentacion_requerida:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  en_organismo:             'bg-purple-500/15 text-purple-400 border-purple-500/25',
  listo_para_retirar:       'bg-green-500/15 text-green-400 border-green-500/25',
  entregado:                'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente:               'Pendiente',
  en_proceso:              'En Proceso',
  documentacion_requerida: 'Doc. Requerida',
  en_organismo:            'En Organismo',
  listo_para_retirar:      'Para Retirar',
  entregado:               'Entregado',
}

// ─── SUBCOMPONENTES ──────────────────────────────────────────────────────────

function KPICard({
  icon: Icon, label, value, sub, color, onClick,
}: {
  icon: React.ElementType; label: string; value: number
  sub: string; color: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group text-left p-4 rounded-xl border transition-all
        bg-[#111827] hover:bg-[#1a2235]
        ${color === 'blue'   ? 'border-blue-500/25 hover:border-blue-500/50'   : ''}
        ${color === 'red'    ? 'border-red-600/30 hover:border-red-600/50'     : ''}
        ${color === 'orange' ? 'border-orange-500/25 hover:border-orange-500/50' : ''}
        ${color === 'yellow' ? 'border-yellow-500/25 hover:border-yellow-500/50' : ''}
        ${color === 'green'  ? 'border-emerald-500/25 hover:border-emerald-500/50' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center
          ${color === 'blue'   ? 'bg-blue-500/15 text-blue-400'    : ''}
          ${color === 'red'    ? 'bg-red-600/15 text-red-400'      : ''}
          ${color === 'orange' ? 'bg-orange-500/15 text-orange-400' : ''}
          ${color === 'yellow' ? 'bg-yellow-500/15 text-yellow-400' : ''}
          ${color === 'green'  ? 'bg-emerald-500/15 text-emerald-400' : ''}
        `}>
          <Icon size={16} />
        </div>
        <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors mt-1" />
      </div>
      <div className={`
        text-2xl font-extrabold tabular-nums mb-0.5
        ${color === 'blue'   ? 'text-blue-400'    : ''}
        ${color === 'red'    ? 'text-red-400'     : ''}
        ${color === 'orange' ? 'text-orange-400'  : ''}
        ${color === 'yellow' ? 'text-yellow-400'  : ''}
        ${color === 'green'  ? 'text-emerald-400' : ''}
      `}>
        {value}
      </div>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[11px] text-gray-600">{sub}</div>
    </button>
  )
}

function AlertaBanner({
  alerta, onAck, tramite,
}: {
  alerta:   AlertaTorre
  onAck:    (id: string) => void
  tramite?: TramiteEnriquecido
}) {
  const nr = NIVEL_RAW[alerta.nivel]
  const labelTipo: Record<string, string> = {
    inscripcion_inicial: 'Inscripción',
    transferencia:       'Transferencia',
    descargo_multa:      'Multa',
  }

  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5"
      style={{
        background:   nr.bg,
        borderLeft:   `4px solid ${nr.border}`,
        borderBottom: `1px solid ${nr.border}20`,
      }}
    >
      <span className="text-base shrink-0 mt-0.5">{NIVEL_ICON[alerta.nivel]}</span>
      <div className="flex-1 min-w-0">
        {/* Nombre del cliente + tipo de trámite */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-extrabold" style={{ color: '#ffffff' }}>
            {tramite?.clienteNombre ?? tramite?.patente ?? alerta.tramiteId.slice(-8)}
          </span>
          {tramite && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}>
              {labelTipo[tramite.tipo] ?? tramite.tipo} · {tramite.patente || '—'}
            </span>
          )}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
            style={{ background: nr.badge, color: nr.badgeText }}>
            {alerta.nivel.toUpperCase()}
          </span>
        </div>
        {/* Mensaje de alerta */}
        <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {alerta.mensaje}
        </p>
        {/* Fecha de carga del trámite */}
        {tramite?.creadoEn && (
          <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Cargado: {tramite.creadoEn.toDate?.()?.toLocaleDateString('es-AR', {
              day: '2-digit', month: '2-digit', year: '2-digit',
            }) ?? '—'}
            {tramite.creadoPorNombre ? ` · por ${tramite.creadoPorNombre}` : ''}
          </p>
        )}
      </div>
      <button
        onClick={() => onAck(alerta.id)}
        className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg font-bold transition-all"
        style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}
      >
        ACK ✓
      </button>
    </div>
  )
}

// ─── DRAWER DETALLE TRÁMITE ───────────────────────────────────────────────────

function TramiteDrawer({
  tramite, onClose,
}: { tramite: TramiteEnriquecido; onClose: () => void }) {
  const navigate  = useNavigate()
  const [tab, setTab] = useState<'timeline' | 'fotos' | 'datos'>('timeline')
  const s  = NIVEL_STYLE[tramite.alertLevel]
  const wf = tramite.workflow

  const pasoActual = wf?.pasoActual ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0d1117] border-l border-white/10
                   overflow-y-auto h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header fijo */}
        <div className="sticky top-0 bg-[#0d1117] border-b border-white/10 p-5 z-10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-gray-500">{tramite.numero || tramite.id}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>
                  {NIVEL_ICON[tramite.alertLevel]} {tramite.alertLevel.toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-white leading-tight">
                {tramite.patente || '—'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {TIPO_LABEL[tramite.tipo] ?? tramite.tipo} · {tramite.asignadoA ?? 'Sin asignar'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10
                         flex items-center justify-center text-gray-400 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Alerta crítica */}
          {tramite.alertLevel === 'critico' && (
            <div className="bg-red-900/20 border border-red-600/40 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-red-400">
                🚨 <strong>CRÍTICO:</strong> {tramite.alertas[0]?.mensaje ?? 'Requiere acción inmediata.'}
              </p>
            </div>
          )}

          {/* Barra de progreso workflow (solo inscripción) */}
          {wf && pasoActual && (
            <div>
              <div className="flex gap-0.5 mb-1">
                {PASOS_INSCRIPCION.map((p, i) => (
                  <div
                    key={p.id}
                    title={p.titulo}
                    className="flex-1 h-1 rounded-full transition-all"
                    style={{
                      background: i < pasoActual - 1 ? p.color
                        : i === pasoActual - 1 ? `${p.color}80`
                        : 'rgba(255,255,255,0.08)',
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-600 text-right">
                Paso {pasoActual}/7 · {PASOS_INSCRIPCION[pasoActual - 1]?.titulo}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-black/20">
          {([['timeline','📋 Timeline'],['fotos','📎 Fotos'],['datos','📊 Datos']] as const).map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                tab === id
                  ? 'text-[#D4621A] border-[#D4621A] bg-[#D4621A]/5'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="p-5 flex-1">

          {/* ── TIMELINE ── */}
          {tab === 'timeline' && (
            <div>

              {/* Multa o Transferencia: botón al workflow + lista de pasos */}
              {(tramite.tipo === 'descargo_multa' || tramite.tipo === 'transferencia') && (
                <>
                  <button
                    onClick={() => { onClose(); navigate(`/admin/tramites/${tramite.id}`) }}
                    className="w-full mb-4 py-2.5 rounded-xl text-xs font-bold text-white
                               flex items-center justify-center gap-1.5 hover:opacity-90 transition-all"
                    style={{ background: '#D4621A' }}
                  >
                    📋 Gestionar trámite — ir al workflow completo →
                  </button>
                  {(tramite.tipo === 'descargo_multa'
                    ? (PASOS_MULTA_CONFIG as readonly { id: number; titulo: string; subtitulo: string; icono: string; rol: string }[])
                    : (PASOS_TRANSFERENCIA as readonly { id: number; titulo: string; icono: string; rol: string }[])
                  ).map((paso, i, arr) => (
                    <div key={paso.id} className="flex gap-3 mb-1">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center
                                     text-xs shrink-0 border-2"
                          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }}
                        >
                          {paso.icono}
                        </div>
                        {i < arr.length - 1 && (
                          <div className="w-px flex-1 min-h-4 my-1"
                            style={{ background: 'rgba(255,255,255,0.06)' }} />
                        )}
                      </div>
                      <div className="flex-1 pb-2 px-2 py-1">
                        <span className="text-xs font-semibold text-gray-400">{paso.titulo}</span>
                        <p className="text-[10px] text-gray-600 capitalize">
                          {'subtitulo' in paso ? (paso as any).subtitulo : paso.rol}
                        </p>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-600 text-center mt-2">
                    Usá el botón de arriba para avanzar los pasos del workflow
                  </p>
                </>
              )}

              {/* Inscripción y otros — timeline original */}
              {tramite.tipo !== 'descargo_multa' && tramite.tipo !== 'transferencia' && (
                <>
              {PASOS_INSCRIPCION.map((paso, i) => {
                if (!wf) return null
                const completado = pasoActual !== null && i < pasoActual - 1
                const enCurso   = pasoActual !== null && i === pasoActual - 1
                const pasoData  = (wf as unknown as Record<string, unknown>)[`paso${paso.id}`] as { completadoPorNombre?: string; completadoEn?: { toDate: () => Date } } | undefined

                return (
                  <div key={paso.id} className="flex gap-3 mb-1">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center
                                   text-xs font-bold shrink-0 z-10 border-2 transition-all"
                        style={{
                          background:   completado ? paso.color : enCurso ? `${paso.color}25` : 'rgba(255,255,255,0.04)',
                          borderColor:  completado || enCurso ? paso.color : 'rgba(255,255,255,0.08)',
                          color:        completado ? '#fff' : paso.color,
                        }}
                      >
                        {completado ? '✓' : enCurso ? '●' : paso.id}
                      </div>
                      {i < PASOS_INSCRIPCION.length - 1 && (
                        <div className="w-px flex-1 min-h-4 my-1"
                          style={{ background: completado ? `${paso.color}40` : 'rgba(255,255,255,0.06)' }} />
                      )}
                    </div>
                    <div
                      className={`flex-1 pb-3 rounded-lg mb-1 px-3 py-2 transition-all ${
                        enCurso ? 'border border-white/10' : 'border border-transparent'
                      }`}
                      style={{ background: enCurso ? `${paso.color}08` : 'transparent' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: completado ? '#e2e8f0' : enCurso ? paso.color : '#475569' }}
                        >
                          {paso.icono} {paso.titulo}
                        </span>
                        {enCurso && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${paso.color}20`, color: paso.color }}
                          >
                            EN CURSO
                          </span>
                        )}
                      </div>
                      {pasoData?.completadoPorNombre && (
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {pasoData.completadoPorNombre} · {pasoData.completadoEn ? formatFecha(pasoData.completadoEn as Parameters<typeof formatFecha>[0]) : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {wf && pasoActual && pasoActual <= 7 && (
                <div className="mt-4 bg-[#D4621A]/08 border border-[#D4621A]/20 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-[#D4621A] uppercase tracking-wide mb-1">
                    📋 Próximo paso
                  </p>
                  <p className="text-xs text-yellow-200/80 leading-relaxed">
                    {PASOS_INSCRIPCION[pasoActual - 1]?.descripcion}
                  </p>
                </div>
              )}
                </>
              )}

            </div>
          )}

          {/* ── FOTOS ── */}
          {tab === 'fotos' && (
            <div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Las fotos marcadas con <span className="text-yellow-400">⚑</span> tienen
                revisión solicitada. El gestor será notificado al ingresar.
              </p>
              {!wf ? (
                <p className="text-center text-gray-600 py-8 text-xs">Sin workflow activo en este trámite.</p>
              ) : (
                [2, 3, 4, 5, 6].map(numPaso => {
                  const pasoKey = `paso${numPaso}` as keyof typeof wf
                  const pasoD = wf[pasoKey] as { fotos?: { nombre: string; tamanoKb: number; subidaEn?: { toDate: () => Date }; subidaPor?: string; adminFlag?: boolean }[] } | undefined
                  if (!pasoD?.fotos?.length) return null
                  const pasoConfig = PASOS_INSCRIPCION[numPaso - 1]

                  return (
                    <div key={numPaso} className="mb-5">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        {pasoConfig?.icono} Paso {numPaso} — {pasoConfig?.titulo}
                      </p>
                      {pasoD.fotos.map((foto, fi) => (
                        <div
                          key={fi}
                          className={`rounded-lg p-3 mb-2 border transition-all ${
                            foto.adminFlag
                              ? 'bg-yellow-900/10 border-yellow-500/30'
                              : 'bg-white/3 border-white/8'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-300 truncate">
                              📄 {foto.nombre}
                            </span>
                            {foto.adminFlag
                              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">⚑ Revisar</span>
                              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30">✓ Válida</span>
                            }
                          </div>
                          {/* Preview placeholder */}
                          <div className="w-full h-14 bg-white/4 rounded-lg flex items-center justify-center text-2xl mb-2">🖼️</div>
                          <p className="text-[10px] text-gray-600">
                            {foto.tamanoKb} KB · {foto.subidaEn ? formatFecha(foto.subidaEn as Parameters<typeof formatFecha>[0]) : '—'}
                          </p>
                          {foto.adminFlag && (
                            <p className="text-[10px] text-yellow-400/80 mt-1 italic">
                              Admin solicitó resubida de esta foto.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── DATOS ── */}
          {tab === 'datos' && (
            <div>
              {[
                ['Número',       tramite.numero || tramite.id],
                ['Tipo',         TIPO_LABEL[tramite.tipo] ?? tramite.tipo],
                ['Estado',       ESTADO_LABEL[tramite.estado] ?? tramite.estado],
                ['Patente',      tramite.patente || '—'],
                ['Gestor',       tramite.asignadoA ?? 'Sin asignar'],
                ['Honorarios',   tramite.honorarios ? `$${tramite.honorarios.toLocaleString('es-AR')}` : '—'],
                ['Pagado',       tramite.pagado ? '✓ Sí' : '✗ No'],
                ['Ingresado',    formatFecha(tramite.creadoEn)],
                ['Última act.',  formatRelativo(tramite.actualizadoEn)],
                ['Días sin mov.',`${tramite.diasSinMovimiento.toFixed(0)} días`],
                ...(tramite.diasHastaChapa !== undefined
                  ? [['Chapa en', tramite.diasHastaChapa <= 0 ? '⚠️ Vencida/Hoy' : `${tramite.diasHastaChapa} días`]]
                  : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-gray-500">{k}</span>
                  <span className="text-xs font-semibold text-gray-200 text-right max-w-[55%]">{v}</span>
                </div>
              ))}

              {tramite.observacionesInternas && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Observaciones internas
                  </p>
                  <div className="bg-white/3 rounded-lg p-3 text-xs text-gray-400 leading-relaxed">
                    {tramite.observacionesInternas}
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate(`/admin/tramites/${tramite.id}`)}
                className="mt-5 w-full flex items-center justify-center gap-2 py-2.5
                           bg-[#D4621A]/10 hover:bg-[#D4621A]/20 border border-[#D4621A]/30
                           text-[#D4621A] text-xs font-bold rounded-lg transition-all"
              >
                <Eye size={13} /> Ver ficha completa del trámite
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ────────────────────────────────────────────────────────

export default function TorreDeControlPage() {
  usePageTitle('Torre de Control')
  const navigate    = useNavigate()
  const { gestores: gestoresEquipo } = useGestoresEquipo()
  const { puede }   = usePermisos()
  const { user }    = useAuth()
  const verTodo            = puede('verTorreCompleta')
  const verRendimiento     = puede('verRendimientoGestores')
  const soloPropia  = puede('verTorreSoloPropia')
  // Panel de premios: visible para asesor_comercial (sus propios) y propietario (los del asesor)
  const verPremiosTorre      = puede('verPremiosTorre')
  const esPropietario        = user?.rol === 'propietario'
  const esAsesorComercial    = user?.rol === 'asesor_comercial'

  const {
    tramitesEnriquecidos, kpis, alertasActivas, etapasPipeline, loading,
  } = useTorreControl()

  // Finalizados hoy: tramites entregados/completados con actualizacion de hoy
  const { tramites: todosLosTramites } = useTramites()
  const finalizadosHoy = useMemo(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    return todosLosTramites.filter(t => {
      if (!['entregado', 'completado'].includes(t.estado)) return false
      const fecha = t.actualizadoEn?.toDate?.() ?? t.creadoEn?.toDate?.()
      return fecha && fecha >= hoy
    }).length
  }, [todosLosTramites])

  const gestorNombrePorUid = useMemo(() => {
    const map = new Map<string, string>()
    gestoresEquipo.forEach(g => map.set(g.uid, `${g.nombre} ${g.apellido}`.trim()))
    return map
  }, [gestoresEquipo])

  const nombreGestor = (uid?: string | null) => {
    if (!uid) return 'Sin asignar'
    return gestorNombrePorUid.get(uid) ?? uid
  }

  const estadisticasMandatarios = useEstadisticasMandatarios(
    tramitesEnriquecidos,
    gestoresEquipo.map(g => ({ uid: g.uid, nombre: g.nombre, apellido: g.apellido }))
  )

  const [vistaActiva, setVista]   = useState<'dashboard' | 'monitor' | 'mandatarios' | 'alertas'>('dashboard')
  const [filtroTipo, setFiltroTipo]   = useState<string>('todos')
  const [filtroNivel, setFiltroNivel] = useState<string>('todos')
  const [filtroMand, setFiltroMand]   = useState<string>('todos')
  const [busqueda, setBusqueda]       = useState('')
  const [detalle, setDetalle]         = useState<TramiteEnriquecido | null>(null)
  const [acksLocales, setAcksLocales] = useState<Set<string>>(new Set())
  const [pulso, setPulso]             = useState(false)
  const [hora, setHora]               = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => { setHora(new Date()); setPulso(p => !p) }, 4000)
    return () => clearInterval(t)
  }, [])

  // Filtrar alertas (excluyendo ACK local)
  const alertasFiltradas = alertasActivas.filter(a => !acksLocales.has(a.id))

  // Filtrar tabla
  const tramitesFiltrados = tramitesEnriquecidos.filter(t => {
    if (filtroTipo  !== 'todos' && t.tipo       !== filtroTipo)  return false
    if (filtroNivel !== 'todos' && t.alertLevel !== filtroNivel) return false
    if (filtroMand  !== 'todos' && t.asignadoA  !== filtroMand)  return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (
        !t.patente?.toLowerCase().includes(q) &&
        !(t.numero ?? '').toLowerCase().includes(q) &&
        !(t.id ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const mandatariosUnicos = estadisticasMandatarios
    .map(m => ({ uid: m.uid, nombre: `${m.nombre} ${m.apellido}`.trim() }))

  // ── VISTAS ────────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="space-y-5">

      {soloPropia && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-xl px-4 py-2.5 mb-2">
          <Eye size={13} className="text-blue-400 shrink-0" />
          <p className="text-xs text-blue-300">Estás viendo solo tus trámites asignados.</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <KPICard icon={Radar}        label="Activos"        value={kpis.activos}       sub={`${kpis.inscripciones} inscripciones`}  color="blue"   onClick={() => setFiltroTipo('todos')} />
        <KPICard icon={ShieldAlert}  label="Críticos"       value={kpis.criticos}      sub="Requieren acción"                       color="red"    onClick={() => setFiltroNivel('critico')} />
        <KPICard icon={Clock}        label="Demorados"      value={kpis.demorados}     sub="SLA excedido"                           color="yellow" onClick={() => setFiltroNivel('amarillo')} />
        <KPICard icon={Lock}         label="Bloqueados"     value={kpis.chapasPendientes} sub="Chapa pendiente"                     color="orange" />
        <KPICard icon={CheckCircle2} label="Finalizados hoy" value={finalizadosHoy}    sub="Completados y entregados"               color="green" />
      </div>

      {/* Alertas activas */}
      {alertasFiltradas.length > 0 && (
        <div className="rounded-xl border border-red-600/20 overflow-hidden bg-[#0d1117]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
              ⚠️ Alertas Activas ({alertasFiltradas.length})
            </span>
            <button onClick={() => setVista('alertas')} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
              Ver todas →
            </button>
          </div>
          {alertasFiltradas.slice(0, 4).map(a => {
            const t = tramitesEnriquecidos.find(t => t.id === a.tramiteId)
            return (
              <AlertaBanner key={a.id} alerta={a} tramite={t}
                onAck={id => setAcksLocales(prev => new Set([...prev, id]))} />
            )
          })}
        </div>
      )}

      {/* Grid principal: tabla + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">

        {/* Tabla operativa */}
        <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0d1117]">
          {/* Filtros */}
          <div className="p-3 border-b border-white/8 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-36">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar patente, número..."
                className="w-full pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg
                           text-xs text-gray-200 placeholder-gray-600 outline-none
                           focus:border-[#D4621A]/50 focus:bg-white/8 transition-all"
              />
            </div>
            {[
              { val: filtroTipo,  set: setFiltroTipo,  opts: [['todos','Todos los tipos'],['inscripcion_inicial','🏍️ Inscripciones'],['transferencia','🔄 Transferencias'],['descargo_multa','📋 Multas']] },
              { val: filtroNivel, set: setFiltroNivel, opts: [['todos','Criticidad'],['critico','🚨 Crítico'],['rojo','🔴 Rojo'],['naranja','🟠 Naranja'],['amarillo','⚠️ Amarillo']] },
              ...(verTodo ? [{ val: filtroMand, set: setFiltroMand, opts: [['todos','Todos los gestores'], ...mandatariosUnicos.map(m => [m.uid, m.nombre])] }] : []),
            ].map((f, i) => (
              <select
                key={i}
                value={f.val}
                onChange={e => f.set(e.target.value)}
                className="py-1.5 px-2 bg-white/5 border border-white/10 rounded-lg text-[11px]
                           text-gray-300 outline-none cursor-pointer hover:border-white/20 transition-all"
              >
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <span className="text-[10px] text-gray-600 ml-auto">{tramitesFiltrados.length}/{tramitesEnriquecidos.length}</span>
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw size={20} className="animate-spin text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-600">Cargando trámites...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8 bg-black/30">
                    {['#','','Patente / Nro','Estado','Gestor','Días','Nivel'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[9px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tramitesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-600">
                        Sin trámites con estos filtros
                      </td>
                    </tr>
                  ) : tramitesFiltrados.map(t => {
                    const s = NIVEL_STYLE[t.alertLevel]
                    return (
                      <tr
                        key={t.id}
                        onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                        className={`border-b border-white/5 cursor-pointer transition-colors hover:bg-white/3 ${s.row}`}
                      >
                        <td className="px-3 py-2.5 font-mono text-[10px] text-gray-600">{t.numero?.slice(-6) ?? t.id.slice(-6)}</td>
                        <td className="px-2 py-2.5 text-gray-500">{TIPO_ICON[t.tipo]}</td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-gray-200 whitespace-nowrap">{t.patente || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${ESTADO_COLOR[t.estado] ?? 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                            {ESTADO_LABEL[t.estado] ?? t.estado}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">{nombreGestor(t.asignadoA)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-bold ${
                            t.diasSinMovimiento > 5 ? 'text-red-400' :
                            t.diasSinMovimiento > 2 ? 'text-yellow-400' : 'text-gray-500'
                          }`}>
                            {t.diasSinMovimiento.toFixed(0)}d
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.badge}`}>
                            {NIVEL_ICON[t.alertLevel]} {t.alertLevel.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">

          {/* Mandatarios */}
          <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0d1117]">
            <div className="px-3 py-2.5 border-b border-white/8">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <Users size={11} className="inline mr-1" />Carga por Gestor
              </span>
            </div>
            <div className="p-3 space-y-3">
              {estadisticasMandatarios.map(m => {
                const color = m.estadoCarga === 'sobrecarga' ? '#ef4444' : m.estadoCarga === 'atencion' ? '#f59e0b' : '#22c55e'
                const pct   = Math.min(m.tramitesActivos / 30 * 100, 100)
                return (
                  <div key={m.uid} className="cursor-pointer" onClick={() => setFiltroMand(m.uid)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-200">{`${m.nombre} ${m.apellido}`.trim()}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${color}18`, color }}>
                        {m.estadoCarga.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-gray-600 mb-1.5">
                      <span>{m.tramitesActivos} asign.</span>
                      {m.criticos > 0 && <span className="text-red-500">🚨{m.criticos}</span>}
                      {m.demorados > 0 && <span className="text-yellow-500">⏱{m.demorados}</span>}
                      <span className="ml-auto text-green-500">✓{m.eficiencia}%</span>
                    </div>
                    <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
              {estadisticasMandatarios.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-2">Sin datos de gestores</p>
              )}
            </div>
          </div>

          {/* Pipeline por paso */}
          <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0d1117]">
            <div className="px-3 py-2.5 border-b border-white/8">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <BarChart3 size={11} className="inline mr-1" />Pipeline Inscripciones
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {PASOS_INSCRIPCION.map(p => {
                const count = etapasPipeline[p.id] ?? 0
                const pct   = count > 0 ? Math.max(count / 10 * 100, 8) : 0
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600 text-right w-20 shrink-0 truncate">{p.titulo}</span>
                    <div className="flex-1 h-3.5 bg-white/5 rounded overflow-hidden">
                      {count > 0 && (
                        <div
                          className="h-full rounded flex items-center justify-end pr-1 transition-all"
                          style={{ width: `${pct}%`, background: p.color }}
                        >
                          <span className="text-[9px] font-bold text-white">{count}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold w-4 text-right" style={{ color: p.color }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Vencimientos chapa */}
          {tramitesEnriquecidos.some(t => t.diasHastaChapa !== undefined) && (
            <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0d1117]">
              <div className="px-3 py-2.5 border-b border-white/8">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <CalendarClock size={11} className="inline mr-1" />Retiro de Chapas
                </span>
              </div>
              <div>
                {tramitesEnriquecidos
                  .filter(t => t.diasHastaChapa !== undefined)
                  .sort((a, b) => (a.diasHastaChapa ?? 99) - (b.diasHastaChapa ?? 99))
                  .slice(0, 4)
                  .map(t => {
                    const dias  = t.diasHastaChapa!
                    const color = dias <= 0 ? 'text-red-400' : dias <= 3 ? 'text-orange-400' : dias <= 7 ? 'text-yellow-400' : 'text-gray-400'
                    const badge = dias <= 0 ? 'HOY/VENCIDA' : dias === 1 ? 'MAÑANA' : `${dias}d`
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 border-b border-white/5 cursor-pointer hover:bg-white/3 transition-colors"
                        onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono text-gray-600 truncate">{t.numero ?? t.id}</p>
                          <p className="text-xs text-gray-300 truncate">{t.patente}</p>
                        </div>
                        <span className={`text-[9px] font-bold ${color}`}>{badge}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderMonitor = () => (
    <div className="font-mono overflow-x-auto -mx-5 px-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-yellow-400 tracking-widest uppercase">
          🖥️ MONITOR OPERATIVO — GESTORÍA PAZ
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-green-400">
          <div className={`w-2 h-2 rounded-full bg-green-400 transition-all ${pulso ? 'opacity-100 shadow-[0_0_6px_#22c55e]' : 'opacity-60'}`} />
          EN LÍNEA · {hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {[
        { grupo: 'INSCRIPCIONES INICIALES', tipo: 'inscripcion_inicial' },
        { grupo: 'TRANSFERENCIAS',           tipo: 'transferencia'      },
        { grupo: 'MULTAS',                   tipo: 'descargo_multa'     },
      ].map(({ grupo, tipo }) => {
        const items   = tramitesEnriquecidos.filter(t => t.tipo === tipo)
        const criticos = items.filter(t => t.alertLevel === 'critico').length
        const demorados = items.filter(t => ['amarillo','naranja'].includes(t.alertLevel)).length
        const bloqueados = items.filter(t => t.estado === 'documentacion_requerida').length

        return (
          <div key={tipo} className="mb-5">
            <div className="flex items-center gap-4 px-3 py-1.5 bg-white/4 rounded-t-lg border border-white/8 border-b-0">
              <span className="text-yellow-400 font-bold text-xs min-w-48">{grupo} ({items.length})</span>
              {criticos  > 0 && <span className="text-red-400 text-[10px]">🚨 {criticos} CRÍTICOS</span>}
              {demorados > 0 && <span className="text-yellow-400 text-[10px]">⏱ {demorados} DEMORADOS</span>}
              {bloqueados > 0 && <span className="text-red-400 text-[10px]">🔒 {bloqueados} BLOQUEADOS</span>}
              {criticos === 0 && demorados === 0 && bloqueados === 0 && (
                <span className="text-green-400 text-[10px]">✅ TODO OK</span>
              )}
            </div>
            <div className="border border-white/8 rounded-b-lg overflow-hidden">
              <div className="grid grid-cols-[90px_1fr_130px_100px_60px_65px] gap-2 px-3 py-1.5 bg-black/40 border-b border-white/8">
                {['ID','PATENTE/NRO','ESTADO','GESTOR','DÍAS','NIVEL'].map(h => (
                  <span key={h} className="text-[8px] font-bold text-gray-600 tracking-wider uppercase">{h}</span>
                ))}
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-gray-600">Sin trámites activos</div>
              ) : items.map(t => {
                const s = NIVEL_STYLE[t.alertLevel]
                return (
                  <div
                    key={t.id}
                    onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                    className={`grid grid-cols-[90px_1fr_130px_100px_60px_65px] gap-2 px-3 py-2
                               border-b border-white/5 cursor-pointer hover:bg-white/3 transition-colors items-center
                               ${s.row}`}
                  >
                    <span className={`text-[10px] font-mono ${s.text}`}>{t.id.slice(-8)}</span>
                    <span className="text-[11px] text-gray-300 truncate">{t.patente || t.numero || '—'}</span>
                    <span className="text-[10px]" style={{ color: ESTADO_COLOR[t.estado]?.match(/text-\S+/)?.[0] ?? '#94a3b8' }}>
                      {ESTADO_LABEL[t.estado] ?? t.estado}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate">{nombreGestor(t.asignadoA)}</span>
                    <span className={`text-[11px] font-bold ${
                      t.diasSinMovimiento > 5 ? 'text-red-400' :
                      t.diasSinMovimiento > 2 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>{t.diasSinMovimiento.toFixed(0)}d</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded text-center ${s.badge}`}>
                      {NIVEL_ICON[t.alertLevel]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderMandatarios = () => {
    const getPctCompletados = (uid: string) => {
      const asignados   = todosLosTramites.filter(t => t.asignadoA === uid || t.creadoPor === uid)
      const total       = asignados.length
      if (!total) return null
      const completados = asignados.filter(t => ['entregado','completado'].includes(t.estado)).length
      return { completados, total, pct: Math.round((completados / total) * 100) }
    }
    return (
      <div className="space-y-5">
        {verRendimiento && (
          <div className="flex items-center gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-4 py-2.5">
            <MonitorDot size={13} className="text-indigo-400 shrink-0" />
            <p className="text-xs text-indigo-300">
              Vista extendida: porcentaje de trámites completados por gestor (Propietario / Admin General).
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {estadisticasMandatarios.map(m => {
            const color   = m.estadoCarga === 'sobrecarga' ? '#ef4444' : m.estadoCarga === 'atencion' ? '#f59e0b' : '#22c55e'
            const pctData = verRendimiento ? getPctCompletados(m.uid) : null
            return (
              <div key={m.uid}
                className="rounded-xl border p-4 bg-[#0d1117] cursor-pointer hover:bg-[#111827] transition-colors"
                style={{ borderColor: `${color}25` }}
                onClick={() => { setFiltroMand(m.uid); setVista('dashboard') }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2"
                      style={{ background: `${color}18`, borderColor: `${color}40`, color }}>
                      {m.nombre[0]}{m.apellido[0] || m.nombre[1]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-100">{`${m.nombre} ${m.apellido}`.trim()}</p>
                      <p className="text-[10px] text-gray-600">Mandatario</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                    style={{ background: `${color}18`, color }}>
                    {m.estadoCarga.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[['Asignados', m.tramitesActivos, '#3b82f6'],['Críticos', m.criticos, '#dc2626'],['Demorados', m.demorados, '#f59e0b'],['Cerrados/sem', m.finalizadosSemana, '#22c55e']].map(([k,v,c]) => (
                    <div key={String(k)} className="bg-white/3 rounded-lg p-2">
                      <p className="text-[9px] text-gray-600">{k}</p>
                      <p className="text-lg font-extrabold" style={{ color: String(c) }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-600">Eficiencia</span>
                  <span className="font-bold" style={{ color }}>{m.eficiencia}%</span>
                </div>
                <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.eficiencia}%`, background: color }} />
                </div>
                {pctData && (
                  <div className="mt-3 pt-3 border-t border-white/6">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-indigo-400 font-semibold">% Completados</span>
                      <span className="text-indigo-300 font-bold">
                        {pctData.completados}/{pctData.total} ({pctData.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-indigo-500/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${pctData.pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderAlertas = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        {(['critico','rojo','naranja','amarillo'] as NivelAlerta[]).map(n => {
          const cnt = alertasFiltradas.filter(a => a.nivel === n).length
          if (!cnt) return null
          return (
            <span key={n} className={`text-[9px] font-bold px-2 py-1 rounded border ${NIVEL_STYLE[n].badge}`}>
              {NIVEL_ICON[n]} {cnt}
            </span>
          )
        })}
      </div>
      <div className="rounded-xl border border-white/8 overflow-hidden bg-[#0d1117]">
        {alertasActivas.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCheck size={28} className="mx-auto text-green-500 mb-2 opacity-60" />
            <p className="text-xs text-gray-600">Sin alertas activas</p>
          </div>
        ) : alertasActivas.map(a => {
          const acked = acksLocales.has(a.id)
          const s     = NIVEL_STYLE[a.nivel]
          return (
            <div key={a.id}
              className={`flex items-start gap-3 px-4 py-3.5 border-b border-white/5 transition-opacity ${acked ? 'opacity-40' : ''}`}
              style={{ borderLeftWidth: 3, borderLeftColor: acked ? '#334155' : NIVEL_STYLE[a.nivel].border.replace('border-l-','') }}
            >
              <span className="text-base shrink-0">{acked ? '✅' : NIVEL_ICON[a.nivel]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-extrabold" style={{ color: '#ffffff' }}>
                    {(() => {
                      const t = tramitesEnriquecidos.find(t => t.id === a.tramiteId)
                      return t?.clienteNombre ?? t?.patente ?? a.tramiteId.slice(-8)
                    })()}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${acked ? 'bg-green-500/10 text-green-400 border-green-500/20' : s.badge}`}>
                    {acked ? 'RECONOCIDA' : a.nivel.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.75)' }}>{a.mensaje}</p>
                {(() => {
                  const t = tramitesEnriquecidos.find(x => x.id === a.tramiteId)
                  if (!t) return null
                  const labelTipo: Record<string, string> = {
                    inscripcion_inicial: 'Inscripción', transferencia: 'Transferencia', descargo_multa: 'Multa',
                  }
                  return (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                        {labelTipo[t.tipo] ?? t.tipo} · {t.patente || '—'}
                      </span>
                      {t.creadoEn && (
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Cargado: {t.creadoEn.toDate?.()?.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })}
                          {t.creadoPorNombre ? ` · ${t.creadoPorNombre}` : ''}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
              {!acked ? (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => setAcksLocales(p => new Set([...p, a.id]))}
                    className={`text-[10px] px-2.5 py-1 rounded border cursor-pointer transition-all ${s.badge}`}>
                    ✓ ACK
                  </button>
                  <button onClick={() => {
                      const _t = tramitesEnriquecidos.find(t => t.id === a.tramiteId)
                      if (_t && (_t.tipo === 'descargo_multa' || _t.tipo === 'transferencia')) {
                        navigate(`/admin/tramites/${a.tramiteId}`)
                      } else { setDetalle(_t ?? null) }
                    }}
                    className="text-[10px] px-2.5 py-1 rounded border border-white/10 bg-white/4 text-gray-500 hover:text-gray-300 cursor-pointer transition-all">
                    Ver →
                  </button>
                </div>
              ) : (
                <span className="text-xs text-green-500 shrink-0">ACK ✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-[#080d14]">
      {/* Header Torre */}
      <div className="sticky top-0 z-30 bg-[#0a0f1a] border-b border-white/8 px-5 flex items-center justify-between h-12">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {([
            ['dashboard',   <TowerControl size={13} />, 'Dashboard'],
            ['monitor',     <MonitorDot  size={13} />, 'Monitor'],
            ...(verTodo ? [['mandatarios', <Users size={13} />, 'Gestores'] as const] : []),
            ['alertas',     <Bell        size={13} />, `Alertas${alertasFiltradas.length > 0 ? ` (${alertasFiltradas.length})` : ''}`],
          ] as const).map(([id, icon, lbl]) => (
            <button key={id} onClick={() => setVista(id as typeof vistaActiva)}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold transition-all border ${
                vistaActiva === id
                  ? 'bg-[#D4621A]/15 text-[#D4621A] border-[#D4621A]/30'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/4'
              }`}>
              {icon}
              <span className="hidden xs:inline sm:inline">{lbl}</span>
            </button>
          ))}
        </div>
        {/* Indicador live */}
        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <div className={`w-1.5 h-1.5 rounded-full bg-green-400 transition-all ${pulso ? 'opacity-100' : 'opacity-40'}`} />
          EN VIVO · {hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-3 sm:p-5">
        {vistaActiva === 'dashboard'   && renderDashboard()}
        {vistaActiva === 'monitor'     && renderMonitor()}
        {vistaActiva === 'mandatarios' && verTodo && renderMandatarios()}
        {vistaActiva === 'alertas'     && renderAlertas()}
      </div>

      {/* Drawer detalle */}
      {detalle && <TramiteDrawer tramite={detalle} onClose={() => setDetalle(null)} />}

      {/* Panel Premios — visible solo para asesor_comercial (propio) y propietario */}
      {verPremiosTorre && (esAsesorComercial || esPropietario) && vistaActiva === 'dashboard' && (
        <div className="px-5 pb-8">
          {esAsesorComercial && (
            <PanelPremiosAsesor />
          )}
          {esPropietario && (
            // El propietario ve el resumen de todos los asesores comerciales del equipo
            // Por ahora mostramos el primer asesor_comercial del equipo si existe
            // (En versiones futuras: iterar sobre todos los asesores)
            <PanelPremiosAsesor />
          )}
        </div>
      )}
    </div>
  )
}