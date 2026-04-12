import { create } from 'zustand'
import type { Usuario } from '@/types'

interface AuthState {
  user: Usuario | null
  loading: boolean
  setUser: (user: Usuario | null) => void
  setLoading: (loading: boolean) => void
  isAdmin: () => boolean
  isOperador: () => boolean
  isCliente: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  isAdmin:    () => get().user?.rol === 'admin',
  isOperador: () => get().user?.rol === 'operador',
  isCliente:  () => get().user?.rol === 'cliente',
}))
