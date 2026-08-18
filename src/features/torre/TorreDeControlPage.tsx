// src/features/torre/TorreDeControlPage.tsx
// Torre de Control — tema claro (fondo blanco), botón pantalla completa
// v2 — JAH-NISSI Digital Studio · GestorApp
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { useNavigate }       from 'react-router-dom'
import {
  Radar, Clock, Lock, CheckCircle2,
  ChevronRight, Search, X,
  RefreshCw, CheckCheck, Eye, Bike, ArrowLeftRight,
  FileWarning, Users, CalendarClock, BarChart3,
  TowerControl, MonitorDot, Bell, ShieldAlert,
  Maximize2, Minimize2,
} from 'lucide-react'
import { useTorreControl, useEstadisticasMandatarios } from '@/hooks/useTorreControl'
import { useTramites }   from '@/hooks/useTramites'
import { usePermisos }   from '@/hooks/usePermisos'
import { useAuth }       from '@/hooks/useAuth'
import { useGestoresEquipo } from '@/hooks/useEquipo'
import { usePageTitle }  from '@/hooks/usePageTitle'
import { formatRelativo, formatFecha } from '@/utils'
import type { TramiteEnriquecido, AlertaTorre, NivelAlerta } from '@/torre_types'
import { PASOS_INSCRIPCION }   from '@/torre_types'
import { PASOS_MULTA_CONFIG }  from '@/types/multa_types'
import { PASOS_TRANSFERENCIA } from '@/transferencia_types'
import PanelPremiosAsesor      from '@/components/shared/PanelPremiosAsesor'

// ─── HELPERS VISUALES ────────────────────────────────────────────────────────
// Todos los colores usan tokens semánticos para fondo CLARO (blanco).
// Las opacidades de `NIVEL_RAW.bg` son bajas (≤0.06) para que la fila de tabla
// sea apenas coloreada sobre blanco sin perder legibilidad.

const NIVEL_STYLE: Record<NivelAlerta, { dot: string; badge: string; text: string; border: string; row: string }> = {
  critico:  { dot:'bg-red-600',    badge:'bg-red-100 text-red-700 border-red-300',        text:'text-red-700',    border:'border-l-red-600',    row:'bg-red-50'       },
  rojo:     { dot:'bg-red-500',    badge:'bg-red-50 text-red-600 border-red-200',          text:'text-red-600',    border:'border-l-red-500',    row:'bg-red-50/60'    },
  naranja:  { dot:'bg-orange-500', badge:'bg-orange-50 text-orange-700 border-orange-200', text:'text-orange-700', border:'border-l-orange-500', row:'bg-orange-50/60' },
  amarillo: { dot:'bg-yellow-500', badge:'bg-yellow-50 text-yellow-700 border-yellow-200', text:'text-yellow-700', border:'border-l-yellow-500', row:'bg-yellow-50/40' },
  info:     { dot:'bg-gray-400',   badge:'bg-gray-100 text-gray-600 border-gray-200',      text:'text-gray-600',   border:'border-l-gray-400',   row:''                },
}

const NIVEL_RAW = {
  critico:  { bg: 'rgba(220,38,38,0.06)',  border: '#dc2626', text: '#b91c1c', badge: 'rgba(220,38,38,0.12)',  badgeText: '#b91c1c' },
  rojo:     { bg: 'rgba(239,68,68,0.04)',  border: '#ef4444', text: '#dc2626', badge: 'rgba(239,68,68,0.10)',  badgeText: '#dc2626' },
  naranja:  { bg: 'rgba(249,115,22,0.04)', border: '#f97316', text: '#c2410c', badge: 'rgba(249,115,22,0.11)', badgeText: '#c2410c' },
  amarillo: { bg: 'rgba(234,179,8,0.04)',  border: '#d97706', text: '#92400e', badge: 'rgba(234,179,8,0.11)',  badgeText: '#92400e' },
  info:     { bg: 'rgba(59,130,246,0.04)', border: '#3b82f6', text: '#1d4ed8', badge: 'rgba(59,130,246,0.11)', badgeText: '#1d4ed8' },
}

