// src/components/shared/PanelPremiosAsesor.tsx
// Widget compacto de premios para la Torre de Control
// Visible SOLO para: asesor_comercial (sus propios premios) y propietario (todos)
// ─────────────────────────────────────────────────────────────────────────────

import { Trophy, Star, TrendingUp, ChevronRight, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  usePremios,
  HITO_VISUAL,
  formatPesos,
  formatPesosCompacto,
} from '@/hooks/usePremios'
import { useAuth } from '@/hooks/useAuth'

// ─── BARRA MINI ───────────────────────────────────────────────────────────────

function MiniBar({ value, max, color = '#D4621A' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 0.8s ease' }} />
    </div>
  )
}

// ─── ROW DE UN ASESOR ─────────────────────────────────────────────────────────

function AsesorPremioRow({ uid, nombre }: { uid: string; nombre: string }) {
  const { data, isLoading } = usePremios(uid)

  if (isLoading) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ height: 14, width: 140, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
      </div>
    )
  }
  if (!data) return null

  const { cfg } = data
  const hitosOrdenados = [...cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
  const proximoHito    = hitosOrdenados.find(h => !data.hitosAlcanzados.includes(h.id))
  const maxUmbral      = hitosOrdenados[hitosOrdenados.length - 1]?.montoUmbral ?? 20_000_000
  const totalGanado    = data.premiosA_pesos + data.premiosB_pesos

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Nombre + badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: 'linear-gradient(135deg, #D4621A33, #e8732a22)',
            border: '1.5px solid rgba(212,98,26,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trophy size={13} color="#D4621A" />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-1)' }}>{nombre}</span>
        </div>
        {totalGanado > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#D4621A',
            background: 'rgba(212,98,26,0.15)', border: '1px solid rgba(212,98,26,0.25)',
            padding: '3px 10px', borderRadius: 999,
          }}>
            {formatPesosCompacto(totalGanado)} ganados
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {/* Premio A */}
        <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(212,98,26,0.1)', border: '1px solid rgba(212,98,26,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Star size={10} color="#D4621A" />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Premios A</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#D4621A', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {data.premiosA_ganados}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{formatPesosCompacto(data.premiosA_pesos)}</div>
        </div>

        {/* Ciclo actual */}
        <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Target size={10} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ciclo</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-1)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {data.tramitesEnCicloActual}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/{cfg.tramitesPorPremioAuto}</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>del próximo</div>
        </div>

        {/* Hitos */}
        <div style={{
          padding: '8px 10px', borderRadius: 10,
          background: data.hitosAlcanzados.length > 0 ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.04)',
          border: data.hitosAlcanzados.length > 0 ? '1px solid rgba(250,204,21,0.2)' : '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Trophy size={10} color={data.hitosAlcanzados.length > 0 ? '#FACC15' : 'rgba(255,255,255,0.4)'} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hitos</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: data.hitosAlcanzados.length > 0 ? '#FACC15' : 'var(--color-text-1)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {data.hitosAlcanzados.length}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/{hitosOrdenados.length}</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>desbloqueados</div>
        </div>
      </div>

      {/* Barras de progreso */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Ciclo Premio A */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 60 }}>Premio A</span>
          <MiniBar value={data.tramitesEnCicloActual} max={cfg.tramitesPorPremioAuto} color="#D4621A" />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
            {data.tramitesFaltanProximo === 1 ? '¡1 más!' : `${data.tramitesFaltanProximo} faltan`}
          </span>
        </div>

        {/* Facturación multas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 60 }}>Multas</span>
          <MiniBar value={data.facturacionMultas} max={maxUmbral} color="#FACC15" />
          {proximoHito ? (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
              → {HITO_VISUAL[proximoHito.id]?.icon ?? '🏆'} {formatPesosCompacto(proximoHito.montoUmbral)}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#FACC15', fontWeight: 700, minWidth: 50, textAlign: 'right' }}>
              🏆 Max
            </span>
          )}
        </div>

        {/* Próximo premio B y su monto si está configurado */}
        {proximoHito && proximoHito.premioMonto > 0 && (
          <div style={{
            marginTop: 2, padding: '5px 10px', borderRadius: 8,
            background: `${HITO_VISUAL[proximoHito.id]?.color ?? '#D4621A'}12`,
            border: `1px solid ${HITO_VISUAL[proximoHito.id]?.color ?? '#D4621A'}28`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 13 }}>{HITO_VISUAL[proximoHito.id]?.icon ?? '🏆'}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              Próximo premio:{' '}
              <strong style={{ color: HITO_VISUAL[proximoHito.id]?.color ?? '#D4621A' }}>
                {formatPesos(proximoHito.premioMonto)}
              </strong>
              {' '}al llegar a {formatPesosCompacto(proximoHito.montoUmbral)} en multas
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface PanelPremiosAsesorProps {
  asesorUid?:    string
  asesorNombre?: string
}

export default function PanelPremiosAsesor({ asesorUid, asesorNombre }: PanelPremiosAsesorProps) {
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const targetUid     = asesorUid ?? user?.uid ?? ''
  const targetNombre  = asesorNombre ?? (user ? `${user.nombre} ${user.apellido ?? ''}`.trim() : 'Asesor')
  const esPropView    = !!asesorUid

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 22, borderRadius: 3, background: 'linear-gradient(180deg, #D4621A, #FACC15)' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--color-text-1)', margin: 0 }}>
            {esPropView ? 'Premios del Asesor Comercial' : 'Mis Premios & Objetivos'}
          </h3>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', fontWeight: 600, textTransform: 'uppercase' }}>
            {esPropView ? 'Vista Propietario' : 'Mi panel'}
          </span>
        </div>
        {!esPropView && (
          <button
            onClick={() => navigate('/admin/premios')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', borderRadius: 999,
              background: 'rgba(212,98,26,0.15)', border: '1px solid rgba(212,98,26,0.3)',
              color: '#D4621A', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Ver detalle <ChevronRight size={12} />
          </button>
        )}
      </div>

      <AsesorPremioRow uid={targetUid} nombre={targetNombre} />

      {esPropView && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(212,98,26,0.06)', border: '1px solid rgba(212,98,26,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={13} color="#D4621A" />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            Los premios se calculan automáticamente desde los trámites creados por el asesor.
            Para configurar los montos ir a{' '}
            <button onClick={() => navigate('/admin/configuracion?tab=premios')} style={{ color: '#D4621A', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>
              Configuración → Premios
            </button>
          </span>
        </div>
      )}
    </section>
  )
}