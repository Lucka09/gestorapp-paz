import { useState } from 'react'
import { FileText, CalendarDays, Phone, ArrowRight, CheckCircle } from 'lucide-react'
import { actualizarCliente } from '@/lib/firestore/clientes'

const PASOS = [
  {
    icon:  <FileText size={32} color="white" />,
    bg:    '#D4621A',
    titulo: 'Seguí tus trámites',
    desc:  'Desde acá podés ver en qué etapa está cada trámite en tiempo real, sin tener que llamar a la gestoría.',
    detalle: '🟡 Pendiente → 🔵 En proceso → 🟠 En organismo → ✅ Listo para retirar',
  },
  {
    icon:  <CalendarDays size={32} color="white" />,
    bg:    '#1A1A1A',
    titulo: 'Reservá turnos online',
    desc:  'Elegí el día y horario que más te convenga. Gestoría Paz confirma tu turno y recibís una notificación.',
    detalle: '📅 Elegís la fecha → 🕐 Elegís el horario → ✅ Listo',
  },
  {
    icon:  <Phone size={32} color="white" />,
    bg:    '#059669',
    titulo: 'Contacto directo',
    desc:  'Si necesitás hablar con alguien, tenés acceso directo a WhatsApp desde cualquier pantalla.',
    detalle: '💬 Botón de WhatsApp siempre disponible en tu portal',
  },
]

interface Props {
  clienteId: string
  nombre:    string
  onFin:     () => void
}

export default function OnboardingPortal({ clienteId, nombre, onFin }: Props) {
  const [paso, setPaso] = useState(0)
  const [saliendo, setSaliendo] = useState(false)

  const esUltimo = paso === PASOS.length - 1
  const actual   = PASOS[paso]

  const siguiente = async () => {
    if (esUltimo) {
      setSaliendo(true)
      // Marcar que el cliente ya vio el onboarding
      try {
        await actualizarCliente(clienteId, { observaciones: '__onboarding_done__' } as any)
      } catch { /* silencioso */ }
      onFin()
      return
    }
    setPaso(p => p + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          animation: 'modal-panel-in 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header coloreado */}
        <div
          className="flex items-center justify-center"
          style={{
            background: actual.bg,
            height: 160,
            transition: 'background 0.3s ease',
          }}
        >
          <div
            style={{
              width: 72, height: 72,
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'modal-panel-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {actual.icon}
          </div>
        </div>

        {/* Dots de progreso */}
        <div className="flex items-center justify-center gap-2 pt-5 pb-1">
          {PASOS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === paso ? 24 : 8,
                height: 8,
                borderRadius: 999,
                background: i === paso ? 'var(--gp-orange)' : '#E5E7EB',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Contenido */}
        <div className="px-7 pt-4 pb-6">
          {paso === 0 && (
            <p style={{
              fontSize: 13, color: 'var(--gp-orange)',
              fontWeight: 700, marginBottom: 4,
            }}>
              Hola, {nombre} 👋
            </p>
          )}

          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800, fontSize: 22,
            color: 'var(--color-text-1)',
            margin: '0 0 10px',
          }}>
            {actual.titulo}
          </h2>

          <p style={{
            fontSize: 15, color: 'var(--color-text-3)',
            lineHeight: 1.65, margin: '0 0 14px',
          }}>
            {actual.desc}
          </p>

          <div style={{
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--color-text-3)',
            marginBottom: 24,
          }}>
            {actual.detalle}
          </div>

          {/* Botón principal */}
          <button
            onClick={siguiente}
            disabled={saliendo}
            style={{
              width: '100%',
              background: 'var(--gp-orange)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '15px',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: 'var(--shadow-gp)',
              transition: 'all 0.15s',
            }}
          >
            {esUltimo
              ? <><CheckCircle size={18} /> Entendido, ir al portal</>
              : <>Siguiente <ArrowRight size={18} /></>
            }
          </button>

          {/* Saltar */}
          {!esUltimo && (
            <button
              onClick={onFin}
              style={{
                width: '100%', marginTop: 12,
                background: 'none', border: 'none',
                fontSize: 13, color: 'var(--color-text-4)',
                cursor: 'pointer', padding: '8px',
                fontFamily: 'var(--font-body)',
              }}
            >
              Saltar introducción
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modal-panel-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
