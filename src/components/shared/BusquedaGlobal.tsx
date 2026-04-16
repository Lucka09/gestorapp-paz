import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, Command } from 'lucide-react'
import { useBusquedaGlobal } from '@/hooks/useBusquedaGlobal'
import { TIPO_LABEL, TIPO_EMOJI, type TipoResultado } from '@/utils/busqueda'

// ─── ÍCONOS POR TIPO ─────────────────────────────────────────────────────────

function TipoIcon({ tipo }: { tipo: TipoResultado }) {
  return (
    <span
      className="text-sm shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
      style={{ background: 'var(--color-border-soft)' }}
      aria-hidden="true"
    >
      {TIPO_EMOJI[tipo]}
    </span>
  )
}

// ─── HIGHLIGHT DEL TEXTO ──────────────────────────────────────────────────────

function Highlight({ texto, query }: { texto: string; query: string }) {
  if (!query.trim()) return <>{texto}</>
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const partes = texto.split(regex)
  return (
    <>
      {partes.map((p, i) =>
        regex.test(p)
          ? <mark key={i} style={{
              background: 'var(--gp-orange-pale)',
              color: 'var(--gp-orange)',
              fontWeight: 700,
              borderRadius: 3,
              padding: '0 2px',
            }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

// ─── BARRA DE BÚSQUEDA GLOBAL ─────────────────────────────────────────────────

export default function BusquedaGlobal() {
  const navigate = useNavigate()
  const {
    query, setQuery, resultados,
    abierto, setAbierto,
    selIndex, setSelIndex,
    inputRef, handleKeyDown, limpiar, cargando,
  } = useBusquedaGlobal()

  const handleSeleccionar = (idx: number) => {
    const r = resultados[idx]
    if (!r) return
    navigate(r.link)
    limpiar()
  }

  // Agrupar resultados por tipo para mostrar cabeceras
  const grupos = resultados.reduce<Record<TipoResultado, typeof resultados>>((acc, r) => {
    if (!acc[r.tipo]) acc[r.tipo] = []
    acc[r.tipo].push(r)
    return acc
  }, {} as any)

  const tiposOrden: TipoResultado[] = ['cliente', 'vehiculo', 'tramite', 'turno']
  const tiposEnResultados = tiposOrden.filter(t => grupos[t]?.length > 0)

  return (
    <div
      data-search
      className="relative w-full max-w-md"
      role="search"
      aria-label="Búsqueda global"
    >
      {/* Input */}
      <div className={`flex items-center gap-2 rounded-xl border transition-all duration-150
                       bg-white px-3 py-2
                       ${abierto
                         ? 'border-[var(--gp-orange)] shadow-[0_0_0_3px_var(--gp-orange-subtle)]'
                         : 'border-[var(--color-border)] hover:border-gray-300'
                       }`}>
        {cargando
          ? <Loader2 size={15} className="text-gray-400 animate-spin shrink-0" />
          : <Search size={15} className="text-gray-400 shrink-0" aria-hidden="true" />
        }

        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-activedescendant={abierto ? `result-${selIndex}` : undefined}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setAbierto(true)}
          onKeyDown={e => {
            handleKeyDown(e)
            if (e.key === 'Enter' && abierto) {
              e.preventDefault()
              handleSeleccionar(selIndex)
            }
          }}
          placeholder="Buscar cliente, patente, trámite..."
          className="flex-1 bg-transparent outline-none text-sm text-[var(--color-text-1)]
                     placeholder-[var(--color-text-4)] min-w-0"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Atajo de teclado */}
        {!query && (
          <div className="hidden md:flex items-center gap-0.5 text-gray-300 shrink-0">
            <Command size={11} />
            <span className="text-xs">K</span>
          </div>
        )}

        {/* Limpiar */}
        {query && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Limpiar búsqueda"
            className="text-gray-300 hover:text-gray-600 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {abierto && (
        <div
          id="search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl
                     border border-[var(--color-border)] shadow-2xl z-[9999]
                     max-h-[70vh] overflow-y-auto"
          style={{
            animation: 'modal-panel-in 0.15s cubic-bezier(0.34,1.56,0.64,1)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}
        >
          {resultados.length === 0 ? (
            // Sin resultados
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Search size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-400">
                Sin resultados para "{query}"
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Probá con otro nombre, patente o número
              </p>
            </div>
          ) : (
            <div className="py-2">
              {/* Iterar por grupos */}
              {tiposEnResultados.map(tipo => {
                const items = grupos[tipo]
                return (
                  <div key={tipo}>
                    {/* Cabecera del grupo */}
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {TIPO_EMOJI[tipo]} {TIPO_LABEL[tipo]}s
                      </span>
                      <span className="text-xs text-gray-300">
                        ({items.length})
                      </span>
                    </div>

                    {/* Items del grupo */}
                    {items.map(r => {
                      const globalIdx = resultados.indexOf(r)
                      const isSelected = globalIdx === selIndex

                      return (
                        <button
                          key={r.id}
                          id={`result-${globalIdx}`}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSeleccionar(globalIdx)}
                          onMouseEnter={() => setSelIndex(globalIdx)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-2.5
                                      transition-colors
                                      ${isSelected
                                        ? 'bg-[var(--gp-orange-pale)]'
                                        : 'hover:bg-gray-50'
                                      }`}
                        >
                          <TipoIcon tipo={r.tipo} />

                          {/* Textos */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-semibold text-[var(--color-text-1)] truncate">
                                <Highlight texto={r.titulo} query={query} />
                              </p>
                              {r.badge && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                                                  shrink-0 ${r.badgeCls ?? 'bg-gray-100 text-gray-500'}`}>
                                  {r.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text-3)] truncate">
                              <Highlight texto={r.subtitulo} query={query} />
                              {r.meta && (
                                <span className="text-[var(--color-text-4)] ml-1.5">
                                  · {r.meta}
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Flecha indicadora en seleccionado */}
                          {isSelected && (
                            <span className="text-[var(--gp-orange)] text-xs shrink-0">
                              ↵
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}

              {/* Footer */}
              <div className="border-t border-gray-100 mx-4 mt-1 pt-2 pb-1
                              flex items-center justify-between">
                <p className="text-xs text-gray-300">
                  {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-300">
                  <span>↑↓ navegar</span>
                  <span>↵ abrir</span>
                  <span>Esc cerrar</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
