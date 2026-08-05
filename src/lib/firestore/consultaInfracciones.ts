// src/lib/firestore/consultasInfracciones.ts
// ─── CAPA DE DATOS — CONSULTAS DE INFRACCIONES ──────────────────────────────
//
// Las consultas nacen en la cola (origen web/manual), las procesa la extensión
// (estado → cotizada) y desde acá GestorApp las lista, genera el presupuesto y
// las envía. `persistirDatosPresupuesto` es la pieza que cierra la "fuente única
// de verdad": la matemática vive en el frontend (calcularPresupuesto) y su
// resultado se guarda en la consulta, así imagen y mensaje nunca discrepan.
//
// Nota de costo: no ordenamos en la query (evita un índice compuesto extra);
// el volumen de leads es bajo y se ordena en memoria en el hook.

import {
  collection, doc, query, where, onSnapshot, updateDoc,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConsultaInfraccion, EstadoConsulta } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'

const consultasCOL = collection(db, 'consultasInfracciones')
const consultaDoc  = (id: string) => doc(db, 'consultasInfracciones', id)

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Todas las consultas de la gestoría (el hook ordena por fecha en memoria). */
export function subscribeConsultas(
  gestoriaId: string,
  callback:   (items: ConsultaInfraccion[]) => void,
): Unsubscribe {
  const q = query(consultasCOL, where('gestoriaId', '==', gestoriaId))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...(d.data() as ConsultaInfraccion), id: d.id }))),
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

/**
 * Persiste el presupuesto calculado en el frontend (filas + totales + mensaje).
 * Se llama desde PresupuestoMultas cuando Jessica genera/ajusta la cotización.
 */
export async function persistirDatosPresupuesto(
  consultaId: string,
  datos:      DatosPresupuesto,
): Promise<void> {
  await updateDoc(consultaDoc(consultaId), {
    datosPresupuesto: datos,
    mensajeWhatsapp:  datos.mensajeWhatsapp,
  })
}

/** Marca la consulta como enviada al cliente (con link al PDF si se subió). */
export async function marcarConsultaEnviada(
  consultaId: string,
  extra?:     { pdfUrl?: string },
): Promise<void> {
  await updateDoc(consultaDoc(consultaId), {
    estado:    'enviada' as EstadoConsulta,
    ...(extra?.pdfUrl ? { pdfUrl: extra.pdfUrl } : {}),
    enviadaEn: serverTimestamp(),
  })
}

/** Descarta una consulta (dato inválido / cliente que no avanza). */
export async function descartarConsulta(consultaId: string): Promise<void> {
  await updateDoc(consultaDoc(consultaId), { estado: 'descartada' as EstadoConsulta })
}