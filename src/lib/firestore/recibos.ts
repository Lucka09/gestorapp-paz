/**
 * RECIBOS
 * ─────────────────────────────────────────────────────────────
 * El recibo es el único hecho económico del sistema. Reportes, Panel de Mando,
 * métricas por secretario y premios suman recibos y nada más.
 *
 * CAMBIOS respecto de tu versión:
 *   1. `crearRecibo` calcula netoGestoria y costoFinanciero ÉL MISMO, siempre.
 *      Antes confiaba en que el caller los mandara; si uno se olvidaba, el
 *      recibo quedaba sin neto y `netoDeRecibo()` caía al bruto en silencio.
 *      Ese es justo el camino por el que vuelven a divergir los números.
 *   2. `tipo` incluye 'devolucion' (deja de necesitar el `as any`).
 *   3. El acumulado del trámite distingue cobros de devoluciones.
 */

import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  serverTimestamp, runTransaction, updateDoc, onSnapshot, limit,
  type Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { emitirEventoSilencioso } from './eventos'
import { crearEvento } from '@/types'
import { calcularNetoGestoria } from './finanzas'

const recibosCol  = collection(db, 'recibos')
const tramitesCol = collection(db, 'tramites')

export type TipoRecibo = 'parcial' | 'total' | 'devolucion'

export interface ReciboInput {
  numeroRecibo:  string
  tramiteId:     string
  clienteId:     string
  gestoriaId:    string
  tipo:          TipoRecibo
  formaPago:     string
  notas:         string
  patente:       string
  numeroTramite: string
  tipoTramite:   string
  emitidoPor:       string
  emitidoPorNombre: string
  atribuidoA?:       string
  atribuidoANombre?: string
  cargadoPorTercero?: boolean
  motivoTercero?:     string
  encargadoId?:     string
  encargadoNombre?: string

  // — MONTOS —
  monto: number              // lo que paga el cliente. Va en el comprobante.
                             // Negativo si es devolución.

  // — DEDUCCIONES (no son ingreso de la gestoría) —
  montoSUATS?:          number
  montoInformePersona?: number
  comisionReferido?:    number
  comisionDestino?:     string

  // — TARJETA —
  montoAcreditado?: number   // lo que realmente entra tras intereses y costos
  cuotasTarjeta?:   number

  // — CALCULADOS: se ignoran si vienen, se recalculan siempre —
  costoFinanciero?: number
  netoGestoria?:    number

  // — DEVOLUCIÓN —
  esDevolucion?:      boolean
  motivoDevolucion?:  string
  detalleDevolucion?: string
  devueltoPor?:       string
  devueltoPorNombre?: string
  reciboOriginalId?:  string

  // — MIGRACIÓN —
  montoCobradoAcumulado?: number
  honorariosTotales?:     number

  costoSUATS?:          number
    costoInformePersona?: number
    baseComisionable?:    number
}

export interface Recibo extends ReciboInput {
  id:           string
  netoGestoria: number
  creadoEn:     Timestamp
}

/** Quita las claves con undefined: Firestore las rechaza. */
function limpiar<T extends Record<string, any>>(o: T): T {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out as T
}

