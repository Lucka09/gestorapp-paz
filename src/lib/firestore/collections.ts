// Centraliza todas las referencias a colecciones de Firestore
// Importar desde acá en lugar de hardcodear strings por toda la app

import {
  collection,
  doc,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore'
import { db } from '../firebase'
import type {
  Usuario, Cliente, Vehiculo, Tramite,
  Turno, Notificacion, Configuracion,
} from '@/types'

// ─── COLECCIONES ──────────────────────────────────────────────────────────────

export const usersCol         = collection(db, 'users')         as CollectionReference<Usuario>
export const clientesCol      = collection(db, 'clientes')      as CollectionReference<Cliente>
export const vehiculosCol     = collection(db, 'vehiculos')     as CollectionReference<Vehiculo>
export const tramitesCol      = collection(db, 'tramites')      as CollectionReference<Tramite>
export const turnosCol        = collection(db, 'turnos')        as CollectionReference<Turno>
export const notificacionesCol= collection(db, 'notificaciones')as CollectionReference<Notificacion>

// ─── DOCS DE CONFIGURACIÓN ────────────────────────────────────────────────────

export const configuracionDoc = doc(db, 'configuracion', 'gestor') as DocumentReference<Configuracion>

// ─── HELPERS DE REFERENCIA ────────────────────────────────────────────────────

export const userDoc         = (uid: string)      => doc(usersCol, uid)
export const clienteDoc      = (id: string)       => doc(clientesCol, id)
export const vehiculoDoc     = (id: string)       => doc(vehiculosCol, id)
export const tramiteDoc      = (id: string)       => doc(tramitesCol, id)
export const turnoDoc        = (id: string)       => doc(turnosCol, id)
export const notificacionDoc = (id: string)       => doc(notificacionesCol, id)

// ─── GENERADOR DE NÚMERO DE TRÁMITE ──────────────────────────────────────────

export function generarNumeroTramite(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `TRM-${year}-${rand}`
}
