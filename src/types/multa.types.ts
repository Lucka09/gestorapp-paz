// src/types/multa.types.ts
// ─── WORKFLOW DE MULTAS / INFRACCIONES (LIT) ─────────────────────────────────
// Un documento por trámite en la colección `multaWorkflow`
// Sigue el mismo patrón que InscripcionWorkflow en torre.types.ts

import { Timestamp } from 'firebase/firestore'
import type { FotoWorkflow, PasoConfig, PasoWorkflowBase } from '@/types/torre.types'

// ─── PASO 1: INGRESO DEL LIT ──────────────────────────────────────────────────
// El operador registra el número de LIT (Infracción en Litigio) y confirma
// que el trámite ingresó al sistema.

export interface MultaPaso1Data extends PasoWorkflowBase {
  numeroLIT: string  // Número de expediente / LIT
  observacionInicial?: string
}

// ─── PASO 2: PRESUPUESTO Y COBRO ─────────────────────────────────────────────
// El asesor envía el presupuesto al cliente. Una vez confirmado el pago,
// queda registrado en historial con método y monto.

export type MetodoPago = 'efectivo' | 'transferencia' | 'mercadopago' | 'cheque' | 'otro'

export interface RegistroPago {
  monto:      number
  metodoPago: MetodoPago
  nota?:      string
  registradoPor:       string
  registradoPorNombre: string
  registradoEn:        Timestamp
}

export interface MultaPaso2Data extends PasoWorkflowBase {
  presupuestoEnviado:  boolean
  pagoConfirmado:      boolean
  historialPagos:      RegistroPago[]  // puede taber pagos parciales o anticipo+saldo
  montoTotal:          number          // suma de historialPagos
}

// ─── PASO 3: DATOS DEL TITULAR + DOCUMENTACIÓN ───────────────────────────────
// Nombre, celular (obligatorios).
// DNI frente/dorso y cédula frente/dorso son OPCIONALES.
// Si falta algún documento, la observación es OBLIGATORIA.

export type EstadoDocumento = 'ok' | 'faltante' | 'incorrecto'

export interface MultaPaso3Data extends PasoWorkflowBase {
  // Datos de contacto — siempre obligatorios
  nombreCompleto: string
  celular:        string

  // Documentos — todos opcionales individualmente
  fotoDniFrente?:    FotoWorkflow
  fotoDniDorso?:     FotoWorkflow
  fotoCedulaFrente?: FotoWorkflow
  fotoCedulaDorso?:  FotoWorkflow

  // Estado de cada documento (para mostrar banners de advertencia)
  estadoDni?:    EstadoDocumento  // 'ok' | 'faltante' | 'incorrecto'
  estadoCedula?: EstadoDocumento

  // Observación: OBLIGATORIA si estadoDni != 'ok' || estadoCedula != 'ok'
  observacion?: string
}

// ─── PASO 4: DESCARGO Y SUATS ─────────────────────────────────────────────────
// Se preparan las cartas documento / descargo.
// Luego se obtiene el informe SUATS.

export interface MultaPaso4Data extends PasoWorkflowBase {
  descargoPreparado: boolean
  suatsObtenido:     boolean
  fotosSuats:        FotoWorkflow[]   // captura(s) del informe SUATS (opcional)
  notaDescargo?:     string
}

// ─── PASO 5: ENTREGA AL CLIENTE Y CIERRE ─────────────────────────────────────
// Se entrega el SUATS al cliente. Con esto el trámite se da por finalizado.

export interface MultaPaso5Data extends PasoWorkflowBase {
  suatsEntregado:    boolean
  fechaEntrega:      string   // "YYYY-MM-DD"
  canalEntrega:      'presencial' | 'whatsapp' | 'email' | 'otro'
  observacionFinal?: string
}

// ─── DOCUMENTO PRINCIPAL ──────────────────────────────────────────────────────

export interface MultaWorkflow {
  id:          string   // = tramiteId
  tramiteId:   string
  gestoriaId:  string
  pasoActual:  1 | 2 | 3 | 4 | 5 | 6   // 6 = finalizado/archivado
  creadoEn:    Timestamp
  actualizadoEn: Timestamp
  creadoPor:   string

  paso1?: MultaPaso1Data
  paso2?: MultaPaso2Data
  paso3?: MultaPaso3Data
  paso4?: MultaPaso4Data
  paso5?: MultaPaso5Data

