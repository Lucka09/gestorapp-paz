/**
 * RECIBOS - VERSIÓN CORREGIDA
 * ─────────────────────────────────────────────────────────────
 * CAMBIO CRÍTICO: Al crear un recibo, también marca el trámite como pagado
 * y actualiza los campos financieros (fechaPago, totalCobradoCliente, etc)
 * 
 * Reemplazar: src/utils/recibos.ts
 */

import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  serverTimestamp, runTransaction, updateDoc, type Timestamp,
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
}

export interface Recibo extends ReciboInput {
  id:       string
  creadoEn: Timestamp
}

/**
 * FUNCIÓN CORREGIDA: Crea recibo Y marca tramite como pagado
 * ─────────────────────────────────────────────────────────────
 */
export async function crearRecibo(data: ReciboInput): Promise<string> {
  const reciboRef = await addDoc(recibosCol, {
    ...data,
    creadoEn: serverTimestamp(),
  })

  // Evento fire-and-forget — todos los datos están en `data`
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   data.gestoriaId,
    tipo:         'recibo.emitido',
    entidad:      'recibo',
    entidadId:    reciboRef.id,
    entidadLabel: data.numeroRecibo,
    actorId:      data.emitidoPor,
    actorNombre:  data.emitidoPorNombre,
    actorTipo:    'usuario',
    payload:      { monto: data.monto, tramiteId: data.tramiteId, tipo: data.tipo, patente: data.patente },
    resumen:      `Recibo ${data.numeroRecibo} emitido por $${data.monto}`,
  }))
  // 🔥 CRÍTICO: Marcar trámite como pagado y actualizar campos financieros
  try {
    const tramiteSnap = await getDoc(doc(tramitesCol, data.tramiteId))
    if (tramiteSnap.exists()) {
      const tramite = tramiteSnap.data()

      // Determinar monto de SUATS (si es multa que lo requiere)
      let montoSUATS = tramite.costosSUATS ?? 0
      
      // Si el recibo es de tipo 'total', marcar definitivamente como pagado
      const actualizacion: Record<string, any> = {
        pagado: true,
        fechaPago: serverTimestamp(),
        totalCobradoCliente: data.monto,
        // Mantener campos existentes de SUATS e informe
        costosSUATS: montoSUATS,
        costosInformePersona: tramite.costosInformePersona ?? 0,
        // Guardar detalles del pago
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
    // No fallar la creación del recibo si falla la sincronización
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
 * NUMERACIÓN DE RECIBOS — compartida entre tramites.ts y MultaWorwflow.ts
 * Antes vivía duplicada/privada en tramites.ts; se centraliza acá para que
 * el workflow de multas use la misma numeración correlativa REC-{año}-{seq}.
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