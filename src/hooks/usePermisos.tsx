import { useAuth } from './useAuth'
import { getPermisos, puedeHacer, type Permisos } from '@/utils/permisos'
import type { Rol } from '@/types'

export function usePermisos() {
  const { user } = useAuth()
  const rol = (user?.rol ?? 'cliente') as Rol
  const permisos = getPermisos(rol)

  return {
    permisos,
    puede:         (p: keyof Permisos) => puedeHacer(rol, p),
    rol,
    esPropietario: rol === 'propietario',
    esAdmin:       rol === 'admin' || rol === 'propietario',
    esVendedor:    rol === 'vendedor',
    esOperador:    rol === 'operador',
    esCliente:     rol === 'cliente',
  }
}

interface GuardProps {
  permiso:   keyof Permisos
  children:  React.ReactNode
  fallback?: React.ReactNode
}

export function PermisoGuard({ permiso, children, fallback = null }: GuardProps) {
  const { puede } = usePermisos()
  return puede(permiso) ? <>{children}</> : <>{fallback}</>
}
