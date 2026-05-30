// src/hooks/usePremios.ts
// Calcula premios y objetivos del Asesor Comercial en tiempo real
// Los montos de premio son configurables por el propietario en ConfiguracionPage
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }   from '@tanstack/react-query'
import { getDocs, query, where, Timestamp } from 'firebase/firestore'
import { tramitesCol }           from '@/lib/firestore/collections'
import { useAuth }               from '@/hooks/useAuth'
import { useGestoria }           from '@/context/GestoriaContext'
import { useConfiguracion }      from '@/hooks/useConfiguracion'
import { periodoDesde }          from '@/lib/firestore/cierresMensuales'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface HitoMultaConfig {
  id:           number
  montoUmbral:  number   // umbral de facturación para activar el premio
  premioMonto:  number   // monto del premio en pesos (0 = "por definir")
  descripcion:  string   // etiqueta libre
}

/** Estructura completa de configuración de premios, tal como se guarda en Firestore */
export interface PremiosConfig {
  montoPremioA:       number           // pesos por grupo de 3 trámites
  tramitesPorPremioA: number           // cuántos trámites por premio
  hitosMultas:        HitoMultaConfig[]
}

/** Valores por defecto cuando el propietario aún no configuró nada */
export const PREMIOS_CONFIG_DEFAULT: PremiosConfig = {
  montoPremioA:       50_000,
  tramitesPorPremioA: 3,
  hitosMultas: [
    { id: 1, montoUmbral: 10_000_000, premioMonto: 0, descripcion: 'Primer hito — $10M en multas' },
    { id: 2, montoUmbral: 15_000_000, premioMonto: 0, descripcion: 'Segundo hito — $15M en multas' },
    { id: 3, montoUmbral: 17_000_000, premioMonto: 0, descripcion: 'Tercer hito — $17M en multas' },
    { id: 4, montoUmbral: 20_000_000, premioMonto: 0, descripcion: 'Hito máximo — $20M en multas' },
  ],
}

/** Íconos y colores fijos por índice de hito */
export const HITO_VISUAL: Record<number, { icon: string; color: string; label: string; bgClass: string }> = {
  1: { icon: '🥉', color: '#CD7F32', label: 'Bronce',  bgClass: 'bg-amber-900/20'  },
  2: { icon: '🥈', color: '#A8A9AD', label: 'Plata',   bgClass: 'bg-slate-700/30'  },
  3: { icon: '🥇', color: '#FFD700', label: 'Oro',     bgClass: 'bg-yellow-900/20' },
  4: { icon: '💎', color: '#818CF8', label: 'Platino', bgClass: 'bg-indigo-900/20' },
}

// ─── TIPOS DE SALIDA ──────────────────────────────────────────────────────────

export interface PremiosData {
  // Configuración activa (puede cambiar en cualquier momento)
  cfg: PremiosConfig

  // Premio A — por trámites (baja + transferencia) completados y pagados
  tramitesCalificantes:  number   // total de bajas+transferencias pagadas
  premiosA_ganados:      number   // floor(tramitesCalificantes / tramitesPorPremioA)
  premiosA_pesos:        number   // premiosA_ganados × montoPremioA
  tramitesEnCicloActual: number   // tramitesCalificantes % tramitesPorPremioA
  tramitesFaltanProximo: number   // cuántos faltan para el próximo premio

  // Premio B — por facturación acumulada en multas tramitadas
  facturacionMultas:     number
  hitosAlcanzados:       number[]  // ids de HitoMultaConfig superados
  proximoHito:           HitoMultaConfig | null
  proximoHitoFalta:      number    // cuánto falta (en $) para el próximo umbral

  // Acumulado de premios B ganados (suma de premioMonto de hitos alcanzados)
  premiosB_pesos:        number

