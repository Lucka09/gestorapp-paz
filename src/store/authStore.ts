import { create } from 'zustand'
import type { Usuario } from '@/types'

interface AuthState {
  user: Usuario | null
  loading: boolean
  setUser:    (user: Usuario | null) => void
  setLoading: (loading: boolean) => void
  // Helpers de rol — usar usePermisos() para lógica de permisos granular
  /** @deprecated Usar usePermisos().esAdmin en su lugar */
  isAdmin:       () => boolean
  /** @deprecated Usar usePermisos().esOperador en su lugar */
  isOperador:    () => boolean
  /** @deprecated Usar usePermisos().esCliente en su lugar */
  isCliente:     () => boolean
  // Helpers actualizados — cubren todos los roles
  isPropietario: () => boolean
  isVendedor:    () => boolean
  isGestor:      () => boolean
  isSuperAdmin:  () => boolean
  /** Verdadero para propietario y superadmin — acceso financiero */
  isFinanciero:      () => boolean
  isAsesorComercial: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser:    (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  /** @deprecated Usar usePermisos().esAdmin en su lugar */
  isAdmin:       () => get().user?.rol === 'admin',
  /** @deprecated Usar usePermisos().esOperador en su lugar */
  isOperador:    () => get().user?.rol === 'operador',
  /** @deprecated Usar usePermisos().esCliente en su lugar */
  isCliente:     () => get().user?.rol === 'cliente',

  isPropietario: () => get().user?.rol === 'propietario',
  isVendedor:    () => get().user?.rol === 'vendedor',
  isGestor:      () => get().user?.rol === 'gestor',
  isSuperAdmin:  () => get().user?.rol === 'superadmin',
  isFinanciero:      () => ['propietario', 'superadmin'].includes(get().user?.rol ?? ''),
  isAsesorComercial: () => get().user?.rol === 'asesor_comercial',
}))