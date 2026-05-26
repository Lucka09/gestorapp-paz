// src/lib/firestore/campanas.ts
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs,
  serverTimestamp, Timestamp,
  type CollectionReference, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type {
  Campana, CampanaInput, EnvioCampana,
  MetricasCampana, EstadoCampana, FiltroAudiencia,
} from '@/campana_types'
import { COSTO_CONVERSACION_USD } from '@/campana_types'

// ─── REFS ──────────────────────────────────────────────────────────────────────

const campanasCol  = (gestoriaId: string) =>
  collection(db, 'gestoriaData', gestoriaId, 'campanas') as CollectionReference<Campana>

const campanaDoc   = (gestoriaId: string, id: string) =>
  doc(campanasCol(gestoriaId), id)

const enviosCol    = (gestoriaId: string, campanaId: string) =>
  collection(db, 'gestoriaData', gestoriaId, 'campanas', campanaId, 'envios') as CollectionReference<EnvioCampana>

// ─── MÉTRICAS VACÍAS ───────────────────────────────────────────────────────────

export function metricasVacias(): MetricasCampana {
  return {
    totalContactos: 0, enviados: 0, entregados: 0,
    leidos: 0, respondidos: 0, fallidos: 0,
    tasaApertura: 0, tasaRespuesta: 0,
    costoPorLead: 0, roi: 0,
  }
}

// ─── CALCULAR MÉTRICAS ─────────────────────────────────────────────────────────

export function calcularMetricas(envios: EnvioCampana[], costoUSD: number): MetricasCampana {
  const enviados    = envios.filter(e => e.estado !== 'pendiente' && e.estado !== 'fallido').length
  const entregados  = envios.filter(e => ['entregado','leido','respondido'].includes(e.estado)).length
  const leidos      = envios.filter(e => ['leido','respondido'].includes(e.estado)).length
  const respondidos = envios.filter(e => e.estado === 'respondido').length
  const fallidos    = envios.filter(e => e.estado === 'fallido').length

  return {
    totalContactos: envios.length,
    enviados,
    entregados,
    leidos,
    respondidos,
    fallidos,
    tasaApertura:  enviados  > 0 ? Math.round(leidos      / enviados  * 100) : 0,
    tasaRespuesta: enviados  > 0 ? Math.round(respondidos / enviados  * 100) : 0,
    costoPorLead:  respondidos > 0 ? Number((costoUSD / respondidos).toFixed(2)) : 0,
    roi: 0, // se calcula en el reporte cuando hay trámites cerrados
  }
}

// ─── ESTIMAR AUDIENCIA ────────────────────────────────────────────────────────
// Cuenta los clientes que cumplen el filtro dado.

