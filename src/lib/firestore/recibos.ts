/**
 * RECIBOS
 * ─────────────────────────────────────────────────────────────
 * Al crear un recibo, también marca el trámite como pagado y actualiza los
 * campos financieros. Los ingresos se cuentan POR RECIBO (señas / cuotas).
 *
 * Reemplazar: src/lib/firestore/recibos.ts
 */

import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  serverTimestamp, runTransaction, updateDoc, onSnapshot, limit,
  type Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { emitirEventoSilencioso } from './eventos'
import { crearEvento } from '@/types'

const recibosCol = collection(db, 'recibos')
const tramitesCol = collection(db, 'tramites')

export interface ReciboInput {
  numeroRecibo:          string
  tramiteId:             string
  clienteId:             string
  gestoriaId:            string
  tipo:                  'parcial' | 'total'
  monto:                 number
  montoCobradoAcumulado: number
  honorariosTotales:     number
  formaPago:             string
  notas:                 string
  patente:               string
  numeroTramite:         string
  tipoTramite:           string
  emitidoPor:            string
  emitidoPorNombre:      string
  // Atribución del ingreso (para métricas por secretario)
  atribuidoA?:           string   // secretario dueño del ingreso (default = emitidoPor)
  atribuidoANombre?:     string
  cargadoPorTercero?:    boolean  // lo cargó un rol de control por otra persona
  motivoTercero?:        string   // obligatorio cuando cargadoPorTercero = true
}

export interface Recibo extends ReciboInput {
  id:       string
  creadoEn: Timestamp
}

export async function crearRecibo(data: ReciboInput): Promise<string> {
  // Si no vino atribución explícita, el ingreso se imputa a quien lo emitió.
  const dataFinal: ReciboInput = {
    ...data,
    atribuidoA:       data.atribuidoA       || data.emitidoPor,
    atribuidoANombre: data.atribuidoANombre || data.emitidoPorNombre,
  }

  const reciboRef = await addDoc(recibosCol, {
    ...dataFinal,
    creadoEn: serverTimestamp(),
  })

  emitirEventoSilencioso(crearEvento({
    gestoriaId:   dataFinal.gestoriaId,
    tipo:         'recibo.emitido',
    entidad:      'recibo',
    entidadId:    reciboRef.id,
    entidadLabel: dataFinal.numeroRecibo,
    actorId:      dataFinal.emitidoPor,
    actorNombre:  dataFinal.emitidoPorNombre,
    actorTipo:    'usuario',
    payload:      { monto: dataFinal.monto, tramiteId: dataFinal.tramiteId, tipo: dataFinal.tipo, patente: dataFinal.patente, atribuidoA: dataFinal.atribuidoA },
    resumen:      `Recibo ${dataFinal.numeroRecibo} emitido por $${dataFinal.monto}`,
  }))

  // Marcar trámite como pagado y actualizar campos financieros
  try {
    const tramiteSnap = await getDoc(doc(tramitesCol, data.tramiteId))
    if (tramiteSnap.exists()) {
      const tramite = tramiteSnap.data()
      const montoSUATS = tramite.costosSUATS ?? 0
      const actualizacion: Record<string, any> = {
        pagado: true,
        fechaPago: serverTimestamp(),
        totalCobradoCliente: data.monto,
        costosSUATS: montoSUATS,
        costosInformePersona: tramite.costosInformePersona ?? 0,
        formaPago: data.formaPago,
        notasPago: data.notas,
        honorarios: data.honorariosTotales,
        actualizadoEn: serverTimestamp(),
      }
      await updateDoc(doc(tramitesCol, data.tramiteId), actualizacion)
      console.log(`✅ Recibo creado y trámite ${tramite.numero} marcado como pagado`)
    }
  } catch (e) {
    console.error('⚠️  Error al sincronizar pago en tramite:', e)
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
 * NUMERACIÓN DE RECIBOS — REC-{año}-{seq}, correlativa por gestoría.
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

// ─── BANDEJA: stream de todos los recibos de la gestoría ──────────────────────
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