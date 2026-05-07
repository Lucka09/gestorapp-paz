// src/components/shared/ClienteCombobox.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Selector de cliente con búsqueda tipeable.
// Reemplaza los <Select> planos en TramiteForm, NuevoTurnoForm y TareasPage.
//
// Props:
//   value       — id del cliente seleccionado ('' = ninguno)
//   onChange    — recibe el id seleccionado
//   error       — mensaje de error opcional (borde rojo + texto)
//   label       — label del campo (default "Cliente")
//   placeholder — placeholder del input (default "Buscar por nombre o DNI...")
//   required    — si true muestra asterisco en el label
//   optional    — si true muestra "(opcional)" en el label y permite deseleccionar
//   clientes    — lista de clientes (viene del hook useClientes del padre)
//   disabled    — deshabilitar el campo
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useRef, useEffect, useCallback, useId,
  type KeyboardEvent,
} from 'react'
import { Search, X, ChevronDown, User } from 'lucide-react'
import type { Cliente } from '@/types'

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  value:       string
  onChange:    (id: string) => void
  clientes:    Cliente[]
  error?:      string
  label?:      string
  placeholder?:string
  required?:   boolean
  optional?:   boolean
  disabled?:   boolean
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar tildes
    .trim()
}

function matchCliente(c: Cliente, q: string): boolean {
  if (!q) return true
  const n = normalizar(q)
  return (
    normalizar(c.apellido).includes(n) ||
    normalizar(c.nombre).includes(n)   ||
    normalizar(`${c.apellido} ${c.nombre}`).includes(n) ||
    normalizar(`${c.nombre} ${c.apellido}`).includes(n) ||
    (c.dni ?? '').includes(n)
  )
}

