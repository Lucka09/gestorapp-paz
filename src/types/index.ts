import { Timestamp } from 'firebase/firestore'

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'propietario' | 'vendedor' | 'operador' | 'cliente' | 'superadmin'

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

// ─── BASE MULTI-TENANT ────────────────────────────────────────────────────────
//
// Todos los documentos que pertenecen a una gestoría específica deben extender
// DocTenant. Esto obliga a TypeScript a exigir gestoriaId en cada creación,
// lo que hace imposible crear un documento sin tenant por error.
//
// Excepción: Usuario usa gestoriaId?: string (opcional) porque el superadmin
// JAH-NISSI no pertenece a ninguna gestoría.

export interface DocTenant {
  /** ID de la gestoría propietaria. Requerido en todos los documentos tenant. */
  gestoriaId: string
}

// ─── MODELOS ──────────────────────────────────────────────────────────────────

export interface Usuario {
  uid:          string
  email:        string
  nombre:       string
  apellido:     string
  telefono:     string
  rol:          Rol
  clienteId:    string | null
  activo:       boolean
  gestoriaId?:  string    // undefined solo para superadmin JAH-NISSI
  creadoEn:     Timestamp
  ultimoAcceso: Timestamp
}

export interface Cliente extends DocTenant {
  id:            string
  nombre:        string
  apellido:      string
  dni:           string
  cuit:          string
  telefono:      string
  email:         string
  direccion:     string
  localidad:     string
  userId:        string | null
  vehiculosIds:  string[]
  observaciones: string
  creadoEn:      Timestamp
  creadoPor:     string
}

export interface TitularHistorial {
  clienteId: string
  desde:     Timestamp
  hasta:     Timestamp | null
}

export interface Vehiculo extends DocTenant {
  id:                 string
  patente:            string
  tipo:               TipoVehiculo
  marca:              string
  modelo:             string
  anio:               number
  color:              string
  nroMotor:           string
  nroChasis:          string
  clienteId:          string
  historialTitulares: TitularHistorial[]
  tramitesIds:        string[]
  creadoEn:           Timestamp
}

export interface DocumentoTramite {
  nombre:      string
  url:         string
  tipo:        TipoDocumento
  subidoPor:   string
  fechaSubida: Timestamp
}

export interface HistorialEstado {
  estadoAnterior: EstadoTramite
  estadoNuevo:    EstadoTramite
  cambiadoPor:    string
  fecha:          Timestamp
  nota:           string
}

export interface Tramite extends DocTenant {
  id:                    string
  numero:                string
  tipo:                  TipoTramite
  estado:                EstadoTramite
  clienteId:             string
  vehiculoId:            string
  patente:               string
  descripcion:           string
  observacionesInternas: string
  documentos:            DocumentoTramite[]
  historialEstados:      HistorialEstado[]
  honorarios:            number
  pagado:                boolean
  fechaPago:             Timestamp | null
  formaPago?:            string
  notasPago?:            string
  turnoId:               string | null
  asignadoA:             string | null
  tokenPublico?:         string      // token único para el QR público
  creadoEn:              Timestamp
  creadoPor:             string
  actualizadoEn:         Timestamp
}

export interface Turno extends DocTenant {
  id:                string
  clienteId:         string
  tramiteId:         string | null
  tipoTramite:       TipoTramite
  fecha:             Timestamp
  horaInicio:        string
  horaFin:           string
  estado:            EstadoTurno
  motivoCancelacion: string
  notas:             string
  creadoEn:          Timestamp
}

export interface Notificacion extends DocTenant {
  id:             string
  destinatarioId: string
  titulo:         string
  mensaje:        string
  tipo:           TipoNotificacion
  tramiteId:      string | null
  turnoId:        string | null
  leida:          boolean
  creadoEn:       Timestamp
}

// ─── HISTORIAL DE ACTIVIDAD (AUDIT TRAIL) ────────────────────────────────────

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
  | 'acceso_denegado'  // intento de acceso a ruta sin permisos

export type EntidadAudit =
  | 'cliente'
  | 'vehiculo'
  | 'tramite'
  | 'turno'
  | 'usuario'
  | 'configuracion'
  | 'presupuesto'
  | 'sistema'          // eventos del sistema (ej: acceso_denegado, errores)

export interface EntradaAudit {
  id:            string
  accion:        AccionAudit
  entidad:       EntidadAudit
  entidadId:     string
  entidadLabel:  string          // ej: "AB123CD — Transferencia" o "García, Juan"
  usuarioId:     string
  usuarioNombre: string
  usuarioRol:    Rol
  gestoriaId?:   string          // opcional: superadmin no tiene gestoriaId
  antes?:        Record<string, unknown>   // snapshot del valor anterior
  despues?:      Record<string, unknown>   // snapshot del valor nuevo
  nota?:         string                // descripción legible del cambio
  ip?:           string
  timestamp:     Timestamp               // serverTimestamp
}

export interface HorarioDia {
  inicio: string
  fin:    string
  activo: boolean
}

export interface Tarifa {
  tipo:       TipoTramite
  honorarios: number       // monto base en pesos
  incluye:    string       // descripción de qué incluye
  activo:     boolean
}