export async function crearRecibo(data: ReciboInput): Promise<string> {
  // ── El neto se calcula acá, no se acepta del caller ───────────────────────
  // Si un formulario nuevo se olvida de mandarlo, el recibo igual queda
  // consistente. Es la única forma de garantizar que las tres pantallas den lo
  // mismo sin depender de que cada call site se acuerde.
  const { netoGestoria, baseComisionable, costoFinanciero, margenSUATS } =
      calcularNetoGestoria({
    monto:               data.monto,
    montoSUATS:          data.montoSUATS,
    costoSUATS:          data.costoSUATS,
    montoInformePersona: data.montoInformePersona,
    costoInformePersona: data.costoInformePersona,
    comisionReferido:    data.comisionReferido,
    montoAcreditado:     data.montoAcreditado,
  })

  const esDevolucion = data.tipo === 'devolucion' || data.monto < 0

  const dataFinal = limpiar({
    ...data,
    // Si no vino atribución explícita, se imputa a quien lo emitió.
    atribuidoA:       data.atribuidoA       || data.emitidoPor,
    atribuidoANombre: data.atribuidoANombre || data.emitidoPorNombre,
    netoGestoria, baseComisionable, costoFinanciero, margenSUATS,
  })

  const reciboRef = await addDoc(recibosCol, {
    ...dataFinal,
    creadoEn: serverTimestamp(),
  })

  emitirEventoSilencioso(crearEvento({
    gestoriaId:   dataFinal.gestoriaId,
    tipo:         esDevolucion ? 'recibo.devolucion' : 'recibo.emitido',
    entidad:      'recibo',
    entidadId:    reciboRef.id,
    entidadLabel: dataFinal.numeroRecibo,
    actorId:      dataFinal.emitidoPor,
    actorNombre:  dataFinal.emitidoPorNombre,
    actorTipo:    'usuario',
    payload: {
      monto: dataFinal.monto, netoGestoria,
      tramiteId: dataFinal.tramiteId, tipo: dataFinal.tipo,
      patente: dataFinal.patente, atribuidoA: dataFinal.atribuidoA,
    },
    resumen: esDevolucion
      ? `Devolución ${dataFinal.numeroRecibo} por $${Math.abs(dataFinal.monto).toLocaleString('es-AR')}`
      : `Recibo ${dataFinal.numeroRecibo} emitido por $${dataFinal.monto.toLocaleString('es-AR')}`,
  }))

  // ── Acumulados en el trámite (solo para mostrar en el detalle) ────────────
  // La fuente de verdad sigue siendo la suma de recibos. Esto es caché.
  // NO se toca `pagado`, `honorarios` ni `totalCobradoCliente`: eso es
  // responsabilidad de quien orquesta el cobro.
  try {
    const previos = await getRecibosPorTramite(data.tramiteId)
    let cobrado = 0, devuelto = 0, neto = 0
    for (const r of previos) {
      const m = Number(r.monto ?? 0)
      if (m < 0 || r.tipo === 'devolucion') devuelto += Math.abs(m)
      else cobrado += m
      neto += Number(r.netoGestoria ?? 0)
    }

    await updateDoc(doc(tramitesCol, data.tramiteId), {
      montoRecibidoAcumulado: cobrado,
      devueltoAlCliente:      devuelto,
      netoGestoriaAcumulado:  neto,
      ultimoReciboEn:         serverTimestamp(),
      actualizadoEn:          serverTimestamp(),
    })
  } catch (e) {
    console.error('[crearRecibo] sync acumulado:', e)
  }

  return reciboRef.id
}

export async function getRecibo(id: string): Promise<Recibo | null> {
  const snap = await getDoc(doc(db, 'recibos', id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id } as Recibo
}

export async function getRecibosPorTramite(tramiteId: string): Promise<Recibo[]> {
  const snap = await getDocs(query(
    recibosCol,
    where('tramiteId', '==', tramiteId),
    orderBy('creadoEn', 'desc'),
  ))
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Recibo)
}

/**
 * NUMERACIÓN — REC-{año}-{seq}, correlativa por gestoría, transaccional.
 * Las devoluciones consumen un número de la serie: quedan en el talonario
 * con su propio comprobante, como corresponde.
 */
export async function generarNumeroRecibo(gestoriaId: string): Promise<string> {
  const anio = new Date().getFullYear()
  const ref  = doc(db, 'contadoresRecibos', `${gestoriaId}_${anio}`)
  const n = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    const siguiente = (snap.exists() ? (snap.data()?.contador ?? 0) : 0) + 1
    tx.set(ref, { gestoriaId, anio, contador: siguiente }, { merge: true })
    return siguiente
  })
  return `REC-${anio}-${String(n).padStart(4, '0')}`
}

export function subscribeRecibos(
  gestoriaId: string,
  callback:   (recibos: Recibo[]) => void,
): Unsubscribe {
  const q = query(
    recibosCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('creadoEn', 'desc'),
    limit(500),
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Recibo))
  )
}

// ─── TIPOS DE EVENTO ──────────────────────────────────────────────────────────
// Agregar en src/types/evento.ts → TipoEvento:
//   | 'recibo.devolucion'
// TIPO_EVENTO_LABELS: 'recibo.devolucion': 'Devolución de dinero'
// TIPO_EVENTO_EMOJI:  'recibo.devolucion': '↩️'