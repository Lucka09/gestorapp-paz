import { Timestamp, } from 'firebase/firestore'

// ─── GESTORÍAS (TENANTS) ──────────────────────────────────────────────────────

export type EstadoGestoria = 'activa' | 'trial' | 'suspendida' | 'cancelada'
export type PlanGestoria = 'starter' | 'profesional' | 'enterprise'

export interface BrandingGestoria {
  logoUrl?: string         // Cambié 'logo' por 'logoUrl'
  colorPrimario?: string
  colorSecundario?: string
  nombreComercial?: string // Agregado
  slogan?: string          // Agregado
}

export interface Gestoria {
  id: string
  nombre: string
  slug: string // para la URL: gestoria-paz
   plan: 'starter' | 'profesional' | 'enterprise';
  maxClientes: number;
  maxUsuarios: number;
  responsable: string;
  email: string;
  telefono: string;
  direccion: string;
  localidad: string;
  provincia: string;
  estado: EstadoGestoria
  branding?: BrandingGestoria
  configuracionId: string
  creadoEn: Timestamp
  venceEn: Timestamp | null
}

export const PLAN_CONFIG: Record<PlanGestoria, { 
  maxUsuarios: number, 
  maxClientes: number, 
  label: string, 
  precio: number // Agregamos precio aquí para corregir [cite: 9, 10, 11]
}> = {
  starter: { maxUsuarios: 2, maxClientes: 100, label: 'Starter', precio: 50000 },
  profesional: { maxUsuarios: 10, maxClientes: 1000, label: 'Profesional', precio: 120000 },
  enterprise: { maxUsuarios: 50, maxClientes: 9999, label: 'Enterprise', precio: 150000 },
};

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type Rol = 'propietario' | 'admin_gral' | 'admin' | 'vendedor' | 'operador' | 'superadmin' | 'gestor' | 'cliente' | 'asesor_comercial' | 'asistente_multas'

export type TipoVehiculo = 'auto' | 'moto' | 'camion' | 'utilitario' | 'otro'

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
  | 'vencimiento'
  | 'general'

// ─── MODELOS ──────────────────────────────────────────────────────────────────

export interface Usuario {
  uid: string
  email: string
  nombre: string
  apellido: string
  telefono: string
  rol: Rol
  gestoriaId: string // Requerido para multi-tenancy
  clienteId: string | null
  activo: boolean
  creadoEn: Timestamp
  ultimoAcceso: Timestamp
}

export type OrigenCanal =
  | 'referido_persona'     // persona física que refirió al cliente
  | 'concesionaria'        // concesionaria oficial
  | 'agencia'              // agencia de vehículos
  | 'reventa'              // reventa / automotora
  | 'encargado_multas'     // encargado de descargo de multas
  | 'instagram'
  | 'facebook'
  | 'google'
  | 'cartel_local'
  | 'whatsapp'
  | 'web'
  | 'otro'
 
export const ORIGEN_CANAL_LABELS: Record<OrigenCanal, string> = {
  referido_persona:  'Referido (persona)',
  concesionaria:     'Concesionaria',
  agencia:           'Agencia',
  reventa:           'Reventa / Automotora',
  encargado_multas:  'Encargado de Multas',
  instagram:         'Instagram',
  facebook:          'Facebook',
  google:            'Google',
  cartel_local:      'Cartel / Local',
  whatsapp:          'WhatsApp',
  web:               'Web',
  otro:              'Otro',
}
 
// Canales que son "referidos comerciales" — aparecen en métricas de referidos (M7)
export const ORIGEN_COMERCIAL: OrigenCanal[] = [
  'concesionaria', 'agencia', 'reventa', 'encargado_multas',
]

