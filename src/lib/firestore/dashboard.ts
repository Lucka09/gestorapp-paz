import {
  query, where, orderBy, limit,
  getDocs, Timestamp, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { tramitesCol, turnosCol, clientesCol, vehiculosCol } from './collections'
import type { Tramite, Turno, Cliente } from '@/types'

// ─── MÉTRICAS GENERALES ───────────────────────────────────────────────────────

export interface MetricasDashboard {
  tramitesHoy:       number
  tramitesPendientes: number
  tramitesActivos:   number
  turnosHoy:         number
  turnosProximos:    number
  sinPagar:          number
  totalClientes:     number
  totalVehiculos:    number
  ingresosMes:       number
  ingresosHoy:       number
}

export function subscribeMetricas(
  callback: (m: MetricasDashboard) => void
): Unsubscribe {
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0)
  const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59, 999)
  const mesInicio = new Date(); mesInicio.setDate(1); mesInicio.setHours(0,0,0,0)

  // Suscripción principal a trámites
  return onSnapshot(
    query(tramitesCol, orderBy('creadoEn', 'desc')),
    async (snapTramites) => {
      const tramites = snapTramites.docs.map(d => ({ ...d.data(), id: d.id })) as Tramite[]

      const [snapTurnos, snapClientes, snapVehiculos] = await Promise.all([
        getDocs(query(turnosCol, orderBy('fecha', 'desc'))),
        getDocs(clientesCol),
        getDocs(vehiculosCol),
      ])
      const turnos   = snapTurnos.docs.map(d => ({ ...d.data(), id: d.id })) as Turno[]
      const clientes = snapClientes.size
      const vehiculos = snapVehiculos.size

      // Trámites de hoy
      const tramitesHoy = tramites.filter(t => {
        const d = t.creadoEn?.toDate?.()
        return d && d >= hoyInicio && d <= hoyFin
      }).length

      // Estados activos
      const estadosActivos = ['pendiente', 'en_proceso', 'documentacion_requerida', 'en_organismo']
      const tramitesPendientes = tramites.filter(t => (t.estado as string) === 'pendiente').length
      const tramitesActivos    = tramites.filter(t => estadosActivos.includes(t.estado)).length

      // Sin pagar (activos con honorarios > 0)
      const sinPagar = tramites.filter(t =>
        !t.pagado && t.honorarios > 0 && t.estado !== 'cancelado'
      ).length

      // Turnos hoy
      const turnosHoy = turnos.filter(t => {
        const d = t.fecha?.toDate?.()
        return d && d >= hoyInicio && d <= hoyFin && t.estado !== 'cancelado'
      }).length

      // Turnos próximos (los próximos 7 días, sin hoy)
      const en7dias = new Date(); en7dias.setDate(en7dias.getDate() + 7)
      const turnosProximos = turnos.filter(t => {
        const d = t.fecha?.toDate?.()
        return d && d > hoyFin && d <= en7dias && t.estado !== 'cancelado'
      }).length

      // Ingresos del mes
      const ingresosMes = tramites
        .filter(t => {
          const d = t.fechaPago?.toDate?.()
          return t.pagado && d && d >= mesInicio
        })
        .reduce((acc, t) => acc + (t.honorarios ?? 0), 0)

      // Ingresos de hoy
      const ingresosHoy = tramites
        .filter(t => {
          const d = t.fechaPago?.toDate?.()
          return t.pagado && d && d >= hoyInicio && d <= hoyFin
        })
        .reduce((acc, t) => acc + (t.honorarios ?? 0), 0)

      callback({
        tramitesHoy, tramitesPendientes, tramitesActivos,
        turnosHoy, turnosProximos, sinPagar,
        totalClientes: clientes, totalVehiculos: vehiculos,
        ingresosMes, ingresosHoy,
      })
    }
  )
}

// ─── ÚLTIMOS TRÁMITES ─────────────────────────────────────────────────────────

