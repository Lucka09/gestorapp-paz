// src/hooks/useReferidosMetricas.ts
// ─── MÉTRICAS DE CANALES COMERCIALES ──────────────────────────────────────────
// Calcula KPIs por concesionaria / agencia / reventa / encargado de multas
// a partir de los campos origenCanal + origenNombre agregados en M4.
//
// Sin nueva colección Firestore — todo se calcula desde clientes + tramites.
// Suscripción reactiva usando los hooks existentes.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useClientes }  from '@/hooks/useClientes'
import { useTramites }  from '@/hooks/useTramites'
import type { OrigenCanal } from '@/types'
import { ORIGEN_CANAL_LABELS, ORIGEN_COMERCIAL } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface MetricaReferente {
  // Identificación
  canal:       OrigenCanal
  canalLabel:  string
  nombre:      string          // nombre de la entidad (ej: "AutoMax San Martín")

  // Volumen
  totalClientes:   number      // clientes traídos
  clientesActivos: number      // con al menos 1 trámite activo
  totalTramites:   number      // trámites generados por sus clientes
  tramitesActivos: number      // en estado no terminal
  tramitesCompletados: number  // entregados/completados

  // Financiero
  ingresosGenerados:   number  // honorarios cobrados (pagado=true) de sus clientes
  facturacionTotal:    number  // honorarios totales facturados (cobrado o no)
  ticketPromedio:      number  // ingresosGenerados / tramitesCompletados

  // Temporal
  primerCliente:  Date | null  // fecha del primer cliente traído
  ultimaActividad: Date | null // fecha del trámite más reciente

  // Ratio
  pctConversion:  number       // tramitesCompletados / totalTramites * 100
  pctCobro:       number       // ingresosGenerados / facturacionTotal * 100
}

export interface MetricaCanal {
  canal:       OrigenCanal
  canalLabel:  string
  referentes:  MetricaReferente[]
  // Totales del canal
  totalClientes:  number
  totalTramites:  number
  ingresosTotal:  number
}

export interface ReferidosMetricas {
  canales:          MetricaCanal[]
  referentes:       MetricaReferente[]   // lista plana ordenada por ingresos
  totales: {
    clientes:  number
    tramites:  number
    ingresos:  number
  }
  loading: boolean
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useReferidosMetricas(): ReferidosMetricas {
  const { clientes, loading: loadC } = useClientes()
  const { tramites, loading: loadT } = useTramites()

  const loading = loadC || loadT

  const referentes = useMemo<MetricaReferente[]>(() => {
    // Solo clientes con origenCanal comercial definido
    const comerciales = clientes.filter(c => {
      const canal = (c as any).origenCanal as OrigenCanal | undefined
      return canal && ORIGEN_COMERCIAL.includes(canal)
    })

    if (!comerciales.length) return []

    // Agrupar por canal + nombre
    const mapa = new Map<string, MetricaReferente>()

    comerciales.forEach(cliente => {
      const canal  = (cliente as any).origenCanal as OrigenCanal
      const nombre = ((cliente as any).origenNombre as string | undefined)?.trim() || 'Sin nombre'
      const key    = `${canal}::${nombre.toLowerCase()}`

      if (!mapa.has(key)) {
        mapa.set(key, {
          canal,
          canalLabel:  ORIGEN_CANAL_LABELS[canal],
          nombre,
          totalClientes:       0,
          clientesActivos:     0,
          totalTramites:       0,
          tramitesActivos:     0,
          tramitesCompletados: 0,
          ingresosGenerados:   0,
          facturacionTotal:    0,
          ticketPromedio:      0,
          primerCliente:       null,
          ultimaActividad:     null,
          pctConversion:       0,
          pctCobro:            0,
        })
      }

      const m = mapa.get(key)!
      m.totalClientes++

      // Fecha del primer cliente
      const fechaCli = (cliente as any).creadoEn?.toDate?.() as Date | undefined
      if (fechaCli) {
        if (!m.primerCliente || fechaCli < m.primerCliente) m.primerCliente = fechaCli
      }

      // Trámites de este cliente
      const tramitesCliente = tramites.filter(t => t.clienteId === cliente.id)
      const ESTADOS_FINALES = ['entregado', 'completado', 'cancelado']
      const ESTADOS_ACTIVOS  = ['pendiente', 'en_proceso', 'documentacion_requerida', 'en_organismo', 'listo_para_retirar']

      m.totalTramites       += tramitesCliente.length
      m.tramitesActivos     += tramitesCliente.filter(t => ESTADOS_ACTIVOS.includes(t.estado)).length
      m.tramitesCompletados += tramitesCliente.filter(t => ['entregado','completado'].includes(t.estado)).length

      const cobrados = tramitesCliente.filter(t => t.pagado === true)
      m.ingresosGenerados += cobrados.reduce((s, t) => s + (t.honorarios ?? 0), 0)
      m.facturacionTotal  += tramitesCliente.reduce((s, t) => s + (t.honorarios ?? 0), 0)

      if (tramitesCliente.length > 0) m.clientesActivos++

      // Última actividad (trámite más reciente)
      tramitesCliente.forEach(t => {
        const fecha = (t.actualizadoEn ?? t.creadoEn)?.toDate?.() as Date | undefined
        if (fecha && (!m.ultimaActividad || fecha > m.ultimaActividad)) {
          m.ultimaActividad = fecha
        }
      })
    })

    // Calcular ratios derivados
    mapa.forEach(m => {
      m.ticketPromedio = m.tramitesCompletados > 0
        ? Math.round(m.ingresosGenerados / m.tramitesCompletados)
        : 0
      m.pctConversion = m.totalTramites > 0
        ? Math.round((m.tramitesCompletados / m.totalTramites) * 100)
        : 0
      m.pctCobro = m.facturacionTotal > 0
        ? Math.round((m.ingresosGenerados / m.facturacionTotal) * 100)
        : 0
    })

    // Ordenar por ingresos generados descendente
    return Array.from(mapa.values()).sort((a, b) => b.ingresosGenerados - a.ingresosGenerados)
  }, [clientes, tramites])

  // Agrupar por canal
  const canales = useMemo<MetricaCanal[]>(() => {
    const canalMap = new Map<OrigenCanal, MetricaCanal>()

    ORIGEN_COMERCIAL.forEach(canal => {
      canalMap.set(canal, {
        canal,
        canalLabel:    ORIGEN_CANAL_LABELS[canal],
        referentes:    [],
        totalClientes: 0,
        totalTramites: 0,
        ingresosTotal: 0,
      })
    })

    referentes.forEach(r => {
      const c = canalMap.get(r.canal)
      if (!c) return
      c.referentes.push(r)
      c.totalClientes  += r.totalClientes
      c.totalTramites  += r.totalTramites
      c.ingresosTotal  += r.ingresosGenerados
    })

    // Solo canales con al menos 1 referente
    return Array.from(canalMap.values())
      .filter(c => c.referentes.length > 0)
      .sort((a, b) => b.ingresosTotal - a.ingresosTotal)
  }, [referentes])

  // Totales globales
  const totales = useMemo(() => ({
    clientes: referentes.reduce((s, r) => s + r.totalClientes,     0),
    tramites: referentes.reduce((s, r) => s + r.totalTramites,     0),
    ingresos: referentes.reduce((s, r) => s + r.ingresosGenerados, 0),
  }), [referentes])

  return { canales, referentes, totales, loading }
}