export interface ConfiguracionBancaria {
  titular: string
  banco:   string
  cbu:     string
  alias:   string
  cuit:    string
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
  tramitesActivos: TipoTramite[]
  tarifas:         Tarifa[]
  // Financiero
  datosBancarios: ConfiguracionBancaria
  // Contacto y RRSS
  redesSociales: ConfiguracionRRSS
  // Mensajes automáticos
  mensajeBienvenida:   string
  mensajeTurnoConfirm: string
  mensajeListoRetirar: string
  // Meta
  actualizadoEn:  Timestamp
  actualizadoPor: string
}

// ─── LABELS ───────────────────────────────────────────────────────────────────

export const TIPO_TRAMITE_LABELS: Record<TipoTramite, string> = {
  transferencia:            'Transferencia',
  alta:                     'Alta de Vehículo',
  baja:                     'Baja de Vehículo',
  tramite_08:               'Trámite 08',
  duplicado_titulo:         'Duplicado de Título',
  duplicado_cedula:         'Duplicado de Cédula',
  cambio_radicacion:        'Cambio de Radicación',
  informe_dominio:          'Informe de Dominio',
  certificado_dominio:      'Certificado de Dominio',
  inscripcion_inicial:      'Inscripción Inicial',
  prenda:                   'Prenda',
  descargo_multa:           'Descargo de Multa PBA',
  inhibicion:               'Inhibición',
  levantamiento_inhibicion: 'Levantamiento de Inhibición',
  vtv:                      'VTV',
  otro:                     'Otro',
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

export interface Tarea extends DocTenant {
  id:              string
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
  vencimiento?:    Timestamp  // Timestamp
  recordatorio?:   Timestamp  // Timestamp — cuándo avisar
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

export interface Vencimiento extends DocTenant {
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

export interface NotaInterna extends DocTenant {
  id:          string
  contenido:   string
  tipo:        TipoNota
  entidad:     'cliente' | 'tramite'
  entidadId:   string
  autorId:     string
  autorNombre: string
  autorRol:    string
  importante:  boolean      // pinned
  creadoEn:    Timestamp
  editadoEn?:  Timestamp
}

export const NOTA_TIPO_CONFIG: Record<TipoNota, {
  label:  string
  emoji:  string
  color:  string
  bg:     string
}> = {
  general:     { label: 'Nota',        emoji: '📝', color: 'text-gray-700',   bg: 'bg-gray-100'   },
  llamada:     { label: 'Llamada',     emoji: '📞', color: 'text-blue-700',   bg: 'bg-blue-100'   },
  reunion:     { label: 'Reunión',     emoji: '🤝', color: 'text-purple-700', bg: 'bg-purple-100' },
  importante:  { label: 'Importante',  emoji: '⭐', color: 'text-amber-700',  bg: 'bg-amber-100'  },
  advertencia: { label: 'Advertencia', emoji: '⚠️', color: 'text-red-700',    bg: 'bg-red-100'    },
  seguimiento: { label: 'Seguimiento', emoji: '🎯', color: 'text-emerald-700',bg: 'bg-emerald-100'},
}

// ─── MULTI-GESTORÍA ───────────────────────────────────────────────────────────

export type PlanGestoria    = 'starter' | 'profesional' | 'enterprise'
export type EstadoGestoria  = 'activa' | 'suspendida' | 'trial' | 'cancelada'

export interface BrandingGestoria {
  colorPrimario:   string      // hex — ej: '#D4621A'
  colorSecundario: string      // hex — ej: '#1A1A1A'
  logoUrl?:        string      // URL en Firebase Storage
  logoBase64?:     string      // base64 para PDF
  nombreComercial: string
  slogan?:         string
}

export interface Gestoria {
  id:          string
  nombre:      string
  nombreLegal: string
  cuit:        string
  responsable: string
  email:       string
  telefono1:   string
  telefono2?:  string
  direccion:   string
  localidad:   string
  provincia:   string
  // Branding
  branding:    BrandingGestoria
  // Plan y estado
  plan:        PlanGestoria
  estado:      EstadoGestoria
  // Límites por plan
  maxUsuarios: number
  maxClientes: number
  // Meta
  creadoEn:    Timestamp
  vencePlan?:  Timestamp     // cuando vence el plan
  notas?:      string  // notas internas JAH-NISSI sobre el cliente
}

export const PLAN_CONFIG: Record<PlanGestoria, {
  label:       string
  maxUsuarios: number
  maxClientes: number
  precio:      number      // ARS mensual
  features:    string[]
}> = {
  starter: {
    label:       'Starter',
    maxUsuarios: 2,
    maxClientes: 100,
    precio:      25_000,
    features:    ['Clientes y trámites', 'Turnos', 'Dashboard básico'],
  },
  profesional: {
    label:       'Profesional',
    maxUsuarios: 5,
    maxClientes: 500,
    precio:      55_000,
    features:    ['Todo Starter', 'Pipeline CRM', 'Reportes PDF', 'Analytics', 'Backup'],
  },
  enterprise: {
    label:       'Enterprise',
    maxUsuarios: 20,
    maxClientes: 9999,
    precio:      110_000,
    features:    ['Todo Profesional', 'Equipo ilimitado', 'Soporte prioritario', 'Onboarding'],
  },
}