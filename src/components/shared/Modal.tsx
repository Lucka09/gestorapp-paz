import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  open:      boolean
  onClose:   () => void
  title:     string
  subtitle?: string
  children:  React.ReactNode
  size?:     'sm' | 'md' | 'lg'
}

const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

export default function Modal({ open, onClose, title, subtitle, children, size = 'md' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else      document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Trap focus dentro del modal
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable[0]?.focus()
    const last = focusable[focusable.length - 1]
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === focusable[0]) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); focusable[0]?.focus() }
      }
    }
    panel.addEventListener('keydown', handleTab)
    return () => panel.removeEventListener('keydown', handleTab)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop con fade */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{ animation: 'modal-backdrop-in 0.2s ease-out' }}
        onClick={onClose}
      />

      {/* Panel con zoom + fade */}
      <div
        ref={panelRef}
        className={`
          relative bg-white rounded-2xl shadow-2xl w-full ${sizeClass[size]}
          max-h-[90vh] flex flex-col
        `}
        aria-describedby={subtitle ? 'modal-subtitle' : undefined}
        style={{
          animation: 'modal-panel-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2
              id="modal-title"
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p id="modal-subtitle" className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100
                       rounded-xl p-1.5 transition-all duration-150 -mt-0.5 ml-3 shrink-0
                       focus-visible:outline-2 focus-visible:outline-[var(--gp-orange)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes modal-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modal-panel-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
