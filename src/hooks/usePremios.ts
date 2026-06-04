// src/hooks/usePremios.ts
// Premio por trámites (segmentado Moto/Auto) + hitos de facturación de multas
// v2 — JAH-NISSI Digital Studio · GestorApp
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }              from '@tanstack/react-query'
import { getDocs, query, where } from 'firebase/firestore'
import { tramitesCol }           from '@/lib/firestore/collections'
import { useAuth }               from '@/hooks/useAuth'
import { useGestoria }           from '@/context/GestoriaContext'
import { useConfiguracion }      from '@/hooks/useConfiguracion'
import { periodoDesde }          from '@/lib/firestore/cierresMensuales'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface HitoMultaConfig {
  id:          number
  montoUmbral: number   // ARS — umbral de facturación de honorarios
  premioMonto: number   // 0 = pendiente de definir por propietario
  descripcion: string
}

/**
 * Configuración persitida en Firestore → config.premiosConfig
 * Los campos *A son compat v1 (sin segmentación moto/auto).
 */
export interface PremiosConfig {
  montoPremioAuto:        number   // default $50.000
  tramitesPorPremioAuto:  number   // default 3
  montoPremioMoto:        number   // default $30.000
  tramitesPorPremioMoto:  number   // default 3
  hitosMultas:            HitoMultaConfig[]
  // Compat v1
  montoPremioA?:          number
  tramitesPorPremioA?:    number
}

export const PREMIOS_CONFIG_DEFAULT: PremiosConfig = {
  montoPremioAuto:       50_000,
  tramitesPorPremioAuto: 3,
  montoPremioMoto:       30_000,
  tramitesPorPremioMoto: 3,
  hitosMultas: [
    { id: 1, montoUmbral: 10_000_000, premioMonto: 0, descripcion: 'Primer hito — $10M en multas'  },
    { id: 2, montoUmbral: 15_000_000, premioMonto: 0, descripcion: 'Segundo hito — $15M en multas' },
    { id: 3, montoUmbral: 17_000_000, premioMonto: 0, descripcion: 'Tercer hito — $17M en multas'  },
    { id: 4, montoUmbral: 20_000_000, premioMonto: 0, descripcion: 'Hito máximo — $20M en multas'  },
  ],
}

/** Tipos que califican para el ciclo de trámites */
const TIPOS_CALIFICANTES = ['baja', 'transferencia', 'inscripcion_inicial'] as const

/** Metadata visual de cada hito (índices 1-4) */
export const HITO_VISUAL: Record<number, { icon: string; color: string; label: string; bgClass: string }> = {
  1: { icon: '🥉', color: '#CD7F32', label: 'Bronce',  bgClass: 'bg-amber-50'  },
  2: { icon: '🥈', color: '#A8A9AD', label: 'Plata',   bgClass: 'bg-slate-100' },
  3: { icon: '🥇', color: '#D97706', label: 'Oro',     bgClass: 'bg-yellow-50' },
  4: { icon: '💎', color: '#818CF8', label: 'Platino', bgClass: 'bg-indigo-50' },
}

// ─── TIPOS DE SALIDA ──────────────────────────────────────────────────────────

/** Ciclo de premios para un tipo de vehículo */
export interface CicloTramites {
  tipo:                 'auto' | 'moto'
  tipoLabel:            string
  montoPremio:          number
  tramitesPorCiclo:     number
  tramitesCalificantes: number   // pagados en el período
  premiosGanados:       number
  premiosPesos:         number
  tramitesEnCiclo:      number   // posición dentro del ciclo actual
  tramitesFaltan:       number
}

/**
 * Desglose financiero de un trámite de multa.
 * REGLA: solo honorariosGestoria cuenta para premios de facturación.
 */
export interface DesgloseMulTa {
  tramiteId:           string
  honorariosGestoria:  number   // ← cuenta para premios
  montoSUATS:          number   // ← NO cuenta
  montoInformePersona: number   // ← NO cuenta
  totalCobradoCliente: number
}

