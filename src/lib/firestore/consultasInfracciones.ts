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
  collection, doc, query, where, onSnapshot, updateDoc, getDoc,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConsultaInfraccion, EstadoConsulta } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'

const consultasCOL = collection(db, 'consultasInfracciones')
const consultaDoc  = (id: string) => doc(db, 'consultasInfracciones', id)

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Todas las consultas de la gestoría (el hook ordena y filtra por privacidad). */
export function subscribeConsultas(
  gestoriaId: string,
  callback:   (items: ConsultaInfraccion[]) => void,
): Unsubscribe {
  const q = query(consultasCOL, where('gestoriaId', '==', gestoriaId))
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...(d.data() as ConsultaInfraccion), id: d.id }))),
  )
}

// ─── ASIGNACIÓN (privacidad) ────────────────────────────────────────────────

/**
 * Asigna (o desasigna con null) una consulta a un usuario. La visibilidad de la
 * consulta sigue a `asignadoA`: solo la ven el asignado + los admins.
 */
export async function asignarConsulta(
  consultaId: string,
  asignado:   { uid: string; nombre: string } | null,
): Promise<void> {
  await updateDoc(consultaDoc(consultaId), {
    asignadoA:       asignado?.uid ?? null,
    asignadoANombre: asignado?.nombre ?? null,
    asignadaEn:      serverTimestamp(),
  })
}

/**
 * Auto-claim: asigna la consulta al usuario SOLO si todavía no tiene dueño.
 * Se usa cuando alguien trabaja/envía una consulta del pool: queda a su nombre.
 * No pisa una asignación existente.
 */
export async function reclamarConsultaSiLibre(
  consultaId: string,
  usuario:    { uid: string; nombre: string },
): Promise<void> {
  const snap = await getDoc(consultaDoc(consultaId))
  const data = snap.data() as ConsultaInfraccion | undefined
  if (data?.asignadoA) return   // ya tiene dueño → no tocar
  await updateDoc(consultaDoc(consultaId), {
    asignadoA:       usuario.uid,
    asignadoANombre: usuario.nombre,
    creadoPor:       data?.creadoPor ?? usuario.uid,
    creadoPorNombre: data?.creadoPorNombre ?? usuario.nombre,
    asignadaEn:      serverTimestamp(),
  })
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

/**
 * Persiste el presupuesto calculado en el frontend (filas + totales + mensaje).
 * Se llama desde PresupuestoMultas cuando se genera/ajusta la cotización.
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