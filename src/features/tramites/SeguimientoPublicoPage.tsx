import { useEffect, useState } from 'react'
import { useParams }           from 'react-router-dom'
import {
  CheckCircle, Clock, AlertCircle,
  FileText, Car, MapPin, Phone, Globe,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { getTramitePorToken } from '@/lib/firestore/tramites'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS } from '@/types'
import type { Tramite } from '@/types'

// ─── ESTADO CONFIG ────────────────────────────────────────────────────────────

const ESTADO_CFG: Record<string, {
  label:   string
  color:   string
  bg:      string
  icon:    React.ElementType
  desc:    string
  progreso: number      // 0–100
}> = {
  pendiente: {
    label:    'Pendiente de inicio',
    color:    'text-yellow-700',
    bg:       'bg-yellow-50',
    icon:     Clock,
    desc:     'Tu trámite fue recibido y está en la cola para comenzar.',
    progreso: 10,
  },
  en_proceso: {
    label:    'En proceso',
    color:    'text-blue-700',
    bg:       'bg-blue-50',
    icon:     FileText,
    desc:     'Estamos trabajando en tu trámite.',
    progreso: 35,
  },
  documentacion_requerida: {
    label:    'Documentación requerida',
    color:    'text-red-700',
    bg:       'bg-red-50',
    icon:     AlertCircle,
    desc:     'Necesitamos que nos envíes documentación adicional. Comunicate con nosotros.',
    progreso: 25,
  },
  en_organismo: {
    label:    'En el organismo',
    color:    'text-orange-700',
    bg:       'bg-orange-50',
    icon:     MapPin,
    desc:     'Tu trámite está siendo procesado en el organismo correspondiente.',
    progreso: 65,
  },
  listo_para_retirar: {
    label:    '¡Listo para retirar!',
    color:    'text-emerald-700',
    bg:       'bg-emerald-50',
    icon:     CheckCircle,
    desc:     'Tu trámite está completado. Podés pasar a retirarlo.',
    progreso: 90,
  },
  entregado: {
    label:    'Entregado',
    color:    'text-green-700',
    bg:       'bg-green-50',
    icon:     CheckCircle,
    desc:     'El trámite fue completado y entregado exitosamente.',
    progreso: 100,
  },
  cancelado: {
    label:    'Cancelado',
    color:    'text-gray-600',
    bg:       'bg-gray-50',
    icon:     AlertCircle,
    desc:     'Este trámite fue cancelado.',
    progreso: 0,
  },
}

const PASOS = [
  { key: 'pendiente',              label: 'Recibido'     },
  { key: 'en_proceso',             label: 'En proceso'   },
  { key: 'en_organismo',           label: 'Organismo'    },
  { key: 'listo_para_retirar',     label: 'Listo'        },
  { key: 'entregado',              label: 'Entregado'    },
]

// ─── BARRA DE PROGRESO ────────────────────────────────────────────────────────

