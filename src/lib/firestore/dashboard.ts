import {
  query, where, orderBy, limit,
  getDocs, getDoc, doc, getCountFromServer, Timestamp, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { tramitesCol, turnosCol, clientesCol, vehiculosCol } from './collections'
import type { Tramite, Turno } from '@/types'

// ─── MÉTRICAS GENERALES ───────────────────────────────────────────────────────
// ⚡ OPTIMIZADO: lectura única (no onSnapshot) + Promise.allSettled (una query
// rota no tira abajo el resto de las métricas) + refetch por polling desde
// useDashboard.ts (ver useMetricas), sin listeners permanentes.

export interface MetricasDashboard {
  tramitesHoy:        number
  tramitesPendientes: number
  tramitesActivos:    number
  turnosHoy:          number
  turnosProximos:     number
  sinPagar:           number
  totalClientes:      number
  totalVehiculos:     number
  ingresosHoy:        number
  ingresosSemana:     number
  ingresosMes:        number
  erroresMetricas:    string[]  // qué sub-métricas fallaron (para debug en consola/UI)
}

const ESTADOS_ACTIVOS = ['pendiente', 'en_proceso', 'documentacion_requerida', 'en_organismo']

export async function getMetricas(gestoriaId: string): Promise<MetricasDashboard> {
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0)
  const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59, 999)
  const mesInicio = new Date(); mesInicio.setDate(1); mesInicio.setHours(0, 0, 0, 0)
  const en7dias   = new Date(); en7dias.setDate(en7dias.getDate() + 7)

  // Semana actual: lunes a hoy (estándar AR/LATAM).
  // Si el negocio cuenta domingo→sábado, cambiar el cálculo de diffLunes.
  const semanaInicio = new Date()
  const diaSemana     = semanaInicio.getDay() // 0 = domingo, 1 = lunes, ...
  const diffLunes      = diaSemana === 0 ? 6 : diaSemana - 1
  semanaInicio.setDate(semanaInicio.getDate() - diffLunes)
  semanaInicio.setHours(0, 0, 0, 0)

  const hoyTs    = Timestamp.fromDate(hoyInicio)
  const hoyFinTs = Timestamp.fromDate(hoyFin)
  const mesTs    = Timestamp.fromDate(mesInicio)
  const en7Ts    = Timestamp.fromDate(en7dias)

  const errores: string[] = []

  // Cada query es su propia promesa nombrada. Usamos allSettled: si "turnosProximos"
  // falla por falta de índice, igual queremos tramitesHoy, ingresosMes, etc.
  const [
    rActivos, rHoy, rPagados,
    rTurnosHoy, rTurnosProx,
    rClientes, rVehiculos,
  ] = await Promise.allSettled([
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('estado','in',ESTADOS_ACTIVOS), limit(1000))),
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('creadoEn','>=',hoyTs), where('creadoEn','<=',hoyFinTs), limit(500))),
    // ⚠️ Esta misma query alimenta ingresosHoy, ingresosSemana e ingresosMes
    // (filtramos el mismo snapshot 3 veces, sin lecturas extra).
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('pagado','==',true), where('fechaPago','>=',mesTs), limit(1000))),
    getDocs(query(turnosCol,   where('gestoriaId','==',gestoriaId), where('fecha','>=',hoyTs), where('fecha','<=',hoyFinTs), limit(200))),
    getDocs(query(turnosCol,   where('gestoriaId','==',gestoriaId), where('fecha','>',hoyFinTs), where('fecha','<=',en7Ts), limit(200))),
    getCountFromServer(query(clientesCol,  where('gestoriaId','==',gestoriaId))),
    getCountFromServer(query(vehiculosCol, where('gestoriaId','==',gestoriaId))),
  ])

  const log = (label: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      console.error(`[getMetricas] falló "${label}":`, r.reason)
      errores.push(label)
    }
  }
  log('tramitesActivos', rActivos)
  log('tramitesHoy', rHoy)
  log('pagadosMes', rPagados)
  log('turnosHoy', rTurnosHoy)
  log('turnosProximos', rTurnosProx)
  log('totalClientes', rClientes)
  log('totalVehiculos', rVehiculos)

  const snapActivos    = rActivos.status === 'fulfilled' ? rActivos.value : null
  const snapHoy        = rHoy.status === 'fulfilled' ? rHoy.value : null
  const snapPagados    = rPagados.status === 'fulfilled' ? rPagados.value : null
  const snapTurnosHoy  = rTurnosHoy.status === 'fulfilled' ? rTurnosHoy.value : null
  const snapTurnosProx = rTurnosProx.status === 'fulfilled' ? rTurnosProx.value : null

  const tramitesActivos    = snapActivos?.size ?? 0
  const tramitesPendientes = snapActivos?.docs.filter(d => d.data().estado === 'pendiente').length ?? 0
  const sinPagar           = snapActivos?.docs.filter(d => !d.data().pagado && (d.data().honorarios ?? 0) > 0).length ?? 0
  const tramitesHoy        = snapHoy?.size ?? 0
  const turnosHoy          = snapTurnosHoy?.docs.filter(d => d.data().estado !== 'cancelado').length ?? 0
  const turnosProximos     = snapTurnosProx?.size ?? 0

  const ingresosMes    = snapPagados?.docs.reduce((a, d) => a + (d.data().honorarios ?? 0), 0) ?? 0
  const ingresosHoy    = snapPagados?.docs
    .filter(d => { const fp = d.data().fechaPago?.toDate?.(); return fp && fp >= hoyInicio && fp <= hoyFin })
    .reduce((a, d) => a + (d.data().honorarios ?? 0), 0) ?? 0
  const ingresosSemana = snapPagados?.docs
    .filter(d => { const fp = d.data().fechaPago?.toDate?.(); return fp && fp >= semanaInicio })
    .reduce((a, d) => a + (d.data().honorarios ?? 0), 0) ?? 0

  return {
    tramitesHoy, tramitesPendientes, tramitesActivos,
    turnosHoy, turnosProximos, sinPagar,
    totalClientes: rClientes.status === 'fulfilled' ? rClientes.value.data().count : 0,
    totalVehiculos: rVehiculos.status === 'fulfilled' ? rVehiculos.value.data().count : 0,
    ingresosHoy, ingresosSemana, ingresosMes,
    erroresMetricas: errores,
  }
}