export function subscribeUltimosTramites(
  callback: (tramites: Tramite[]) => void,
  cantidad = 8
): Unsubscribe {
  const q = query(tramitesCol, orderBy('actualizadoEn', 'desc'), limit(cantidad))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// ─── TURNOS DE HOY ────────────────────────────────────────────────────────────

export function subscribeTurnosHoy(
  callback: (turnos: Turno[]) => void
): Unsubscribe {
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0)
  const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59, 999)
  const q = query(
    turnosCol,
    where('fecha', '>=', Timestamp.fromDate(hoyInicio)),
    where('fecha', '<=', Timestamp.fromDate(hoyFin)),
    orderBy('fecha')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// ─── TRÁMITES POR ESTADO (para gráfico) ──────────────────────────────────────

export interface EstadoCount { estado: string; cantidad: number; label: string }

export function subscribeDistribucionEstados(
  callback: (data: EstadoCount[]) => void
): Unsubscribe {
  return onSnapshot(tramitesCol, snap => {
    const conteo: Record<string, number> = {}
    snap.docs.forEach(d => {
      const estado = d.data().estado as string
      conteo[estado] = (conteo[estado] ?? 0) + 1
    })
    const labels: Record<string, string> = {
      pendiente: 'Pendiente', en_proceso: 'En Proceso',
      documentacion_requerida: 'Docs. Req.', en_organismo: 'En Organismo',
      listo_para_retirar: 'Para Retirar', entregado: 'Entregado', cancelado: 'Cancelado',
    }
    callback(
      Object.entries(conteo).map(([estado, cantidad]) => ({
        estado, cantidad, label: labels[estado] ?? estado,
      }))
    )
  })
}

// ─── INGRESOS POR MES (últimos 6 meses) ──────────────────────────────────────

export interface IngresoMes {
  mes:      string   // 'Ene', 'Feb', etc.
  ingresos: number
  tramites: number
}

export async function getIngresosPorMes(meses = 6): Promise<IngresoMes[]> {
  const snap = await getDocs(query(tramitesCol, orderBy('creadoEn', 'desc')))
  const tramites = snap.docs.map(d => d.data()) as Tramite[]

  const resultado: IngresoMes[] = []
  const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  for (let i = meses - 1; i >= 0; i--) {
    const fecha = new Date()
    fecha.setDate(1)
    fecha.setMonth(fecha.getMonth() - i)
    fecha.setHours(0, 0, 0, 0)
    const fin = new Date(fecha)
    fin.setMonth(fin.getMonth() + 1)
    fin.setDate(0)
    fin.setHours(23, 59, 59, 999)

    const delMes = tramites.filter(t => {
      const d = t.creadoEn?.toDate?.()
      return d && d >= fecha && d <= fin
    })
    const ingresosMes = delMes
      .filter(t => t.pagado)
      .reduce((a, t) => a + (t.honorarios ?? 0), 0)

    resultado.push({
      mes:      `${nombres[fecha.getMonth()]} ${fecha.getFullYear().toString().slice(2)}`,
      ingresos: ingresosMes,
      tramites: delMes.length,
    })
  }
  return resultado
}

// ─── TIPOS DE TRÁMITE MÁS FRECUENTES ─────────────────────────────────────────

export interface TipoCount { tipo: string; label: string; cantidad: number; ingresos: number }

export async function getTiposTramiteFrecuentes(): Promise<TipoCount[]> {
  const snap = await getDocs(tramitesCol)
  const conteo: Record<string, { cantidad: number; ingresos: number }> = {}

  snap.docs.forEach(d => {
    const t = d.data() as Tramite
    if (!conteo[t.tipo]) conteo[t.tipo] = { cantidad: 0, ingresos: 0 }
    conteo[t.tipo].cantidad++
    if (t.pagado) conteo[t.tipo].ingresos += (t.honorarios ?? 0)
  })

  const { TIPO_TRAMITE_LABELS } = await import('@/types')

  return Object.entries(conteo)
    .map(([tipo, data]) => ({
      tipo,
      label: TIPO_TRAMITE_LABELS[tipo as keyof typeof TIPO_TRAMITE_LABELS] ?? tipo,
      ...data,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 6)
}

// ─── ALERTAS INTELIGENTES ─────────────────────────────────────────────────────

export interface AlertaDashboard {
  id:      string
  tipo:    'urgente' | 'advertencia' | 'info'
  titulo:  string
  detalle: string
  link?:   string
}

export async function getAlertas(): Promise<AlertaDashboard[]> {
  const alertas: AlertaDashboard[] = []

  const [snapTramites, snapTurnos] = await Promise.all([
    getDocs(query(tramitesCol, orderBy('actualizadoEn', 'desc'))),
    getDocs(query(turnosCol, orderBy('fecha', 'asc'))),
  ])

  const tramites = snapTramites.docs.map(d => ({ ...d.data(), id: d.id })) as Tramite[]
  const turnos   = snapTurnos.docs.map(d => ({ ...d.data(), id: d.id })) as Turno[]
  const ahora    = new Date()

  // Trámites con documentación requerida hace más de 5 días
  const tramitesDocVencida = tramites.filter(t => {
    if (t.estado !== 'documentacion_requerida') return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    const dias = (ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    return dias > 5
  })
  if (tramitesDocVencida.length > 0) {
    alertas.push({
      id: 'docs-vencida',
      tipo: 'urgente',
      titulo: `${tramitesDocVencida.length} trámite${tramitesDocVencida.length > 1 ? 's' : ''} esperando documentación`,
      detalle: `Llevan más de 5 días sin recibir los documentos del cliente.`,
      link: '/admin/tramites',
    })
  }

  // Turnos de mañana sin confirmar
  const manana = new Date(ahora)
  manana.setDate(manana.getDate() + 1)
  manana.setHours(0, 0, 0, 0)
  const mananaFin = new Date(manana)
  mananaFin.setHours(23, 59, 59, 999)

  const turnosMananaSinConfirmar = turnos.filter(t => {
    const d = t.fecha?.toDate?.()
    return d && d >= manana && d <= mananaFin && (t.estado as string) === 'pendiente'
  })
  if (turnosMananaSinConfirmar.length > 0) {
    alertas.push({
      id: 'turnos-sin-confirmar',
      tipo: 'advertencia',
      titulo: `${turnosMananaSinConfirmar.length} turno${turnosMananaSinConfirmar.length > 1 ? 's' : ''} mañana sin confirmar`,
      detalle: 'Confirmá los turnos de mañana para que los clientes reciban la notificación.',
      link: '/admin/turnos',
    })
  }

  // Trámites en organismo hace más de 10 días
  const tramitesOrganismoLargo = tramites.filter(t => {
    if (t.estado !== 'en_organismo') return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    const dias = (ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    return dias > 10
  })
  if (tramitesOrganismoLargo.length > 0) {
    alertas.push({
      id: 'organismo-largo',
      tipo: 'advertencia',
      titulo: `${tramitesOrganismoLargo.length} trámite${tramitesOrganismoLargo.length > 1 ? 's' : ''} hace más de 10 días en organismo`,
      detalle: 'Considerá contactar al cliente para actualizar el estado.',
      link: '/admin/tramites',
    })
  }

  // Trámites sin cobrar con honorarios altos
  const sinCobrar = tramites.filter(t =>
    !t.pagado && t.honorarios > 0 &&
    ['entregado', 'listo_para_retirar'].includes(t.estado)
  )
  const totalSinCobrar = sinCobrar.reduce((a, t) => a + (t.honorarios ?? 0), 0)
  if (sinCobrar.length > 0) {
    alertas.push({
      id: 'sin-cobrar',
      tipo: 'info',
      titulo: `$${totalSinCobrar.toLocaleString('es-AR')} pendiente de cobro`,
      detalle: `${sinCobrar.length} trámite${sinCobrar.length > 1 ? 's' : ''} entregado${sinCobrar.length > 1 ? 's' : ''} sin marcar como pagado.`,
      link: '/admin/tramites',
    })
  }

  return alertas
}

// ─── TOP CLIENTES POR VOLUMEN ─────────────────────────────────────────────────

export interface TopCliente {
  clienteId: string
  nombre:    string
  tramites:  number
  ingresos:  number
}

export async function getTopClientes(n = 5): Promise<TopCliente[]> {
  const [snapTramites, snapClientes] = await Promise.all([
    getDocs(tramitesCol),
    getDocs(clientesCol),
  ])
  const clientes = Object.fromEntries(
    snapClientes.docs.map(d => [d.id, d.data()])
  )
  const conteo: Record<string, { tramites: number; ingresos: number }> = {}

  snapTramites.docs.forEach(d => {
    const t = d.data() as Tramite
    if (!conteo[t.clienteId]) conteo[t.clienteId] = { tramites: 0, ingresos: 0 }
    conteo[t.clienteId].tramites++
    if (t.pagado) conteo[t.clienteId].ingresos += (t.honorarios ?? 0)
  })

  return Object.entries(conteo)
    .map(([clienteId, data]) => ({
      clienteId,
      nombre: clientes[clienteId]
        ? `${clientes[clienteId].apellido}, ${clientes[clienteId].nombre}`
        : 'Cliente eliminado',
      ...data,
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, n)
}
