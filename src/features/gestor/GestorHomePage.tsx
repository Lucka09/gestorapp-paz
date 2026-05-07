// ═══════════════════════════════════════════════════════════════════════════
// ARCHIVO 1: src/features/gestor/GestorHomePage.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Pegar como archivo nuevo en src/features/gestor/GestorHomePage.tsx
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo }       from 'react'
import { useNavigate }   from 'react-router-dom'
import { Bike, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { useAuth }       from '@/hooks/useAuth'
import { useTramites }   from '@/hooks/useTramites'
import { usePageTitle }  from '@/hooks/usePageTitle'
import { formatRelativo } from '@/utils'
import { PASOS_INSCRIPCION } from '@/types/torre.types'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const ALERTA_COLOR: Record<number, string> = {
  0: 'border-gray-700 bg-transparent',
  1: 'border-red-600/35 bg-red-900/8',
  2: 'border-orange-500/30 bg-orange-900/6',
  3: 'border-yellow-500/25 bg-yellow-900/5',
}

function calcularAlerta(diasSinMov: number): 0 | 1 | 2 | 3 {
  if (diasSinMov > 5) return 1
  if (diasSinMov > 3) return 2
  if (diasSinMov > 1) return 3
  return 0
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function GestorHomePage() {
  usePageTitle('Mis Trámites')
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const { tramites, loading } = useTramites()

  // Solo inscripciones asignadas a este gestor
  const misTramites = useMemo(() =>
    tramites.filter(t =>
      t.tipo === 'inscripcion_inicial' &&
      t.asignadoA === user?.uid &&
      t.estado !== 'entregado' &&
      t.estado !== 'cancelado'
    ),
  [tramites, user?.uid])

  const stats = useMemo(() => ({
    total:      misTramites.length,
    enProceso:  misTramites.filter(t => !['pendiente'].includes(t.estado)).length,
    completados: tramites.filter(t => t.asignadoA === user?.uid && t.estado === 'entregado').length,
  }), [misTramites, tramites, user?.uid])

  return (
    <div className="min-h-screen bg-[#080d14] text-gray-200" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="bg-[#0a0f1a] border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white">👤 Portal del Gestor</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {user?.nombre} {user?.apellido} · Gestoría Paz
            </p>
          </div>
        </div>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[
          { label: 'Asignados',    value: stats.total,      color: '#3b82f6' },
          { label: 'En proceso',   value: stats.enProceso,  color: '#f59e0b' },
          { label: 'Completados',  value: stats.completados,color: '#22c55e' },
        ].map(s => (
          <div key={s.label}
            className="rounded-xl border border-white/8 bg-[#0d1117] p-3 text-center">
            <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className="px-4 pb-16">
        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-3">
          Inscripciones Iniciales Asignadas
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-gray-600" />
          </div>
        ) : misTramites.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={36} className="text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Sin trámites asignados</p>
          </div>
        ) : (
          misTramites.map(t => {
            const ahora = new Date()
            const ultima = t.actualizadoEn?.toDate?.() ?? t.creadoEn?.toDate?.() ?? ahora
            const diasSinMov = (ahora.getTime() - ultima.getTime()) / 86_400_000
            const nivelAlerta = calcularAlerta(diasSinMov)

            return (
              <div
                key={t.id}
                onClick={() => navigate(`/admin/gestor/tramite/${t.id}`)}
                className={`rounded-2xl border p-4 mb-3 cursor-pointer transition-all hover:bg-white/2 ${ALERTA_COLOR[nivelAlerta]}`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-mono text-gray-600 mb-0.5">{t.numero || t.id.slice(-8)}</p>
                    <p className="text-sm font-bold text-gray-100">{t.patente || 'Sin patente'}</p>
                  </div>
                  {nivelAlerta === 1 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600/15 text-red-400 border border-red-600/25">
                      🚨 URGENTE
                    </span>
                  )}
                  {nivelAlerta === 2 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/25">
                      ⏱ DEMORADO
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <Bike size={11} /> {t.descripcion || 'Inscripción inicial'}
                  </span>
                  <span className="flex items-center gap-1 ml-auto">
                    <Clock size={10} /> {formatRelativo(t.actualizadoEn)}
                  </span>
                </div>

                {/* Barra de pasos */}
                <div className="flex gap-0.5 mb-2">
                  {PASOS_INSCRIPCION.map((p) => (
                    <div key={p.id} className="flex-1 h-1 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.07)' }} />
                  ))}
                </div>

                {/* Estado */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: '#64748b' }}>
                    📋 Paso 1 — Asignado al Gestor
                  </span>
                  <span className="text-[10px] text-[#D4621A] font-semibold">Continuar →</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}