// Wrapper para compatibilidad con AsistenteIA (no rompe nada)
export function subscribeMetricas(
  gestoriaId: string,
  callback:   (m: MetricasDashboard) => void
): Unsubscribe {
  let cancelled = false
  getMetricas(gestoriaId).then(m => { if (!cancelled) callback(m) }).catch(() => {})
  return () => { cancelled = true }
}

// ─── ÚLTIMOS TRÁMITES (onSnapshot acotado a 8 docs) ──────────────────────────
export function subscribeUltimosTramites(
  gestoriaId: string,
  callback:   (tramites: Tramite[]) => void,
  cantidad = 8
): Unsubscribe {
  const q = query(tramitesCol, where('gestoriaId','==',gestoriaId), orderBy('actualizadoEn','desc'), limit(cantidad))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
}

// ─── TURNOS HOY (onSnapshot acotado por fecha) ───────────────────────────────
export function subscribeTurnosHoy(
  gestoriaId: string,
  callback:   (turnos: Turno[]) => void
): Unsubscribe {
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0)
  const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59, 999)
  const q = query(
    turnosCol,
    where('gestoriaId','==',gestoriaId),
    where('fecha','>=',Timestamp.fromDate(hoyInicio)),
    where('fecha','<=',Timestamp.fromDate(hoyFin)),
    orderBy('fecha'), limit(50),
  )
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
}

// ─── DISTRIBUCIÓN ESTADOS (getDocs, no listener permanente) ──────────────────
export interface EstadoCount { estado: string; cantidad: number; label: string }

export async function getDistribucionEstados(gestoriaId: string): Promise<EstadoCount[]> {
  const snap = await getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), limit(500)))
  const conteo: Record<string, number> = {}
  snap.docs.forEach(d => { const e = d.data().estado as string; conteo[e] = (conteo[e] ?? 0) + 1 })
  const labels: Record<string, string> = {
    pendiente:'Pendiente', en_proceso:'En Proceso', documentacion_requerida:'Docs. Req.',
    en_organismo:'En Organismo', listo_para_retirar:'Para Retirar', entregado:'Entregado', cancelado:'Cancelado',
  }
  return Object.entries(conteo).map(([estado, cantidad]) => ({ estado, cantidad, label: labels[estado] ?? estado }))
}

export function subscribeDistribucionEstados(
  gestoriaId: string,
  callback:   (data: EstadoCount[]) => void
): Unsubscribe {
  let cancelled = false
  getDistribucionEstados(gestoriaId).then(d => { if (!cancelled) callback(d) }).catch(() => {})
  return () => { cancelled = true }
}

// ─── INGRESOS POR MES ─────────────────────────────────────────────────────────
export interface IngresoMes { mes: string; ingresos: number; tramites: number }

export async function getIngresosPorMes(gestoriaId: string, _meses = 6): Promise<IngresoMes[]> {
  const hace6Meses = new Date(); hace6Meses.setMonth(hace6Meses.getMonth() - 6); hace6Meses.setDate(1); hace6Meses.setHours(0,0,0,0)
  const snap = await getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('pagado','==',true), where('fechaPago','>=',Timestamp.fromDate(hace6Meses)), limit(500)))
  const meses: Record<string, IngresoMes> = {}
  const nm = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  snap.docs.forEach(d => {
    const fp = d.data().fechaPago?.toDate?.()
    if (!fp) return
    const key = `${fp.getFullYear()}-${String(fp.getMonth()).padStart(2,'0')}`
    if (!meses[key]) meses[key] = { mes: nm[fp.getMonth()], ingresos: 0, tramites: 0 }
    meses[key].ingresos += d.data().honorarios ?? 0
    meses[key].tramites += 1
  })
  return Object.entries(meses).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
}

// ─── TIPOS AUXILIARES ────────────────────────────────────────────────────────