  // Totales
  totalTramitesCreados:  number
  totalMultasCreadas:    number
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

/**
 * Calcula los premios del asesor identificado por `uid`.
 * Si `uid` no se provee, usa el usuario autenticado.
 */
export function usePremios(uid?: string) {
  const { user }       = useAuth()
  const { gestoriaId } = useGestoria()
  const { config }     = useConfiguracion()

  const targetUid = uid ?? user?.uid

  // Resolver la configuración de premios — con fallback a los defaults
  const cfg: PremiosConfig = {
    ...PREMIOS_CONFIG_DEFAULT,
    ...(config as any).premiosConfig,
    hitosMultas: ((config as any).premiosConfig?.hitosMultas ?? PREMIOS_CONFIG_DEFAULT.hitosMultas),
  }

  return useQuery({
    queryKey: ['premios', gestoriaId, targetUid, cfg,
              new Date().getFullYear(), new Date().getMonth()],
    enabled:  !!gestoriaId && !!targetUid,
    staleTime: 1000 * 60 * 2,   // 2 min

    queryFn: async (): Promise<PremiosData> => {
      // ── Período activo: mes calendario corriente ──────────────────────────
      // Al cerrar un mes (M6), usePremios parte en 0 para el período nuevo.
      // Los datos históricos quedan en cierresMensuales (accesibles en Reportes).
      const hoy             = new Date()
      const { inicio, fin } = periodoDesde(hoy.getFullYear(), hoy.getMonth())

      // ── Consulta única: todos los trámites del asesor ─────────────────────
      const snap = await getDocs(query(
        tramitesCol,
        where('gestoriaId', '==', gestoriaId),
        where('creadoPor',  '==', targetUid),
      ))
      // Filtrar al período activo (mes corriente) para el cálculo de premios
      const todos = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(t => {
          const f = (t as any).creadoEn?.toDate?.()
          return f && f >= inicio && f <= fin
        })

      const totalTramitesCreados = todos.length

      // ── Premio A: bajas y transferencias marcadas como pagadas ────────────
      const tramitesA = todos.filter(
        t => ['baja', 'transferencia'].includes(t.tipo) && t.pagado === true
      )
      const tramitesCalificantes  = tramitesA.length
      const { tramitesPorPremioA, montoPremioA } = cfg
      const premiosA_ganados      = Math.floor(tramitesCalificantes / tramitesPorPremioA)
      const premiosA_pesos        = premiosA_ganados * montoPremioA
      const tramitesEnCicloActual = tramitesCalificantes % tramitesPorPremioA
      const tramitesFaltanProximo = tramitesPorPremioA - tramitesEnCicloActual

      // ── Premio B: facturación de multas (todas no canceladas) ─────────────
      const multas            = todos.filter(t => t.tipo === 'descargo_multa' && t.estado !== 'cancelado')
      const totalMultasCreadas = multas.length
      const facturacionMultas  = multas.reduce((s, t) => s + (t.honorarios ?? 0), 0)

      const hitosOrdenados    = [...cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
      const hitosAlcanzados   = hitosOrdenados.filter(h => facturacionMultas >= h.montoUmbral).map(h => h.id)
      const proximoHito       = hitosOrdenados.find(h => facturacionMultas < h.montoUmbral) ?? null
      const proximoHitoFalta  = proximoHito ? proximoHito.montoUmbral - facturacionMultas : 0

      // Suma de premios B confirmados (solo hitos con premioMonto > 0)
      const premiosB_pesos    = hitosOrdenados
        .filter(h => hitosAlcanzados.includes(h.id) && h.premioMonto > 0)
        .reduce((s, h) => s + h.premioMonto, 0)

      return {
        cfg,
        tramitesCalificantes,
        premiosA_ganados,
        premiosA_pesos,
        tramitesEnCicloActual,
        tramitesFaltanProximo,
        facturacionMultas,
        hitosAlcanzados,
        proximoHito,
        proximoHitoFalta,
        premiosB_pesos,
        totalTramitesCreados,
        totalMultasCreadas,
      }
    },
  })
}

// ─── HELPERS DE FORMATO ───────────────────────────────────────────────────────

export function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

export function formatPesosCompacto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return formatPesos(n)
}