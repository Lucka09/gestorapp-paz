// src/types/transferencia_types.ts
// ─── WORKFLOW DE TRANSFERENCIA — 7 PASOS ──────────────────────────────────────

import type { Timestamp } from 'firebase/firestore'
import type { FotoWorkflow, GeoRegistro } from '@/torre_types'

// ─── ESTADOS ──────────────────────────────────────────────────────────────────

export type EstadoTransferenciaWorkflow =
  | 'carga_datos'         // paso 1: asesor/admin cargando datos
  | 'carga_documentos'    // paso 2: subiendo documentación
  | 'en_registro'         // paso 3: gestor presentó docs, esperando recibos
  | 'seguimiento'         // paso 4: esperando que el registro procese
  | 'recibo_listo'        // paso 5: registro notificó recibo listo
  | 'retiro_confirmado'   // paso 6: gestor se presentó y retiró
  | 'completado'          // paso 7: entregado al cliente, archivado

// ─── PASO 1 — Datos del trámite ───────────────────────────────────────────────

export interface TrfPaso1Data {
  clienteId:            string
  vehiculoId:           string
  futuraRadicacion:     boolean   // determina plazos y docs adicionales
  // Si futuraRadicacion = true
  jurisdiccionDestino?: string    // provincia/municipio destino
  observacion?:         string

  creadoPor:            string
  creadoPorNombre:      string
  creadoEn:             Timestamp
}

// ─── PASO 2 — Documentación ───────────────────────────────────────────────────

export interface DocPar {
  frente?: FotoWorkflow
  dorso?:  FotoWorkflow
}

export interface TrfPaso2Data {
  // Documentación OBLIGATORIA (todos frente y dorso)
  formulario08:         DocPar   // Formulario 08 o 08 Digital
  titulo:               DocPar   // Título del vehículo
  cedula:               DocPar   // Cédula verde
  verificacionPolicial: DocPar   // Verificación policial
  dniComprador:         DocPar   // DNI del comprador

  // CONDICIONAL: solo si paso1.futuraRadicacion = true
  formulario04?:        DocPar   // Formulario 04

  observacion?:         string

  completadoPor:        string
  completadoPorNombre:  string
  completadoEn:         Timestamp
}

// ─── PASO 3 — Presentación al registro y recibos ──────────────────────────────

export interface TrfPaso3Data {
  // Recibos — OBLIGATORIOS (mínimo frente). Dorso opcional dentro del DocPar.
  reciboTransferencia:  DocPar   // frente requerido, dorso opcional
  reciboArba:           DocPar   // frente requerido, dorso opcional
  reciboSuats:          DocPar   // frente requerido, dorso opcional

  // Monto a abonar al registro
  montoRegistro:        number
  notaMontoRegistro?:   string

  // Geo de presencia en el registro
  geoPresencia?:        GeoRegistro

  observacion?:         string
  completadoPor:        string
  completadoPorNombre:  string
  completadoEn:         Timestamp
}

// ─── PASO 4 — Seguimiento de plazos ───────────────────────────────────────────

export interface SeguimientoEntrada {
  fecha:       Timestamp
  observacion: string   // "El registro aún no tiene el recibo listo"
  registradoPor:       string
  registradoPorNombre: string
}

export interface TrfPaso4Data {
  // Configuración de alertas según futuraRadicacion
  // Sin futura radicación: plazo 3-21 días, alertas cada 3-5 días
  // Con futura radicación: plazo hasta 45 días, alertas cada 5-7 días
  frecuenciaAlertaDias:  3 | 5 | 7   // cada cuántos días se genera la alerta
  plazoMaximoDias:       21 | 45      // plazo total del trámite

  // Historial de seguimientos
  seguimientos:          SeguimientoEntrada[]

  // Próxima alerta programada
  proximaAlerta?:        Timestamp

  completadoPor:         string
  completadoPorNombre:   string
  completadoEn:          Timestamp   // cuando se confirma que el recibo está listo
}

// ─── PASO 5 — Recibo listo para retirar ───────────────────────────────────────

export type NombreRegistro =
  | 'Registro Seccional San Martín'
  | 'Registro Seccional Palermo'
  | 'Registro Seccional La Plata'
  | 'Registro Seccional Quilmes'
  | 'Registro Seccional Lomas de Zamora'
  | 'Registro Seccional Morón'
  | 'Registro Seccional Lanús'
  | 'Otro'

export interface TrfPaso5Data {
  reciboListo:           boolean   // check confirmación
  fechaTurnoRetiro:      string    // YYYY-MM-DD
  horaTurnoRetiro?:      string    // HH:MM
  registroNombre:        string    // nombre del registro a presentarse
  registroDireccion?:    string    // dirección opcional

