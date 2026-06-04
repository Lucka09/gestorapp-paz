import {
  query, where, orderBy, limit,
  getDocs, getDoc, doc, getCountFromServer, Timestamp, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { tramitesCol, turnosCol, clientesCol, vehiculosCol } from './collections'
import type { Tramite, Turno } from '@/types'

// ─── MÉTRICAS GENERALES ───────────────────────────────────────────────────────
// ⚡ OPTIMIZADO: lectura única en vez de onSnapshot de colección completa.

export interface MetricasDashboard {
  tramitesHoy:        number
  tramitesPendientes: number
  tramitesActivos:    number
  turnosHoy:          number
  turnosProximos:     number
  sinPagar:           number
  totalClientes:      number
  totalVehiculos:     number
  ingresosMes:        number
  ingresosHoy:        number
}

export async function getMetricas(gestoriaId: string): Promise<MetricasDashboard> {
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0)
  const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59, 999)
  const mesInicio = new Date(); mesInicio.setDate(1); mesInicio.setHours(0, 0, 0, 0)
  const en7dias   = new Date(); en7dias.setDate(en7dias.getDate() + 7)

  const hoyTs    = Timestamp.fromDate(hoyInicio)
  const hoyFinTs = Timestamp.fromDate(hoyFin)
  const mesTs    = Timestamp.fromDate(mesInicio)
  const en7Ts    = Timestamp.fromDate(en7dias)

  const estadosActivos = ['pendiente', 'en_proceso', 'documentacion_requerida', 'en_organismo']

  // getCountFromServer: solo lee metadatos del índice (1 read), no trae documentos.
  // Ahorra hasta 4000 reads/mes vs getDocs con limit(2000).
  const [
    snapActivos, snapHoy, snapPagados,
    snapTurnosHoy, snapTurnosProx,
    cntClientes, cntVehiculos,
  ] = await Promise.all([
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('estado','in',estadosActivos), limit(500))),
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('creadoEn','>=',hoyTs), where('creadoEn','<=',hoyFinTs), limit(200))),
    getDocs(query(tramitesCol, where('gestoriaId','==',gestoriaId), where('pagado','==',true), where('fechaPago','>=',mesTs), limit(500))),
    getDocs(query(turnosCol,   where('gestoriaId','==',gestoriaId), where('fecha','>=',hoyTs), where('fecha','<=',hoyFinTs), limit(100))),
    getDocs(query(turnosCol,   where('gestoriaId','==',gestoriaId), where('fecha','>',hoyFinTs), where('fecha','<=',en7Ts), limit(100))),
    getCountFromServer(query(clientesCol,  where('gestoriaId','==',gestoriaId))),
    getCountFromServer(query(vehiculosCol, where('gestoriaId','==',gestoriaId))),
  ])

  const tramitesActivos    = snapActivos.size
  const tramitesPendientes = snapActivos.docs.filter(d => d.data().estado === 'pendiente').length
  const sinPagar           = snapActivos.docs.filter(d => !d.data().pagado && (d.data().honorarios ?? 0) > 0).length
  const tramitesHoy        = snapHoy.size
  const turnosHoy          = snapTurnosHoy.docs.filter(d => d.data().estado !== 'cancelado').length
  const turnosProximos     = snapTurnosProx.size
  const ingresosMes        = snapPagados.docs.reduce((a, d) => a + (d.data().honorarios ?? 0), 0)
  const ingresosHoy        = snapPagados.docs
    .filter(d => { const fp = d.data().fechaPago?.toDate?.(); return fp && fp >= hoyInicio && fp <= hoyFin })
    .reduce((a, d) => a + (d.data().honorarios ?? 0), 0)

  return {
    tramitesHoy, tramitesPendientes, tramitesActivos,
    turnosHoy, turnosProximos, sinPagar,
    totalClientes: cntClientes.data().count,
    totalVehiculos: cntVehiculos.data().count,
    ingresosMes, ingresosHoy,
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
      ? (data.razonSocial ?? `${data.nombre ?? ''} ${data.apellido ?? ''}`.trim() || clienteId)
      : clienteId
    return {
      clienteId,
      nombre,
      tramites,
      ingresos: ingresosPorCliente[clienteId] ?? 0,
    }
  })
}