export interface TipoCount  { tipo: string; label: string; cantidad: number; ingresos: number }
export interface TopCliente { clienteId: string; nombre: string; tramites: number; ingresos: number }

// ─── TIPOS DE TRÁMITE FRECUENTES ─────────────────────────────────────────────
// ⚡ getDocs acotado — no listener permanente

export async function getTiposTramiteFrecuentes(gestoriaId: string): Promise<TipoCount[]> {
  const snap = await getDocs(query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    limit(500),
  ))
  const conteo: Record<string, number> = {}
  const conteoIngresos: Record<string, number> = {}
  snap.docs.forEach(d => {
    const tipo = d.data().tipo as string
    conteo[tipo] = (conteo[tipo] ?? 0) + 1
    conteoIngresos[tipo] = (conteoIngresos[tipo] ?? 0) + (d.data().honorarios ?? 0)
  })
  const labels: Record<string, string> = {
    transferencia: 'Transferencia', inscripcion_inicial: 'Inscripción Inicial',
    baja: 'Baja', formulario_08: 'Form. 08', duplicado_titulo: 'Dup. Título',
    duplicado_cedula: 'Dup. Cédula', cambio_radicacion: 'Cambio Radicación',
    informe_dominio: 'Informe Dominio', certificado_dominio: 'Cert. Dominio',
    prenda: 'Prenda', descargo_multa: 'Descargo Multas PBA', vtv: 'VTV',
    inhibicion: 'Inhibición', levantamiento_inhibicion: 'Lev. Inhibición',
  }
  return Object.entries(conteo)
    .map(([tipo, cantidad]) => ({ tipo, label: labels[tipo] ?? tipo, cantidad, ingresos: conteoIngresos[tipo] ?? 0 }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)
}

// ─── TOP CLIENTES POR TRÁMITES ────────────────────────────────────────────────

export async function getTopClientes(
  gestoriaId: string,
  cantidad = 5
): Promise<TopCliente[]> {
  const snap = await getDocs(query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    limit(500),
  ))
  const conteo: Record<string, number> = {}
  snap.docs.forEach(d => {
    const cid = d.data().clienteId as string
    if (cid) conteo[cid] = (conteo[cid] ?? 0) + 1
  })
  const ingresosPorCliente: Record<string, number> = {}
  snap.docs.forEach(d => {
    const cid = d.data().clienteId as string
    if (cid) ingresosPorCliente[cid] = (ingresosPorCliente[cid] ?? 0) + (d.data().honorarios ?? 0)
  })
  const top = Object.entries(conteo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, cantidad)

  // Resolver nombres reales en paralelo (solo `cantidad` lecturas extra)
  const clienteSnaps = await Promise.all(
    top.map(([clienteId]) => getDoc(doc(clientesCol, clienteId)).catch(() => null))
  )

  return top.map(([clienteId, tramites], i) => {
    const data = clienteSnaps[i]?.data() as { nombre?: string; apellido?: string; razonSocial?: string } | undefined
    const nombre = data
      ? (data.razonSocial ?? (`${data.nombre ?? ''} ${data.apellido ?? ''}`.trim() || clienteId))
      : clienteId
    return {
      clienteId,
      nombre,
      tramites,
      ingresos: ingresosPorCliente[clienteId] ?? 0,
    }
  })
}

// ─── ORIGEN DE CLIENTES — comercial (referidos) y canal digital ──────────────
// Reemplaza el bloque comentado "PENDIENTE" al final de dashboard.ts.
// Se basa en el campo `origenCanal` que ya graba ClienteForm.tsx.

import { ORIGEN_CANAL_LABELS, type OrigenCanal } from '@/types'

export interface OrigenCount { canal: OrigenCanal; label: string; cantidad: number }

const CANALES_COMERCIALES: OrigenCanal[] = [
  'referido_persona', 'concesionaria', 'agencia', 'reventa', 'encargado_multas',
]
const CANALES_DIGITALES: OrigenCanal[] = [
  'instagram', 'facebook', 'google', 'cartel_local', 'whatsapp', 'otro',
]

export interface ClientesPorOrigen {
  comercial: OrigenCount[]
  digital:   OrigenCount[]
  sinDato:   number  // clientes sin origenCanal asignado (altas viejas, manuales, etc.)
}

export async function getClientesPorOrigen(gestoriaId: string): Promise<ClientesPorOrigen> {
  const snap = await getDocs(query(clientesCol, where('gestoriaId', '==', gestoriaId), limit(1000)))

  const conteo: Record<string, number> = {}
  let sinDato = 0
  snap.docs.forEach(d => {
    const canal = d.data().origenCanal as OrigenCanal | undefined
    if (!canal) { sinDato++; return }
    conteo[canal] = (conteo[canal] ?? 0) + 1
  })

  const armar = (lista: OrigenCanal[]): OrigenCount[] =>
    lista
      .map(canal => ({ canal, label: ORIGEN_CANAL_LABELS[canal] ?? canal, cantidad: conteo[canal] ?? 0 }))
      .filter(c => c.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad)

  return {
    comercial: armar(CANALES_COMERCIALES),
    digital:   armar(CANALES_DIGITALES),
    sinDato,
  }
}