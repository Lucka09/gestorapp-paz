// src/cupon_types.ts
// ─── CUPONES DE INFRACCIÓN (PDFs del portal + evaluación de cinemómetros) ───

import type { Timestamp } from 'firebase/firestore'
import type { EstadoVerificacion } from './lib/cinemometros'

export type EstadoDescargaCupon =
  | 'pendiente'
  | 'descargando'
  | 'subiendo'
  | 'parseando'
  | 'ok'
  | 'error_pdf'
  | 'error_parse'
  | 'error_storage'
  | 'reintentar'
  | 'omitido'

export interface CuponInfraccion {
  id: string
  tramiteId: string
  gestoriaId: string
  nroCausa: string
  nroActa: string
  dominio: string
  fechaHechoISO?: string
  storagePath: string
  signedUrl?: string
  signedUrlExpira?: Timestamp
  pdfSizeBytes: number
  marca?: string
  modelo?: string
  serieOriginal?: string
  serieNormalizada?: string
  valorUF?: number
  importeNeto?: number
  fechaVencimiento?: string
  cantidadUF?: number
  evaluacion?: {
    estado: EstadoVerificacion
    cinemometro?: { marca: string; modelo: string; codAprobacion: string }
    ultimaVerifAnterior?: { original: string; iso: string; vencimiento: string }
    diasExceso?: number
    ambigua?: boolean
    fundamentos: string[]
  }
  estado: EstadoDescargaCupon
  errorDetalle?: string
  descargadoPor?: string
  descargadoPorNombre?: string
  descargadoEn?: Timestamp
  creadoEn: Timestamp
  actualizadoEn: Timestamp
}

export interface ItemDescargaCupon {
  nroCausa: string
  nroActa: string
  estado: EstadoDescargaCupon
  reintentos: number
  ultimoIntento?: Timestamp
  errorDetalle?: string
}

export interface DescargaCuponesJob {
  id: string
  tramiteId: string
  gestoriaId: string
  estadoGeneral:
    | 'pendiente'
    | 'en_progreso'
    | 'pausado'
    | 'completado'
    | 'parcial'
    | 'cancelado'
  totalItems: number
  completadosOk: number
  conError: number
  omitidos: number
  items: Record<string, ItemDescargaCupon>
  iniciadoEn: Timestamp
  iniciadoPor: string
  iniciadoPorNombre: string
  completadoEn?: Timestamp
  pausadoEn?: Timestamp
  canceladoEn?: Timestamp
  canceladoPor?: string
}