function etiqueta(c: Cliente): string {
  return `${c.apellido}, ${c.nombre} — DNI ${c.dni}`
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function ClienteCombobox({
  value, onChange, clientes,
  error, label = 'Cliente', placeholder = 'Buscar por nombre o DNI...',
  required = false, optional = false, disabled = false,
}: Props) {
  const uid           = useId()
  const inputRef      = useRef<HTMLInputElement>(null)
  const listRef       = useRef<HTMLUListElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)

  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [cursor,  setCursor]  = useState(-1)   // índice resaltado con teclado

  // Cliente actualmente seleccionado
  const clienteActual = clientes.find(c => c.id === value) ?? null

  // Lista filtrada
  const filtrados = clientes
    .filter(c => matchCliente(c, query))
    .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'))
    .slice(0, 60)   // cap para no renderizar miles de nodos

  // ── Abrir / cerrar ────────────────────────────────────────────────────────

  const abrir = () => {
    if (disabled) return
    setQuery('')
    setCursor(-1)
    setOpen(true)
    // dar foco en el siguiente tick para que el input ya esté visible
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const cerrar = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(-1)
  }, [])

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cerrar()
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, cerrar])

  // ── Selección ─────────────────────────────────────────────────────────────

  const seleccionar = (id: string) => {
    onChange(id)
    cerrar()
  }

  const deseleccionar = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    cerrar()
  }

  // ── Teclado ───────────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor(c => Math.min(c + 1, filtrados.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor(c => Math.max(c - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (cursor >= 0 && filtrados[cursor]) {
          seleccionar(filtrados[cursor].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        cerrar()
        break
      case 'Tab':
        cerrar()
        break
    }
  }

  // Scroll del item activo a la vista
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return
    const item = listRef.current.children[cursor] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  // Reset cursor cuando cambia la búsqueda
  useEffect(() => { setCursor(-1) }, [query])

  // ── Render ────────────────────────────────────────────────────────────────

  const listboxId = `${uid}-listbox`
  const hasError  = !!error

  return (
    <div ref={containerRef} className="relative">

      {/* Label */}
      <label
        htmlFor={`${uid}-trigger`}
        className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5"
      >
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {optional && <span className="text-gray-300 ml-1 normal-case font-normal">(opcional)</span>}
      </label>

      {/* Trigger — muestra el cliente seleccionado o abre el combobox */}
      <button
        id={`${uid}-trigger`}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={label}
        disabled={disabled}
        onClick={abrir}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm
                    text-left transition-all outline-none
                    ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100' :
                      open    ? 'border-gp-orange ring-2 ring-gp-orange/15 bg-white'           :
                      hasError? 'border-red-300 bg-red-50'                                      :
                      'border-gray-200 bg-white hover:border-gray-300 focus-visible:border-gp-orange focus-visible:ring-2 focus-visible:ring-gp-orange/15'
                    }`}
      >
        {/* Ícono usuario */}
        <User size={14} className={clienteActual ? 'text-gp-orange' : 'text-gray-300'} />

        {/* Texto del trigger */}
        <span className={`flex-1 truncate ${clienteActual ? 'text-gray-900' : 'text-gray-400'}`}>
          {clienteActual
            ? `${clienteActual.apellido}, ${clienteActual.nombre}`
            : '— Seleccioná un cliente —'}
        </span>

        {/* Badge DNI — solo si hay selección */}
        {clienteActual && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md
                           font-mono shrink-0 hidden sm:block">
            {clienteActual.dni}
          </span>
        )}

        {/* Botón limpiar — solo si hay selección y es opcional */}
        {clienteActual && optional && (
          <span
            role="button"
            aria-label="Quitar cliente"
            onClick={deseleccionar}
            className="w-5 h-5 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500
                       flex items-center justify-center shrink-0 transition-colors"
          >
            <X size={10} />
          </span>
        )}

        <ChevronDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Mensaje de error */}
      {hasError && !open && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 w-full mt-1 bg-white rounded-2xl border border-gray-200
                     shadow-xl overflow-hidden"
          style={{ maxHeight: 320 }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setCursor(-1)
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 text-sm outline-none placeholder-gray-400 bg-transparent"
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={cursor >= 0 ? `${uid}-opt-${cursor}` : undefined}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Lista */}
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label={`Clientes${query ? ` filtrados por "${query}"` : ''}`}
            className="overflow-y-auto"
            style={{ maxHeight: 256 }}
          >
            {/* Opción vacía — solo si es optional */}
            {optional && !query && (
              <li
                role="option"
                aria-selected={value === ''}
                onClick={() => seleccionar('')}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm
                             transition-colors text-gray-400 italic
                             ${value === '' ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                <User size={13} className="shrink-0" />
                Sin vincular
              </li>
            )}

            {/* Sin resultados */}
            {filtrados.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">
                <User size={24} className="mx-auto mb-2 text-gray-200" />
                No se encontraron clientes
                {query && (
                  <span className="block text-xs mt-1">
                    para "{query}"
                  </span>
                )}
              </li>
            )}

            {/* Resultados */}
            {filtrados.map((c, i) => {
              const seleccionado = c.id === value
              const resaltado    = i === cursor

              return (
                <li
                  key={c.id}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={seleccionado}
                  onClick={() => seleccionar(c.id)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer
                               transition-colors text-sm select-none
                               ${seleccionado ? 'bg-gp-orange-pale'  :
                                 resaltado    ? 'bg-gray-50'         :
                                               'hover:bg-gray-50'   }`}
                >
                  {/* Avatar iniciales */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center
                                 text-xs font-bold shrink-0 ${
                      seleccionado ? 'bg-gp-orange text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.apellido[0]?.toUpperCase()}{c.nombre[0]?.toUpperCase()}
                  </div>

                  {/* Nombre + DNI */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate leading-tight ${
                      seleccionado ? 'text-gp-orange' : 'text-gray-800'
                    }`}>
                      <HighlightText text={`${c.apellido}, ${c.nombre}`} query={query} />
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      DNI <HighlightText text={c.dni} query={query} />
                      {c.telefono && (
                        <span className="ml-2 not-italic text-gray-300">{c.telefono}</span>
                      )}
                    </p>
                  </div>

                  {/* Check si está seleccionado */}
                  {seleccionado && (
                    <div className="w-4 h-4 rounded-full bg-gp-orange flex items-center
                                     justify-center shrink-0">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5"
                              strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </li>
              )
            })}

            {/* Footer — contador */}
            {filtrados.length > 0 && clientes.length > filtrados.length && (
              <li className="px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-50">
                Mostrando {filtrados.length} de {clientes.length} clientes
                {query && ' — refiná la búsqueda para ver más'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── HIGHLIGHT: resalta coincidencias en el texto ─────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const n = normalizar(query)
  const nt = normalizar(text)
  const idx = nt.indexOf(n)
  if (idx < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-gp-orange/20 text-gp-orange rounded-sm not-italic font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}