export interface Cliente {
  id:           string
  gestoriaId:   string
  nombre:       string
  apellido:     string
  dni:          string
  cuit:         string
  telefono:     string
  email:        string
  direccion:    string
  localidad:    string
  userId:       string | null
  vehiculosIds: string[]
  observaciones:string
  origen?:       string          
  origenCanal?:  OrigenCanal  
  origenNombre?: string
  cicloVida?:             'prospecto' | 'cliente'
  datosIncompletos?:      boolean       // falta DNI/apellido — completar
  origenLeadId?:          string        // cross-ref al lead de origen
  creadoAutomaticamente?: boolean       // creado por el materializador
  actualizadoEn?:         Timestamp
  creadoEn:     Timestamp
  creadoPor:    string
}

export interface TitularHistorial {
  clienteId: string
  desde: Timestamp
  hasta: Timestamp | null
}

export interface Vehiculo {
  id:           string
  gestoriaId:   string
  patente:      string
  tipo:         TipoVehiculo
  marca:        string
  modelo:       string
  anio:         number
  color:        string
  nroMotor:     string
  nroChasis:    string
  clienteId:    string
  historialTitulares: TitularHistorial[]
  tramitesIds:  string[]
  creadoEn:     Timestamp
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
  gestoriaId: string // Agregado para resolver TS2339
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
  formaPago?: string
  totalCobradoCliente?: number   // total que pagó el cliente (honorarios + SUATS + informe)
  costosSUATS?: number           // 0 o monto SUATS abonado (no es ingreso)
  costosInformePersona?: number  // 0 o costo del informe de persona (no es ingreso)
  cuotasTarjeta?: number         // cantidad de cuotas si formaPago === 'tarjeta'
  notasPago?: string
  turnoId: string | null
  asignadoA: string | null
  tokenPublico?: string
  creadoEn: Timestamp
  creadoPor: string
  actualizadoEn: Timestamp
}

export interface Turno {
  id: string
  gestoriaId: string
  clienteId: string
  clienteNombre: string
  tramiteId: string | null
  tipoTramite: TipoTramite
  fecha: Timestamp
  horaInicio: string
  horaFin: string
  estado: EstadoTurno
  motivoCancelacion: string
  notas: string
  creadoEn: Timestamp
  creadoPor?: string
  creadoPorNombre?: string
}

export interface Notificacion {
  id: string
  gestoriaId: string // Agregado
  destinatarioId: string
  titulo: string
  mensaje: string
  tipo: TipoNotificacion
  tramiteId: string | null
  turnoId: string | null
  leida: boolean
  creadoEn: Timestamp
}

// ─── AUDIT TRAIL ──────────────────────────────────────────────────────────────

export type AccionAudit =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'cambiar_estado'
  | 'registrar_pago'
  | 'desmarcar_pago'
  | 'crear_acceso'
  | 'confirmar_turno'
  | 'cancelar_turno'
  | 'importar'
  | 'login'
  | 'acceso_denegado' // Requerido por router/index.tsx
  | 'autoasignar_gestion_transferencia'  // ← AGREGA ESTA
  | 'asignar_gestor_transferencia'

export type EntidadAudit =
  | 'cliente'
  | 'vehiculo'
  | 'tramite'
  | 'turno'
  | 'usuario'
  | 'configuracion'
  | 'presupuesto'
  | 'sistema' // Requerido por router/index.tsx

export interface EntradaAudit {
  id:              string
  gestoriaId?:     string // Opcional para logs de sistema global
  accion:          AccionAudit
  entidad:         EntidadAudit
  entidadId:       string
  entidadLabel:    string
  usuarioId:       string
  usuarioNombre:   string
  usuarioRol:      Rol
  antes?:          Record<string, unknown>
  despues?:        Record<string, unknown>
  nota?:           string
  ip?:             string
  timestamp:       Timestamp | number
}

export interface HorarioDia {
  inicio: string
  fin: string
  activo: boolean
}

export interface Tarifa {
  tipo:       TipoTramite
  honorarios: number       // monto base en pesos
  incluye:    string       // descripción de qué incluye
  activo:     boolean
}