  // Alertas programadas (se calculan al guardar)
  alerta24hs?:           Timestamp // fechaTurnoRetiro - 1 día
  alertaDiaTurno?:       Timestamp // el mismo día del turno a las 8am

  observacion?:          string
  completadoPor:         string
  completadoPorNombre:   string
  completadoEn:          Timestamp
}

// ─── PASO 6 — Confirmación de presencia y retiro ──────────────────────────────

export interface TrfPaso6Data {
  presentadoEnRegistro:  boolean
  geoRetiro?:            GeoRegistro   // ubicación al momento del retiro
  fotoComprobanteRetiro:  FotoWorkflow  // foto del recibo físico retirado — OBLIGATORIO
  observacion?:          string

  completadoPor:         string
  completadoPorNombre:   string
  completadoEn:          Timestamp
}

// ─── PASO 7 — Entrega al cliente y cierre ─────────────────────────────────────

export interface TrfPaso7Data {
  entregadoAlCliente:    boolean
  canalEntrega:          'presencial' | 'whatsapp' | 'email' | 'otro'
  fotoEntrega?:          FotoWorkflow  // constancia de entrega (opcional)
  observacionFinal?:     string

  completadoPor:         string
  completadoPorNombre:   string
  completadoEn:          Timestamp
}

// ─── DOCUMENTO PRINCIPAL ──────────────────────────────────────────────────────

export interface TransferenciaWorkflow {
  id:                    string   // = tramiteId
  tramiteId:             string
  gestoriaId:            string
  pasoActual:            1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  estadoWorkflow:        EstadoTransferenciaWorkflow

  // Quién inició
  iniciadoPor:           string
  iniciadoPorNombre:     string

  // Gestor/Mandatario asignado para la gestión en el registro
  gestorId?:             string
  gestorNombre?:         string

  // Recordatorios programados
  recordatorioSeguimiento?: Timestamp   // próxima alerta de seguimiento
  recordatorio24hs?:        Timestamp
  recordatorioDiaTurno?:    Timestamp

  creadoEn:              Timestamp
  actualizadoEn:         Timestamp

  paso1?: TrfPaso1Data
  paso2?: TrfPaso2Data
  paso3?: TrfPaso3Data
  paso4?: TrfPaso4Data
  paso5?: TrfPaso5Data
  paso6?: TrfPaso6Data
  paso7?: TrfPaso7Data
}

// ─── CONFIGURACIÓN UI ─────────────────────────────────────────────────────────

export const PASOS_TRANSFERENCIA = [
  { id: 1, titulo: 'Datos del trámite',          icono: '📋', rol: 'asesor' },
  { id: 2, titulo: 'Documentación',              icono: '📄', rol: 'asesor' },
  { id: 3, titulo: 'Presentación y recibos',     icono: '🏛️', rol: 'gestor' },
  { id: 4, titulo: 'Seguimiento de plazos',      icono: '⏱️', rol: 'gestor' },
  { id: 5, titulo: 'Recibo listo — turno',       icono: '📅', rol: 'gestor' },
  { id: 6, titulo: 'Confirmación de retiro',     icono: '📍', rol: 'gestor' },
  { id: 7, titulo: 'Entrega al cliente y cierre',icono: '🗂️', rol: 'asesor' },
] as const

export const ESTADO_TRF_LABELS: Record<EstadoTransferenciaWorkflow, string> = {
  carga_datos:        'Carga de datos',
  carga_documentos:   'Carga de documentación',
  en_registro:        'Presentado en registro',
  seguimiento:        'En seguimiento',
  recibo_listo:       'Recibo listo — turno agendado',
  retiro_confirmado:  'Recibo retirado',
  completado:         'Completado',
}

export const ESTADO_TRF_COLORS: Record<EstadoTransferenciaWorkflow, string> = {
  carga_datos:        'bg-gray-100 text-gray-600',
  carga_documentos:   'bg-blue-100 text-blue-700',
  en_registro:        'bg-purple-100 text-purple-700',
  seguimiento:        'bg-amber-100 text-amber-700',
  recibo_listo:       'bg-emerald-100 text-emerald-700',
  retiro_confirmado:  'bg-teal-100 text-teal-700',
  completado:         'bg-green-100 text-green-700',
}

// Helpers de plazo según futura radicación
export function getConfigPlazos(futuraRadicacion: boolean) {
  return {
    plazoMaximoDias:      futuraRadicacion ? 45 : 21,
    frecuenciaAlertaDias: futuraRadicacion ? 7  : 5,
    label:                futuraRadicacion
      ? 'Hasta 45 días hábiles (con futura radicación)'
      : 'Entre 3 y 21 días hábiles',
  }
}