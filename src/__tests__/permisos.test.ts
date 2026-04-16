// src/__tests__/permisos.test.ts
// Tests para src/utils/permisos.ts
//
// Verifica que la matriz RBAC está correctamente definida:
// - Cada rol tiene exactamente los permisos que debe tener
// - El helper puedeHacer() refleja la matriz
// - Los roles restrictivos NO tienen acceso a funciones sensibles
// - No hay permisos "de regalo" por error de copy-paste

import { describe, it, expect } from 'vitest'
import { getPermisos, puedeHacer, type Permisos } from '@/utils/permisos'
import type { Rol } from '@/types'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const TODOS_LOS_PERMISOS = Object.keys(
  getPermisos('admin')
) as (keyof Permisos)[]

const ROLES_ADMIN: Rol[] = ['propietario', 'admin', 'vendedor', 'operador']

// Permisos que SOLO propietario y admin deben tener
const PERMISOS_FINANCIEROS: (keyof Permisos)[] = [
  'verHonorariosDetalle',
  'marcarPagado',
  'verMetricasFinancieras',
  'exportarDatos',
  'editarConfiguracion',
  'verConfiguracion',
]

// Permisos que NI vendedor NI operador deben tener
const PERMISOS_SENSIBLES: (keyof Permisos)[] = [
  'eliminarClientes',
  'darAccesoPortal',
  'verHonorariosDetalle',
  'marcarPagado',
  'verMetricasFinancieras',
  'editarConfiguracion',
  'exportarDatos',
]

// ─── PROPIETARIO — ACCESO TOTAL ────────────────────────────────────────────────

describe('propietario', () => {
  it('tiene todos los permisos', () => {
    TODOS_LOS_PERMISOS.forEach(permiso => {
      expect(puedeHacer('propietario', permiso)).toBe(true)
    })
  })
})

// ─── ADMIN — IGUAL A PROPIETARIO ──────────────────────────────────────────────

describe('admin', () => {
  it('tiene todos los permisos (igual que propietario)', () => {
    TODOS_LOS_PERMISOS.forEach(permiso => {
      expect(puedeHacer('admin', permiso)).toBe(true)
    })
  })

  it('admin y propietario tienen exactamente los mismos permisos', () => {
    TODOS_LOS_PERMISOS.forEach(permiso => {
      expect(puedeHacer('admin', permiso)).toBe(puedeHacer('propietario', permiso))
    })
  })
})

// ─── VENDEDOR ─────────────────────────────────────────────────────────────────

describe('vendedor', () => {
  it('puede ver clientes, crear clientes', () => {
    expect(puedeHacer('vendedor', 'verClientes')).toBe(true)
    expect(puedeHacer('vendedor', 'crearClientes')).toBe(true)
  })

  it('puede ver tramites pero no cambiar su estado', () => {
    expect(puedeHacer('vendedor', 'verTramites')).toBe(true)
    expect(puedeHacer('vendedor', 'cambiarEstadoTramite')).toBe(false)
  })

  it('puede acceder al CRM / pipeline', () => {
    expect(puedeHacer('vendedor', 'verCRM')).toBe(true)
    expect(puedeHacer('vendedor', 'verSeguimiento')).toBe(true)
    expect(puedeHacer('vendedor', 'crearSeguimiento')).toBe(true)
  })

  it('NO tiene permisos sensibles', () => {
    PERMISOS_SENSIBLES.forEach(permiso => {
      expect(puedeHacer('vendedor', permiso)).toBe(false)
    })
  })

  it('no puede editar ni eliminar clientes', () => {
    expect(puedeHacer('vendedor', 'editarClientes')).toBe(false)
    expect(puedeHacer('vendedor', 'eliminarClientes')).toBe(false)
  })

  it('no puede crear vehículos ni editarlos', () => {
    expect(puedeHacer('vendedor', 'crearVehiculos')).toBe(false)
    expect(puedeHacer('vendedor', 'editarVehiculos')).toBe(false)
  })
})

// ─── OPERADOR ─────────────────────────────────────────────────────────────────