export interface PremiosData {
  cfg: PremiosConfig

  // Premio A — por tipo de vehículo
  cicloAuto: CicloTramites
  cicloMoto: CicloTramites

  // Compat v1 — campos planos para componentes que usen la API anterior
  tramitesCalificantes:  number
  premiosA_ganados:      number
  premiosA_pesos:        number
  tramitesEnCicloActual: number
  tramitesFaltanProximo: number

  // Premio B — facturación de honorarios de multas
  facturacionMultas:      number   // solo honorarios → para premios
  facturacionBrutaMultas: number   // total cobrado → informativo
  totalSUATS:             number
  totalInformePersona:    number
  desgloseMultas:         DesgloseMulTa[]
  hitosAlcanzados:        number[]
  proximoHito:            HitoMultaConfig | null
  proximoHitoFalta:       number
  premiosB_pesos:         number

  // Totales del período
  totalTramitesCreados: number
  totalMultasCreadas:   number
}

// ─── HELPER: ¿es moto? ───────────────────────────────────────────────────────

function esMoto(tramite: any): boolean {
  const tv = (tramite.tipoVehiculo ?? tramite.vehiculoTipo ?? '').toLowerCase()
  return tv.includes('moto') || tv.includes('ciclomotor') || tv.includes('bike') || tv === 'moto'
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function usePremios(uid?: string) {
  const { user }       = useAuth()
  const { gestoriaId } = useGestoria()
  const { config }     = useConfiguracion()

  const targetUid = uid ?? user?.uid

  // Resolver config con compat v1 y fallback a defaults
  const cfgRaw = (config as any).premiosConfig ?? {}
  const cfg: PremiosConfig = {
    ...PREMIOS_CONFIG_DEFAULT,
    ...cfgRaw,
    montoPremioAuto:       cfgRaw.montoPremioAuto ?? cfgRaw.montoPremioA ?? PREMIOS_CONFIG_DEFAULT.montoPremioAuto,
    montoPremioMoto:       cfgRaw.montoPremioMoto ?? PREMIOS_CONFIG_DEFAULT.montoPremioMoto,
    tramitesPorPremioAuto: cfgRaw.tramitesPorPremioAuto ?? cfgRaw.tramitesPorPremioA ?? PREMIOS_CONFIG_DEFAULT.tramitesPorPremioAuto,
    tramitesPorPremioMoto: cfgRaw.tramitesPorPremioMoto ?? PREMIOS_CONFIG_DEFAULT.tramitesPorPremioMoto,
    hitosMultas:           cfgRaw.hitosMultas ?? PREMIOS_CONFIG_DEFAULT.hitosMultas,
  }

  return useQuery({
    queryKey:  ['premios', gestoriaId, targetUid, cfg, new Date().getFullYear(), new Date().getMonth()],
    enabled:   !!gestoriaId && !!targetUid,
    staleTime: 1000 * 60 * 2,

    queryFn: async (): Promise<PremiosData> => {
      const hoy             = new Date()
      const { inicio, fin } = periodoDesde(hoy.getFullYear(), hoy.getMonth())

      const snap = await getDocs(query(
        tramitesCol,
        where('gestoriaId', '==', gestoriaId),
        where('creadoPor',  '==', targetUid),
      ))

      const todos = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(t => {
          const f = (t as any).creadoEn?.toDate?.()
          return f && f >= inicio && f <= fin
        })

      const totalTramitesCreados = todos.length

      // ── Premio A ─────────────────────────────────────────────────────────
      const calificantesAll = todos.filter(
        t => TIPOS_CALIFICANTES.includes(t.tipo as any) && t.pagado === true
      )
      const tramitesAutoArr = calificantesAll.filter(t => !esMoto(t))
      const tramitesMotoArr = calificantesAll.filter(t =>  esMoto(t))

      const buildCiclo = (
        arr: typeof calificantesAll,
        tipo: 'auto' | 'moto',
        montoPremio: number,
        tramitesPorCiclo: number,
      ): CicloTramites => {
        const calificantes   = arr.length
        const premiosGanados = Math.floor(calificantes / tramitesPorCiclo)
        const enCiclo        = calificantes % tramitesPorCiclo
        return {
          tipo,
          tipoLabel:            tipo === 'auto' ? 'Automóviles / Camiones' : 'Motos / Ciclomotores',
          montoPremio,
          tramitesPorCiclo,
          tramitesCalificantes: calificantes,
          premiosGanados,
          premiosPesos:         premiosGanados * montoPremio,
          tramitesEnCiclo:      enCiclo,
          tramitesFaltan:       tramitesPorCiclo - enCiclo,
        }
      }

      const cicloAuto = buildCiclo(tramitesAutoArr, 'auto', cfg.montoPremioAuto, cfg.tramitesPorPremioAuto)
      const cicloMoto = buildCiclo(tramitesMotoArr, 'moto', cfg.montoPremioMoto, cfg.tramitesPorPremioMoto)

      // Compat v1
      const tramitesCalificantes  = calificantesAll.length
      const premiosA_ganados      = cicloAuto.premiosGanados + cicloMoto.premiosGanados
      const premiosA_pesos        = cicloAuto.premiosPesos   + cicloMoto.premiosPesos
      const tramitesEnCicloActual = tramitesCalificantes % cfg.tramitesPorPremioAuto
      const tramitesFaltanProximo = cfg.tramitesPorPremioAuto - tramitesEnCicloActual

      // ── Premio B ─────────────────────────────────────────────────────────
      // REGLA: costosSUATS y costosInformePersona son gastos del trámite repercutidos
      // al cliente. No son honorarios de gestoría → no cuentan para premios de facturación.
      const multas = todos.filter(t => t.tipo === 'descargo_multa' && t.estado !== 'cancelado')
      const totalMultasCreadas = multas.length

      const desgloseMultas: DesgloseMulTa[] = multas.map(t => {
        const totalCobrado = (t as any).totalCobradoCliente ?? t.honorarios ?? 0
        const suats        = (t as any).costosSUATS ?? 0
        const informe      = (t as any).costosInformePersona ?? 0
        return {
          tramiteId:           t.id,
          honorariosGestoria:  Math.max(0, totalCobrado - suats - informe),
          montoSUATS:          suats,
          montoInformePersona: informe,
          totalCobradoCliente: totalCobrado,
        }
      })

      const facturacionMultas      = desgloseMultas.reduce((s, d) => s + d.honorariosGestoria,  0)
      const facturacionBrutaMultas = desgloseMultas.reduce((s, d) => s + d.totalCobradoCliente, 0)
      const totalSUATS             = desgloseMultas.reduce((s, d) => s + d.montoSUATS,          0)
      const totalInformePersona    = desgloseMultas.reduce((s, d) => s + d.montoInformePersona, 0)

      const hitosOrdenados  = [...cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
      const hitosAlcanzados = hitosOrdenados.filter(h => facturacionMultas >= h.montoUmbral).map(h => h.id)
      const proximoHito     = hitosOrdenados.find(h => facturacionMultas < h.montoUmbral) ?? null
      const premiosB_pesos  = hitosOrdenados
        .filter(h => hitosAlcanzados.includes(h.id) && h.premioMonto > 0)
        .reduce((s, h) => s + h.premioMonto, 0)

      return {
        cfg,
        cicloAuto,
        cicloMoto,
        tramitesCalificantes,
        premiosA_ganados,
        premiosA_pesos,
        tramitesEnCicloActual,
        tramitesFaltanProximo,
        facturacionMultas,
        facturacionBrutaMultas,
        totalSUATS,
        totalInformePersona,
        desgloseMultas,
        hitosAlcanzados,
        proximoHito,
        proximoHitoFalta: proximoHito ? proximoHito.montoUmbral - facturacionMultas : 0,
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