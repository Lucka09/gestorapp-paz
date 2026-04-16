import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { subscribeClientes, subscribeCliente, getClientesPagina, getClientesCount, getClientesTodos } from '@/lib/firestore/clientes'
import { useGestoriaId } from '@/context/GestoriaContext'
import { exportarClientes } from '@/utils/exportar'
import type { Cliente } from '@/types'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

// ─── HOOKS EXISTENTES (para formularios/selects — lista completa en realtime) ──

export function useClientes() {
  const gestoriaId              = useGestoriaId()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!gestoriaId) return
    setLoading(true)
    const unsub = subscribeClientes(gestoriaId, data => {
      setClientes(data)
      setLoading(false)
    })
    return () => unsub()
  }, [gestoriaId])

  return { clientes, loading }
}

export function useCliente(id: string | undefined) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    const unsub = subscribeCliente(id, data => {
      setCliente(data)
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  return { cliente, loading }
}

export function useClientesFiltrados(search: string) {
  const { clientes, loading } = useClientes()

  const filtrados = useMemo(() => {
    if (!search.trim()) return clientes
    const q = search.toLowerCase()
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q)   ||
      c.apellido.toLowerCase().includes(q) ||
      c.dni.includes(q)                    ||
      c.telefono.includes(q)               ||
      c.email.toLowerCase().includes(q)
    )
  }, [clientes, search])

  return { clientes: filtrados, total: clientes.length, loading }
}

// ─── HOOK PAGINADO (para ClientesPage) ───────────────────────────────────────

const PAGE_SIZE = 25

/**
 * Paginación con cursores Firestore para la vista de lista.
 *
 * Modos:
 *  - Browse (sin búsqueda): 25 docs por página, getDocs por página.
 *  - Search (con búsqueda):  carga TODOS los clientes del tenant una sola vez
 *    y filtra client-side. La carga ocurre cuando el usuario empieza a escribir
 *    (no al montar el componente).
 *
 * El stack de cursores se guarda en un useRef para no causar re-renders
 * ni loops en useEffect.
 */
export function useClientesPaginados(pageSize = PAGE_SIZE) {
  const gestoriaId = useGestoriaId()

  // ── Paginación ────────────────────────────────────────────────────────────
  const [page, setPage]         = useState(1)
  const [items, setItems]       = useState<Cliente[]>([])
  const [total, setTotal]       = useState(0)
  const [hasNext, setHasNext]   = useState(false)
  const [loading, setLoading]   = useState(true)

  // Stack de cursores en ref — no dispara efectos.
  // cursorsRef.current[i] = cursor para cargar la página i+1.
  // cursorsRef.current[0] = null → página 1 empieza desde el inicio.
  const cursorsRef = useRef<(QueryDocumentSnapshot<Cliente> | null)[]>([null])
  // Último doc de la página actual — goNext lo usa como cursor de la siguiente.
  const lastDocRef = useRef<QueryDocumentSnapshot<Cliente> | null>(null)

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  // inputSearch: valor del <input> (reactivo, sin debounce)
  // debouncedSearch: valor que dispara la carga de todos los docs
  const [inputSearch, setInputSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchAll, setSearchAll]         = useState<Cliente[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // ── Exportar ──────────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false)

  // ── Efectos ───────────────────────────────────────────────────────────────

  // 1. Contar total del tenant (una vez al montar)
  useEffect(() => {
    if (!gestoriaId) return
    getClientesCount(gestoriaId).then(setTotal).catch(console.warn)
  }, [gestoriaId])

  // 2. Debounce del input de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inputSearch), 400)
    return () => clearTimeout(t)
  }, [inputSearch])

  // 3. Cargar página (solo cuando no hay búsqueda activa)
  useEffect(() => {
    if (!gestoriaId || debouncedSearch.trim()) return
    setLoading(true)

    const cursor = cursorsRef.current[page - 1] ?? null
    getClientesPagina(gestoriaId, cursor, pageSize)
      .then(({ clientes: data, lastDoc }) => {
        setItems(data)
        lastDocRef.current = lastDoc
        setHasNext(data.length === pageSize)
        setLoading(false)
      })
      .catch(err => {
        console.error('[useClientesPaginados]', err)
        setLoading(false)
      })
  }, [gestoriaId, page, pageSize, debouncedSearch])

  // 4. Cargar TODOS los clientes para búsqueda (solo cuando hay texto)
  useEffect(() => {
    if (!debouncedSearch.trim() || !gestoriaId) {
      setSearchAll(null)
      return
    }
    setSearchLoading(true)
    getClientesTodos(gestoriaId)
      .then(todos => {
        setSearchAll(todos)
        setSearchLoading(false)
      })
      .catch(err => {
        console.error('[useClientesPaginados:search]', err)
        setSearchLoading(false)
      })
  }, [debouncedSearch, gestoriaId])

  // ── Acciones de paginación ────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!hasNext || !lastDocRef.current) return
    // Guardar el cursor del last doc de la página actual para que la siguiente lo use
    cursorsRef.current[page] = lastDocRef.current
    setPage(p => p + 1)
  }, [hasNext, page])

  const goPrev = useCallback(() => {
    if (page <= 1) return
    setPage(p => p - 1)
  }, [page])

  // ── Exportar ──────────────────────────────────────────────────────────────

  const exportar = useCallback(async () => {
    if (!gestoriaId || exportLoading) return
    setExportLoading(true)
    try {
      const todos = await getClientesTodos(gestoriaId)
      await exportarClientes(todos)
    } catch (err) {
      console.error('[useClientesPaginados:exportar]', err)
      throw err   // la página muestra el toast de error
    } finally {
      setExportLoading(false)
    }
  }, [gestoriaId, exportLoading])

  // ── Derivados ─────────────────────────────────────────────────────────────

  const isSearching = debouncedSearch.trim() !== ''

  const clientesFiltrados = useMemo(() => {
    if (!searchAll) return null
    const q = debouncedSearch.toLowerCase()
    return searchAll.filter(c =>
      c.nombre.toLowerCase().includes(q)   ||
      c.apellido.toLowerCase().includes(q) ||
      c.dni.includes(q)                    ||
      c.telefono.includes(q)               ||
      c.email.toLowerCase().includes(q)
    )
  }, [searchAll, debouncedSearch])

  return {
    // Datos a mostrar
    clientes:  clientesFiltrados ?? items,
    total,

    // Estado de carga
    loading:       isSearching ? searchLoading : loading,
    searchLoading,

    // Paginación (irrelevante en modo búsqueda)
    page,
    hasPrev:   page > 1,
    hasNext:   isSearching ? false : hasNext,
    goNext,
    goPrev,

    // Búsqueda
    search:      inputSearch,
    setSearch:   setInputSearch,
    isSearching,

    // Exportar
    exportar,
    exportLoading,
  }
}