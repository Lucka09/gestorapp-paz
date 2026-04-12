import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import {
  ESTADO_TRAMITE_LABELS,
  ESTADO_TRAMITE_COLORS,
  ESTADO_TRAMITE_DOT,
  ESTADO_TRAMITE_EMOJI,
  type EstadoTramite,
} from '@/types'

// ─── BADGE CON DOT ────────────────────────────────────────────────────────────

export function EstadoBadge({ estado, showDot = true }: { estado: EstadoTramite; showDot?: boolean }) {
  const activo = ['pendiente','en_proceso','documentacion_requerida','en_organismo'].includes(estado)
  return (
    <span
      role="status"
      aria-label={`Estado: ${ESTADO_TRAMITE_LABELS[estado]}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                  ${ESTADO_TRAMITE_COLORS[estado]}`}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${ESTADO_TRAMITE_DOT[estado]}
                      ${activo ? 'pulse-orange' : ''}`}
        />
      )}
      {ESTADO_TRAMITE_LABELS[estado]}
    </span>
  )
}

// ─── BADGE GRANDE CON EMOJI ───────────────────────────────────────────────────

export function EstadoBadgeLarge({ estado }: { estado: EstadoTramite }) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold
                      ${ESTADO_TRAMITE_COLORS[estado]}`}>
      <span aria-hidden="true">{ESTADO_TRAMITE_EMOJI[estado]}</span>
      {ESTADO_TRAMITE_LABELS[estado]}
    </span>
  )
}

// ─── SELECTOR DE ESTADO ───────────────────────────────────────────────────────

const FLUJO: EstadoTramite[] = [
  'pendiente','en_proceso','documentacion_requerida',
  'en_organismo','listo_para_retirar','entregado','cancelado',
]

interface SelectorProps {
  estadoActual: EstadoTramite
  onCambiar:    (nuevo: EstadoTramite, nota: string) => Promise<void>
}

export function EstadoSelector({ estadoActual, onCambiar }: SelectorProps) {
  const [open, setOpen]       = useState(false)
  const [nota, setNota]       = useState('')
  const [target, setTarget]   = useState<EstadoTramite | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSelect = (estado: EstadoTramite) => {
    if (estado === estadoActual) { setOpen(false); return }
    setTarget(estado)
    setOpen(false)
  }

  const confirmar = async () => {
    if (!target) return
    setLoading(true)
    try { await onCambiar(target, nota); setTarget(null); setNota('') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-3">
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <EstadoBadgeLarge estado={estadoActual} />
          <ChevronDown size={14} className="text-gray-400" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-10 z-20 bg-white border border-gray-100
                            rounded-2xl shadow-2xl py-2 w-60">
              {FLUJO.map(estado => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => handleSelect(estado)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm
                              hover:bg-gray-50 transition-colors
                              ${estado === estadoActual ? 'opacity-40 cursor-default' : ''}`}
                >
                  <EstadoBadge estado={estado} />
                  {estado === estadoActual && <Check size={14} className="text-gray-400" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {target && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Cambiar a</span>
            <EstadoBadge estado={target} />
          </div>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Nota del cambio (opcional)..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       outline-none focus:border-[var(--gp-orange)] resize-none placeholder-gray-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={loading}
              className="flex-1 bg-[var(--gp-orange)] hover:bg-[var(--gp-orange-hover)] text-white
                         text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Confirmar cambio'}
            </button>
            <button
              type="button"
              onClick={() => { setTarget(null); setNota('') }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm
                         font-medium py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
