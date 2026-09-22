// src/lib/firestore/encargadosMetricas.ts
// ─── MÉTRICAS Y DETALLE DE ENCARGADOS ────────────────────────────────────────
//
// Reemplaza a `getMetricasEncargados` de encargados.ts, que consultaba TODOS
// los encargados de la gestoría. Un secretario solo puede leer los suyos por
// reglas, así que esa query le fallaba entera. Acá el alcance depende del rol.

import {
  collection, query, where, getDocs, doc, getDoc, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Encargado, TipoEncargado } from './encargados'

const DIA = 86_400_000
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const ms  = (t: any) => t?.toMillis?.() ?? t?.toDate?.()?.getTime?.() ?? 0

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface MetricasEncargado {
  encargadoId:     string
  nombre:          string
  apodo:           string
  tipo:            TipoEncargado
  telefono:        string
  asignadoA:       string
  asignadoANombre: string
  datosIncompletos: boolean
  // Volumen
  clientes:        number
  tramites:        number
  tramitesActivos: number
  tramitesMes:     number
  // Plata (del período elegido)
  cobradoBruto:    number   // lo que pagaron sus clientes
  comisionPagada:  number   // lo que se le entregó a él
  netoGestoria:    number   // lo que quedó para la gestoría
  // Tiempo
  antiguedadDias:  number
  ultimoAporte:    Date | null
  diasSinAportar:  number | null
}

export interface ScopeEncargados {
  gestoriaId: string
  uid:        string
  verTodos:   boolean   // admin / CEO
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function cargarEncargados(s: ScopeEncargados): Promise<Encargado[]> {
  const filtros = [where('gestoriaId', '==', s.gestoriaId)]
  if (!s.verTodos) filtros.push(where('asignadoA', '==', s.uid))
  const snap = await getDocs(query(collection(db, 'encargados'), ...filtros, limit(500)))
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }) as Encargado)
    .filter(e => (e as any).activo !== false)
}

const q = (c: string, gestoriaId: string) =>
  getDocs(query(collection(db, c), where('gestoriaId', '==', gestoriaId), limit(5000)))

const ESTADOS_CERRADOS = ['entregado', 'cancelado']

// ─── LISTADO CON MÉTRICAS ─────────────────────────────────────────────────────

export async function getMetricasEncargados(
  s: ScopeEncargados,
  desde?: Date,
  hasta?: Date,
): Promise<MetricasEncargado[]> {
  if (!s.gestoriaId) return []

  const [encargados, cliS, traS, recS] = await Promise.all([
    cargarEncargados(s),
    q('clientes', s.gestoriaId),
    q('tramites', s.gestoriaId),
    q('recibos',  s.gestoriaId),
  ])

  const ahora = Date.now()
  const d0 = desde?.getTime() ?? 0
  const d1 = hasta?.getTime() ?? ahora
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()

  // cliente → encargado
  const encDeCli = new Map<string, string>()
  cliS.forEach(d => {
    const e = (d.data() as any).encargadoId
    if (e) encDeCli.set(d.id, e)
  })

  const acc = new Map<string, Omit<MetricasEncargado,
    'encargadoId'|'nombre'|'apodo'|'tipo'|'telefono'|'asignadoA'|'asignadoANombre'|
    'datosIncompletos'|'antiguedadDias'|'diasSinAportar'>>()
  const fila = (id: string) => {
    if (!acc.has(id)) acc.set(id, {
      clientes: 0, tramites: 0, tramitesActivos: 0, tramitesMes: 0,
      cobradoBruto: 0, comisionPagada: 0, netoGestoria: 0, ultimoAporte: null,
    })
    return acc.get(id)!
  }

  encDeCli.forEach(encId => { fila(encId).clientes++ })

  traS.forEach(d => {
    const t = d.data() as any
    const encId = t.encargadoId || encDeCli.get(t.clienteId)
    if (!encId) return
    const f = fila(encId)
    f.tramites++
    if (!ESTADOS_CERRADOS.includes(t.estado)) f.tramitesActivos++
    if (ms(t.creadoEn) >= inicioMes) f.tramitesMes++
    const c = ms(t.creadoEn)
    if (c && (!f.ultimoAporte || c > f.ultimoAporte.getTime())) f.ultimoAporte = new Date(c)
  })

  recS.forEach(d => {
    const r = d.data() as any
    const encId = r.encargadoId || encDeCli.get(r.clienteId)
    if (!encId) return
    const t = ms(r.creadoEn)
    if (t < d0 || t > d1) return
    const m = num(r.monto)
    if (m < 0) return          // las devoluciones no suman al bruto
    const f = fila(encId)
    f.cobradoBruto   += m
    f.comisionPagada += num(r.comisionReferido)
    f.netoGestoria   += num(r.netoGestoria ?? m)
  })

  return encargados.map(e => {
    const f = fila(e.id)
    const creado = ms(e.creadoEn) || ahora
    return {
      encargadoId: e.id,
      nombre: `${e.nombre} ${e.apellido ?? ''}`.trim(),
      apodo: (e as any).apodo ?? '',
      tipo: e.tipo,
      telefono: e.telefono ?? '',
      asignadoA: e.asignadoA,
      asignadoANombre: e.asignadoANombre ?? '',
      datosIncompletos: !e.telefono || !!(e as any).datosIncompletos,
      ...f,
      antiguedadDias: Math.floor((ahora - creado) / DIA),
      diasSinAportar: f.ultimoAporte
        ? Math.floor((ahora - f.ultimoAporte.getTime()) / DIA) : null,
    }
  }).sort((a, b) => b.cobradoBruto - a.cobradoBruto || b.clientes - a.clientes)
}