  // Historial de auditoría (modificaciones admin)
  auditoria?: {
    campo:             string
    valorAnterior:     unknown
    valorNuevo:        unknown
    modificadoPor:     string
    modificadoPorNombre: string
    modificadoEn:      Timestamp
    nota?:             string
  }[]
}

// ─── CONFIGURACIÓN DE PASOS (para UI) ────────────────────────────────────────

export const PASOS_MULTA: PasoConfig[] = [
  {
    id: 1,
    codigo: 'LIT_INGRESADO',
    titulo: 'Ingreso del LIT',
    subtitulo: 'Registro del expediente de infracción en litigio',
    descripcion: 'Ingresá el número de LIT (Infracción en Litigio) para iniciar el seguimiento del trámite.',
    icono: '⚖️',
    color: '#64748b',
    fotos: false,
    requiereDatos: ['numeroLIT'],
    accion: 'Confirmar ingreso',
  },
  {
    id: 2,
    codigo: 'PRESUPUESTO_COBRO',
    titulo: 'Presupuesto y Cobro',
    subtitulo: 'Envío de presupuesto y confirmación de pago',
    descripcion: 'Enviá el presupuesto al cliente. Registrá el pago con método y monto una vez confirmado.',
    icono: '💰',
    color: '#3b82f6',
    fotos: false,
    requiereDatos: ['presupuestoEnviado', 'pagoConfirmado', 'metodoPago', 'monto'],
    accion: 'Confirmar cobro',
  },
  {
    id: 3,
    codigo: 'DOCUMENTACION',
    titulo: 'Datos del Titular y Documentación',
    subtitulo: 'Contacto + DNI y cédula (opcionales con observación)',
    descripcion: 'Cargá nombre y celular del titular. El DNI y la cédula son opcionales — si faltan, dejá una observación explicando el motivo.',
    icono: '📋',
    color: '#8b5cf6',
    fotos: true,
    cantidadFotos: 'variable',
    labelFotos: 'DNI y/o cédula del titular',
    requiereDatos: ['nombreCompleto', 'celular'],
    accion: 'Confirmar documentación',
  },
  {
    id: 4,
    codigo: 'DESCARGO_SUATS',
    titulo: 'Descargo y SUATS',
    subtitulo: 'Preparación de cartas documento e informe SUATS',
    descripcion: 'Prepará las cartas documento/descargo y obtené el informe SUATS. Podés adjuntar capturas del SUATS.',
    icono: '📝',
    color: '#f59e0b',
    fotos: true,
    cantidadFotos: 'variable',
    labelFotos: 'Informe SUATS',
    requiereDatos: ['descargoPreparado', 'suatsObtenido'],
    accion: 'Confirmar SUATS obtenido',
  },
  {
    id: 5,
    codigo: 'ENTREGA_CIERRE',
    titulo: 'Entrega al Cliente y Cierre',
    subtitulo: 'Entrega del SUATS y archivo del trámite',
    descripcion: 'Confirmá la entrega del SUATS al cliente. Con esto el trámite queda finalizado y archivado.',
    icono: '✅',
    color: '#10b981',
    fotos: false,
    requiereDatos: ['suatsEntregado', 'fechaEntrega', 'canalEntrega'],
    accion: 'Finalizar y archivar',
  },
  {
    id: 6,
    codigo: 'FINALIZADO',
    titulo: 'Finalizado y Archivado',
    subtitulo: 'Trámite completado',
    descripcion: 'El trámite fue completado y archivado correctamente.',
    icono: '🗂️',
    color: '#10b981',
    fotos: false,
    accion: undefined,
  },
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function esMultaWorkflow(tipo: string): boolean {
  return tipo === 'descargo_multa'
}

/** Retorna true si el paso 3 requiere observación obligatoria */
export function observacionObligatoria(paso3: Partial<MultaPaso3Data>): boolean {
  const dniCompleto    = !!paso3.fotoDniFrente && !!paso3.fotoDniDorso
  const cedulaCompleta = !!paso3.fotoCedulaFrente && !!paso3.fotoCedulaDorso
  return !dniCompleto || !cedulaCompleta
}

/** Suma total de pagos en el historial */
export function calcularMontoTotal(historial: RegistroPago[]): number {
  return historial.reduce((acc, p) => acc + p.monto, 0)
}