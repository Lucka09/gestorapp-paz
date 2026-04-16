import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useClientes }  from './useClientes'
import { useVehiculos } from './useVehiculos'
import { useTramites }  from './useTramites'
import { useTurnos }    from './useTurnos'
import { buscarTodo, type ResultadoBusqueda } from '@/utils/busqueda'

const DEBOUNCE_MS = 220

export function useBusquedaGlobal() {
  const [query,      setQuery]      = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [abierto,    setAbierto]    = useState(false)
  const [selIndex,   setSelIndex]   = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Datos de todas las colecciones
  const { clientes }  = useClientes()
  const { vehiculos } = useVehiculos()
  const { tramites }  = useTramites()
  const { turnos }    = useTurnos()

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // Resultados memoizados
  const resultados = useMemo<ResultadoBusqueda[]>(() => {
    if (debouncedQ.length < 2) return []
    return buscarTodo({ clientes, vehiculos, tramites, turnos }, debouncedQ)
  }, [debouncedQ, clientes, vehiculos, tramites, turnos])

  // Abrir/cerrar
  useEffect(() => {
    if (resultados.length > 0) {
      setAbierto(true)
      setSelIndex(0)
    } else {
      setAbierto(query.length >= 2)
    }
  }, [resultados, query])

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-search]')) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Atajo de teclado Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setAbierto(true)
      }
      if (e.key === 'Escape') {
        setAbierto(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Navegación con teclado dentro de los resultados
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!abierto || resultados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelIndex(i => Math.min(i + 1, resultados.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelIndex(i => Math.max(i - 1, 0))
    }
  }, [abierto, resultados.length])

  const limpiar = useCallback(() => {
    setQuery('')
    setDebouncedQ('')
    setAbierto(false)
    setSelIndex(0)
  }, [])

  return {
    query, setQuery,
    resultados,
    abierto, setAbierto,
    selIndex, setSelIndex,
    inputRef,
    handleKeyDown,
    limpiar,
    cargando: query.length >= 2 && debouncedQ !== query,
  }
}
