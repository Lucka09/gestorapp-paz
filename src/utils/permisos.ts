import type { Rol } from '@/types'

// ─── DEFINICIÓN DE PERMISOS ───────────────────────────────────────────────────

export interface Permisos {
  // Clientes
  verClientes:          boolean
  crearClientes:        boolean
  editarClientes:       boolean
  eliminarClientes:     boolean
  darAccesoPortal:      boolean

  // Vehículos
  verVehiculos:         boolean
  crearVehiculos:       boolean
  editarVehiculos:      boolean

  // Trámites
  verTramites:          boolean
  crearTramites:        boolean
  cambiarEstadoTramite: boolean
  verHonorariosDetalle: boolean
  marcarPagado:         boolean
  verObsInternas:       boolean

  // Turnos
  verTurnos:            boolean
  crearTurnos:          boolean
  confirmarTurnos:      boolean
  cancelarTurnos:       boolean

  // Dashboard
  verDashboard:         boolean
  verPanelMando:        boolean   // Panel de Mando (dashboard de gestión) — solo CEO / Admin Gral
  verMetricasFinancieras: boolean
  verCRM:               boolean

  // Exportar
  exportarDatos:        boolean

  // Seguimiento
  verSeguimiento:       boolean
  crearSeguimiento:     boolean

  // Config
  verConfiguracion:     boolean
  editarConfiguracion:  boolean

  // Equipo
  verEquipo:            boolean
  gestionarEquipo:      boolean

  // Finanzas — solo propietario y superadmin
  verCobranzas:         boolean   // página de cobranzas completa
  verReportes:          boolean   // reportes contables / financieros
  registrarDevoluciones: boolean

  // Multas — módulo de descargos / Revisión de Multas
  gestionarMultas:      boolean   // acceso al módulo de multas y su workflow
  verConsultasMultas:   boolean   // Consultas de Multas (búsqueda de infracciones) — visible a todo el staff
  verTodasLasMultas:    boolean   // Revisión + Torre de Multas: true = todas; false = solo propias
  // WhatsApp Bandeja — acceso por rol
  verBandejaWA:         boolean   // ver bandeja de mensajes WhatsApp
  responderWA:          boolean   // enviar mensajes desde la bandeja
  verTodaLaBandejaWA:   boolean   // ve TODAS las conversaciones (roles de control); false = solo propias + pool
  reasignarWA:          boolean   // puede reasignar una conversación a otro agente

  // Torre de Control — visibilidad
  verTorreCompleta:     boolean   // ve todos los gestores y performance (propietario/admin)
  verTorreSoloPropia:   boolean   // solo ve sus propios trámites (gestor)

  // Geolocalización obligatoria en workflow
  requiereGeo:          boolean   // el rol debe proveer geo en pasos de campo

  // Premios & Objetivos — solo asesor comercial (y propietario)
  verPremios:           boolean   // página propia de premios y objetivos
  verPremiosTorre:      boolean   // panel de premios en Torre de Control

  // Rendimiento de gestores — Torre de Control avanzada
  verRendimientoGestores: boolean  // % completados por gestor (propietario / admin_gral)

  // Edición con trazabilidad
  // Habilita modificar cliente / vehículo / titular dejando motivo obligatorio
  // en audit_log. Es un permiso "blando": no da acceso a datos nuevos, solo
  // habilita el cambio quedando registrado quién, cuándo y por qué.
  editarConMotivo:      boolean
}

// ─── PERMISOS POR ROL ─────────────────────────────────────────────────────────

