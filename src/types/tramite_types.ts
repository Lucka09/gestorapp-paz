/**
 * TRAMITE TYPES
 * ─────────────────────────────────────────────────────────────────
 * Tipos principales para Trámites en GestorApp
 */

import type { Timestamp } from 'firebase/firestore'

export type EstadoTramite = 
  | 'pendiente'
  | 'en_proceso'
  | 'en_organismo'
  | 'documentacion_requerida'
  | 'entregado'
  | 'cancelado'

export type TipoTramite = 
  | 'transferencia'
  | 'inscripcion_inicial'
  | 'cambio_domicilio'
  | 'baja'
  | 'cambio_color'
  | 'descargo_multa'
  | 'duplicado_titulo'
  | 'otros'

export type MetodoPago = 
  | 'efectivo'
  | 'transferencia'
  | 'mercadopago'
  | 'cheque'
  | 'otro'

export interface PagoTramite {
  monto: number
  formaPago: 'efectivo' | 'transferencia' | 'cheque' | 'mixto' | 'mercadopago'
  fecha: Timestamp
  notas: string
  tipo: 'parcial' | 'total'
  numeroRecibo: string
  reciboId: string
  registradoPor: string
  registradoPorNombre: string
}

/**
 * INTERFAZ PRINCIPAL — TRAMITE
 * ─────────────────────────────────────────────────────────────────
 * IMPORTANTE: Incluye campos financieros para cálculos correctos
 */
export interface Tramite {
  // ─── IDENTIFICACIÓN ───────────────────────────────────────────
  id: string
  gestoriaId: string
  clienteId: string
  vehiculoId?: string
  numero?: string                  // Número de trámite correlativo
  
  // ─── DATOS BÁSICOS ────────────────────────────────────────────
  tipo: TipoTramite
  patente: string
  estado: EstadoTramite
  
  // ─── FECHAS ───────────────────────────────────────────────────
  creadoEn?: Timestamp
  actualizadoEn?: Timestamp
  fechaPago?: Timestamp
  
  // ─── DATOS OPERATIVOS ─────────────────────────────────────────
  asignadoA?: string              // UID del gestor/asesor
  asignadoANombre?: string
  creadoPor?: string              // UID de quién creó
  creadoPorNombre?: string
  
  // ─── PAGOS REGULARES (Trámites no-multa) ──────────────────────
  honorarios?: number             // $ de honorarios
  montoCobrado?: number           // $ cobrado acumulado
  pagado?: boolean
  formaPago?: 'efectivo' | 'transferencia' | 'cheque' | 'mixto' | 'mercadopago'
  notasPago?: string
  historialPagos?: PagoTramite[]
  
  // ─── PAGOS MULTA (NEW — IMPORTANTE) ────────────────────────────
  // NUEVO: Campos para desglose financiero correcto
  // Estos se guardan cuando se completa paso 7 en workflow de multa
  
  /** $ total que pagó el cliente (suma de honorarios + SUATS + informe) */
  totalCobradoCliente?: number
  
  /** 0 o $16.000 si se abonó SUATS (se excluye de premios) */
  costosSUATS?: number
  
  /** 0 o monto si se realizó informe de persona (se excluye de premios) */
  costosInformePersona?: number
  
  // ─── DATOS ADICIONALES ────────────────────────────────────────
  observaciones?: string
  documentosAdjuntos?: Array<{
    nombre: string
    url: string
    cargadoEn: Timestamp
  }>
  
  // ─── AUDITORÍA ────────────────────────────────────────────────
  ultimoAcceso?: Timestamp
  ultimoAccesoPor?: string
}

/**
 * INTERFAZ PARA CREAR/ACTUALIZAR
 */
export interface TramiteInput {
  tipo: TipoTramite
  patente: string
  clienteId: string
  vehiculoId?: string
  estado?: EstadoTramite
  honorarios?: number
  asignadoA?: string
  asignadoANombre?: string
}

/**
 * INTERFAZ PARA FILTROS
 */
export interface FiltrosTramitesPagina {
  estado?: EstadoTramite
  tipo?: TipoTramite
  clienteId?: string
  pagado?: boolean
  desde?: Timestamp
  hasta?: Timestamp
  buscar?: string
}

/**
 * INTERFAZ PARA REGISTRO DE PAGO
 */
export interface RegistroPago {
  monto: number
  metodoPago: MetodoPago
  fecha: string                    // ISO date string (YYYY-MM-DD)
  nota?: string
  registradoPor: string            // UID
  registradoPorNombre: string
}