describe('operador', () => {
  it('puede gestionar trámites completos', () => {
    expect(puedeHacer('operador', 'verTramites')).toBe(true)
    expect(puedeHacer('operador', 'crearTramites')).toBe(true)
    expect(puedeHacer('operador', 'cambiarEstadoTramite')).toBe(true)
  })

  it('puede gestionar turnos', () => {
    expect(puedeHacer('operador', 'verTurnos')).toBe(true)
    expect(puedeHacer('operador', 'crearTurnos')).toBe(true)
    expect(puedeHacer('operador', 'confirmarTurnos')).toBe(true)
    expect(puedeHacer('operador', 'cancelarTurnos')).toBe(true)
  })

  it('puede crear y editar clientes y vehículos', () => {
    expect(puedeHacer('operador', 'verClientes')).toBe(true)
    expect(puedeHacer('operador', 'crearClientes')).toBe(true)
    expect(puedeHacer('operador', 'editarClientes')).toBe(true)
    expect(puedeHacer('operador', 'crearVehiculos')).toBe(true)
    expect(puedeHacer('operador', 'editarVehiculos')).toBe(true)
  })

  it('NO tiene permisos sensibles', () => {
    PERMISOS_SENSIBLES.forEach(permiso => {
      expect(puedeHacer('operador', permiso)).toBe(false)
    })
  })

  it('no tiene acceso al CRM ni pipeline', () => {
    expect(puedeHacer('operador', 'verCRM')).toBe(false)
    expect(puedeHacer('operador', 'verSeguimiento')).toBe(false)
    expect(puedeHacer('operador', 'crearSeguimiento')).toBe(false)
  })

  it('no puede ver honorarios ni marcar pagado', () => {
    expect(puedeHacer('operador', 'verHonorariosDetalle')).toBe(false)
    expect(puedeHacer('operador', 'marcarPagado')).toBe(false)
  })
})

// ─── CLIENTE — SIN PERMISOS EN EL PANEL ADMIN ─────────────────────────────────

describe('cliente', () => {
  it('no tiene ningún permiso del panel admin', () => {
    TODOS_LOS_PERMISOS.forEach(permiso => {
      expect(puedeHacer('cliente', permiso)).toBe(false)
    })
  })
})

// ─── SUPERADMIN ───────────────────────────────────────────────────────────────

describe('superadmin', () => {
  it('tiene todos los permisos', () => {
    TODOS_LOS_PERMISOS.forEach(permiso => {
      expect(puedeHacer('superadmin', permiso)).toBe(true)
    })
  })
})

// ─── CONSISTENCIA DE LA MATRIZ ────────────────────────────────────────────────

describe('Consistencia de la matriz RBAC', () => {
  it('los roles más privilegiados tienen todo lo que tienen los menos privilegiados', () => {
    // Jerarquía: propietario >= admin >= operador (para permisos operativos)
    const operadorPermisos = getPermisos('operador')
    const adminPermisos    = getPermisos('admin')

    // Todo lo que puede hacer operador, lo puede hacer admin
    TODOS_LOS_PERMISOS.forEach(permiso => {
      if (operadorPermisos[permiso]) {
        expect(adminPermisos[permiso]).toBe(true)
      }
    })
  })

  it('getPermisos devuelve fallback a operador para rol desconocido', () => {
    const p = getPermisos('desconocido' as Rol)
    // Debe ser el objeto de operador (el fallback definido en getPermisos)
    expect(p.verTramites).toBe(true)
    expect(p.editarConfiguracion).toBe(false)
  })

  it('puedeHacer es equivalente a getPermisos()[permiso]', () => {
    const roles: Rol[] = ['admin', 'vendedor', 'operador', 'cliente']
    roles.forEach(rol => {
      TODOS_LOS_PERMISOS.forEach(permiso => {
        expect(puedeHacer(rol, permiso)).toBe(getPermisos(rol)[permiso])
      })
    })
  })

  it('ningún rol tiene permisos undefined (todos son boolean)', () => {
    const roles: Rol[] = ['propietario', 'admin', 'vendedor', 'operador', 'cliente', 'superadmin']
    roles.forEach(rol => {
      const p = getPermisos(rol)
      TODOS_LOS_PERMISOS.forEach(permiso => {
        expect(typeof p[permiso]).toBe('boolean')
      })
    })
  })
})

// ─── SEPARACIÓN VENDEDOR vs OPERADOR ─────────────────────────────────────────

describe('Separación vendedor/operador', () => {
  it('vendedor puede CRM pero operador no', () => {
    expect(puedeHacer('vendedor', 'verCRM')).toBe(true)
    expect(puedeHacer('operador', 'verCRM')).toBe(false)
  })

  it('operador puede cambiar estado de tramite pero vendedor no', () => {
    expect(puedeHacer('operador', 'cambiarEstadoTramite')).toBe(true)
    expect(puedeHacer('vendedor', 'cambiarEstadoTramite')).toBe(false)
  })

  it('operador puede confirmar turnos pero vendedor no', () => {
    expect(puedeHacer('operador', 'confirmarTurnos')).toBe(true)
    expect(puedeHacer('vendedor', 'confirmarTurnos')).toBe(false)
  })
})