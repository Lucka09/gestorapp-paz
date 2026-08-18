// src/types/cupon_types.ts
// ─── CUPONES DE INFRACCIÓN (PDFs del portal + evaluación de cinemómetros) ───
// Cada trámite tiene una subcolección `cupones` (uno por acta/nroCausa).
// El tracking del job de descarga vive en `descargaCupones/{tramiteId}` (doc raíz).

import type { Timestamp } from 'firebase/firestore'
import type { EstadoVerificacion } from '@/lib/cinemometros'

export type EstadoDescargaCupon =
  | 'pendiente'    // en cola, sin tocar
  | 'descargando'  // extensión lo está bajando
  | 'subiendo'     // subiendo a Cloud Storage
  | 'parseando'    // backend procesando PDF
  | 'ok'           // todo listo + evaluado
  | 'error_pdf'    // el portal devolvió algo raro (no es PDF)
  | 'error_parse'  // no se pudo extraer la serie/fecha del PDF
  | 'error_storage'// falló Cloud Storage
  | 'reintentar'   // error transitorio, reintentar más tarde
  | 'omitido'      // el operador lo marcó a mano para no procesar

export interface CuponInfraccion {
  id: string                    // = nroCausa
  tramiteId: string
  gestoriaId: string
  nroCausa: string              // ej: '02-155-00139546-6-00'
  nroActa: string               // del JSON original de la consulta
  dominio: string
  fechaHechoISO?: string        // parseado del PDF

  // Cloud Storage
  storagePath: string           // gs://gestorapp-cupones/{gid}/{tid}/{nroCausa}.pdf
  signedUrl?: string            // firmada 7 días, regenerable
  signedUrlExpira?: Timestamp
  pdfSizeBytes: number

  // Campos extraídos del PDF
  marca?: string                // 'TS TECNOLOGY'
  modelo?: string               // 'TS CONTROL-X V2'
  serieOriginal?: string        // 'TS_CONTROL_X_0314' (tal cual del PDF)
  serieNormalizada?: string     // 'TSCONTROLX0314' (para buscar en cinemometros)
  valorUF?: number
  importeNeto?: number
  fechaVencimiento?: string     // YYYY-MM-DD
  cantidadUF?: number

  // Evaluación contra base INTI (F1)
  evaluacion?: {
    estado: EstadoVerificacion
    cinemometro?: { marca: string; modelo: string; codAprobacion: string }
    ultimaVerifAnterior?: { original: string; iso: string; vencimiento: string }
    diasExceso?: number
    ambigua?: boolean
    fundamentos: string[]
  }

  // Estado
  estado: EstadoDescargaCupon
  errorDetalle?: string         // si estado empieza con error_

  // Auditoría
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
  reintentos: number            // max 3
  ultimoIntento?: Timestamp
  errorDetalle?: string
}

export interface DescargaCuponesJob {
  id: string                    // = tramiteId
  tramiteId: string
  gestoriaId: string
  estadoGeneral:
    | 'pendiente'               // todavía no arrancó
    | 'en_progreso'             // la extensión está descargando
    | 'pausado'                 // operador lo pausó
    | 'completado'              // todos ok
    | 'parcial'                 // algunos ok, otros con error
    | 'cancelado'
  totalItems: number
  completadosOk: number
  conError: number
  omitidos: number
  items: ItemDescargaCupon[]

  iniciadoEn: Timestamp
  iniciadoPor: string
  iniciadoPorNombre: string
  completadoEn?: Timestamp
  pausadoEn?: Timestamp
  canceladoEn?: Timestamp
  canceladoPor?: string
}