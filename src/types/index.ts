import { Timestamp } from 'firebase/firestore'

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'propietario' | 'vendedor' | 'operador' | 'cliente'

export type TipoVehiculo = 'auto' | 'moto' | 'camion' | 'utilitario' | 'otro'

// Servicios reales de Gestoría Paz
export type TipoTramite =
  | 'transferencia'
  | 'alta'
  | 'baja'
  | 'tramite_08'
  | 'duplicado_titulo'
  | 'duplicado_cedula'
  | 'cambio_radicacion'
  | 'informe_dominio'
  | 'certificado_dominio'
  | 'inscripcion_inicial'
  | 'prenda'
  | 'descargo_multa'
  | 'inhibicion'
  | 'levantamiento_inhibicion'
  | 'vtv'
  | 'otro'

export type EstadoTramite =
  | 'pendiente'
  | 'en_proceso'
  | 'documentacion_requerida'
  | 'en_organismo'
  | 'listo_para_retirar'
  | 'entregado'
  | 'cancelado'

export type EstadoTurno = 'reservado' | 'confirmado' | 'cancelado' | 'cumplido'

export type TipoDocumento =
  | 'dni'
  | 'titulo'
  | 'cedula'
  | 'formulario_08'
  | 'informe_dominio'
  | 'poder'
  | 'comprobante_pago'
  | 'otro'

export type TipoNotificacion =
  | 'estado_tramite'
  | 'turno'
  | 'documentacion'
  | 'general'

// ─── MODELOS ──────────────────────────────────────────────────────────────────

export interface Usuario {
  uid: string
  email: string
  nombre: string
  apellido: string
  telefono: string
  rol: Rol
  clienteId: string | null
  activo: boolean
  creadoEn: Timestamp
  ultimoAcceso: Timestamp
}

export interface Cliente {
  id: string
  nombre: string
  apellido: string
  dni: string
  cuit: string
  telefono: string
  email: string
  direccion: string
  localidad: string
  userId: string | null
  vehiculosIds: string[]
  observaciones: string
  creadoEn: Timestamp
  creadoPor: string
}

export interface TitularHistorial {
  clienteId: string
  desde: Timestamp
  hasta: Timestamp | null
}

export interface Vehiculo {
  id: string
  patente: string
  tipo: TipoVehiculo
  marca: string
  modelo: string
  anio: number
  color: string
  nroMotor: string
  nroChasis: string
  clienteId: string
  historialTitulares: TitularHistorial[]
  tramitesIds: string[]
  creadoEn: Timestamp
}

export interface DocumentoTramite {
  nombre: string
  url: string
  tipo: TipoDocumento
  subidoPor: string
  fechaSubida: Timestamp
}

export interface HistorialEstado {
  estadoAnterior: EstadoTramite
  estadoNuevo: EstadoTramite
  cambiadoPor: string
  fecha: Timestamp
  nota: string
}

export interface Tramite {
  id: string
  numero: string
  tipo: TipoTramite
  estado: EstadoTramite
  clienteId: string
  vehiculoId: string
  patente: string
  descripcion: string
  observacionesInternas: string
  documentos: DocumentoTramite[]
  historialEstados: HistorialEstado[]
  honorarios: number
  pagado: boolean
  fechaPago: Timestamp | null
  turnoId: string | null
  asignadoA: string | null
  creadoEn: Timestamp
  creadoPor: string
  actualizadoEn: Timestamp
}

export interface Turno {
  id: string
  clienteId: string
  tramiteId: string | null
  tipoTramite: TipoTramite
  fecha: Timestamp
  horaInicio: string
  horaFin: string
  estado: EstadoTurno
  motivoCancelacion: string
  notas: string
  creadoEn: Timestamp
}

export interface Notificacion {
  id: string
  destinatarioId: string
  titulo: string
  mensaje: string
  tipo: TipoNotificacion
  tramiteId: string | null
  turnoId: string | null
  leida: boolean
  creadoEn: Timestamp
}

export interface HorarioDia {
  inicio: string
  fin: string
  activo: boolean
}

export interface Configuracion {
  nombre: string
  telefono: string
  email: string
  direccion: string
  localidad: string
  horarioAtencion: Record<string, HorarioDia>
  duracionTurnoMin: number
  tramitesActivos: TipoTramite[]
}

// ─── LABELS ───────────────────────────────────────────────────────────────────

export const TIPO_TRAMITE_LABELS: Record<TipoTramite, string> = {
  transferencia:           'Transferencia',
  alta:                    'Alta de Vehículo',
  baja:                    'Baja de Vehículo',
  tramite_08:              'Trámite 08',
  duplicado_titulo:        'Duplicado de Título',
  duplicado_cedula:        'Duplicado de Cédula',
  cambio_radicacion:       'Cambio de Radicación',
  informe_dominio:         'Informe de Dominio',
  certificado_dominio:     'Certificado de Dominio',
  inscripcion_inicial:     'Inscripción Inicial',
  prenda:                  'Prenda',
  descargo_multa:          'Descargo de Multa PBA',
  inhibicion:              'Inhibición',
  levantamiento_inhibicion:'Levantamiento de Inhibición',
  vtv:                     'VTV',
  otro:                    'Otro',
}

export const ESTADO_TRAMITE_LABELS: Record<EstadoTramite, string> = {
  pendiente:               'Pendiente',
  en_proceso:              'En Proceso',
  documentacion_requerida: 'Docs. Requerida',
  en_organismo:            'En Organismo',
  listo_para_retirar:      'Listo p/ Retirar',
  entregado:               'Entregado',
  cancelado:               'Cancelado',
}

// ─── COLORES DE ESTADO — paleta Gestoría Paz ──────────────────────────────────

export const ESTADO_TRAMITE_COLORS: Record<EstadoTramite, string> = {
  pendiente:               'bg-yellow-100 text-yellow-800',
  en_proceso:              'bg-orange-100 text-orange-700',
  documentacion_requerida: 'bg-red-100 text-red-700',
  en_organismo:            'bg-blue-100 text-blue-700',
  listo_para_retirar:      'bg-emerald-100 text-emerald-700',
  entregado:               'bg-gray-100 text-gray-500',
  cancelado:               'bg-gray-200 text-gray-500',
}

export const TIPO_VEHICULO_LABELS: Record<TipoVehiculo, string> = {
  auto:       'Auto',
  moto:       'Moto',
  camion:     'Camión',
  utilitario: 'Utilitario',
  otro:       'Otro',
}

// ─── COLORES SEMÁNTICOS ADICIONALES ──────────────────────────────────────────

export const ESTADO_TRAMITE_DOT: Record<EstadoTramite, string> = {
  pendiente:               'bg-yellow-400',
  en_proceso:              'bg-blue-400',
  documentacion_requerida: 'bg-red-500',
  en_organismo:            'bg-orange-400',
  listo_para_retirar:      'bg-emerald-400',
  entregado:               'bg-green-500',
  cancelado:               'bg-gray-300',
}

export const ESTADO_TRAMITE_EMOJI: Record<EstadoTramite, string> = {
  pendiente:               '🟡',
  en_proceso:              '🔵',
  documentacion_requerida: '🔴',
  en_organismo:            '🟠',
  listo_para_retirar:      '🟢',
  entregado:               '✅',
  cancelado:               '⚫',
}
