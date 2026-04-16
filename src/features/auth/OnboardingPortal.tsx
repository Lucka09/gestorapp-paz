import { useState } from 'react'
import { FileText, CalendarDays, Phone, ArrowRight, CheckCircle } from 'lucide-react'
import { actualizarCliente } from '@/lib/firestore/clientes'

// bgClass usa clases Tailwind completas para que el purger las incluya.
// animate-modal-in-slow se define en index.css.
const PASOS = [
  {
    icon:     <FileText size={32} color="white" />,
    bgClass:  'bg-gp-orange',
    titulo:   'Seguí tus trámites',
    desc:     'Desde acá podés ver en qué etapa está cada trámite en tiempo real, sin tener que llamar a la gestoría.',
    detalle:  '🟡 Pendiente → 🔵 En proceso → 🟠 En organismo → ✅ Listo para retirar',
  },
  {
    icon:     <CalendarDays size={32} color="white" />,
    bgClass:  'bg-gp-black',
    titulo:   'Reservá turnos online',
    desc:     'Elegí el día y horario que más te convenga. Gestoría Paz confirma tu turno y recibís una notificación.',
    detalle:  '📅 Elegís la fecha → 🕐 Elegís el horario → ✅ Listo',
  },
  {
    icon:     <Phone size={32} color="white" />,
    bgClass:  'bg-emerald-600',
    titulo:   'Contacto directo',
    desc:     'Si necesitás hablar con alguien, tenés acceso directo a WhatsApp desde cualquier pantalla.',
    detalle:  '💬 Botón de WhatsApp siempre disponible en tu portal',
  },
]

interface Props {
  clienteId: string
  nombre:    string
  onFin:     () => void
}

export default function OnboardingPortal({ clienteId, nombre, onFin }: Props) {
  const [paso,    setPaso]    = useState(0)
  const [saliendo, setSaliendo] = useState(false)

  const esUltimo = paso === PASOS.length - 1
  const actual   = PASOS[paso]

  const siguiente = async () => {
    if (esUltimo) {
      setSaliendo(true)
      try {
        await actualizarCliente(clienteId, { observaciones: '__onboarding_done__' })
      } catch { /* silencioso */ }
      onFin()
      return
    }
    setPaso(p => p + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Paso ${paso + 1} de ${PASOS.length}: ${actual.titulo}`}
    >
      {/* Panel — animate-modal-in definido en index.css */}
      <div className="animate-modal-in bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl
                      overflow-hidden shadow-[0_-8px_40px_rgba(0,0,0,0.15)]">

        {/* Header coloreado — usa la clase de bgClass del paso actual */}
        <div
          className={`flex items-center justify-center h-40 transition-colors duration-300 ${actual.bgClass}`}
          aria-hidden="true"
        >
          {/* Ícono con fondo translúcido */}
          <div className="animate-modal-in-slow w-18 h-18 rounded-[20px]
                          bg-white/20 flex items-center justify-center">
            {actual.icon}
          </div>
        </div>

        {/* Dots de progreso */}
        <div
          className="flex items-center justify-center gap-2 pt-5 pb-1"
          role="tablist"
          aria-label="Progreso del tutorial"
        >
          {PASOS.map((p, i) => (
            <div
              key={i}
              role="tab"
              aria-selected={i === paso}
              aria-label={`Paso ${i + 1}`}
              className={`h-2 rounded-gp-full transition-all duration-300 ${
                i === paso
                  ? 'w-6 bg-gp-orange'
                  : 'w-2 bg-gp-border'
              }`}
            />
          ))}
        </div>

        {/* Contenido */}
        <div className="px-7 pt-4 pb-6">

          {/* Saludo — solo en el primer paso */}
          {paso === 0 && (
            <p className="text-[13px] text-gp-orange font-bold mb-1">
              Hola, {nombre} 👋
            </p>
          )}

          <h2 className="font-gp-display font-extrabold text-[22px] text-gp-text-1 mb-2.5">
            {actual.titulo}
          </h2>

          <p className="text-[15px] text-gp-text-3 leading-[1.65] mb-3.5">
            {actual.desc}
          </p>

          {/* Caja de detalle */}
          <div className="bg-gp-bg rounded-gp-md px-3.5 py-2.5 text-[13px]
                          text-gp-text-3 mb-6">
            {actual.detalle}
          </div>

          {/* Botón principal — btn-primary maneja hover/active/disabled en CSS */}
          <button
            onClick={siguiente}
            disabled={saliendo}
            className="btn-primary w-full flex items-center justify-center gap-2
                       py-3.75 text-[15px] font-bold"
            aria-label={esUltimo ? 'Finalizar tutorial e ir al portal' : `Ir al paso ${paso + 2}`}
          >
            {esUltimo
              ? <><CheckCircle size={18} /> Entendido, ir al portal</>
              : <>Siguiente <ArrowRight size={18} /></>
            }
          </button>

          {/* Saltar — solo si no es el último paso */}
          {!esUltimo && (
            <button
              onClick={onFin}
              className="touch-xs w-full mt-3 bg-transparent border-none text-[13px]
                         text-gp-text-4 cursor-pointer px-2 py-2 font-gp-body"
              aria-label="Saltar el tutorial e ir directamente al portal"
            >
              Saltar introducción
            </button>
          )}
        </div>
      </div>
    </div>
  )
}