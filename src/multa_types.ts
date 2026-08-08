// src/types/multa_types.ts
// ─── WORKFLOW DE MULTAS / INFRACCIONES — 7 PASOS ─────────────────────────────

import { Timestamp } from 'firebase/firestore'
import type { FotoWorkflow } from '@/torre_types'

// ─── ESTADOS DEL WORKFLOW ─────────────────────────────────────────────────────

export type EstadoMultaWorkflow =
  | 'recepcion'          // pasos 1-2: asesor cargando datos y documentación
  | 'en_revision'        // paso 3: admin haciendo pre-revisión
  | 'rebotado'           // admin rebotó al asesor — esperando resolución
  | 'en_espera_mesa'     // esperando mesa de ayuda externa (24-72hs)
  | 'en_gestion'         // paso 4: revisión profunda multa x multa
  | 'borradores_listos'  // borradores de descargo preparados
  | 'descargo_subido'    // paso 5 completado
  | 'suats_generado'     // paso 6 con SUATS
  | 'resuelto_sin_suats' // paso 6 sin SUATS (cliente no lo requería)
  | 'completado'         // paso 7 — archivado

// ─── PAGO / HONORARIOS ────────────────────────────────────────────────────────

export type MetodoPago = 'efectivo' | 'transferencia' | 'mercadopago' | 'cheque' | 'otro'

export interface RegistroPago {
  monto:               number
  metodoPago:          MetodoPago
  nota?:               string
  registradoPor:       string
  registradoPorNombre: string
  registradoEn:        Timestamp
}

// ─── PASO 1 — Recepción de datos (Asesor) ─────────────────────────────────────

export interface MultaPaso1Data {
  patente:          string
  nombreCompleto:   string
  dni:              string
  fechaTramite:     string    // YYYY-MM-DD — campo crítico con advertencia
  fechaInfraccion?: string    // YYYY-MM-DD — fecha de la infracción (editable posterior)
  requiereSUATS:    boolean
  observacion?:     string
  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── PASO 2 — Documentación + Honorarios (Asesor) ─────────────────────────────

export interface MultaPaso2Data {
  // Documentos — DNI obligatorio, cédula/título opcionales
  fotoDniFrente?:    FotoWorkflow
  fotoDniDorso?:     FotoWorkflow
  fotoCedulaFrente?: FotoWorkflow   // opcional
  fotoCedulaDorso?:  FotoWorkflow   // opcional
  fotoTituloFrente?: FotoWorkflow   // alternativa si no hay cédula
  fotoTituloDorso?:  FotoWorkflow   // alternativa si no hay cédula
  tieneCedula:       boolean
  tieneTitulo:       boolean
  // Observación OBLIGATORIA si falta cédula Y título
  observacionDocumentacion?: string

  // Honorarios
  presupuestoEnviado: boolean
  pagoConfirmado:     boolean
  historialPagos:     RegistroPago[]
  montoTotal:         number

  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── PASO 3 — Pre-revisión Admin ──────────────────────────────────────────────

export type ResultadoPreRevision = 'ok' | 'rebotado' | 'mesa_ayuda'

export interface MultaPaso3Data {
  resultado: ResultadoPreRevision

  // Observación general (siempre disponible)
  observacion?: string

  // Si resultado === 'rebotado'
  motivoRebote?:       string
  rebotadoAUid?:       string    // uid del asesor que inició
  rebotadoANombre?:    string

  // Si resultado === 'mesa_ayuda'
  motivoMesaAyuda?:   string
  emailMesaAyuda?:    string    // email al que se derivó
  plazoEspera?:       '24hs' | '48hs' | '72hs'
  fechaLimiteEspera?: Timestamp // para recordatorio automático

  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── SUB-PASO: Resolución del rebote (Asesor) ─────────────────────────────────

export interface MultaReboteResolucion {
  // Si consiguió el DNI del infractor
  fotoDniInfractorFrente?: FotoWorkflow
  fotoDniInfractorDorso?:  FotoWorkflow

  // Si requiere informe de persona en lugar de DNI
  requiereInformePersona?:   boolean
  informePersonaPagado?:     boolean
  fechaPagoInformePersona?:  Timestamp  // para calcular 24hs de espera

