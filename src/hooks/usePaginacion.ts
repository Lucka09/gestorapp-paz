// src/hooks/usePaginacion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Paginación en cliente para colecciones ya cargadas en memoria.
// Aplica cuando los datos vienen de onSnapshot (stream en memoria) y el
// cuello de botella es el renderizado DOM, no la query a Firestore.
//
// Uso:
//   const { pagina, setPagina, paginas, itemsPagina, desde, hasta, total }
//     = usePaginacion(listadoFiltrado, { porPagina: 30 })
//
//   {itemsPagina.map(item => <Fila key={item.id} item={item} />)}
//   <ControlPaginacion pagina={pagina} paginas={paginas} onChange={setPagina} />
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'

interface OpcionesPaginacion {
  porPagina?: number
}

interface ResultadoPaginacion<T> {
  pagina:      number
  setPagina:   (p: number) => void
  paginas:     number       // total de páginas
  itemsPagina: T[]          // slice de la página actual
  desde:       number       // índice 1-based del primer ítem visible
  hasta:       number       // índice 1-based del último ítem visible
  total:       number       // total de ítems en la lista
}

export function usePaginacion<T>(
  items:   T[],
  opciones: OpcionesPaginacion = {}
): ResultadoPaginacion<T> {
  const porPagina = opciones.porPagina ?? 25
  const [pagina,  setPagina] = useState(1)

  // Resetear a la primera página cuando cambie la lista filtrada
  // (el usuario aplicó un filtro y la página actual ya no existe)
  useEffect(() => {
    setPagina(1)
  }, [items.length])

  const paginas = Math.max(1, Math.ceil(items.length / porPagina))

  // Normalizar página si el total de páginas cambia
  const paginaReal = Math.min(pagina, paginas)

  const itemsPagina = useMemo(() => {
    const inicio = (paginaReal - 1) * porPagina
    return items.slice(inicio, inicio + porPagina)
  }, [items, paginaReal, porPagina])

  const desde = items.length === 0 ? 0 : (paginaReal - 1) * porPagina + 1
  const hasta  = Math.min(paginaReal * porPagina, items.length)

  return {
    pagina:    paginaReal,
    setPagina: (p: number) => setPagina(Math.max(1, Math.min(p, paginas))),
    paginas,
    itemsPagina,
    desde,
    hasta,
    total:     items.length,
  }
}