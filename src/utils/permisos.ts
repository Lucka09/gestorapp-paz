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
  },

  // ── ADMIN — igual a propietario ───────────────────────────────────────────
  admin: {
    verClientes: true, crearClientes: true, editarClientes: true,
    eliminarClientes: true, darAccesoPortal: true,
    verVehiculos: true, crearVehiculos: true, editarVehiculos: true,
    verTramites: true, crearTramites: true, cambiarEstadoTramite: true,
    verHonorariosDetalle: true, marcarPagado: true, verObsInternas: true,
    verTurnos: true, crearTurnos: true, confirmarTurnos: true, cancelarTurnos: true,
    verDashboard: true, verMetricasFinancieras: true, verCRM: true,
    exportarDatos: true, verSeguimiento: true, crearSeguimiento: true,
    verConfiguracion: true, editarConfiguracion: true,
  },

  // ── VENDEDOR/CLOSER — ve clientes, seguimiento y turnos. NO ve financiero ─
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
  },

  // ── OPERADOR — gestiona trámites y turnos. NO ve CRM ni financiero ─────────
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
  },

  // ── CLIENTE — solo su portal ───────────────────────────────────────────────
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
  cliente:     'Cliente',
}

export const ROL_COLORS: Record<Rol, string> = {
  propietario: 'bg-purple-100 text-purple-700',
  admin:       'bg-[#D4621A]/10 text-[#D4621A]',
  vendedor:    'bg-blue-100 text-blue-700',
  operador:    'bg-emerald-100 text-emerald-700',
  cliente:     'bg-gray-100 text-gray-600',
}

// Roles que tienen acceso al panel admin
export const ROLES_ADMIN: Rol[] = ['admin', 'propietario', 'vendedor', 'operador']
