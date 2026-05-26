// Centraliza todas las referencias a colecciones de Firestore
// Importar desde acá en lugar de hardcodear strings por toda la app

import {
  collection,
  doc,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type {
  Usuario, Cliente, Vehiculo, Tramite,
  Turno, Notificacion, Configuracion,
} from '@/types'
import type { ConversacionWA } from '@/wa_types'
// ─── COLECCIONES ──────────────────────────────────────────────────────────────

export const usersCol         = collection(db, 'users')         as CollectionReference<Usuario>
export const clientesCol      = collection(db, 'clientes')      as CollectionReference<Cliente>
export const vehiculosCol     = collection(db, 'vehiculos')     as CollectionReference<Vehiculo>
export const tramitesCol      = collection(db, 'tramites')      as CollectionReference<Tramite>
export const turnosCol        = collection(db, 'turnos')        as CollectionReference<Turno>
export const notificacionesCol= collection(db, 'notificaciones')as CollectionReference<Notificacion>
export const conversacionesWACol = collection(db, 'conversacionesWA') as CollectionReference<ConversacionWA>
// ─── DOCS DE CONFIGURACIÓN ────────────────────────────────────────────────────

export const configuracionDoc = doc(db, 'configuracion', 'gestor') as DocumentReference<Configuracion>

// ─── HELPERS DE REFERENCIA ────────────────────────────────────────────────────

export const userDoc         = (uid: string)      => doc(usersCol, uid)
export const clienteDoc      = (id: string)       => doc(clientesCol, id)
export const vehiculoDoc     = (id: string)       => doc(vehiculosCol, id)
export const tramiteDoc      = (id: string)       => doc(tramitesCol, id)
export const turnoDoc        = (id: string)       => doc(turnosCol, id)
export const notificacionDoc = (id: string)       => doc(notificacionesCol, id)

// ─── CÓDIGOS DE TIPO DE TRÁMITE ──────────────────────────────────────────────

export const CODIGO_TRAMITE: Record<string, string> = {
  transferencia:            'TRF',
  alta:                     'ALT',
  baja:                     'BAJ',
  tramite_08:               'T08',
  duplicado_titulo:         'DTI',
  duplicado_cedula:         'DCE',
  cambio_radicacion:        'RAD',
  informe_dominio:          'IND',
  certificado_dominio:      'CED',
  inscripcion_inicial:      'INS',
  prenda:                   'PRE',
  descargo_multa:           'MUL',
  inhibicion:               'INH',
  levantamiento_inhibicion: 'LEV',
  vtv:                      'VTV',
  otro:                     'OTR',
}

// ─── GENERADOR DE NÚMERO DE TRÁMITE ──────────────────────────────────────────
// Formato: [TIPO]-[AÑO2D]-[SEQ4]  →  ej: TRF-26-0001 · MUL-26-0042
// El secuencial se pasa desde tramites.ts donde se cuenta el total del año.
// Si no se proporciona secuencial, usa timestamp como fallback seguro.

export function generarNumeroTramite(tipo?: string, secuencial?: number): string {
  const año = new Date().getFullYear().toString().slice(-2)
  const cod = tipo ? (CODIGO_TRAMITE[tipo] ?? 'OTR') : 'TRM'
  const seq = secuencial != null
    ? String(secuencial).padStart(4, '0')
    : String(Math.floor(Date.now() / 1000) % 10000).padStart(4, '0')
  return `${cod}-${año}-${seq}`
}