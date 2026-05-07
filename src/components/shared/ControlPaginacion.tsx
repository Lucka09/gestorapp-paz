// src/components/shared/ControlPaginacion.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Barra de paginación reutilizable.
// Muestra: [← Anterior] [1] [2] ... [N] [Siguiente →]
// Oculta si solo hay 1 página.
// ─────────────────────────────────────────────────────────────────────────────

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  pagina:    number
  paginas:   number
  desde:     number
  hasta:     number
  total:     number
  onChange:  (p: number) => void
  // Texto opcional del contador (ej: "25 de 312 cobranzas")
  labelItem?: string
}

export default function ControlPaginacion({
  pagina, paginas, desde, hasta, total,
  onChange, labelItem = 'registros',
}: Props) {
  if (paginas <= 1) return null

  // Generar el rango de números a mostrar
  const numeros: (number | '...')[] = []
  if (paginas <= 7) {
    for (let i = 1; i <= paginas; i++) numeros.push(i)
  } else {
    numeros.push(1)
    if (pagina > 3)       numeros.push('...')
    for (let i = Math.max(2, pagina - 1); i <= Math.min(paginas - 1, pagina + 1); i++) {
      numeros.push(i)
    }
    if (pagina < paginas - 2) numeros.push('...')
    numeros.push(paginas)
  }

  const btn = (
    label: React.ReactNode,
    onClick: () => void,
    active  = false,
    disabled = false,
    key?: string | number
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={typeof label === 'string' ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-sm
                   font-medium transition-all select-none
                   ${active
                     ? 'bg-gp-orange text-white shadow-sm'
                     : disabled
                     ? 'text-gray-200 cursor-not-allowed'
                     : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                   }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100
                    flex-wrap">

      {/* Contador */}
      <p className="text-xs text-gray-400">
        {desde}–{hasta} de <span className="font-semibold text-gray-600">{total}</span> {labelItem}
      </p>

      {/* Controles */}
      <nav aria-label="Paginación" className="flex items-center gap-0.5">
        {btn(
          <ChevronLeft size={14} />,
          () => onChange(pagina - 1),
          false,
          pagina === 1,
          'prev'
        )}

        {numeros.map((n, i) =>
          n === '...'
            ? <span key={`ellipsis-${i}`} className="px-1.5 text-gray-300 text-sm select-none">
                ···
              </span>
            : btn(
                String(n),
                () => onChange(n),
                n === pagina,
                false,
                n
              )
        )}

        {btn(
          <ChevronRight size={14} />,
          () => onChange(pagina + 1),
          false,
          pagina === paginas,
          'next'
        )}
      </nav>
    </div>
  )
}