  observacion?: string
  resueltoBy:          string
  resueltoPorNombre:   string
  resueltoEn:          Timestamp
}

// ─── PASO 4 — Revisión profunda (Admin) ───────────────────────────────────────

export interface MultaPaso4Data {
  notasRevision:   string    // campo libre para documentar multa x multa
  cantidadMultas?: number
  borradoresListos: boolean
  observacion?:    string
  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── PASO 5 — Carga del descargo (Admin) ──────────────────────────────────────

export interface MultaPaso5Data {
  fotosDescargo:  FotoWorkflow[]
  observacion?:   string
  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── PASO 6 — SUATS o resolución (Admin) ──────────────────────────────────────

export interface MultaPaso6Data {
  suatsGenerado:  boolean         // true si el cliente requería SUATS
  fotosSuats?:    FotoWorkflow[]  // capturas del informe SUATS
  observacion?:   string
  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── PASO 7 — Cierre y entrega (Asesor / At. Cliente) ─────────────────────────

export interface MultaPaso7Data {
  clienteAvisado:   boolean
  suatsEntregado?:  boolean    // solo si requiereSUATS
  canalEntrega:     'presencial' | 'whatsapp' | 'email' | 'otro'
  observacionFinal?: string

  // ─── SUATS abonado ────────────────────────────────────────────────────────
  // Si la gestoría tuvo que abonar el SUATS por el cliente
  suatsAbonado?:    boolean
  montoSUATS?:      number   // monto abonado por SUATS

  // ─── Informe de persona ───────────────────────────────────────────────────
  // Si se requirió informe de persona (datos del titular para el descargo)
  informePersonaRealizado?: boolean
  montoInformePersona?:     number   // costo del informe de persona

  // ─── Pago total del recibo (OBLIGATORIO para finalizar) ──────────────────
  // Suma de: honorarios gestoría + SUATS (si abonado) + informe persona (si realizado)
  pagoTotalRecibo:  number

  completadoPor:       string
  completadoPorNombre: string
  completadoEn:        Timestamp
}

// ─── DOCUMENTOS ADICIONALES ───────────────────────────────────────────────────
// Para patentes con multas a nombre de MÁS DE UN DNI: cada carga es un ítem
// aparte que se suma a los documentos base del paso 2, sin sobrescribirlos.

export interface DocumentoAdicional {
  id:        string          // id local (uuid)
  etiqueta:  string          // ej: "DNI 2do titular", "DNI infractor", "Informe persona"
  dni?:      string
  nombre?:   string
  frente?:   FotoWorkflow
  dorso?:    FotoWorkflow
  extra?:    FotoWorkflow[]  // por si hace falta más de 2 imágenes
  agregadoPor:       string
  agregadoPorNombre: string
  agregadoEn:        Timestamp
}

// ─── DOCUMENTO PRINCIPAL ──────────────────────────────────────────────────────

export interface MultaWorkflow {
  id:            string    // = tramiteId
  tramiteId:     string
  gestoriaId:    string
  pasoActual:    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8   // 8 = finalizado
  estadoWorkflow: EstadoMultaWorkflow

  // Quién inició (asesor comercial)
  iniciadoPor:       string
  iniciadoPorNombre: string

  // Admin asignado para la gestión
  asignadoAdminId?:     string
  asignadoAdminNombre?: string

  // Recordatorio mesa de ayuda (para alertas)
  recordatorioMesaAyuda?: Timestamp

  // ─── FECHA DEL TRÁMITE EDITABLE ───────────────────────────────────────────
  fechaTramiteActual?:     string      // copia sincronizada de paso1.fechaTramite (para alertas)
  alertaFechaTramite48h?:  Timestamp   // 48hs antes → alerta in-app
  alertaFechaTramite24h?:  Timestamp   // 24hs antes → alerta in-app
  historialFechaTramite?: {
    valorAnterior:       string
    valorNuevo:          string
    modificadoPor:       string
    modificadoPorNombre: string
    modificadoEn:        Timestamp
    nota?:               string
  }[]

  // ─── ESTADO OPERATIVO DE MULTA (visible para operadores) ──────────────────
  // Override manual. Si existe, gana sobre el estado derivado del workflow.
  estadoMultaManual?:      EstadoMulta
  estadoMultaManualPor?:   string
  estadoMultaManualNombre?:string
  estadoMultaManualEn?:    Timestamp

  // ─── DOCUMENTOS ADICIONALES (multi-DNI / cargas libres) ───────────────────
  // Append-only: se agregan SIN pisar los ya cargados (botón "Agregar doc.").
  documentosAdicionales?:  DocumentoAdicional[]

  creadoEn:      Timestamp
  actualizadoEn: Timestamp

  paso1?: MultaPaso1Data
  paso2?: MultaPaso2Data
  paso3?: MultaPaso3Data
  reboteResolucion?: MultaReboteResolucion  // resolución del rebote por el asesor
  paso4?: MultaPaso4Data
  paso5?: MultaPaso5Data
  paso6?: MultaPaso6Data
  paso7?: MultaPaso7Data

