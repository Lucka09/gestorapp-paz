import { getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore'
import { tramitesCol, turnosCol, clientesCol } from './collections'
import type { Tramite, Cliente } from '@/types'
import { TIPO_TRAMITE_LABELS } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface PuntoTendencia {
  mes:             string     // 'Ene 25'
  fecha:           Date
  ingresos:        number
  tramites:        number
  cobrados:        number
  nuevosClientes:  number
  tasaCierre:      number     // 0–100%
  ticketPromedio:  number
}

export interface ComparativaPeriodo {
  actual:    number
  anterior:  number
  variacion: number           // % variación (puede ser negativo)
  tendencia: 'up' | 'down' | 'equal'
}

export interface ProyeccionMes {
  mes:       string
  proyeccion: number
  confianza:  'alta' | 'media' | 'baja'
}

export interface AnalisisTiempo {
  tipo:           string
  label:          string
  promediosDias:  number      // promedio días en resolver
  min:            number
  max:            number
  cantidad:       number
}

export interface EmbudioConversion {
  etapa:     string
  cantidad:  number
  pct:       number
  color:     string
}

export interface RetenciónDatos {
  nuevos:      number         // clientes que hicieron su primer trámite
  recurrentes: number         // clientes con más de 1 trámite
  perdidos:    number         // clientes sin actividad en 90 días
}

export interface DatosAnalytics {
  tendencia:         PuntoTendencia[]
  comparativa:       Record<string, ComparativaPeriodo>
  proyeccion:        ProyeccionMes[]
  tiempoResolucion:  AnalisisTiempo[]
  embudio:           EmbudioConversion[]
  retencion:         RetenciónDatos
  topDiaSemana:      { dia: string; cantidad: number }[]
  topHoraTurno:      { hora: string; cantidad: number }[]
  distribucionTicket: { rango: string; cantidad: number }[]
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_SEM    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function mesLabel(d: Date) {
  return `${MESES_CORTO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

function diasEntre(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000*60*60*24)))
}

function regresionLineal(puntos: number[]): number {
  const n = puntos.length
  if (n < 2) return puntos[0] ?? 0
  const sumX  = puntos.reduce((a,_,i) => a + i, 0)
  const sumY  = puntos.reduce((a,v) => a + v, 0)
  const sumXY = puntos.reduce((a,v,i) => a + i*v, 0)
  const sumX2 = puntos.reduce((a,_,i) => a + i*i, 0)
  const m = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX)
  const b = (sumY - m*sumX) / n
  return Math.max(0, Math.round(m*n + b))
}

// ─── MOTOR PRINCIPAL ──────────────────────────────────────────────────────────

export async function calcularAnalytics(meses = 12): Promise<DatosAnalytics> {
  const ahora  = new Date()
  const limite = new Date(ahora)
  limite.setMonth(limite.getMonth() - meses)

  // Cargar todos los datos
  const [snapT, snapC, snapTurnos] = await Promise.all([
    getDocs(query(tramitesCol, orderBy('creadoEn', 'desc'))),
    getDocs(clientesCol),
    getDocs(query(turnosCol,   orderBy('fecha', 'desc'))),
  ])

  const tramites = snapT.docs.map(d => ({ ...d.data(), id: d.id })) as Tramite[]
  const clientes = snapC.docs.map(d => ({ ...d.data(), id: d.id })) as Cliente[]
  const turnos   = snapTurnos.docs.map(d => d.data()) as any[]

  // ── 1. TENDENCIA MENSUAL ──────────────────────────────────────────────────

  const tendencia: PuntoTendencia[] = []
  const clientesPrevios = new Set<string>()

  for (let i = meses - 1; i >= 0; i--) {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const fin    = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59)

    const delMes = tramites.filter(t => {
      const d = t.creadoEn?.toDate?.()
      return d && d >= inicio && d <= fin
    })
    const cobradosMes = tramites.filter(t => {
      const d = t.fechaPago?.toDate?.()
      return t.pagado && d && d >= inicio && d <= fin
    })
    const entregadosMes = delMes.filter(t => t.estado === 'entregado')
    const ingresosMes   = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
    const ticketProm    = cobradosMes.length > 0 ? Math.round(ingresosMes / cobradosMes.length) : 0
    const tasaCierre    = delMes.length > 0
      ? Math.round((entregadosMes.length / delMes.length) * 100) : 0

    // Clientes nuevos en ese mes (primer trámite)
    let nuevos = 0
    delMes.forEach(t => {
      if (!clientesPrevios.has(t.clienteId)) { nuevos++; clientesPrevios.add(t.clienteId) }
    })

    tendencia.push({
      mes:            mesLabel(inicio),
      fecha:          inicio,
      ingresos:       ingresosMes,
      tramites:       delMes.length,
      cobrados:       cobradosMes.length,
      nuevosClientes: nuevos,
      tasaCierre,
      ticketPromedio: ticketProm,
    })
  }

  // ── 2. COMPARATIVA MES ACTUAL vs ANTERIOR ─────────────────────────────────

  const actual   = tendencia[tendencia.length - 1]
  const anterior = tendencia[tendencia.length - 2]

  const comp = (a: number, b: number): ComparativaPeriodo => {
    const variacion = b > 0 ? Math.round(((a - b) / b) * 100) : 0
    return {
      actual: a, anterior: b, variacion,
      tendencia: variacion > 0 ? 'up' : variacion < 0 ? 'down' : 'equal',
    }
  }

  const comparativa: Record<string, ComparativaPeriodo> = {
    ingresos:       comp(actual?.ingresos       ?? 0, anterior?.ingresos       ?? 0),
    tramites:       comp(actual?.tramites        ?? 0, anterior?.tramites        ?? 0),
    tasaCierre:     comp(actual?.tasaCierre      ?? 0, anterior?.tasaCierre      ?? 0),
    ticketPromedio: comp(actual?.ticketPromedio  ?? 0, anterior?.ticketPromedio  ?? 0),
  }

  // ── 3. PROYECCIÓN PRÓXIMOS 3 MESES ────────────────────────────────────────

  const ingresosHistorico = tendencia.slice(-6).map(t => t.ingresos)
  const tramitesHistorico = tendencia.slice(-6).map(t => t.tramites)
  const proyeccion: ProyeccionMes[] = []

  for (let i = 1; i <= 3; i++) {
    const fechaProy = new Date(ahora.getFullYear(), ahora.getMonth() + i, 1)
    const proyIngr  = regresionLineal([...ingresosHistorico, regresionLineal(ingresosHistorico)])
    const varianza  = ingresosHistorico.length >= 3
      ? Math.sqrt(ingresosHistorico.reduce((a, v) => a + Math.pow(v - (ingresosHistorico.reduce((s,x)=>s+x,0)/ingresosHistorico.length), 2), 0) / ingresosHistorico.length) / (ingresosHistorico.reduce((s,x)=>s+x,0)/ingresosHistorico.length || 1)
      : 1
    proyeccion.push({
      mes:        mesLabel(fechaProy),
      proyeccion: Math.round(proyIngr * (1 + (Math.random() * 0.1 - 0.05))),
      confianza:  varianza < 0.2 ? 'alta' : varianza < 0.4 ? 'media' : 'baja',
    })
  }

  // ── 4. TIEMPO PROMEDIO DE RESOLUCIÓN POR TIPO ─────────────────────────────

  const tiemposPorTipo: Record<string, number[]> = {}
  tramites.forEach(t => {
    if (t.estado !== 'entregado') return
    const inicio = t.creadoEn?.toDate?.()
    const fin    = t.actualizadoEn?.toDate?.()
    if (!inicio || !fin) return
    const dias = diasEntre(inicio, fin)
    if (dias > 365) return  // ignorar outliers extremos
    if (!tiemposPorTipo[t.tipo]) tiemposPorTipo[t.tipo] = []
    tiemposPorTipo[t.tipo].push(dias)
  })

  const tiempoResolucion: AnalisisTiempo[] = Object.entries(tiemposPorTipo)
    .map(([tipo, dias]) => ({
      tipo,
      label:         (TIPO_TRAMITE_LABELS as Record<string,string>)[tipo] ?? tipo,
      promediosDias: Math.round(dias.reduce((a,v)=>a+v,0) / dias.length),
      min:           Math.min(...dias),
      max:           Math.max(...dias),
      cantidad:      dias.length,
    }))
    .filter(t => t.cantidad >= 1)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8)

  // ── 5. EMBUDO DE CONVERSIÓN ───────────────────────────────────────────────

  const total         = tramites.length
  const enProceso     = tramites.filter(t => t.estado !== 'cancelado').length
  const enOrganismo   = tramites.filter(t => ['en_organismo','listo_para_retirar','entregado'].includes(t.estado)).length
  const entregados    = tramites.filter(t => t.estado === 'entregado').length

  const embudio: EmbudioConversion[] = total > 0 ? [
    { etapa: 'Ingresados',    cantidad: total,       pct: 100, color: '#374151' },
    { etapa: 'En proceso',    cantidad: enProceso,   pct: Math.round((enProceso/total)*100),   color: '#3B82F6' },
    { etapa: 'En organismo',  cantidad: enOrganismo, pct: Math.round((enOrganismo/total)*100), color: '#F97316' },
    { etapa: 'Entregados',    cantidad: entregados,  pct: Math.round((entregados/total)*100),  color: '#22C55E' },
  ] : []

  // ── 6. RETENCIÓN DE CLIENTES ─────────────────────────────────────────────

  const tramitesPorCliente: Record<string, number> = {}
  tramites.forEach(t => {
    tramitesPorCliente[t.clienteId] = (tramitesPorCliente[t.clienteId] ?? 0) + 1
  })

  const hace90 = new Date(ahora); hace90.setDate(hace90.getDate() - 90)
  const clientesConActividad = new Set(
    tramites.filter(t => {
      const d = t.creadoEn?.toDate?.()
      return d && d >= hace90
    }).map(t => t.clienteId)
  )

  const retencion: RetenciónDatos = {
    nuevos:      Object.values(tramitesPorCliente).filter(n => n === 1).length,
    recurrentes: Object.values(tramitesPorCliente).filter(n => n > 1).length,
    perdidos:    clientes.filter(c => !clientesConActividad.has(c.id)).length,
  }

  // ── 7. TOP DÍA DE LA SEMANA ───────────────────────────────────────────────

  const conteosDia: Record<number, number> = {}
  turnos.forEach(t => {
    const d = t.fecha?.toDate?.()
    if (!d) return
    const dia = d.getDay()
    conteosDia[dia] = (conteosDia[dia] ?? 0) + 1
  })

  const topDiaSemana = DIAS_SEM.map((dia, i) => ({
    dia, cantidad: conteosDia[i] ?? 0,
  }))

  // ── 8. TOP HORA DE TURNOS ─────────────────────────────────────────────────

  const conteosHora: Record<string, number> = {}
  turnos.forEach(t => {
    const h = t.horaInicio
    if (!h) return
    conteosHora[h] = (conteosHora[h] ?? 0) + 1
  })

  const topHoraTurno = Object.entries(conteosHora)
    .map(([hora, cantidad]) => ({ hora, cantidad }))
    .sort((a, b) => a.hora.localeCompare(b.hora))

  // ── 9. DISTRIBUCIÓN POR TICKET ────────────────────────────────────────────

  const rangos = [
    { label: '$0–10k',   min: 0,      max: 10000  },
    { label: '$10–25k',  min: 10000,  max: 25000  },
    { label: '$25–50k',  min: 25000,  max: 50000  },
    { label: '$50–100k', min: 50000,  max: 100000 },
    { label: '$100k+',   min: 100000, max: Infinity },
  ]

  const distribucionTicket = rangos.map(r => ({
    rango:    r.label,
    cantidad: tramites.filter(t =>
      t.pagado && t.honorarios >= r.min && t.honorarios < r.max
    ).length,
  }))

  return {
    tendencia, comparativa, proyeccion,
    tiempoResolucion, embudio, retencion,
    topDiaSemana, topHoraTurno, distribucionTicket,
  }
}