function BarraProgreso({ estado }: { estado: string }) {
  const cfg = ESTADO_CFG[estado]
  const pct = cfg?.progreso ?? 0

  const pasoActual = PASOS.findIndex(p =>
    p.key === estado ||
    (estado === 'documentacion_requerida' && p.key === 'en_proceso')
  )

  return (
    <div className="space-y-4">
      {/* Pasos visuales */}
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 right-0 top-3.5 h-0.5 bg-gray-100 -z-0" />
        <div
          className="absolute left-0 top-3.5 h-0.5 transition-all duration-700 -z-0"
          style={{ width: `${pct}%`, background: '#D4621A' }}
        />
        {PASOS.map((paso, i) => {
          const activo   = i <= pasoActual && estado !== 'cancelado'
          const esActual = i === pasoActual
          return (
            <div key={paso.key} className="flex flex-col items-center gap-1.5 z-10">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center
                               border-2 transition-all
                               ${activo
                                 ? 'border-[#D4621A] bg-[#D4621A]'
                                 : 'border-gray-200 bg-white'
                               }
                               ${esActual ? 'ring-4 ring-orange-100 scale-110' : ''}`}>
                {activo
                  ? <CheckCircle size={14} className="text-white" />
                  : <span className="w-2 h-2 rounded-full bg-gray-300" />
                }
              </div>
              <span className={`text-xs font-medium text-center leading-tight
                                ${activo ? 'text-gray-800' : 'text-gray-400'}
                                ${esActual ? 'font-bold text-[#D4621A]' : ''}`}>
                {paso.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function SeguimientoPublicoPage() {
  const { token }   = useParams<{ token: string }>()
  const [tramite,   setTramite]   = useState<Tramite | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [historial, setHistorial] = useState(false)

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    getTramitePorToken(token)
      .then(t => {
        if (!t) { setError(true) }
        else    { setTramite(t as Tramite) }
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [token])

  // Estilos inline para no depender de Tailwind en ruta pública
  const S = {
    page: {
      minHeight:        '100vh',
      background:       'linear-gradient(135deg, #1A1A1A 0%, #2D1810 50%, #1A1A1A 100%)',
      display:          'flex',
      flexDirection:    'column' as const,
      alignItems:       'center',
      padding:          '24px 16px',
      fontFamily:       'system-ui, -apple-system, sans-serif',
    },
    card: {
      background:   'white',
      borderRadius: 24,
      width:        '100%',
      maxWidth:     480,
      overflow:     'hidden',
      boxShadow:    '0 32px 80px rgba(0,0,0,0.4)',
    },
    header: {
      background:     '#D4621A',
      padding:        '24px 28px 20px',
      display:        'flex',
      alignItems:     'center',
      gap:            16,
    },
    logo: {
      width:        48,
      height:       48,
      borderRadius: 12,
      background:   'rgba(255,255,255,0.2)',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      fontSize:     18,
      fontWeight:   800,
      color:        'white',
      flexShrink:   0 as const,
    },
  }

  if (loading) return (
    <div style={{ ...S.page, justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '4px solid #D4621A',
          borderTopColor: 'transparent',
          margin: '0 auto 16px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Buscando tu trámite...</p>
      </div>
    </div>
  )

  if (error || !tramite) return (
    <div style={{ ...S.page, justifyContent: 'center' }}>
      <div style={{ ...S.card, padding: '40px 28px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, background: '#FEF2F2', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <AlertCircle size={28} color="#EF4444" />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#111827' }}>
          Trámite no encontrado
        </h2>
        <p style={{ margin: '0 0 24px', color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
          El código QR puede haber expirado o ser incorrecto.
          Contactá a Gestoría Paz para obtener uno nuevo.
        </p>
        <a
          href="https://wa.me/5491136141431"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#25D366', color: 'white', padding: '12px 24px',
            borderRadius: 12, fontWeight: 700, fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Contactar por WhatsApp
        </a>
      </div>
    </div>
  )

  const cfg    = ESTADO_CFG[tramite.estado] ?? ESTADO_CFG.pendiente
  const IconE  = cfg.icon
  const tipo   = TIPO_TRAMITE_LABELS[tramite.tipo] ?? tramite.tipo
  const hists  = tramite.historialEstados ?? []

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header naranja */}
        <div style={S.header}>
          <div style={S.logo}>GP</div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'white' }}>
              Gestoría Paz
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Seguimiento de trámite
            </p>
          </div>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Número de trámite + patente */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tipo de trámite
              </p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                {tipo}
              </p>
            </div>
            {tramite.patente && (
              <div style={{
                background: '#1A1A1A', color: 'white',
                padding: '8px 16px', borderRadius: 10,
                fontFamily: 'monospace', fontWeight: 800, fontSize: 18,
                letterSpacing: '0.1em',
              }}>
                {tramite.patente}
              </div>
            )}
          </div>

          {/* Estado actual */}
          <div style={{
            background: cfg.bg.replace('bg-', '').includes('-')
              ? undefined : '#F9FAFB',
            borderRadius: 16,
            padding: '20px',
            border: '1px solid #F3F4F6',
          }}
          className={cfg.bg}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                <IconE size={20} color="#D4621A" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Estado actual
                </p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  {cfg.label}
                </p>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
              {cfg.desc}
            </p>
          </div>

          {/* Barra de progreso */}
          {tramite.estado !== 'cancelado' && (
            <BarraProgreso estado={tramite.estado} />
          )}

          {/* Última actualización */}
          {tramite.actualizadoEn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} color="#9CA3AF" />
              <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>
                Última actualización: {
                  tramite.actualizadoEn?.toDate?.()?.toLocaleDateString('es-AR', {
                    weekday: 'short', day: 'numeric', month: 'long',
                    hour: '2-digit', minute: '2-digit',
                  })
                }
              </p>
            </div>
          )}

          {/* Historial de estados — expandible */}
          {hists.length > 0 && (
            <div>
              <button
                onClick={() => setHistorial(!historial)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#6B7280', fontSize: 13, fontWeight: 600, padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                {historial ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                Ver historial ({hists.length} cambio{hists.length !== 1 ? 's' : ''})
              </button>

              {historial && (
                <div style={{ marginTop: 12, paddingLeft: 8, borderLeft: '2px solid #F3F4F6' }}>
                  {[...hists].reverse().map((h: any, i: number) => (
                    <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < hists.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                        {(ESTADO_TRAMITE_LABELS as Record<string,string>)[h.estadoNuevo] ?? h.estadoNuevo}
                      </p>
                      {h.nota && (
                        <p style={{ margin: '2px 0', fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                          "{h.nota}"
                        </p>
                      )}
                      <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>
                        {h.fecha?.toDate?.()?.toLocaleDateString('es-AR', {
                          day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contacto */}
          <div style={{
            background: '#F9FAFB',
            borderRadius: 16,
            padding: '16px 20px',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ¿Tenés alguna consulta?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="https://wa.me/5491136141431"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#25D366', color: 'white',
                  padding: '12px 16px', borderRadius: 12,
                  fontWeight: 700, fontSize: 14, textDecoration: 'none',
                }}
              >
                <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp: 11 3614-1431
              </a>
              <a
                href="mailto:info@gestoriapaz.com"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  color: '#6B7280', fontSize: 13, textDecoration: 'none',
                }}
              >
                <Globe size={15} />
                info@gestoriapaz.com · gestoriapaz.com
              </a>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          background: '#1A1A1A',
          padding: '12px 28px',
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>
            Gestoría Paz · San Martín, Buenos Aires
          </p>
        </div>
      </div>

      {/* Firma JAH-NISSI */}
      <p style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        Desarrollado por JAH-NISSI Digital Studio
      </p>
    </div>
  )
}