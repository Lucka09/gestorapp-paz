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
}

// ─── PERMISOS POR ROL ─────────────────────────────────────────────────────────

const PERMISOS: Record<Rol, Permisos> = {

  // ── PROPIETARIO — acceso total + financiero ───────────────────────────────
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
  },

  // ── ADMIN — igual a propietario EXCEPTO finanzas ─────────────────────────
  admin: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: true, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: false, verCRM: true,
    exportarDatos: false, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
    verEquipo: true, gestionarEquipo: true,
    verCobranzas: false, verReportes: false,  // ← sin acceso financiero
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
  },

  // ── GESTOR (mandatario) — solo su portal de trámites ──────────────────────
  gestor: {
    verClientes: false, crearClientes: false, editarClientes: false,
    eliminarClientes: false, darAccesoPortal: false,
    verVehiculos: false, crearVehiculos: false, editarVehiculos: false,
    verTramites: true,  crearTramites: false, cambiarEstadoTramite: true,
    verHonorariosDetalle: false, marcarPagado: false, verObsInternas: false,
    verTurnos: false, crearTurnos: false, confirmarTurnos: false, cancelarTurnos: false,
    verDashboard: false, verMetricasFinancieras: false, verCRM: false,
    exportarDatos: false, verSeguimiento: false, crearSeguimiento: false,
    verConfiguracion: false, editarConfiguracion: false,
    verEquipo: false, gestionarEquipo: false,
    verCobranzas: false, verReportes: false,
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
  },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getPermisos(rol: Rol): Permisos {
  return PERMISOS[rol] ?? PERMISOS.operador
}

export function puedeHacer(rol: Rol, permiso: keyof Permisos): boolean {
  return getPermisos(rol)[permiso] ?? false
}

export const ROL_LABELS: Record<Rol, string> = {
  propietario: 'Propietario',
  admin:       'Administrador',
  vendedor:    'Vendedor / Closer',
  operador:    'Operador',
  superadmin:  'Super Admin',
  cliente:     'Cliente',
  gestor:      'Gestor / Mandatario',
}

export const ROL_COLORS: Record<Rol, string> = {
  propietario: 'bg-purple-100 text-purple-700',
  admin:       'bg-[#D4621A]/10 text-[#D4621A]',
  vendedor:    'bg-blue-100 text-blue-700',
  operador:    'bg-emerald-100 text-emerald-700',
  superadmin:  'bg-purple-200 text-purple-800',
  cliente:     'bg-gray-100 text-gray-600',
  gestor:      'bg-cyan-100 text-cyan-700',
}

// Roles que tienen acceso al panel admin
export const ROLES_ADMIN: Rol[] = ['admin', 'propietario', 'vendedor', 'operador', 'gestor']