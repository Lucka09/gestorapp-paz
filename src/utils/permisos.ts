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

  // Multas — módulo de descargos / Revisión de Multas
  gestionarMultas:      boolean   // acceso al módulo de multas y su workflow
  verConsultasMultas:   boolean   // Consultas de Multas (búsqueda de infracciones) — visible a todo el staff

  // WhatsApp Bandeja — acceso por rol
  verBandejaWA:         boolean   // ver bandeja de mensajes WhatsApp
  responderWA:          boolean   // enviar mensajes desde la bandeja

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
}

// ─── PERMISOS POR ROL ─────────────────────────────────────────────────────────

const PERMISOS: Record<Rol, Permisos> = {

  // ── PROPIETARIO (label: CEO) — acceso total + financiero ──────────────────
  propietario: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: true, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: true, verCRM: true,
    exportarDatos: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
    verEquipo: true, gestionarEquipo: true,
    verCobranzas: true, verReportes: true,  // ← acceso financiero total
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,
  },

  // ── ADMIN — operaciones completas, SIN finanzas ni eliminar clientes ───────
  admin: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
    verEquipo: true, gestionarEquipo: true,
    verCobranzas: false, verReportes: false,  // ← sin acceso financiero
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: false,
  },

  // ── ADMIN GENERAL — igual a admin + acceso financiero, solo 1 por gestoría ──
  admin_gral: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: true, verCRM: true,
    exportarDatos: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: false,  // ← no puede cambiar config
    verEquipo: true, gestionarEquipo: false,             // ← no puede crear/eliminar miembros
    verCobranzas: true, verReportes: true,               // ← acceso financiero elevado
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,                        // ← puede ver % por gestor en Torre
  },

  // ── VENDEDOR — NO gestiona equipo ─────────────────────────────────────────
  vendedor: {
    verClientes: true, crearClientes: true, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: false, editarVehiculos: false,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: false,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: true, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
  },

  // ── OPERADOR — NO gestiona equipo ─────────────────────────────────────────
  operador: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: true,
    verBandejaWA: false, responderWA: false,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
  },

  // ── SUPERADMIN — acceso total ─────────────────────────────────────────────
  superadmin: {
    verClientes: true, crearClientes: true, editarClientes: true, eliminarClientes: true,
    darAccesoPortal: true, verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    exportarDatos: true, verDashboard: true, verCRM: true, editarConfiguracion: true,
    verMetricasFinancieras: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, verEquipo: true, gestionarEquipo: true,
    verCobranzas: true, verReportes: true,
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,
    verRendimientoGestores: true,
  },

  // ── GESTOR (mandatario) — carga y gestión propia, sin finanzas ni WA ────────
  gestor: {
    verClientes: true,  crearClientes: true,  editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true,  crearTramites: true,  cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: false,
    verDashboard: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: false, responderWA: false,
    verTorreCompleta: false, verTorreSoloPropia: true, requiereGeo: true,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
  },

  // ── ASESOR COMERCIAL (label: Secretario Comercial) ──────────────────────────
  asesor_comercial: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,        // ← sin acceso financiero
    gestionarMultas: true,
    verConsultasMultas: true,
    verBandejaWA: true, responderWA: true,
    verTorreCompleta: true, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: true, verPremiosTorre: true,         // ← exclusivo de este rol
    verRendimientoGestores: false,
  },

  // ── ASISTENTE DE MULTAS — módulo de multas + básico, nada financiero ────────
  // Recibe multas asignadas y ejecuta el workflow COMPLETO (paso 1 a 7).
  // Ve Trámites (para abrir la multa) y Torre solo-propia. Sin clientes/vehículos,
  // turnos, cobranzas, reportes, config, equipo, pipeline, WhatsApp ni premios.
  asistente_multas: {
    verClientes: false, crearClientes: false, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: false, crearVehiculos: false, editarVehiculos: false,
    // verTramites: false → NO ve la lista general de Trámites/Torre/Tareas en el
    // menú. El detalle de la multa se abre igual desde Revisión de Multas (la ruta
    // /admin/tramites/:id no está guardada por permiso) y el workflow corre porque
    // usa cambiarEstadoTramite, no verTramites.
    verTramites: false, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: false, crearTurnos: false, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: true, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: true,                          // ← acceso al módulo de multas
    verConsultasMultas: true,
    verBandejaWA: false, responderWA: false,
    verTorreCompleta: false, verTorreSoloPropia: true, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
  },

  // ── CLIENTE — solo su portal ──────────────────────────────────────────────
  cliente: {
    verClientes: false, crearClientes: false, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: false, crearVehiculos: false, editarVehiculos: false,
    verTramites: false, crearTramites: false, cambiarEstadoTramite: false,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: false, crearTurnos: false, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
    gestionarMultas: false,
    verConsultasMultas: false,
    verBandejaWA: false, responderWA: false,
    verTorreCompleta: false, verTorreSoloPropia: false, requiereGeo: false,
    verPremios: false, verPremiosTorre: false,
    verRendimientoGestores: false,
  },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getPermisos(rol: Rol): Permisos {
  return PERMISOS[rol] ?? PERMISOS.operador
}

export function puedeHacer(rol: Rol, permiso: keyof Permisos): boolean {
  return getPermisos(rol)[permiso] ?? false
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