import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from 'react'
import { subscribeGestoria } from '@/lib/firestore/gestionarias'
import { useAuthStore }      from '@/store/authStore'
import type { Gestoria, EstadoGestoria } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface GestoriaContextValue {
  gestoria:        Gestoria | null
  gestoriaId:      string | null
  loading:         boolean
  estadoGestoria:  EstadoGestoria | null   // para bloquear en AdminLayout
  // Helpers de branding
  colorPrimario:   string
  colorSecundario: string
  nombreComercial: string
  slogan:          string
  logoUrl:         string | null
}

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────

const CTX_DEFAULT: GestoriaContextValue = {
  gestoria:        null,
  gestoriaId:      null,
  loading:         true,
  estadoGestoria:  null,
  colorPrimario:   '#D4621A',
  colorSecundario: '#1A1A1A',
  nombreComercial: 'GestorApp',
  slogan:          '',
  logoUrl:         null,
}

const GestoriaContext = createContext<GestoriaContextValue>(CTX_DEFAULT)

// ─── HELPERS INTERNOS ─────────────────────────────────────────────────────────

/** Actualiza o crea un <link> o <meta> en el <head> */
function setHeadTag(
  selector: string,
  attrs:    Record<string, string>,
  content?: string
): void {
  let el = document.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
  if (!el) {
    const tag = selector.startsWith('link') ? 'link' : 'meta'
    el = document.createElement(tag)
    document.head.appendChild(el)
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v))
  if (content !== undefined) el.setAttribute('content', content)
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function GestoriaProvider({ children }: { children: ReactNode }) {
  const { user }   = useAuthStore()
  const [gestoria, setGestoria] = useState<Gestoria | null>(null)
  const [loadedForGestoriaId, setLoadedForGestoriaId] = useState<string | null>(null)

  // gestoriaId viene del perfil del usuario almacenado en Firestore
  const gestoriaId = (user as { gestoriaId?: string | null })?.gestoriaId ?? null

  useEffect(() => {
    if (!gestoriaId) {
      return
    }
    const unsub = subscribeGestoria(gestoriaId, g => {
      setGestoria(g)
      setLoadedForGestoriaId(gestoriaId)
    })
    return () => unsub()
  }, [gestoriaId])

  const loading = Boolean(gestoriaId) && loadedForGestoriaId !== gestoriaId

  // ── Branding dinámico completo ───────────────────────────────────────────
  // Se ejecuta cada vez que la gestoría cambia (incluyendo cambios en tiempo
  // real desde SuperAdminPage o ConfiguracionPage).
  useEffect(() => {
    if (!gestoria?.branding) return
    const { colorPrimario, colorSecundario, nombreComercial, slogan, logoUrl } = gestoria.branding

    // CSS custom properties → todos los componentes se actualizan
    const root = document.documentElement
    root.style.setProperty('--gp-orange', colorPrimario ?? '#D4621A')
    root.style.setProperty('--gp-black',  colorSecundario ?? '#1A1A1A')

    // Título de la pestaña
    document.title = slogan
      ? `${nombreComercial} — ${slogan}`
      : `${nombreComercial} — GestorApp`

    // Favicon dinámico (usa el logo del tenant si existe)
    if (logoUrl) {
      setHeadTag(
        "link[rel='icon']",
        { rel: 'icon', type: 'image/jpeg', href: logoUrl }
      )
      setHeadTag(
        "link[rel='apple-touch-icon']",
        { rel: 'apple-touch-icon', href: logoUrl }
      )
    }

    // Open Graph — apariencia al compartir en WhatsApp / redes
    setHeadTag("meta[property='og:title']",       { property: 'og:title' },       nombreComercial)
    setHeadTag("meta[property='og:description']", { property: 'og:description' }, slogan ?? `${nombreComercial} — Gestoría del Automotor`)
    if (logoUrl) {
      setHeadTag("meta[property='og:image']", { property: 'og:image' }, logoUrl)
    }

    // Meta description para SEO
    setHeadTag(
      "meta[name='description']",
      { name: 'description' },
      slogan ?? `${nombreComercial} — Gestoría del Automotor`
    )

    // Theme color para PWA (barra de estado del móvil)
    setHeadTag("meta[name='theme-color']", { name: 'theme-color' }, colorPrimario ?? '#D4621A')
  }, [gestoria])

  const value: GestoriaContextValue = {
    gestoria,
    gestoriaId,
    loading,
    estadoGestoria:  gestoria?.estado ?? null,
    colorPrimario:   gestoria?.branding?.colorPrimario   ?? '#D4621A',
    colorSecundario: gestoria?.branding?.colorSecundario ?? '#1A1A1A',
    nombreComercial: gestoria?.branding?.nombreComercial ?? 'GestorApp',
    slogan:          gestoria?.branding?.slogan          ?? '',
    logoUrl:         gestoria?.branding?.logoUrl         ?? null,
  }

  return (
    <GestoriaContext.Provider value={value}>
      {children}
    </GestoriaContext.Provider>
  )
}

// ─── HOOKS ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useGestoria() {
  return useContext(GestoriaContext)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGestoriaId(): string {
  const { gestoriaId } = useContext(GestoriaContext)
  return gestoriaId ?? 'default'
}