// src/hooks/usePageTitle.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hook que actualiza document.title por página.
// Formato: "{Página} — {NombreGestoría}"
//
// Uso:
//   usePageTitle('Dashboard')          → "Dashboard — Gestoría Paz"
//   usePageTitle('Trámites')           → "Trámites — Gestoría Paz"
//   usePageTitle(`Trámite ${numero}`)  → "Trámite GP-2025-0042 — Gestoría Paz"
//
// Al desmontar el componente, restaura el título base del tenant.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { useGestoria } from '@/context/GestoriaContext'

export function usePageTitle(pagina: string) {
  const { nombreComercial } = useGestoria()

  useEffect(() => {
    const anterior = document.title
    document.title = `${pagina} — ${nombreComercial}`

    return () => {
      // Restaurar el título base al salir de la página
      document.title = nombreComercial
        ? `${nombreComercial} — GestorApp`
        : 'GestorApp'
    }
  }, [pagina, nombreComercial])
}