export interface ConfiguracionBancaria {
  titular:   string
  banco:     string
  cbu:       string
  alias:     string
  cuit:      string
}

export interface ConfiguracionRRSS {
  instagram?: string
  facebook?:  string
  whatsapp1:  string
  whatsapp2?: string
  web?:       string
}

export interface Configuracion {
  // Datos de la gestoría
  nombre:          string
  nombreComercial: string
  responsable:     string
  email:           string
  emailSecundario: string
  telefono1:       string
  telefono2:       string
  direccion:       string
  localidad:       string
  provincia:       string
  // Turnos
  horarioAtencion:  Record<string, HorarioDia>
  duracionTurnoMin: number
  turnosMaxDia:     number
  diasAnticipacion: number   // con cuántos días de anticipación se puede reservar
  // Trámites
  tramitesActivos:  TipoTramite[]
  tarifas:          Tarifa[]
  // Financiero
  datosBancarios:   ConfiguracionBancaria
  // Contacto y RRSS
  costosMulta?: { suats?: number; informePersona?: number }
  redesSociales:    ConfiguracionRRSS
  // Mensajes automáticos
  mensajeBienvenida:    string
  mensajeTurnoConfirm:  string
  mensajeListoRetirar:  string
  // Meta
  actualizadoEn:    Timestamp
  actualizadoPor:   string

