import { NavLink, Outlet } from 'react-router-dom'
import { Home, FileText, CalendarDays, LogOut, Menu, X, Bell } from 'lucide-react'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useNotificacionesPortal } from '@/hooks/usePortal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const navItems = [
  { to: '/portal',          icon: Home,         label: 'Inicio',        end: true },
  { to: '/portal/tramites', icon: FileText,      label: 'Mis Trámites'           },
  { to: '/portal/turnos',   icon: CalendarDays,  label: 'Turnos'                 },
]

export default function ClienteLayout() {
  const { user }  = useAuth()
  const [open, setOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const { noLeidas } = useNotificacionesPortal(user?.uid)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header role="banner" className="bg-[#1A1A1A] h-14 flex items-center justify-between px-4 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-1 text-gray-400" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full border-2 border-[#D4621A] overflow-hidden
                            shrink-0 bg-[#D4621A] flex items-center justify-center">
              <span className="text-white font-bold text-xs">GP</span>
            </div>
            <div>
              <span className="text-white font-bold text-sm">Gestoría Paz</span>
              <span className="text-[#D4621A] text-xs ml-2 hidden sm:inline">· Portal</span>
            </div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-[#D4621A]/20 text-[#F4936A]' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon size={15} />{label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Notificaciones badge */}
          {noLeidas > 0 && (
            <div className="relative">
              <Bell size={18} className="text-gray-400" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#D4621A] text-white
                               text-xs rounded-full flex items-center justify-center font-bold">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            </div>
          )}
          <div className="hidden md:flex items-center gap-2 ml-2">
            <div className="w-7 h-7 rounded-full bg-[#D4621A]/20 flex items-center justify-center
                            text-[#D4621A] font-bold text-xs">
              {user?.nombre?.[0]}{user?.apellido?.[0]}
            </div>
            <span className="text-gray-400 text-xs">{user?.nombre}</span>
          </div>
          <button onClick={() => setLogoutOpen(true)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors ml-1">
            <LogOut size={15} />
            <span className="hidden md:block">Salir</span>
          </button>
        </div>
      </header>

      {/* Barra naranja */}
      <div className="h-0.5 bg-[#D4621A] w-full" />

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
          <nav className="fixed top-[56px] left-0 right-0 z-20 bg-[#1A1A1A] border-t border-white/10 md:hidden shadow-xl">
            {navItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-4 text-sm border-b border-white/5 ${
                    isActive ? 'text-[#F4936A]' : 'text-gray-400'
                  }`
                }
              >
                <Icon size={17} />{label}
              </NavLink>
            ))}
          </nav>
        </>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => signOut(auth)}
        titulo="¿Cerrar sesión?"
        descripcion="Vas a salir del portal. Podés volver a ingresar cuando quieras con tu correo y contraseña."
        labelConfirm="Cerrar sesión"
        labelCancel="Quedarme"
        tipo="warning"
      />
    </div>
  )
}