const PERMISOS: Record<Rol, Permisos> = {

  // ── PROPIETARIO (label: CEO) — acceso total + financiero ──────────────────
  propietario: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: true, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, registrarDevoluciones: true,
     marcarPagado: true, verObsInternas: true,    verTodasLasMultas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verPanelMando: true, verMetricasFinancieras: true, verCRM: true,
    exportarDatos: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
    verEquipo: true, gestionarEquipo: true,
    verCobranzas: true, verReportes: true,  // ← acceso financiero total
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: true, reasignarWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,
    editarConMotivo: true,
  },

  // ── ADMIN — operaciones completas, SIN finanzas ni eliminar clientes ───────
  admin: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, registrarDevoluciones: true, marcarPagado: false, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verPanelMando: false, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
    verEquipo: true, gestionarEquipo: true,
    verCobranzas: false, verReportes: false,  // ← sin acceso financiero
    gestionarMultas: true,
    verConsultasMultas: true,    verTodasLasMultas: true,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: true, reasignarWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: false,
    editarConMotivo: true,
  },

  // ── ADMIN GENERAL — igual a admin + acceso financiero, solo 1 por gestoría ──
  admin_gral: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, registrarDevoluciones: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verPanelMando: true, verMetricasFinancieras: true, verCRM: true,
    exportarDatos: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: false,  // ← no puede cambiar config
    verEquipo: true, gestionarEquipo: false,             // ← no puede crear/eliminar miembros
    verCobranzas: true, verReportes: true,               // ← acceso financiero elevado
    gestionarMultas: true,
    verConsultasMultas: true,    verTodasLasMultas: true,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: true, reasignarWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,                        // ← puede ver % por gestor en Torre
    editarConMotivo: true,
  },

  // ── VENDEDOR — NO gestiona equipo. Bandeja: solo propias + pool ─────────────
  vendedor: {
    verClientes: true, crearClientes: true, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: false, editarVehiculos: false,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: false,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: true, verPanelMando: false, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: true,    verTodasLasMultas: false,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
    editarConMotivo: false,
  },

  // ── OPERADOR — NO gestiona equipo ─────────────────────────────────────────
  operador: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verPanelMando: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: true,    verTodasLasMultas:false,
    verBandejaWA: false, responderWA: false, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
    editarConMotivo: false,
  },

  // ── SUPERADMIN — acceso total ─────────────────────────────────────────────
  superadmin: {
    verClientes: true, crearClientes: true, editarClientes: true, eliminarClientes: true,
    darAccesoPortal: true, verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, registrarDevoluciones: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    exportarDatos: true, verDashboard: true, verPanelMando: true, verCRM: true, editarConfiguracion: true,
    verMetricasFinancieras: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, verEquipo: true, gestionarEquipo: true,
    verCobranzas: true, verReportes: true,
    gestionarMultas: true,
    verConsultasMultas: true,    verTodasLasMultas: true,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: true, reasignarWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,
    editarConMotivo: true,
  },

  // ── GESTOR (mandatario) — carga y gestión propia, sin finanzas ni WA ────────
  gestor: {
    verClientes: true,  crearClientes: true,  editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true,  crearTramites: true,  cambiarEstadoTramite: true,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: false,
    verDashboard: false, verPanelMando: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: true,
    verConsultasMultas: true,    verTodasLasMultas: true,
    verBandejaWA: false, responderWA: false, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: false, verTorreSoloPropia: true, requiereGeo: true,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
    editarConMotivo: false,
  },

  // ── ASESOR COMERCIAL (label: Secretario Comercial) — Bandeja: propias + pool ─
  asesor_comercial: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verPanelMando: false, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,        // ← sin acceso financiero
    gestionarMultas: true,
    verConsultasMultas: true,    verTodasLasMultas: false,
    verBandejaWA: true, responderWA: true, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,         // ← exclusivo de este rol
    verRendimientoGestores: false,
    editarConMotivo: true,                           // ← puede editar dejando motivo
  },

  // ── ASISTENTE DE MULTAS — módulo de multas + básico, nada financiero ────────
  asistente_multas: {
    verClientes: false, crearClientes: false, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: false, crearVehiculos: false, editarVehiculos: false,
    verTramites: false, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: false, crearTurnos: false, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: true, verPanelMando: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: true,                          // ← acceso al módulo de multas
    verConsultasMultas: true,    verTodasLasMultas: true,
    verBandejaWA: false, responderWA: false, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: false, verTorreSoloPropia: true, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
    editarConMotivo: false,
  },

  // ── CLIENTE — solo su portal ──────────────────────────────────────────────
  cliente: {
    verClientes: false, crearClientes: false, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: false, crearVehiculos: false, editarVehiculos: false,
    verTramites: false, crearTramites: false, cambiarEstadoTramite: false,
    verHonorariosDetalle: false, registrarDevoluciones: false, marcarPagado: false, verObsInternas: false,
    verTurnos: false, crearTurnos: false, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: false, verPanelMando: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: false,    verTodasLasMultas: false,
    verBandejaWA: false, responderWA: false, verTodaLaBandejaWA: false, reasignarWA: false,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
    editarConMotivo: false,
  },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getPermisos(rol: Rol): Permisos {
  return PERMISOS[rol] ?? PERMISOS.operador
}

export function puedeHacer(rol: Rol, permiso: keyof Permisos): boolean {
  return getPermisos(rol)[permiso] ?? false
}

// Roles habilitados a editar dejando motivo. Se usa en servicios y guards
// donde no hay hook disponible (edicionTrazable.ts, Cloud Functions).
export const ROLES_EDICION_CON_MOTIVO: Rol[] = [
  'propietario', 'admin_gral', 'admin', 'superadmin', 'asesor_comercial',
]

export function puedeEditarConMotivo(rol: Rol | undefined): boolean {
  return !!rol && ROLES_EDICION_CON_MOTIVO.includes(rol)
}

// ─── LABELS DE DISPLAY ─────────────────────────────────────────────────────────
// IMPORTANTE: solo cambian la etiqueta visible. Las KEYS internas
// (propietario, asesor_comercial) se preservan para no romper historial en
// Firestore, reglas de seguridad ni queries. NO renombrar las keys.
export const ROL_LABELS: Record<Rol, string> = {
  propietario:      'CEO',
  admin_gral:       'Administrador General',
  admin:            'Administrador',
  vendedor:         'Vendedor / Closer',
  operador:         'Operador',
  superadmin:       'Super Admin',
  cliente:          'Cliente',
  gestor:           'Gestor / Mandatario',
  asesor_comercial: 'Secretario Comercial',
  asistente_multas: 'Asistente de Multas',
}

export const ROL_COLORS: Record<Rol, string> = {
  propietario:      'bg-purple-100 text-purple-700',
  admin_gral:       'bg-indigo-100 text-indigo-700',
  admin:            'bg-[#D4621A]/10 text-[#D4621A]',
  vendedor:         'bg-blue-100 text-blue-700',
  operador:         'bg-emerald-100 text-emerald-700',
  superadmin:       'bg-purple-200 text-purple-800',
  cliente:          'bg-gray-100 text-gray-600',
  gestor:           'bg-cyan-100 text-cyan-700',
  asesor_comercial: 'bg-amber-100 text-amber-700',
  asistente_multas: 'bg-rose-100 text-rose-700',
}

// Roles que tienen acceso al panel admin
export const ROLES_ADMIN: Rol[] = ['admin', 'admin_gral', 'propietario', 'vendedor', 'operador', 'gestor', 'asesor_comercial', 'asistente_multas']