  auditoria?: {
    campo:              string
    valorAnterior:      unknown
    valorNuevo:         unknown
    modificadoPor:      string
    modificadoPorNombre: string
    modificadoEn:       Timestamp
    nota?:              string
  }[]
}

// ─── CONFIGURACIÓN DE PASOS (UI) ──────────────────────────────────────────────

export const PASOS_MULTA_CONFIG = [
  {
    id:       1,
    titulo:   'Recepción de datos',
    subtitulo:'Patente · DNI · Fecha · SUATS',
    icono:    '📋',
    rol:      'asesor',
    color:    '#64748b',
  },
  {
    id:       2,
    titulo:   'Documentación y honorarios',
    subtitulo:'DNI · Cédula/Título · Pago',
    icono:    '📄',
    rol:      'asesor',
    color:    '#3b82f6',
  },
  {
    id:       3,
    titulo:   'Pre-revisión Admin',
    subtitulo:'Verificación de documentación',
    icono:    '🔍',
    rol:      'admin',
    color:    '#8b5cf6',
  },
  {
    id:       4,
    titulo:   'Revisión profunda',
    subtitulo:'Multa x multa · Borradores',
    icono:    '⚖️',
    rol:      'admin',
    color:    '#f59e0b',
  },
  {
    id:       5,
    titulo:   'Carga del descargo',
    subtitulo:'Subir borradores al sistema',
    icono:    '📤',
    rol:      'admin',
    color:    '#f97316',
  },
  {
    id:       6,
    titulo:   'SUATS / Resolución',
    subtitulo:'Informe SUATS o aviso de cierre',
    icono:    '✅',
    rol:      'admin',
    color:    '#10b981',
  },
  {
    id:       7,
    titulo:   'Cierre y entrega',
    subtitulo:'Avisar al cliente · Archivar',
    icono:    '🗂️',
    rol:      'asesor',
    color:    '#1D9E75',
  },
] as const

export const ESTADO_MULTA_LABELS: Record<EstadoMultaWorkflow, string> = {
  recepcion:          'En recepción',
  en_revision:        'En pre-revisión',
  rebotado:           'Rebotado al asesor',
  en_espera_mesa:     'En espera — Mesa de ayuda',
  en_gestion:         'En gestión',
  borradores_listos:  'Borradores listos',
  descargo_subido:    'Descargo subido',
  suats_generado:     'SUATS generado',
  resuelto_sin_suats: 'Resuelto sin SUATS',
  completado:         'Completado',
}

export const ESTADO_MULTA_COLORS: Record<EstadoMultaWorkflow, string> = {
  recepcion:          'bg-gray-100 text-gray-600',
  en_revision:        'bg-purple-100 text-purple-700',
  rebotado:           'bg-red-100 text-red-700',
  en_espera_mesa:     'bg-amber-100 text-amber-700',
  en_gestion:         'bg-blue-100 text-blue-700',
  borradores_listos:  'bg-indigo-100 text-indigo-700',
  descargo_subido:    'bg-orange-100 text-orange-700',
  suats_generado:     'bg-emerald-100 text-emerald-700',
  resuelto_sin_suats: 'bg-teal-100 text-teal-700',
  completado:         'bg-green-100 text-green-700',
}

export const METODOS_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia bancaria',
  mercadopago:   'Mercado Pago',
  cheque:        'Cheque',
  otro:          'Otro',
}

export function calcularMontoTotal(historial: RegistroPago[]): number {
  return historial.reduce((acc, p) => acc + p.monto, 0)
}

export function documentacionCompleta(paso2: Partial<MultaPaso2Data>): boolean {
  const dniOk     = !!paso2.fotoDniFrente && !!paso2.fotoDniDorso
  const cedulaOk  = !!paso2.fotoCedulaFrente && !!paso2.fotoCedulaDorso
  const tituloOk  = !!paso2.fotoTituloFrente && !!paso2.fotoTituloDorso
  const docSecOk  = cedulaOk || tituloOk
  return dniOk && (docSecOk || !!(paso2.observacionDocumentacion?.trim()))
}


// ─── ESTADO OPERATIVO DE MULTA (VISIBLE) ──────────────────────────────────────
// Set propio de "Revisión de Multas", distinto del EstadoMultaWorkflow interno.
// Se usa en la lista de multas Y dentro del workflow. Híbrido: algunos derivan
// del avance de pasos (AUTO), otros los setea el operador a mano (MANUAL).

export type EstadoMulta =
  | 'pendiente_revision'       // AUTO   — esperando pre-revisión del admin
  | 'revision_ok'              // AUTO   — admin marcó "ok", proceder
  | 'en_proceso'               // AUTO   — gestión en curso
  | 'docs_requerida'           // AUTO   — falta doc (informe persona / DNI ajeno)
  | 'p_envio_renaper'          // MANUAL — listo para enviar a RENAPER (a la mañana)
  | 'esperando_renaper'        // MANUAL — enviado, esperando respuesta
  | 'esperando_fecha_cliente'  // MANUAL — cliente aún no confirmó fecha (SIN alertas)
  | 'listo_presentar'          // MANUAL — todo listo, esperando la fecha de entrega
  | 'entregado'                // AUTO   — completado
  | 'cancelado'                // MANUAL

export const ESTADO_MULTA_OP_ORDER: EstadoMulta[] = [
  'pendiente_revision', 'revision_ok', 'en_proceso', 'docs_requerida',
  'p_envio_renaper', 'esperando_renaper', 'esperando_fecha_cliente',
  'listo_presentar', 'entregado', 'cancelado',
]

export const ESTADO_MULTA_OP_LABELS: Record<EstadoMulta, string> = {
  pendiente_revision:      'Pendiente Revisión',
  revision_ok:             'Revisión OK, proceder',
  en_proceso:              'En Proceso',
  docs_requerida:          'Docs. Requerida',
  p_envio_renaper:         'P/ Envío RENAPER',
  esperando_renaper:       'Esperando RENAPER',
  esperando_fecha_cliente: 'Esperando Fecha (Cliente)',
  listo_presentar:         'Listo p/ Presentar',
  entregado:               'Entregado',
  cancelado:               'Cancelado',
}

// Badges (Tailwind) para lista y workflow
export const ESTADO_MULTA_OP_COLORS: Record<EstadoMulta, string> = {
  pendiente_revision:      'bg-gray-100 text-gray-700 border border-gray-200',
  revision_ok:             'bg-sky-100 text-sky-700 border border-sky-200',
  en_proceso:              'bg-blue-100 text-blue-700 border border-blue-200',
  docs_requerida:          'bg-amber-100 text-amber-800 border border-amber-200',
  p_envio_renaper:         'bg-violet-100 text-violet-700 border border-violet-200',
  esperando_renaper:       'bg-purple-100 text-purple-700 border border-purple-200',
  esperando_fecha_cliente: 'bg-orange-100 text-orange-700 border border-orange-200',
  listo_presentar:         'bg-teal-100 text-teal-700 border border-teal-200',
  entregado:               'bg-green-100 text-green-700 border border-green-200',
  cancelado:               'bg-red-100 text-red-700 border border-red-200',
}

// Estados que setea el operador a mano (no salen del avance de pasos)
export const ESTADOS_MULTA_MANUALES: EstadoMulta[] = [
  'p_envio_renaper', 'esperando_renaper', 'esperando_fecha_cliente',
  'listo_presentar', 'cancelado',
]

// Mientras esperamos que el cliente confirme fecha NO deben sonar alertas de fecha
export const ESTADOS_MULTA_SIN_ALERTA_FECHA: EstadoMulta[] = [
  'esperando_fecha_cliente',
]

// ─── DERIVACIÓN AUTOMÁTICA (parte AUTO del híbrido) ───────────────────────────
// Estado operativo por defecto según el avance del workflow interno.
export function derivarEstadoMulta(
  w: Pick<MultaWorkflow, 'pasoActual' | 'estadoWorkflow' | 'paso3'>,
): EstadoMulta {
  switch (w.estadoWorkflow) {
    case 'recepcion':
    case 'en_revision':
      return 'pendiente_revision'
    case 'rebotado':
    case 'en_espera_mesa':
      return 'docs_requerida'
    case 'en_gestion':
      return w.paso3?.resultado === 'ok' && w.pasoActual === 4
        ? 'revision_ok'
        : 'en_proceso'
    case 'borradores_listos':
    case 'descargo_subido':
      return 'en_proceso'
    case 'suats_generado':
    case 'resuelto_sin_suats':
      return 'listo_presentar'
    case 'completado':
      return 'entregado'
    default:
      return 'pendiente_revision'
  }
}

// Estado efectivo: manual si existe, si no el derivado del workflow.
export function estadoMultaEfectivo(
  w: Pick<MultaWorkflow, 'pasoActual' | 'estadoWorkflow' | 'paso3' | 'estadoMultaManual'>,
): EstadoMulta {
  return w.estadoMultaManual ?? derivarEstadoMulta(w)
}