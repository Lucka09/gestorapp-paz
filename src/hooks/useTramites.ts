import { useQuery }                from '@tanstack/react-query'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  subscribeTramitesPropios, subscribeTramitesPorCliente, subscribeTramite,
  getTramitesPagina, getTramitesCount, getTramitesPropiosTodos, getTramitesTodos,
  getTramites,
  type FiltrosTramitesPagina,
} from '@/lib/firestore/tramites'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useAuthStore } from '@/store/authStore'
import { exportarTramites } from '@/utils/exportar'
import { useClientes } from '@/hooks/useClientes'
import type { Tramite, EstadoTramite, TipoTramite } from '@/types'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

// ─── HOOKS BASE ───────────────────────────────────────────────────────────────

// ⚡ OPTIMIZADO: TanStack Query con caché 5 min en vez de onSnapshot permanente
// Usado por VencimientosPage, ReportesPage, CobranzasPage, GestorHomePage
export function useTramites() {
  const gestoriaId  = useGestoriaId()
  const { user }    = useAuthStore()
  const esGestor    = user?.rol === 'gestor' && !!user?.uid

  const { data: tramites = [], isLoading: loading, refetch } = useQuery<Tramite[]>({
    queryKey:  ['tramites-all', gestoriaId, user?.uid, esGestor],
    queryFn:   () => esGestor
      ? getTramitesPropiosTodos(gestoriaId, user!.uid)
      : getTramites(gestoriaId),
    staleTime: 1000 * 60 * 3,   // 3 minutos de caché
    enabled:   !!gestoriaId,
  })

  return { tramites, loading, refetch }
}

export function useTramitesPorCliente(clienteId: string | undefined) {
  const gestoriaId = useGestoriaId()
  const [tramites, setTramites] = useState<Tramite[]>([])
  const [loading, setLoading]   = useState(!!clienteId)

  useEffect(() => {
    if (!clienteId || !gestoriaId) return
    const unsub = subscribeTramitesPorCliente(clienteId, gestoriaId, data => {
      setTramites(data)
      setLoading(false)
    })
    return () => unsub()
  }, [clienteId, gestoriaId])

  return { tramites, loading }
}