// ─── DETALLE INDIVIDUAL ───────────────────────────────────────────────────────

export interface DetalleEncargado {
  encargado: Encargado & { apodo?: string; notas?: string; telefonoAlt?: string }
  clientes:  { id: string; nombre: string; telefono: string; creadoEn: Date | null }[]
  tramites:  {
    id: string; numero: string; tipo: string; estado: string; patente: string
    cliente: string; creadoEn: Date | null; honorarios: number; activo: boolean
  }[]
  comisiones: {
    reciboId: string; numeroRecibo: string; fecha: Date | null
    cliente: string; patente: string; cobrado: number; comision: number
  }[]
  totales: {
    clientes: number; tramites: number; tramitesActivos: number
    cobrado: number; comision: number; neto: number
  }
}

export async function getDetalleEncargado(
  encargadoId: string,
  gestoriaId: string,
): Promise<DetalleEncargado | null> {
  const encSnap = await getDoc(doc(db, 'encargados', encargadoId))
  if (!encSnap.exists()) return null
  const encargado = { ...encSnap.data(), id: encSnap.id } as DetalleEncargado['encargado']

  const [cliS, traS, recS] = await Promise.all([
    getDocs(query(collection(db, 'clientes'),
      where('gestoriaId', '==', gestoriaId),
      where('encargadoId', '==', encargadoId), limit(1000))),
    q('tramites', gestoriaId),
    q('recibos',  gestoriaId),
  ])

  const nombreCli = new Map<string, string>()
  const clientes = cliS.docs.map(d => {
    const c = d.data() as any
    const nom = `${c.nombre ?? ''} ${c.apellido ?? ''}`.trim()
    nombreCli.set(d.id, nom)
    return {
      id: d.id, nombre: nom, telefono: c.telefono ?? '',
      creadoEn: ms(c.creadoEn) ? new Date(ms(c.creadoEn)) : null,
    }
  }).sort((a, b) => (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0))

  const tramites: DetalleEncargado['tramites'] = []
  traS.forEach(d => {
    const t = d.data() as any
    const mio = t.encargadoId === encargadoId || nombreCli.has(t.clienteId)
    if (!mio) return
    tramites.push({
      id: d.id, numero: t.numero ?? d.id, tipo: t.tipo ?? '',
      estado: t.estado ?? '', patente: t.patente ?? '',
      cliente: nombreCli.get(t.clienteId) ?? '',
      creadoEn: ms(t.creadoEn) ? new Date(ms(t.creadoEn)) : null,
      honorarios: num(t.honorarios),
      activo: !ESTADOS_CERRADOS.includes(t.estado),
    })
  })
  // Activos primero, después por fecha
  tramites.sort((a, b) =>
    Number(b.activo) - Number(a.activo) ||
    (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0))

  const comisiones: DetalleEncargado['comisiones'] = []
  let cobrado = 0, comision = 0, neto = 0
  recS.forEach(d => {
    const r = d.data() as any
    const mio = r.encargadoId === encargadoId || nombreCli.has(r.clienteId)
    if (!mio) return
    const m = num(r.monto)
    if (m < 0) return
    cobrado  += m
    comision += num(r.comisionReferido)
    neto     += num(r.netoGestoria ?? m)
    comisiones.push({
      reciboId: d.id, numeroRecibo: r.numeroRecibo ?? '',
      fecha: ms(r.creadoEn) ? new Date(ms(r.creadoEn)) : null,
      cliente: nombreCli.get(r.clienteId) ?? '', patente: r.patente ?? '',
      cobrado: m, comision: num(r.comisionReferido),
    })
  })
  comisiones.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))

  return {
    encargado, clientes, tramites, comisiones,
    totales: {
      clientes: clientes.length,
      tramites: tramites.length,
      tramitesActivos: tramites.filter(t => t.activo).length,
      cobrado, comision, neto,
    },
  }
}

// ─── ÍNDICE NUEVO ─────────────────────────────────────────────────────────────
// La query de clientes por encargado necesita:
//   clientes: gestoriaId ASC, encargadoId ASC