export async function estimarAudiencia(
  gestoriaId: string,
  filtro:     FiltroAudiencia,
): Promise<number> {
  const clientesRef = collection(db, 'clientes')
  const q = query(clientesRef, where('gestoriaId', '==', gestoriaId))
  const snap = await getDocs(q)
  const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

  const ahora = new Date()

  switch (filtro.criterio) {
    case 'todos_clientes':
      return clientes.filter(c => c.telefono).length

    case 'sin_tramite_reciente': {
      const meses  = filtro.mesesSinTramite ?? 6
      const limite = new Date(ahora)
      limite.setMonth(limite.getMonth() - meses)
      const tramRef = collection(db, 'tramites')
      const tSnap   = await getDocs(query(tramRef, where('gestoriaId', '==', gestoriaId)))
      const activos = new Set(tSnap.docs.map(d => d.data().clienteId))
      const recientes = new Set(
        tSnap.docs
          .filter(d => d.data().creadoEn?.toDate?.() > limite)
          .map(d => d.data().clienteId)
      )
      return clientes.filter(c => c.telefono && activos.has(c.id) && !recientes.has(c.id)).length
    }

    case 'con_tramite_activo': {
      const tramRef = collection(db, 'tramites')
      const tSnap   = await getDocs(query(
        tramRef,
        where('gestoriaId', '==', gestoriaId),
        where('estado', 'in', ['pendiente', 'en_proceso']),
      ))
      const ids = new Set(tSnap.docs.map(d => d.data().clienteId))
      return clientes.filter(c => c.telefono && ids.has(c.id)).length
    }

    case 'por_tipo_tramite': {
      if (!filtro.tipoTramite) return 0
      const tramRef = collection(db, 'tramites')
      const tSnap   = await getDocs(query(
        tramRef,
        where('gestoriaId', '==', gestoriaId),
        where('tipo', '==', filtro.tipoTramite),
      ))
      const ids = new Set(tSnap.docs.map(d => d.data().clienteId))
      return clientes.filter(c => c.telefono && ids.has(c.id)).length
    }

    default:
      return clientes.filter(c => c.telefono).length
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function crearCampana(
  gestoriaId: string,
  input:      CampanaInput,
): Promise<string> {
  const ref = await addDoc(campanasCol(gestoriaId), {
    ...input,
    gestoriaId,
    estado:         'borrador',
    totalAudiencia: 0,
    costoUSD:       0,
    metricas:       metricasVacias(),
    creadoEn:       serverTimestamp() as unknown as Timestamp,
    actualizadoEn:  serverTimestamp() as unknown as Timestamp,
  } as any)
  return ref.id
}

export async function actualizarCampana(
  gestoriaId: string,
  id:         string,
  data:       Partial<Campana>,
): Promise<void> {
  await updateDoc(campanaDoc(gestoriaId, id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

export async function cambiarEstadoCampana(
  gestoriaId: string,
  id:         string,
  estado:     EstadoCampana,
): Promise<void> {
  const extra: Record<string, unknown> = { estado, actualizadoEn: serverTimestamp() }
  if (estado === 'completada') extra.completadaEn = serverTimestamp()
  if (estado === 'enviando')   extra.iniciadaEn   = serverTimestamp()
  await updateDoc(campanaDoc(gestoriaId, id), extra)
}

export async function eliminarCampana(gestoriaId: string, id: string): Promise<void> {
  await deleteDoc(campanaDoc(gestoriaId, id))
}

// ─── SUBSCRIPCIONES ───────────────────────────────────────────────────────────

export function subscribeCampanas(
  gestoriaId: string,
  onData:     (items: Campana[]) => void,
  onError?:   (err: any) => void,
): Unsubscribe {
  const q = query(campanasCol(gestoriaId), orderBy('creadoEn', 'desc'))
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as Campana))),
    onError,
  )
}

export function subscribeEnvios(
  gestoriaId: string,
  campanaId:  string,
  onData:     (items: EnvioCampana[]) => void,
  onError?:   (err: any) => void,
): Unsubscribe {
  const q = query(enviosCol(gestoriaId, campanaId), orderBy('enviadoEn', 'desc'))
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as EnvioCampana))),
    onError,
  )
}

// ─── SIMULAR ENVÍO (dev sin Meta API) ────────────────────────────────────────
// Cuando la Cloud Function de Meta no está disponible, simula el flujo
// para poder probar la UI completa.

export async function simularEnvioCampana(
  gestoriaId: string,
  campanaId:  string,
): Promise<void> {
  const envRef  = enviosCol(gestoriaId, campanaId)
  const clSnap  = await getDocs(query(
    collection(db, 'clientes'),
    where('gestoriaId', '==', gestoriaId),
  ))
  const clientes = clSnap.docs.slice(0, 5) // max 5 en modo simulación

  for (const cl of clientes) {
    const data = cl.data() as any
    await addDoc(envRef, {
      campanaId,
      gestoriaId,
      clienteId: cl.id,
      nombre:    `${data.nombre} ${data.apellido}`.trim(),
      telefono:  data.telefono ?? '5491100000000',
      estado:    'enviado',
      variables: [data.nombre ?? 'Cliente'],
      enviadoEn: serverTimestamp(),
    } as any)
  }

  await actualizarCampana(gestoriaId, campanaId, {
    estado:         'completada',
    totalAudiencia: clientes.length,
    costoUSD:       Number((clientes.length * COSTO_CONVERSACION_USD).toFixed(3)),
    completadaEn:   serverTimestamp() as unknown as Timestamp,
  })
}