// Paleta saturada SOLO para el monitor (tabla). Colores puros estilo Excel,
// aislada de NIVEL_RAW para no recargar el feed de alertas.
const NIVEL_MONITOR = {
  critico:  { bg: 'rgba(220,38,38,0.22)',  border: '#dc2626', text: '#991b1b', badge: 'rgba(220,38,38,0.16)',  badgeText: '#991b1b' },
  rojo:     { bg: 'rgba(239,68,68,0.16)',  border: '#ef4444', text: '#b91c1c', badge: 'rgba(239,68,68,0.14)',  badgeText: '#b91c1c' },
  naranja:  { bg: 'rgba(249,115,22,0.18)', border: '#f97316', text: '#9a3412', badge: 'rgba(249,115,22,0.16)', badgeText: '#9a3412' },
  amarillo: { bg: 'rgba(250,204,21,0.28)', border: '#ca8a04', text: '#854d0e', badge: 'rgba(234,179,8,0.20)',  badgeText: '#854d0e' },
  info:     { bg: 'rgba(59,130,246,0.14)', border: '#3b82f6', text: '#1e40af', badge: 'rgba(59,130,246,0.14)', badgeText: '#1e40af' },
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
  pendiente:                'bg-gray-100 text-gray-600 border-gray-200',
  en_proceso:               'bg-blue-100 text-blue-700 border-blue-200',
  documentacion_requerida:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  en_organismo:             'bg-purple-100 text-purple-700 border-purple-200',
  listo_para_retirar:       'bg-green-100 text-green-700 border-green-200',
  entregado:                'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente:               'Pendiente',
  en_proceso:              'En Proceso',
  documentacion_requerida: 'Doc. Requerida',
  en_organismo:            'En Organismo',
  listo_para_retirar:      'Para Retirar',
  entregado:               'Entregado',
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

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
        group text-left p-4 rounded-xl border bg-white shadow-sm transition-all hover:shadow-md
        ${color === 'blue'   ? 'border-blue-200   hover:border-blue-400'    : ''}
        ${color === 'red'    ? 'border-red-200    hover:border-red-400'     : ''}
        ${color === 'orange' ? 'border-orange-200 hover:border-orange-400'  : ''}
        ${color === 'yellow' ? 'border-yellow-200 hover:border-yellow-400'  : ''}
        ${color === 'green'  ? 'border-emerald-200 hover:border-emerald-400': ''}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center
          ${color === 'blue'   ? 'bg-blue-100 text-blue-600'      : ''}
          ${color === 'red'    ? 'bg-red-100 text-red-600'        : ''}
          ${color === 'orange' ? 'bg-orange-100 text-orange-600'  : ''}
          ${color === 'yellow' ? 'bg-yellow-100 text-yellow-700'  : ''}
          ${color === 'green'  ? 'bg-emerald-100 text-emerald-600': ''}
        `}>
          <Icon size={16} />
        </div>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
      </div>
      <div className={`
        text-2xl font-extrabold tabular-nums mb-0.5
        ${color === 'blue'   ? 'text-blue-600'    : ''}
        ${color === 'red'    ? 'text-red-600'     : ''}
        ${color === 'orange' ? 'text-orange-600'  : ''}
        ${color === 'yellow' ? 'text-yellow-700'  : ''}
        ${color === 'green'  ? 'text-emerald-600' : ''}
      `}>
        {value}
      </div>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </button>
  )
}

// ─── ALERTA BANNER ────────────────────────────────────────────────────────────

function AlertaBanner({
  alerta, onAck, tramite,
}: { alerta: AlertaTorre; onAck: (id: string) => void; tramite?: TramiteEnriquecido }) {
  const nr = NIVEL_RAW[alerta.nivel]
  const labelTipo: Record<string, string> = {
    inscripcion_inicial: 'Inscripción', transferencia: 'Transferencia', descargo_multa: 'Multa',
  }
  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5"
      style={{ background: nr.bg, borderLeft: `4px solid ${nr.border}`, borderBottom: `1px solid ${nr.border}20` }}
    >
      <span className="text-base shrink-0 mt-0.5">{NIVEL_ICON[alerta.nivel]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-extrabold text-gray-900">
            {tramite?.clienteNombre ?? tramite?.patente ?? alerta.tramiteId.slice(-8)}
          </span>
          {tramite && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {labelTipo[tramite.tipo] ?? tramite.tipo} · {tramite.patente || '—'}
            </span>
          )}
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
            style={{ background: nr.badge, color: nr.badgeText }}
          >
            {alerta.nivel.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-gray-700 leading-snug">{alerta.mensaje}</p>
        {tramite?.creadoEn && (
          <p className="text-[10px] mt-1 text-gray-400">
            Cargado: {tramite.creadoEn.toDate?.()?.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' })}
          </p>
        )}
      </div>
      <button
        onClick={() => onAck(alerta.id)}
        className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg font-bold border border-gray-200
                   bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all"
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
  const navigate       = useNavigate()
  const [tab, setTab]  = useState<'timeline' | 'fotos' | 'datos'>('timeline')
  const s              = NIVEL_STYLE[tramite.alertLevel]
  const wf             = tramite.workflow
  const pasoActual     = wf?.pasoActual ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border-l border-gray-200 overflow-y-auto h-full flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 z-10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-gray-400">{tramite.numero || tramite.id}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>
                  {NIVEL_ICON[tramite.alertLevel]} {tramite.alertLevel.toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">{tramite.patente || '—'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {TIPO_LABEL[tramite.tipo] ?? tramite.tipo} · {tramite.asignadoA ?? 'Sin asignar'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200
                         flex items-center justify-center text-gray-500 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {tramite.alertLevel === 'critico' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-red-700">
                🚨 <strong>CRÍTICO:</strong> {tramite.alertas[0]?.mensaje ?? 'Requiere acción inmediata.'}
              </p>
            </div>
          )}

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
                        : i === pasoActual - 1 ? `${p.color}60`
                        : '#E5E7EB',
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-400 text-right">
                Paso {pasoActual}/7 · {PASOS_INSCRIPCION[pasoActual - 1]?.titulo}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {(['timeline','fotos','datos'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                tab === id
                  ? 'text-[#D4621A] border-[#D4621A] bg-[#D4621A]/5'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {id === 'timeline' ? '📋 Timeline' : id === 'fotos' ? '📎 Fotos' : '📊 Datos'}
            </button>
          ))}
        </div>

        <div className="p-5 flex-1">

          {/* TIMELINE */}
          {tab === 'timeline' && (
            <div>
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
                    ? PASOS_MULTA_CONFIG as readonly { id: number; titulo: string; subtitulo: string; icono: string; rol: string }[]
                    : PASOS_TRANSFERENCIA as readonly { id: number; titulo: string; icono: string; rol: string }[]
                  ).map((paso, i, arr) => (
                    <div key={paso.id} className="flex gap-3 mb-1">
                      <div className="flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 border-2 bg-gray-50 border-gray-200 text-gray-500">
                          {paso.icono}
                        </div>
                        {i < arr.length - 1 && <div className="w-px flex-1 min-h-4 my-1 bg-gray-200" />}
                      </div>
                      <div className="flex-1 pb-2 px-2 py-1">
                        <span className="text-xs font-semibold text-gray-600">{paso.titulo}</span>
                        <p className="text-[10px] text-gray-400 capitalize">
                          {'subtitulo' in paso ? (paso as any).subtitulo : paso.rol}
                        </p>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400 text-center mt-2">
                    Usá el botón de arriba para avanzar los pasos del workflow
                  </p>
                </>
              )}

              {tramite.tipo !== 'descargo_multa' && tramite.tipo !== 'transferencia' && (
                <>
                  {PASOS_INSCRIPCION.map((paso, i) => {
                    if (!wf) return null
                    const completado = pasoActual !== null && i < pasoActual - 1
                    const enCurso    = pasoActual !== null && i === pasoActual - 1
                    const pasoData   = (wf as unknown as Record<string, unknown>)[`paso${paso.id}`] as
                      { completadoPorNombre?: string; completadoEn?: { toDate: () => Date } } | undefined

                    return (
                      <div key={paso.id} className="flex gap-3 mb-1">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 border-2 transition-all"
                            style={{
                              background:  completado ? paso.color : enCurso ? `${paso.color}20` : '#F9FAFB',
                              borderColor: completado || enCurso ? paso.color : '#E5E7EB',
                              color:       completado ? '#fff' : paso.color,
                            }}
                          >
                            {completado ? '✓' : enCurso ? '●' : paso.id}
                          </div>
                          {i < PASOS_INSCRIPCION.length - 1 && (
                            <div className="w-px flex-1 min-h-4 my-1" style={{ background: completado ? `${paso.color}40` : '#E5E7EB' }} />
                          )}
                        </div>
                        <div
                          className={`flex-1 pb-3 rounded-lg mb-1 px-3 py-2 transition-all ${
                            enCurso ? 'border border-gray-200' : 'border border-transparent'
                          }`}
                          style={{ background: enCurso ? `${paso.color}06` : 'transparent' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: completado ? '#374151' : enCurso ? paso.color : '#9CA3AF' }}
                            >
                              {paso.icono} {paso.titulo}
                            </span>
                            {enCurso && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${paso.color}20`, color: paso.color }}>
                                EN CURSO
                              </span>
                            )}
                          </div>
                          {pasoData?.completadoPorNombre && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {pasoData.completadoPorNombre} · {pasoData.completadoEn ? formatFecha(pasoData.completadoEn as Parameters<typeof formatFecha>[0]) : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {wf && pasoActual && pasoActual <= 7 && (
                    <div className="mt-4 bg-orange-50 border border-orange-100 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-[#D4621A] uppercase tracking-wide mb-1">📋 Próximo paso</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{PASOS_INSCRIPCION[pasoActual - 1]?.descripcion}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* FOTOS */}
          {tab === 'fotos' && (
            <div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Las fotos marcadas con <span className="text-amber-600">⚑</span> tienen revisión solicitada.
              </p>
              {!wf ? (
                <p className="text-center text-gray-400 py-8 text-xs">Sin workflow activo en este trámite.</p>
              ) : (
                [2, 3, 4, 5, 6].map(numPaso => {
                  const pasoKey = `paso${numPaso}` as keyof typeof wf
                  const pasoD   = wf[pasoKey] as { fotos?: { nombre: string; tamanoKb: number; subidaEn?: { toDate: () => Date }; adminFlag?: boolean }[] } | undefined
                  if (!pasoD?.fotos?.length) return null
                  const pasoConfig = PASOS_INSCRIPCION[numPaso - 1]
                  return (
                    <div key={numPaso} className="mb-5">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        {pasoConfig?.icono} Paso {numPaso} — {pasoConfig?.titulo}
                      </p>
                      {pasoD.fotos.map((foto, fi) => (
                        <div key={fi} className={`rounded-lg p-3 mb-2 border ${foto.adminFlag ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-600 truncate">📄 {foto.nombre}</span>
                            {foto.adminFlag
                              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">⚑ Revisar</span>
                              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">✓ Válida</span>
                            }
                          </div>
                          <div className="w-full h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xl mb-1">🖼️</div>
                          <p className="text-[10px] text-gray-400">{foto.tamanoKb} KB · {foto.subidaEn ? formatFecha(foto.subidaEn as Parameters<typeof formatFecha>[0]) : '—'}</p>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* DATOS */}
          {tab === 'datos' && (
            <div>
              {[
                ['Número',      tramite.numero || tramite.id],
                ['Tipo',        TIPO_LABEL[tramite.tipo] ?? tramite.tipo],
                ['Estado',      ESTADO_LABEL[tramite.estado] ?? tramite.estado],
                ['Patente',     tramite.patente || '—'],
                ['Honorarios',  tramite.honorarios ? `$${tramite.honorarios.toLocaleString('es-AR')}` : '—'],
                ['Pagado',      tramite.pagado ? '✓ Sí' : '✗ No'],
                ['Ingresado',   formatFecha(tramite.creadoEn)],
                ['Última act.', formatRelativo(tramite.actualizadoEn)],
                ['Días sin mov.',`${tramite.diasSinMovimiento.toFixed(0)} días`],
                ...(tramite.diasHastaChapa !== undefined
                  ? [['Chapa en', tramite.diasHastaChapa <= 0 ? '⚠️ Vencida/Hoy' : `${tramite.diasHastaChapa} días`]]
                  : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-400">{k}</span>
                  <span className="text-xs font-semibold text-gray-700 text-right max-w-[55%]">{v}</span>
                </div>
              ))}
              {tramite.observacionesInternas && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Observaciones internas</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
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

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function TorreDeControlPage() {
  usePageTitle('Torre de Control')
  const navigate             = useNavigate()
  const { gestores: gestoresEquipo } = useGestoresEquipo()
  const { puede }            = usePermisos()
  const { user }             = useAuth()
  const verTodo              = puede('verTorreCompleta')
  const verRendimiento       = puede('verRendimientoGestores')
  const soloPropia           = puede('verTorreSoloPropia')
  const verPremiosTorre      = puede('verPremiosTorre')
  const esPropietario        = user?.rol === 'propietario'
  const esAsesorComercial    = user?.rol === 'asesor_comercial'

  const { tramitesEnriquecidos, kpis, alertasActivas, etapasPipeline, loading } = useTorreControl()
  const { tramites: todosLosTramites } = useTramites()

  const finalizadosHoy = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    return todosLosTramites.filter(t => {
      if (!['entregado', 'completado'].includes(t.estado)) return false
      const f = t.actualizadoEn?.toDate?.() ?? t.creadoEn?.toDate?.()
      return f && f >= hoy
    }).length
  }, [todosLosTramites])

  const gestorNombrePorUid = useMemo(() => {
    const map = new Map<string, string>()
    gestoresEquipo.forEach(g => map.set(g.uid, `${g.nombre} ${g.apellido}`.trim()))
    return map
  }, [gestoresEquipo])

  const nombreGestor = (uid?: string | null) =>
    !uid ? 'Sin asignar' : (gestorNombrePorUid.get(uid) ?? uid)

  const estadisticasMandatarios = useEstadisticasMandatarios(
    tramitesEnriquecidos,
    gestoresEquipo.map(g => ({ uid: g.uid, nombre: g.nombre, apellido: g.apellido }))
  )

  const [vistaActiva,  setVista]      = useState<'dashboard' | 'monitor' | 'mandatarios' | 'alertas'>('dashboard')
  const [filtroTipo,   setFiltroTipo]  = useState('todos')
  const [filtroNivel,  setFiltroNivel] = useState('todos')
  const [filtroMand,   setFiltroMand]  = useState('todos')
  const [busqueda,     setBusqueda]    = useState('')
  const [detalle,      setDetalle]     = useState<TramiteEnriquecido | null>(null)
  const [acksLocales,  setAcksLocales] = useState<Set<string>>(new Set())
  const [pulso,        setPulso]       = useState(false)
  const [hora,         setHora]        = useState(new Date())
  const [fullscreen,   setFullscreen]  = useState(false)

  useEffect(() => {
    const t = setInterval(() => { setHora(new Date()); setPulso(p => !p) }, 4000)
    return () => clearInterval(t)
  }, [])

  const alertasFiltradas   = alertasActivas.filter(a => !acksLocales.has(a.id))
  const mandatariosUnicos  = estadisticasMandatarios.map(m => ({ uid: m.uid, nombre: `${m.nombre} ${m.apellido}`.trim() }))

  const tramitesFiltrados = tramitesEnriquecidos.filter(t => {
    if (filtroTipo  !== 'todos' && t.tipo      !== filtroTipo)  return false
    if (filtroNivel !== 'todos' && t.alertLevel !== filtroNivel) return false
    if (filtroMand  !== 'todos' && t.asignadoA  !== filtroMand)  return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!t.patente?.toLowerCase().includes(q) && !(t.numero ?? '').toLowerCase().includes(q) && !(t.id ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="space-y-5">

      {soloPropia && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <Eye size={13} className="text-blue-600 shrink-0" />
          <p className="text-xs text-blue-700">Estás viendo solo tus trámites asignados.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <KPICard icon={Radar}       label="Activos"         value={kpis.activos}          sub={`${kpis.inscripciones} inscripciones`} color="blue"   onClick={() => setFiltroTipo('todos')}     />
        <KPICard icon={ShieldAlert} label="Críticos"        value={kpis.criticos}         sub="Requieren acción"                      color="red"    onClick={() => setFiltroNivel('critico')}  />
        <KPICard icon={Clock}       label="Demorados"       value={kpis.demorados}        sub="SLA excedido"                          color="yellow" onClick={() => setFiltroNivel('amarillo')} />
        <KPICard icon={Lock}        label="Bloqueados"      value={kpis.chapasPendientes} sub="Chapa pendiente"                       color="orange" />
        <KPICard icon={CheckCircle2} label="Finalizados hoy" value={finalizadosHoy}       sub="Completados y entregados"              color="green"  />
      </div>

      {alertasFiltradas.length > 0 && (
        <div className="rounded-xl border border-red-200 overflow-hidden bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">
              ⚠️ Alertas Activas ({alertasFiltradas.length})
            </span>
            <button onClick={() => setVista('alertas')} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
              Ver todas →
            </button>
          </div>
          {alertasFiltradas.slice(0, 4).map(a => {
            const t = tramitesEnriquecidos.find(x => x.id === a.tramiteId)
            return (
              <AlertaBanner
                key={a.id} alerta={a} tramite={t}
                onAck={id => setAcksLocales(prev => new Set([...prev, id]))}
              />
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">

        {/* Tabla operativa */}
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-36">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar patente, número..."
                className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg
                           text-xs text-gray-700 placeholder-gray-400 outline-none
                           focus:border-[#D4621A]/50 focus:bg-white transition-all"
              />
            </div>
            {[
              { val: filtroTipo,  set: setFiltroTipo,  opts: [['todos','Todos los tipos'],['inscripcion_inicial','🏍️ Inscripciones'],['transferencia','🔄 Transferencias'],['descargo_multa','📋 Multas']] },
              { val: filtroNivel, set: setFiltroNivel, opts: [['todos','Criticidad'],['critico','🚨 Crítico'],['rojo','🔴 Rojo'],['naranja','🟠 Naranja'],['amarillo','⚠️ Amarillo']] },
              ...(verTodo ? [{ val: filtroMand, set: setFiltroMand, opts: [['todos','Todos los gestores'], ...mandatariosUnicos.map(m => [m.uid, m.nombre])] }] : []),
            ].map((f, i) => (
              <select
                key={i} value={f.val} onChange={e => f.set(e.target.value)}
                className="py-1.5 px-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px]
                           text-gray-600 outline-none cursor-pointer hover:border-gray-300 transition-all"
              >
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <span className="text-[10px] text-gray-400 ml-auto">{tramitesFiltrados.length}/{tramitesEnriquecidos.length}</span>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw size={20} className="animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Cargando trámites...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    {['#', '', 'Patente / Cliente', 'Estado', 'Gestor', 'Días', 'Nivel'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap border-r border-gray-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tramitesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-400">
                        Sin trámites con estos filtros
                      </td>
                    </tr>
                  ) : tramitesFiltrados.map(t => {
                    const nr = NIVEL_MONITOR[t.alertLevel]
                    return (
                      <tr
                        key={t.id}
                        onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                        className="cursor-pointer hover:brightness-95"
                        style={{ background: nr.bg, borderLeft: `4px solid ${nr.border}`, borderBottom: '1px solid #cbd5e1' }}
                      >
                        <td className="px-2 py-1 font-mono text-[10px] font-bold border-r border-gray-200" style={{ color: nr.text }}>
                          {t.numero ?? t.id.slice(-8)}
                        </td>
                        <td className="px-1.5 py-1 text-center border-r border-gray-200" style={{ color: nr.text, opacity: 0.85 }}>{TIPO_ICON[t.tipo]}</td>
                        <td className="px-2 py-1 whitespace-nowrap border-r border-gray-200">
                          <span className="text-xs font-bold text-gray-900">{t.patente || '—'}</span>
                          {(t as any).clienteNombre && (
                            <span className="text-[10px] text-gray-500"> · {(t as any).clienteNombre}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 border-r border-gray-200">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${ESTADO_COLOR[t.estado] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {ESTADO_LABEL[t.estado] ?? t.estado}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap border-r border-gray-200">
                          {nombreGestor(t.asignadoA)}
                        </td>
                        <td className="px-2 py-1 text-center border-r border-gray-200">
                          <span className="text-xs font-extrabold" style={{ color: nr.text }}>
                            {t.diasSinMovimiento.toFixed(0)}d
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded"
                            style={{ background: nr.badge, color: nr.badgeText }}>
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

          {/* Carga por gestor */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
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
                      <span className="text-xs font-semibold text-gray-700">{`${m.nombre} ${m.apellido}`.trim()}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                        {m.estadoCarga.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-gray-400 mb-1.5">
                      <span>{m.tramitesActivos} asign.</span>
                      {m.criticos  > 0 && <span className="text-red-500">🚨{m.criticos}</span>}
                      {m.demorados > 0 && <span className="text-yellow-600">⏱{m.demorados}</span>}
                      <span className="ml-auto text-green-600">✓{m.eficiencia}%</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
              {estadisticasMandatarios.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Sin datos de gestores</p>
              )}
            </div>
          </div>

          {/* Pipeline inscripciones */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
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
                    <span className="text-[9px] text-gray-400 text-right w-20 shrink-0 truncate">{p.titulo}</span>
                    <div className="flex-1 h-3.5 bg-gray-100 rounded overflow-hidden">
                      {count > 0 && (
                        <div className="h-full rounded flex items-center justify-end pr-1 transition-all"
                          style={{ width: `${pct}%`, background: p.color }}>
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

          {/* Retiro de chapas */}
          {tramitesEnriquecidos.some(t => t.diasHastaChapa !== undefined) && (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
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
                    const color = dias <= 0 ? 'text-red-600' : dias <= 3 ? 'text-orange-600' : dias <= 7 ? 'text-yellow-600' : 'text-gray-400'
                    const badge = dias <= 0 ? 'HOY/VENCIDA' : dias === 1 ? 'MAÑANA' : `${dias}d`
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono text-gray-400 truncate">{t.numero ?? t.id}</p>
                          <p className="text-xs text-gray-700 truncate font-medium">{t.patente}</p>
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

  // ── MONITOR ───────────────────────────────────────────────────────────────

  const renderMonitor = () => (
    <div className="font-mono">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-gray-700 tracking-widest uppercase">
          🖥️ MONITOR OPERATIVO — GESTORÍA PAZ
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <div className={`w-2 h-2 rounded-full bg-green-500 transition-all ${pulso ? 'opacity-100 shadow-[0_0_5px_#22c55e]' : 'opacity-50'}`} />
          EN LÍNEA · {hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {[
        { grupo: 'INSCRIPCIONES INICIALES', tipo: 'inscripcion_inicial' },
        { grupo: 'TRANSFERENCIAS',           tipo: 'transferencia'      },
        { grupo: 'MULTAS',                   tipo: 'descargo_multa'     },
      ].map(({ grupo, tipo }) => {
        const items    = tramitesEnriquecidos.filter(t => t.tipo === tipo)
        const criticos  = items.filter(t => t.alertLevel === 'critico').length
        const demorados = items.filter(t => ['amarillo','naranja'].includes(t.alertLevel)).length
        const bloqueados= items.filter(t => t.estado === 'documentacion_requerida').length
        return (
          <div key={tipo} className="mb-5">
            <div className="flex items-center gap-4 px-3 py-1.5 bg-gray-100 rounded-t-lg border border-gray-200 border-b-0">
              <span className="text-gray-800 font-bold text-xs min-w-48">{grupo} ({items.length})</span>
              {criticos   > 0 && <span className="text-red-600 text-[10px]">🚨 {criticos} CRÍTICOS</span>}
              {demorados  > 0 && <span className="text-yellow-600 text-[10px]">⏱ {demorados} DEMORADOS</span>}
              {bloqueados > 0 && <span className="text-orange-600 text-[10px]">🔒 {bloqueados} BLOQUEADOS</span>}
              {criticos === 0 && demorados === 0 && bloqueados === 0 && (
                <span className="text-green-600 text-[10px]">✅ TODO OK</span>
              )}
            </div>
            <div className="border border-gray-200 rounded-b-lg overflow-hidden bg-white">
              <div className="grid grid-cols-[90px_1fr_130px_100px_60px_65px] gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                {['ID','PATENTE/NRO','ESTADO','GESTOR','DÍAS','NIVEL'].map(h => (
                  <span key={h} className="text-[8px] font-bold text-gray-400 tracking-wider uppercase">{h}</span>
                ))}
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-gray-400">Sin trámites activos</div>
              ) : items.map(t => {
                const nr = NIVEL_RAW[t.alertLevel]
                return (
                  <div
                    key={t.id}
                    onClick={() => (t.tipo === 'descargo_multa' || t.tipo === 'transferencia') ? navigate(`/admin/tramites/${t.id}`) : setDetalle(t)}
                    className="grid grid-cols-[90px_1fr_130px_100px_60px_65px] gap-2 px-3 py-2.5 cursor-pointer transition-all items-center hover:brightness-95"
                    style={{ background: nr.bg, borderLeft: `3px solid ${nr.border}`, borderBottom: `1px solid ${nr.border}15` }}
                  >
                    <span className="text-[10px] font-mono font-bold" style={{ color: nr.text }}>{t.numero ?? t.id.slice(-8)}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-gray-900 truncate">{t.patente || t.numero || '—'}</p>
                      {(t as any).clienteNombre && (
                        <p className="text-[9px] text-gray-500 truncate">{(t as any).clienteNombre}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-gray-700">{ESTADO_LABEL[t.estado] ?? t.estado}</span>
                    <span className="text-[10px] text-gray-500 truncate">{nombreGestor(t.asignadoA)}</span>
                    <span className="text-[11px] font-extrabold text-center" style={{ color: nr.text }}>{t.diasSinMovimiento.toFixed(0)}d</span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-center"
                      style={{ background: nr.badge, color: nr.badgeText }}>
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

  // ── MANDATARIOS ───────────────────────────────────────────────────────────

  const renderMandatarios = () => {
    const getPct = (uid: string) => {
      const asig  = todosLosTramites.filter(t => t.asignadoA === uid || t.creadoPor === uid)
      if (!asig.length) return null
      const comp  = asig.filter(t => ['entregado','completado'].includes(t.estado)).length
      return { comp, total: asig.length, pct: Math.round((comp / asig.length) * 100) }
    }
    return (
      <div className="space-y-5">
        {verRendimiento && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
            <MonitorDot size={13} className="text-indigo-600 shrink-0" />
            <p className="text-xs text-indigo-700">Vista extendida: porcentaje de trámites completados por gestor.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {estadisticasMandatarios.map(m => {
            const color   = m.estadoCarga === 'sobrecarga' ? '#ef4444' : m.estadoCarga === 'atencion' ? '#f59e0b' : '#22c55e'
            const pctData = verRendimiento ? getPct(m.uid) : null
            return (
              <div
                key={m.uid}
                className="rounded-xl border p-4 bg-white shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                style={{ borderColor: `${color}30` }}
                onClick={() => { setFiltroMand(m.uid); setVista('dashboard') }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2"
                      style={{ background: `${color}18`, borderColor: `${color}40`, color }}>
                      {m.nombre[0]}{m.apellido[0] || m.nombre[1]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{`${m.nombre} ${m.apellido}`.trim()}</p>
                      <p className="text-[10px] text-gray-400">Mandatario</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                    {m.estadoCarga.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {([
                    ['Asignados',   m.tramitesActivos,   '#3b82f6'],
                    ['Críticos',    m.criticos,          '#dc2626'],
                    ['Demorados',   m.demorados,         '#f59e0b'],
                    ['Cerrados/sem',m.finalizadosSemana, '#22c55e'],
                  ] as const).map(([k, v, c]) => (
                    <div key={k} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[9px] text-gray-400">{k}</p>
                      <p className="text-lg font-extrabold" style={{ color: c }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-400">Eficiencia</span>
                  <span className="font-bold" style={{ color }}>{m.eficiencia}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.eficiencia}%`, background: color }} />
                </div>
                {pctData && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-indigo-600 font-semibold">% Completados</span>
                      <span className="text-indigo-700 font-bold">{pctData.comp}/{pctData.total} ({pctData.pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pctData.pct}%` }} />
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

  // ── ALERTAS ───────────────────────────────────────────────────────────────

  const renderAlertas = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
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
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {alertasActivas.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCheck size={28} className="mx-auto text-green-500 mb-2 opacity-60" />
            <p className="text-xs text-gray-400">Sin alertas activas</p>
          </div>
        ) : alertasActivas.map(a => {
          const acked = acksLocales.has(a.id)
          const s     = NIVEL_STYLE[a.nivel]
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 transition-opacity ${acked ? 'opacity-40' : ''}`}
              style={{ borderLeftWidth: 3, borderLeftColor: acked ? '#D1D5DB' : NIVEL_RAW[a.nivel].border }}
            >
              <span className="text-base shrink-0">{acked ? '✅' : NIVEL_ICON[a.nivel]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`font-mono text-[10px] font-bold ${s.text}`}>{a.tramiteId}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${acked ? 'bg-green-50 text-green-700 border-green-200' : s.badge}`}>
                    {acked ? 'RECONOCIDA' : a.nivel.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-snug">{a.mensaje}</p>
                <p className="text-[10px] text-gray-400 mt-1">{a.titulo}</p>
              </div>
              {!acked ? (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => setAcksLocales(p => new Set([...p, a.id]))}
                    className={`text-[10px] px-2.5 py-1 rounded border cursor-pointer transition-all ${s.badge}`}
                  >
                    ✓ ACK
                  </button>
                  <button
                    onClick={() => {
                      const _t = tramitesEnriquecidos.find(t => t.id === a.tramiteId)
                      if (_t && (_t.tipo === 'descargo_multa' || _t.tipo === 'transferencia')) {
                        navigate(`/admin/tramites/${a.tramiteId}`)
                      } else { setDetalle(_t ?? null) }
                    }}
                    className="text-[10px] px-2.5 py-1 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-700 cursor-pointer transition-all"
                  >
                    Ver →
                  </button>
                </div>
              ) : (
                <span className="text-xs text-green-600 shrink-0 font-semibold">ACK ✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-full bg-[var(--color-bg)] ${fullscreen ? 'fixed inset-0 z-[100] overflow-auto bg-white' : ''}`}>

      {/* Header — fondo blanco, borde gris claro */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 flex items-center justify-between h-12 shadow-sm">
        {/* Tabs de sección */}
        <div className="flex items-center gap-1">
          {([
            ['dashboard',   <TowerControl size={13} />, 'Dashboard'],
            ['monitor',     <MonitorDot  size={13} />, 'Monitor'],
            ...(verTodo ? [['mandatarios', <Users size={13} />, 'Gestores'] as [string, React.ReactNode, string]] : []),
            ['alertas',     <Bell        size={13} />, `Alertas${alertasFiltradas.length > 0 ? ` (${alertasFiltradas.length})` : ''}`],
          ] as [string, React.ReactNode, string][]).map(([id, icon, lbl]) => (
            <button
              key={id}
              onClick={() => setVista(id as typeof vistaActiva)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                vistaActiva === id
                  ? 'bg-[#D4621A]/10 text-[#D4621A] border-[#D4621A]/25'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {icon}{lbl}
            </button>
          ))}
        </div>

        {/* Indicador live + botón pantalla completa */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <div className={`w-1.5 h-1.5 rounded-full bg-green-500 transition-all ${pulso ? 'opacity-100' : 'opacity-40'}`} />
            EN VIVO · {hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa — ideal para monitor central'}
            className="w-7 h-7 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100
                       flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all"
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Contenido de vista */}
      <div className="p-5">
        {vistaActiva === 'dashboard'    && renderDashboard()}
        {vistaActiva === 'monitor'      && renderMonitor()}
        {vistaActiva === 'mandatarios'  && verTodo && renderMandatarios()}
        {vistaActiva === 'alertas'      && renderAlertas()}
      </div>

      {/* Drawer detalle de trámite */}
      {detalle && <TramiteDrawer tramite={detalle} onClose={() => setDetalle(null)} />}

      {/* Panel Premios — asesor_comercial ve los propios, propietario ve los del equipo */}
      {verPremiosTorre && (esAsesorComercial || esPropietario) && vistaActiva === 'dashboard' && (
        <div className="px-3 sm:px-5 pb-8">
          <PanelPremiosAsesor />
        </div>
      )}
    </div>
  )
}