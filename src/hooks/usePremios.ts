// src/hooks/usePremios.ts — VERSIÓN COMPLETA (reemplaza el archivo entero)
//
// CAMBIO PRINCIPAL: se extrajo toda la lógica de cálculo (que antes vivía
// adentro del queryFn de usePremios) a una función pura `calcularPremios()`,
// reutilizable tanto por usePremios (un asesor — vista personal) como por
// el nuevo usePremiosEquipo (todos los asesores — vista de supervisión del
// propietario/admin_gral). Cero duplicación de la lógica de negocio.

import { useQuery }              from '@tanstack/react-query'
import { getDocs, query, where } from 'firebase/firestore'
import { tramitesCol, usersCol } from '@/lib/firestore/collections'
import { useAuth }               from '@/hooks/useAuth'
import { useGestoria }           from '@/context/GestoriaContext'
import { useConfiguracion }      from '@/hooks/useConfiguracion'
import { periodoDesde }          from '@/lib/firestore/cierresMensuales'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface HitoMultaConfig {
  id:          number
  montoUmbral: number
  premioMonto: number
  descripcion: string
}

export interface PremiosConfig {
  montoPremioAuto:        number
  tramitesPorPremioAuto:  number
  montoPremioMoto:        number
  tramitesPorPremioMoto:  number
  hitosMultas:            HitoMultaConfig[]
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

const TIPOS_CALIFICANTES = ['baja', 'transferencia', 'inscripcion_inicial'] as const

export const HITO_VISUAL: Record<number, { icon: string; color: string; label: string; bgClass: string }> = {
  1: { icon: '🥉', color: '#CD7F32', label: 'Bronce',  bgClass: 'bg-amber-50'  },
  2: { icon: '🥈', color: '#A8A9AD', label: 'Plata',   bgClass: 'bg-slate-100' },
  3: { icon: '🥇', color: '#D97706', label: 'Oro',     bgClass: 'bg-yellow-50' },
  4: { icon: '💎', color: '#818CF8', label: 'Platino', bgClass: 'bg-indigo-50' },
}

export interface CicloTramites {
  tipo:                 'auto' | 'moto'
  tipoLabel:            string
  montoPremio:          number
  tramitesPorCiclo:     number
  tramitesCalificantes: number
  premiosGanados:       number
  premiosPesos:         number
  tramitesEnCiclo:      number
  tramitesFaltan:       number
}

export interface DesgloseMulTa {
  tramiteId:           string
  honorariosGestoria:  number
  montoSUATS:          number
  montoInformePersona: number
  totalCobradoCliente: number
}

export interface PremiosData {
  cfg: PremiosConfig
  cicloAuto: CicloTramites
  cicloMoto: CicloTramites
  tramitesCalificantes:  number
  premiosA_ganados:      number
  premiosA_pesos:        number
  tramitesEnCicloActual: number
  tramitesFaltanProximo: number
  facturacionMultas:      number
  facturacionBrutaMultas: number
  totalSUATS:             number
  totalInformePersona:    number
  desgloseMultas:         DesgloseMulTa[]
  hitosAlcanzados:        number[]
  proximoHito:            HitoMultaConfig | null
  proximoHitoFalta:       number
  premiosB_pesos:         number
  totalTramitesCreados: number
  totalMultasCreadas:   number
}

function esMoto(tramite: any): boolean {
  const tv = (tramite.tipoVehiculo ?? tramite.vehiculoTipo ?? '').toLowerCase()
  return tv.includes('moto') || tv.includes('ciclomotor') || tv.includes('bike') || tv === 'moto'
}

export function resolverConfigPremios(config: any): PremiosConfig {
  const cfgRaw = config?.premiosConfig ?? {}
  return {
    ...PREMIOS_CONFIG_DEFAULT,
    ...cfgRaw,
    montoPremioAuto:       cfgRaw.montoPremioAuto ?? cfgRaw.montoPremioA ?? PREMIOS_CONFIG_DEFAULT.montoPremioAuto,
    montoPremioMoto:       cfgRaw.montoPremioMoto ?? PREMIOS_CONFIG_DEFAULT.montoPremioMoto,
    tramitesPorPremioAuto: cfgRaw.tramitesPorPremioAuto ?? cfgRaw.tramitesPorPremioA ?? PREMIOS_CONFIG_DEFAULT.tramitesPorPremioAuto,
    tramitesPorPremioMoto: cfgRaw.tramitesPorPremioMoto ?? PREMIOS_CONFIG_DEFAULT.tramitesPorPremioMoto,
    hitosMultas:           cfgRaw.hitosMultas ?? PREMIOS_CONFIG_DEFAULT.hitosMultas,
  }
}

// ─── FUNCIÓN PURA — el cálculo en sí, reutilizable ───────────────────────────
// Antes vivía adentro del queryFn de usePremios. Ahora la usan tanto
// usePremios (un asesor) como usePremiosEquipo (todos los asesores).

export async function calcularPremios(
  gestoriaId: string,
  targetUid:  string,
  cfg:        PremiosConfig,
): Promise<PremiosData> {
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

  const tramitesCalificantes  = calificantesAll.length
  const premiosA_ganados      = cicloAuto.premiosGanados + cicloMoto.premiosGanados
  const premiosA_pesos        = cicloAuto.premiosPesos   + cicloMoto.premiosPesos
  const tramitesEnCicloActual = tramitesCalificantes % cfg.tramitesPorPremioAuto
  const tramitesFaltanProximo = cfg.tramitesPorPremioAuto - tramitesEnCicloActual

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
    cfg, cicloAuto, cicloMoto,
    tramitesCalificantes, premiosA_ganados, premiosA_pesos,
    tramitesEnCicloActual, tramitesFaltanProximo,
    facturacionMultas, facturacionBrutaMultas, totalSUATS, totalInformePersona,
    desgloseMultas, hitosAlcanzados, proximoHito,
    proximoHitoFalta: proximoHito ? proximoHito.montoUmbral - facturacionMultas : 0,
    premiosB_pesos, totalTramitesCreados, totalMultasCreadas,
  }
}