export function useTramite(id: string | undefined) {
  const [tramite, setTramite] = useState<Tramite | null>(null)
  const [loading, setLoading] = useState(!!id)

  useEffect(() => {
    if (!id) return
    const unsub = subscribeTramite(id, data => {
      setTramite(data)
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  return { tramite, loading }
}

export type TramitesFiltros = {
  search: string
  estado: EstadoTramite | 'todos'
  tipo:   TipoTramite   | 'todos'
}

export function useTramitesFiltrados(filtros: TramitesFiltros) {
  const { tramites, loading } = useTramites()

  const filtrados = useMemo(() => {
    return tramites.filter(t => {
      if (filtros.estado !== 'todos' && t.estado !== filtros.estado) return false
      if (filtros.tipo   !== 'todos' && t.tipo   !== filtros.tipo)   return false
      if (filtros.search.trim()) {
        const q = filtros.search.toLowerCase()
        const match =
          t.numero.toLowerCase().includes(q)  ||
          t.patente.toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [tramites, filtros])

  return { tramites: filtrados, total: tramites.length, loading }
}

// ─── HOOK PAGINADO (para TramitesPage) ───────────────────────────────────────

const PAGE_SIZE = 25

/**
 * Paginación con cursores Firestore para la vista de lista de trámites.
 *
 * Filtros de estado/tipo se aplican SERVER-SIDE (where en Firestore) — solo
 * llegan al cliente los documentos que coinciden.
 *
 * Búsqueda de texto: carga todos los trámites del filtro activo una sola vez
 * (bajo demanda al escribir, con debounce 400ms).
 *
 * Cuando filtros cambian: resetea automáticamente a página 1.
 */
export function useTramitesPaginados(
  filtros:  FiltrosTramitesPagina,
  pageSize = PAGE_SIZE,
) {
  const gestoriaId           = useGestoriaId()
  const { clientes }         = useClientes()   // para exportar

  // ── Paginación ────────────────────────────────────────────────────────────
  const [page, setPage]       = useState(1)
  const [items, setItems]     = useState<Tramite[]>([])
  const [total, setTotal]     = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)

  const cursorsRef = useRef<(QueryDocumentSnapshot<Tramite> | null)[]>([null])
  const lastDocRef = useRef<QueryDocumentSnapshot<Tramite> | null>(null)

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [inputSearch, setInputSearch]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchAll, setSearchAll]             = useState<Tramite[] | null>(null)
  const [searchLoading, setSearchLoading]     = useState(false)

  // ── Exportar ──────────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false)

  // ── Efectos ───────────────────────────────────────────────────────────────

  // 1. Resetear paginación cuando cambian los filtros server-side
  const filtrosKey = `${filtros.estado}:${filtros.tipo}`
  useEffect(() => {
    cursorsRef.current = [null]
    lastDocRef.current = null
    setPage(1)
    setSearchAll(null)
    setInputSearch('')
    setDebouncedSearch('')
  }, [filtrosKey])

  // 2. Contar total (se recalcula cuando cambian filtros)
  useEffect(() => {
    if (!gestoriaId) return
    getTramitesCount(gestoriaId, filtros)
      .then(setTotal)
      .catch(console.warn)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestoriaId, filtrosKey])

  // 3. Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inputSearch), 400)
    return () => clearTimeout(t)
  }, [inputSearch])

  // 4. Cargar página (solo cuando no hay búsqueda)
  useEffect(() => {
    if (!gestoriaId || debouncedSearch.trim()) return
    setLoading(true)

    const cursor = cursorsRef.current[page - 1] ?? null
    getTramitesPagina(gestoriaId, filtros, cursor, pageSize)
      .then(({ tramites: data, lastDoc }) => {
        setItems(data)
        lastDocRef.current = lastDoc
        setHasNext(data.length === pageSize)
        setLoading(false)
      })
      .catch(err => {
        console.error('[useTramitesPaginados]', err)
        setLoading(false)
      })
  // filtrosKey en lugar de filtros object para evitar igualdad referencial falsa
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestoriaId, page, pageSize, debouncedSearch, filtrosKey])

  // 5. Cargar TODOS (para búsqueda de texto)
  useEffect(() => {
    if (!debouncedSearch.trim() || !gestoriaId) {
      setSearchAll(null)
      return
    }
    setSearchLoading(true)
    getTramitesTodos(gestoriaId, filtros)
      .then(todos => {
        setSearchAll(todos)
        setSearchLoading(false)
      })
      .catch(err => {
        console.error('[useTramitesPaginados:search]', err)
        setSearchLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, gestoriaId, filtrosKey])

  // ── Acciones ──────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!hasNext || !lastDocRef.current) return
    cursorsRef.current[page] = lastDocRef.current
    setPage(p => p + 1)
  }, [hasNext, page])

  const goPrev = useCallback(() => {
    if (page <= 1) return
    setPage(p => p - 1)
  }, [page])

  const exportar = useCallback(async () => {
    if (!gestoriaId || exportLoading) return
    setExportLoading(true)
    try {
      const todos = await getTramitesTodos(gestoriaId, filtros)
      await exportarTramites(todos, clientes)
    } catch (err) {
      console.error('[useTramitesPaginados:exportar]', err)
      throw err
    } finally {
      setExportLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestoriaId, filtrosKey, clientes, exportLoading])

  // ── Derivados ─────────────────────────────────────────────────────────────

  const isSearching = debouncedSearch.trim() !== ''

  const tramitesFiltrados = useMemo(() => {
    if (!searchAll) return null
    const q = debouncedSearch.toLowerCase()
    return searchAll.filter(t =>
      t.numero.toLowerCase().includes(q)      ||
      t.patente.toLowerCase().includes(q)     ||
      t.descripcion.toLowerCase().includes(q)
    )
  }, [searchAll, debouncedSearch])

  return {
    tramites:  tramitesFiltrados ?? items,
    total,
    loading:       isSearching ? searchLoading : loading,
    searchLoading,
    page,
    hasPrev:   page > 1,
    hasNext:   isSearching ? false : hasNext,
    goNext,
    goPrev,
    search:      inputSearch,
    setSearch:   setInputSearch,
    isSearching,
    exportar,
    exportLoading,
  }
}