import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Car, FileText,
  CalendarDays, LogOut, Menu, X, FolderInput, Kanban
} from 'lucide-react'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import NotificacionesPanel from '@/components/shared/NotificacionesPanel'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { usePermisos } from '@/hooks/usePermisos'
import { ROL_LABELS, ROL_COLORS } from '@/utils/permisos'

// navItems se filtra dinámicamente en el componente
const NAV_ITEMS_ALL = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard',  permiso: 'verDashboard'  },
  { to: '/admin/clientes',  icon: Users,           label: 'Clientes',   permiso: 'verClientes'   },
  { to: '/admin/vehiculos', icon: Car,             label: 'Vehículos',  permiso: 'verVehiculos'  },
  { to: '/admin/tramites',  icon: FileText,        label: 'Trámites',   permiso: 'verTramites'   },
  { to: '/admin/turnos',    icon: CalendarDays,    label: 'Turnos',    permiso: 'verTurnos'    },
] as const

export default function AdminLayout() {
  const { user } = useAuth()
  const { puede, rol } = usePermisos()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const handleLogout = () => setLogoutOpen(true)
  const confirmarLogout = () => signOut(auth)

  return (
    <>
    {/* Skip link — accesibilidad teclado */}
    <a href="#main-content" className="skip-link">
      Saltar al contenido principal
    </a>
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-[#1A1A1A]
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <img
            src="/logo-gp-64.jpg"
            alt="Gestoría Paz"
            className="w-9 h-9 rounded-full shrink-0 object-cover border-2"
            style={{ borderColor: 'var(--gp-orange)' }}
            onError={e => {
              e.currentTarget.style.display = 'none'
              const fallback = e.currentTarget.nextElementSibling as HTMLElement
              if (fallback) fallback.style.display = 'flex'
            }}
          />
          <div
            className="w-9 h-9 rounded-full shrink-0 items-center justify-center
                       text-white font-bold text-xs border-2"
            style={{ background: 'var(--gp-orange)', borderColor: 'var(--gp-orange)', display: 'none' }}
          >
            GP
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">GestorApp</p>
            <p style={{ color: 'var(--gp-orange)' }} className="text-xs font-medium">Gestoría Paz</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS_ALL.filter(item => puede(item.permiso as any)).map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                 transition-all border-l-2 ${
                  isActive
                    ? 'bg-[#D4621A]/20 text-[#F4936A] border-[#D4621A]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white border-transparent'
                }`
              }
            >
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#D4621A]/25 flex items-center justify-center
                            text-[#D4621A] font-bold text-xs uppercase shrink-0">
              {user?.nombre?.[0]}{user?.apellido?.[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-xs font-semibold truncate">
                {user?.nombre} {user?.apellido}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROL_COLORS[rol] ?? 'bg-gray-100 text-gray-500'}`}>
                {ROL_LABELS[rol] ?? rol}
              </span>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-gray-500 hover:text-red-400 text-xs w-full transition-colors">
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center
                           justify-between px-4 shrink-0 shadow-sm">
          <button className="lg:hidden p-1.5 rounded text-gray-500 hover:bg-gray-100"
            onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />
          {/* Panel de notificaciones admin */}
          <NotificacionesPanel />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={confirmarLogout}
        titulo="¿Cerrar sesión?"
        descripcion="Vas a salir de GestorApp. Podés volver a ingresar cuando quieras."
        labelConfirm="Cerrar sesión"
        labelCancel="Cancelar"
        tipo="warning"
      />
    </div>
    </>
  )
}