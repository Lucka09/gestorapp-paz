import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, CalendarDays, Clock,
  ChevronRight, CheckCircle, AlertCircle, Phone,
} from 'lucide-react'
import { useAuth }           from '@/hooks/useAuth'
import { useCliente }        from '@/hooks/useClientes'
import { useTramitesPortal, useTurnosPortal, useNotificacionesPortal } from '@/hooks/usePortal'
import { marcarTodasLeidas } from '@/lib/firestore/portal'
import { Card, Spinner }     from '@/components/ui'
import { EstadoBadge }       from '@/features/tramites/EstadoBadge'
import OnboardingPortal      from './OnboardingPortal'
import { TIPO_TRAMITE_LABELS } from '@/types'
import { formatFecha, formatRelativo } from '@/utils'
import { format, isFuture } from 'date-fns'
import { es } from 'date-fns/locale'

// Clave localStorage para no mostrar onboarding dos veces
const ONBOARDING_KEY = 'gp_onboarding_done'

export default function PortalHomePage() {
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const clienteId     = user?.clienteId ?? undefined

  // ── Carga en cascada — primero perfil, luego datos ──────────────────────
  const { cliente }                          = useCliente(clienteId)
  const { tramites, loading: loadT }         = useTramitesPortal(clienteId)
  const { turnos,   loading: loadTu }        = useTurnosPortal(clienteId)
  const { notifs,   noLeidas }               = useNotificacionesPortal(user?.uid)

  // Onboarding — mostrar solo la primera vez
  const [showOnboarding, setShowOnboarding]  = useState(false)

  useEffect(() => {
    if (!clienteId) return
    const ya = localStorage.getItem(`${ONBOARDING_KEY}_${clienteId}`)
    if (!ya) setShowOnboarding(true)
  }, [clienteId])

  const finOnboarding = () => {
    if (clienteId) localStorage.setItem(`${ONBOARDING_KEY}_${clienteId}`, '1')
    setShowOnboarding(false)
  }

  // ── Datos derivados ──────────────────────────────────────────────────────
  const tramitesActivos = tramites.filter(t =>
    ['pendiente','en_proceso','documentacion_requerida','en_organismo','listo_para_retirar']
      .includes(t.estado)
  )
  const proximoTurno = turnos.find(t => {
    const d = t.fecha?.toDate?.()
    return d && isFuture(d) && t.estado !== 'cancelado'
  })

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Onboarding primer acceso */}
      {showOnboarding && clienteId && (
        <OnboardingPortal
          clienteId={clienteId}
          nombre={cliente?.nombre ?? user?.nombre ?? ''}
          onFin={finOnboarding}
        />
      )}

      <div className="space-y-5 animate-fadein">

        {/* Saludo */}
        <div
          className="rounded-2xl p-5 text-white"
          style={{ background: 'var(--gp-black)' }}
        >
          <p style={{ color: 'var(--gp-orange)', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
            Gestoría Paz · Portal
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: 22, margin: '0 0 4px' }}>
            Hola, {cliente?.nombre ?? user?.nombre} 👋
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 14, margin: 0 }}>
            {loadT
              ? 'Cargando tus trámites...'
              : tramitesActivos.length > 0
                ? `Tenés ${tramitesActivos.length} trámite${tramitesActivos.length !== 1 ? 's' : ''} activo${tramitesActivos.length !== 1 ? 's' : ''}.`
                : 'No tenés trámites activos por el momento.'
            }
          </p>
        </div>

        {/* Notificaciones no leídas */}
        {noLeidas > 0 && (
          <button
            onClick={() => marcarTodasLeidas(notifs)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm
                       font-medium transition-colors text-left"
            style={{
              background: 'var(--gp-orange-pale)',
              border: '1px solid rgba(212,98,26,0.2)',
              color: 'var(--gp-orange-dark)',
            }}
          >
            <AlertCircle size={17} className="shrink-0" />
            <span>
              Tenés <strong>{noLeidas}</strong> notificación{noLeidas !== 1 ? 'es' : ''} nueva{noLeidas !== 1 ? 's' : ''}.
            </span>
            <ChevronRight size={15} className="ml-auto shrink-0" />
          </button>
        )}

        {/* Accesos rápidos */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/portal/tramites')}
            className="flex flex-col items-center gap-2.5 bg-white border border-gray-100
                       rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-orange-100
                       transition-all duration-150 text-center"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                 style={{ background: 'var(--gp-orange-pale)' }}>
              <FileText size={22} style={{ color: 'var(--gp-orange)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>
              Mis Trámites
            </span>
            {loadT
              ? <span style={{ fontSize: 11, color: 'var(--color-text-4)' }}>Cargando...</span>
              : tramitesActivos.length > 0
                ? <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--gp-orange)',
                                  color: 'white', padding: '2px 10px', borderRadius: 999 }}>
                    {tramitesActivos.length} activo{tramitesActivos.length !== 1 ? 's' : ''}
                  </span>
                : <span style={{ fontSize: 11, color: 'var(--color-text-4)' }}>Sin activos</span>
            }
          </button>

          <button
            onClick={() => navigate('/portal/turnos')}
            className="flex flex-col items-center gap-2.5 bg-white border border-gray-100
                       rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-orange-100
                       transition-all duration-150 text-center"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                 style={{ background: 'var(--gp-orange-pale)' }}>
              <CalendarDays size={22} style={{ color: 'var(--gp-orange)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>
              Turnos
            </span>
            {loadTu
              ? <span style={{ fontSize: 11, color: 'var(--color-text-4)' }}>Cargando...</span>
              : proximoTurno
                ? <span style={{ fontSize: 11, fontWeight: 700, background: '#D1FAE5',
                                  color: '#065F46', padding: '2px 10px', borderRadius: 999 }}>
                    1 próximo
                  </span>
                : <span style={{ fontSize: 11, color: 'var(--color-text-4)' }}>Reservar</span>
            }
          </button>
        </div>

        {/* Próximo turno */}
        {!loadTu && proximoTurno && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={14} style={{ color: 'var(--gp-orange)' }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-4)',
                          textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Próximo Turno
              </p>
            </div>
            <div className="rounded-xl p-4"
                 style={{ background: 'var(--gp-orange-pale)', border: '1px solid rgba(212,98,26,0.2)' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
                          margin: '0 0 4px', textTransform: 'capitalize' }}>
                {proximoTurno.fecha?.toDate
                  ? format(proximoTurno.fecha.toDate(), "EEEE d 'de' MMMM", { locale: es })
                  : '—'}
              </p>
              <div className="flex items-center gap-1.5">
                <Clock size={13} style={{ color: 'var(--gp-orange)' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--gp-orange)' }}>
                  {proximoTurno.horaInicio} – {proximoTurno.horaFin} hs
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '4px 0 0' }}>
                {TIPO_TRAMITE_LABELS[proximoTurno.tipoTramite]}
              </p>
            </div>
          </Card>
        )}

        {/* Trámites activos — carga lazy */}
        {!loadT && tramitesActivos.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText size={14} style={{ color: 'var(--gp-orange)' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-4)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Trámites Activos
                </p>
              </div>
              <button
                onClick={() => navigate('/portal/tramites')}
                style={{ fontSize: 12, color: 'var(--gp-orange)', background: 'none',
                         border: 'none', cursor: 'pointer', fontWeight: 500,
                         display: 'flex', alignItems: 'center', gap: 3 }}
              >
                Ver todos <ChevronRight size={13} />
              </button>
            </div>

            <div className="space-y-0">
              {tramitesActivos.slice(0, 3).map(t => (
                <div key={t.id}
                  className="flex items-center justify-between gap-3 py-3
                             border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
                                margin: '0 0 3px' }}>
                      {TIPO_TRAMITE_LABELS[t.tipo]}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="patente">{t.patente}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-4)' }}>
                        {formatRelativo(t.actualizadoEn)}
                      </span>
                    </div>
                  </div>
                  <EstadoBadge estado={t.estado} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Skeletons durante carga */}
        {loadT && (
          <Card className="p-5">
            <div className="space-y-3">
              {[1,2].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-4 w-36 rounded" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                  <div className="skeleton h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Contacto */}
        <div className="rounded-2xl p-5"
             style={{ background: 'var(--gp-black)' }}>
          <p style={{ color: 'white', fontSize: 14, fontWeight: 600,
                      margin: '0 0 3px', fontFamily: 'var(--font-display)' }}>
            ¿Tenés alguna consulta?
          </p>
          <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 12px' }}>
            Contactá a Gestoría Paz directamente.
          </p>
          <div className="space-y-2">
            {[
              { tel: '5491136141431', label: '11 3614-1431' },
              { tel: '5491152219011', label: '11 5221-9011' },
            ].map(({ tel, label }) => (
              <a
                key={tel}
                href={`https://wa.me/${tel}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                style={{
                  background: 'rgba(37,211,102,0.12)',
                  border: '1px solid rgba(37,211,102,0.25)',
                  color: '#25D366',
                  fontSize: 14, fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <Phone size={16} />
                WhatsApp: {label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