  premiosConfig?: {
  montoPremioA:       number
  tramitesPorPremioA: number
  hitosMultas: Array<{
    id:          number
    montoUmbral: number
    premioMonto: number
    descripcion: string
  }>
}
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
  descargo_multa:          'Revisión de Multas',
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

// ─── TAREAS ───────────────────────────────────────────────────────────────────

export type PrioridadTarea = 'baja' | 'normal' | 'alta' | 'urgente'
export type EstadoTarea    = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada'

export interface Tarea {
  id:              string
  gestoriaId:      string
  titulo:          string
  descripcion?:    string
  prioridad:       PrioridadTarea
  estado:          EstadoTarea
  // Vinculación opcional a entidades
  clienteId?:      string
  clienteNombre?:  string
  tramiteId?:      string
  tramiteLabel?:   string
  // Asignación
  asignadoA:       string     // uid del responsable
  asignadoNombre:  string
  creadoPor:       string
  creadoPorNombre: string
  // Fechas
  vencimiento?:    Timestamp
  recordatorio?:   Timestamp
  completadaEn?:   Timestamp
  creadoEn:        Timestamp
  actualizadoEn:   Timestamp
}

export const PRIORIDAD_LABELS: Record<PrioridadTarea, string> = {
  baja:    'Baja',
  normal:  'Normal',
  alta:    'Alta',
  urgente: 'Urgente',
}

export const PRIORIDAD_COLORS: Record<PrioridadTarea, string> = {
  baja:    'bg-gray-100 text-gray-500',
  normal:  'bg-blue-100 text-blue-700',
  alta:    'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}

// ─── VENCIMIENTOS DE VEHÍCULO ─────────────────────────────────────────────────

export type TipoVencimiento =
  | 'vtv'
  | 'seguro'
  | 'cedula_verde'
  | 'poliza'
  | 'oblea_gnc'
  | 'revision_tecnica'
  | 'habilitacion'
  | 'otro'

export type EstadoVencimiento =
  | 'vigente'      // más de 30 días
  | 'por_vencer'   // 1–30 días
  | 'vencido'      // pasado
  | 'sin_datos'    // no cargado

export interface Vencimiento {
  id:              string
  vehiculoId:      string
  clienteId:       string
  patente:         string
  tipo:            TipoVencimiento
  fechaVencimiento: Timestamp
  compania?:       string     // compañía de seguros, etc.
  nroPóliza?:      string
  notas?:          string
  alertado:        boolean    // ya se envió alerta al operador
  creadoEn:        Timestamp
  actualizadoEn:   Timestamp
}

export const VENCIMIENTO_LABELS: Record<TipoVencimiento, string> = {
  vtv:              'VTV',
  seguro:           'Seguro del automotor',
  cedula_verde:     'Cédula verde',
  poliza:           'Póliza',
  oblea_gnc:        'Oblea GNC',
  revision_tecnica: 'Revisión técnica',
  habilitacion:     'Habilitación especial',
  otro:             'Otro',
}

export const VENCIMIENTO_EMOJI: Record<TipoVencimiento, string> = {
  vtv:              '🔧',
  seguro:           '🛡️',
  cedula_verde:     '📄',
  poliza:           '📋',
  oblea_gnc:        '⛽',
  revision_tecnica: '🔍',
  habilitacion:     '✅',
  otro:             '📌',
}

// ─── NOTAS INTERNAS ───────────────────────────────────────────────────────────

export type TipoNota =
  | 'general'       // nota libre
  | 'llamada'       // registro de llamada
  | 'reunion'       // registro de reunión
  | 'importante'    // destacada / pin
  | 'advertencia'   // alerta sobre el cliente/trámite
  | 'seguimiento'   // acción de seguimiento

export interface NotaInterna {
  id:            string
  contenido:     string
  tipo:          TipoNota
  entidad:       'cliente' | 'tramite'
  entidadId:     string
  autorId:       string
  autorNombre:   string
  autorRol:      string
  importante:    boolean      // pinned
  creadoEn:      Timestamp
  editadoEn?:    Timestamp
}

export const NOTA_TIPO_CONFIG: Record<TipoNota, {
  label:  string
  emoji:  string
  color:  string
  bg:     string
}> = {
  general:     { label: 'Nota',       emoji: '📝', color: 'text-gray-700',   bg: 'bg-gray-100'   },
  llamada:     { label: 'Llamada',    emoji: '📞', color: 'text-blue-700',   bg: 'bg-blue-100'   },
  reunion:     { label: 'Reunión',    emoji: '🤝', color: 'text-purple-700', bg: 'bg-purple-100' },
  importante:  { label: 'Importante', emoji: '⭐', color: 'text-amber-700',  bg: 'bg-amber-100'  },
  advertencia: { label: 'Advertencia',emoji: '⚠️', color: 'text-red-700',    bg: 'bg-red-100'    },
  seguimiento: { label: 'Seguimiento',emoji: '🎯', color: 'text-emerald-700',bg: 'bg-emerald-100'},
}
// ─── REEXPORTS: CRM + IA + AUTOMATIZACIONES ────────────────────────────────
export type {
  Lead, LeadInput, LeadInputPublico,
  EstadoLead, MotivoPerdida, PrioridadLead, OrigenSistema,
} from './lead'
export {
  ESTADO_LEAD_LABELS, ESTADO_LEAD_COLORS, ESTADO_LEAD_DOT,
  MOTIVO_PERDIDA_LABELS, PRIORIDAD_LEAD_LABELS, PRIORIDAD_LEAD_COLORS,
  ESTADOS_LEAD_ACTIVOS, ESTADOS_LEAD_FINALES,
} from './lead'

export type {
  Evento, EventoInput, TipoEvento, EntidadEvento, Actor, ActorId,
} from './evento'
export {
  crearEvento, DOMINIOS_EVENTO, TIPO_EVENTO_LABELS, TIPO_EVENTO_EMOJI,
} from './evento'

export type {
  Automatizacion, EjecucionAutomatizacion, PlantillaAutomatizacion,
  TriggerEvento, Condicion, OperadorCondicion, Accion, TipoAccion,
  EstadoEjecucion,
} from './automatizacion'
export {
  PLANTILLAS_AUTOMATIZACION,
  TIPO_ACCION_LABELS, TIPO_ACCION_EMOJI,
  OPERADOR_LABELS, CATEGORIA_AUTOMATIZACION_LABELS,
} from './automatizacion'