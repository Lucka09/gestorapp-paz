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
 * Filtro de ciclo de vida:
 *  - verProspectos = false (default) → solo cicloVida == 'cliente'.
 *  - verProspectos = true            → sin filtro (clientes + prospectos).
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
  // Mensaje de error de carga del listado (p. ej. índice Firestore faltante).
  // Permite distinguir "vacío real" de "falló la query" en la UI.
  const [error, setError]       = useState<string | null>(null)

  // ── Ciclo de vida (toggle "Ver prospectos") ───────────────────────────────
  const [verProspectos, setVerProspectosState] = useState(false)
  // undefined → trae todo (clientes + prospectos); 'cliente' → solo clientes.
  const cicloVida: 'cliente' | undefined = verProspectos ? undefined : 'cliente'

  // Stack de cursores en ref — no dispara efectos.
  // cursorsRef.current[i] = cursor para cargar la página i+1.
  // cursorsRef.current[0] = null → página 1 empieza desde el inicio.
  const cursorsRef = useRef<(QueryDocumentSnapshot<Cliente> | null)[]>([null])
  // Último doc de la página actual — goNext lo usa como cursor de la siguiente.
  const lastDocRef = useRef<QueryDocumentSnapshot<Cliente> | null>(null)

  // Cambiar el filtro invalida los cursores: reseteamos a página 1.
  const setVerProspectos = useCallback((v: boolean) => {
    cursorsRef.current = [null]
    lastDocRef.current = null
    setPage(1)
    setVerProspectosState(v)
  }, [])

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

  // 1. Contar total del tenant (según filtro de ciclo de vida)
  useEffect(() => {
    if (!gestoriaId) return
    getClientesCount(gestoriaId, cicloVida).then(setTotal).catch(console.warn)
  }, [gestoriaId, cicloVida])

  // 2. Debounce del input de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inputSearch), 400)
    return () => clearTimeout(t)
  }, [inputSearch])

  // 3. Cargar página (solo cuando no hay búsqueda activa)
  useEffect(() => {
    if (!gestoriaId || debouncedSearch.trim()) return
    setLoading(true)
    setError(null)

    const cursor = cursorsRef.current[page - 1] ?? null
    getClientesPagina(gestoriaId, cursor, pageSize, cicloVida)
      .then(({ clientes: data, lastDoc }) => {
        setItems(data)
        lastDocRef.current = lastDoc
        setHasNext(data.length === pageSize)
        setLoading(false)
      })
      .catch(err => {
        console.error('[useClientesPaginados]', err)
        setError(
          err?.code === 'failed-precondition'
            ? 'Falta un índice de Firestore para ordenar los clientes (revisá Firestore → Índices).'
            : 'No se pudo cargar el listado de clientes.'
        )
        setItems([])
        setHasNext(false)
        setLoading(false)
      })
  }, [gestoriaId, page, pageSize, debouncedSearch, cicloVida])

  // 4. Cargar TODOS los clientes para búsqueda (solo cuando hay texto)
  useEffect(() => {
    if (!debouncedSearch.trim() || !gestoriaId) {
      setSearchAll(null)
      return
    }
    setSearchLoading(true)
    setError(null)
    getClientesTodos(gestoriaId)
      .then(todos => {
        setSearchAll(todos)
        setSearchLoading(false)
      })
      .catch(err => {
        console.error('[useClientesPaginados:search]', err)
        setError(
          err?.code === 'failed-precondition'
            ? 'Falta un índice de Firestore para la búsqueda de clientes (revisá Firestore → Índices).'
            : 'No se pudo completar la búsqueda de clientes.'
        )
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
    return searchAll
      // Respeta el toggle: si no se ven prospectos, excluye solo los explícitos.
      // (Los registros legacy sin cicloVida se consideran clientes.)
      .filter(c => verProspectos || (c as { cicloVida?: string }).cicloVida !== 'prospecto')
      .filter(c =>
        c.nombre.toLowerCase().includes(q)   ||
        c.apellido.toLowerCase().includes(q) ||
        c.dni.includes(q)                    ||
        c.telefono.includes(q)               ||
        c.email.toLowerCase().includes(q)
      )
  }, [searchAll, debouncedSearch, verProspectos])

  return {
    // Datos a mostrar
    clientes:  clientesFiltrados ?? items,
    total,

    // Estado de carga
    loading:       isSearching ? searchLoading : loading,
    searchLoading,
    error,

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

    // Ciclo de vida
    verProspectos,
    setVerProspectos,

    // Exportar
    exportar,
    exportLoading,
  }
}