// ─── HOOK: UN ASESOR (vista personal — sin cambios de comportamiento) ───────

export function usePremios(uid?: string) {
  const { user }       = useAuth()
  const { gestoriaId } = useGestoria()
  const { config }     = useConfiguracion()
  const targetUid       = uid ?? user?.uid
  const cfg             = resolverConfigPremios(config)

  return useQuery({
    queryKey:  ['premios', gestoriaId, targetUid, cfg, new Date().getFullYear(), new Date().getMonth()],
    enabled:   !!gestoriaId && !!targetUid,
    staleTime: 1000 * 60 * 2,
    queryFn:   () => calcularPremios(gestoriaId!, targetUid!, cfg),
  })
}

// ─── HOOK NUEVO: TODOS LOS ASESORES (vista de supervisión propietario) ──────
// Roles considerados "con premio asignado" — hoy solo asesor_comercial, pero
// queda armado para sumar más roles a futuro sin tocar el resto del sistema.

const ROLES_CON_PREMIO = ['asesor_comercial'] as const

export interface AsesorPremios {
  uid:    string
  nombre: string
  rol:    string
  data:   PremiosData
}

export function usePremiosEquipo() {
  const { gestoriaId } = useGestoria()
  const { config }     = useConfiguracion()
  const cfg            = resolverConfigPremios(config)

  return useQuery({
    queryKey:  ['premios-equipo', gestoriaId, cfg, new Date().getFullYear(), new Date().getMonth()],
    enabled:   !!gestoriaId,
    staleTime: 1000 * 60 * 2,

    queryFn: async (): Promise<AsesorPremios[]> => {
      // 1. Buscar todos los usuarios con rol "con premio asignado", activos
      const snapUsers = await getDocs(query(
        usersCol,
        where('gestoriaId', '==', gestoriaId),
        where('rol', 'in', [...ROLES_CON_PREMIO]),
        where('activo', '==', true),
      ))

      const asesores = snapUsers.docs.map(d => ({ ...d.data(), uid: d.id }))

      // 2. Calcular premios de cada uno en paralelo, reutilizando la misma
      //    función pura que usa la vista personal — cero lógica duplicada.
      const resultados = await Promise.all(
        asesores.map(async (a: any) => ({
          uid:    a.uid,
          nombre: `${a.nombre ?? ''} ${a.apellido ?? ''}`.trim() || a.email || 'Sin nombre',
          rol:    a.rol,
          data:   await calcularPremios(gestoriaId!, a.uid, cfg),
        }))
      )

      // Orden: el que más va a cobrar este mes, primero
      return resultados.sort((a, b) => {
        const totalA = a.data.premiosA_pesos + a.data.premiosB_pesos
        const totalB = b.data.premiosA_pesos + b.data.premiosB_pesos
        return totalB - totalA
      })
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