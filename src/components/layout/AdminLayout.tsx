import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Car, FileText,
  CalendarDays, LogOut, Radar, Menu, X,
  AlertTriangle, Ban, WifiOff, TrendingUp, CheckSquare, UserCog,
  Calculator, Upload, Settings, DollarSign, BarChart2,
} from 'lucide-react'
import { useState } from 'react'
import { signOut }     from 'firebase/auth'
import { auth }        from '@/lib/firebase'
import { useAuth }     from '@/hooks/useAuth'
import { useGestoria } from '@/context/GestoriaContext'
import NotificacionesPanel from '@/components/shared/NotificacionesPanel'
import ConfirmDialog       from '@/components/shared/ConfirmDialog'
import { usePermisos }     from '@/hooks/usePermisos'
import BusquedaGlobal      from '@/components/shared/BusquedaGlobal'
import { ROL_LABELS, ROL_COLORS } from '@/utils/permisos'
import AsistenteIA from '@/components/shared/AsistenteIA'

// ─── PREFETCH DE CHUNKS AL HOVER ──────────────────────────────────────────────

const PREFETCH_MAP: Record<string, () => Promise<unknown>> = {
  '/admin/gestor':            () => import('@/features/gestor/GestorHomePage'),
  '/admin/tramites':          () => import('@/features/tramites/TramitesPage'),
  '/admin/torre-de-control':  () => import('@/features/torre/TorreDeControlPage'),
  '/admin/clientes':          () => import('@/features/clientes/ClientesPage'),
  '/admin/vehiculos':         () => import('@/features/vehiculos/VehiculosPage'),
  '/admin/turnos':            () => import('@/features/turnos/TurnosPage'),
  '/admin/pipeline':          () => import('@/features/pipeline/PipelinePage'),
  '/admin/cobranzas':         () => import('@/features/cobranzas/CobranzasPage'),
  '/admin/reportes':          () => import('@/features/reportes/ReportesPage'),
  '/admin/configuracion':     () => import('@/features/configuracion/ConfiguracionPage'),
  '/admin/dashboard':         () => import('@/features/dashboard/DashboardPage'),
  '/admin/tareas':            () => import('@/features/tareas/TareasPage'),           // ← nuevo
  '/admin/equipo':            () => import('@/features/equipo/EquipoPage'),           // ← nuevo
  '/admin/calculadora':       () => import('@/features/calculadora/CalculadoraPage'), // ← nuevo
  '/admin/importar':          () => import('@/features/importar/ImportarPage'),       // ← nuevo
}

const NAV_ITEMS_ALL = [
  { to: '/admin/dashboard',        icon: LayoutDashboard, label: 'Dashboard',        permiso: 'verDashboard'   },
  { to: '/admin/clientes',         icon: Users,           label: 'Clientes',         permiso: 'verClientes'    },
  { to: '/admin/vehiculos',        icon: Car,             label: 'Vehículos',        permiso: 'verVehiculos'   },
  { to: '/admin/tramites',         icon: FileText,        label: 'Trámites',         permiso: 'verTramites'    },
  { to: '/admin/torre-de-control', icon: Radar,           label: 'Torre de Control', permiso: 'verTramites'    },
  { to: '/admin/turnos',           icon: CalendarDays,    label: 'Turnos',           permiso: 'verTurnos'      },
  { to: '/admin/pipeline',         icon: TrendingUp,      label: 'Pipeline',         permiso: 'verCRM'         },
  { to: '/admin/cobranzas',        icon: DollarSign,      label: 'Cobranzas',        permiso: 'verCobranzas'   },
  { to: '/admin/reportes',         icon: BarChart2,       label: 'Reportes',         permiso: 'verReportes'    },
  { to: '/admin/tareas',           icon: CheckSquare,     label: 'Tareas',           permiso: 'verTramites'    },
  { to: '/admin/equipo',           icon: UserCog,         label: 'Equipo',           permiso: 'verEquipo'      },
  { to: '/admin/calculadora',      icon: Calculator,      label: 'Calculadora',      permiso: 'verDashboard'   },
  { to: '/admin/importar',         icon: Upload,          label: 'Importar',         permiso: 'verClientes'    },
  { to: '/admin/configuracion',    icon: Settings,        label: 'Configuración',    permiso: 'verConfiguracion' },
] as const

// ─── PANTALLAS DE ESTADO DEL TENANT ──────────────────────────────────────────
//
// Bloqueamos el render del panel si la gestoría está en un estado no operable.
// Esto protege contra renders con gestoriaId=null que lanzarían queries inválidas.

function TenantLoader() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'var(--gp-orange)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"
                stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <rect x="9" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--gp-orange)', opacity: 0.7,
            animation: 'bounce 1.1s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }} />
        ))}
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)} }`}</style>
    </div>
  )
}

function TenantBloqueado({ titulo, detalle, icon: Icon, color }: {
  titulo:  string; detalle: string
  icon:    typeof AlertTriangle; color: string
}) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px',
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={28} color={color} />
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20,
          color: 'var(--color-text-1)', margin: '0 0 8px',
        }}>{titulo}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-3)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {detalle}
        </p>
        <a
          href="https://wa.me/5491136141431"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#25D366', color: 'white',
            padding: '10px 20px', borderRadius: 10,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >
          Contactar soporte
        </a>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-4)' }}>
          GestorApp · JAH-NISSI Digital Studio
        </p>
      </div>
    </div>
  )
}

function ErrorConfigTenant() {
  return (
    <TenantBloqueado
      titulo="Error de configuración"
      detalle="Tu cuenta no tiene una gestoría asignada. Contactá al administrador para resolver este problema."
      icon={WifiOff}
      color="#EF4444"
    />
  )
}

// ─── LAYOUT PRINCIPAL ────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { user }      = useAuth()
  const { puede, rol } = usePermisos()
  const {
    gestoriaId, loading: tenantLoading,
    estadoGestoria, nombreComercial, logoUrl,
  } = useGestoria()
  const [logoutOpen, setLogoutOpen]   = useState(false)
  const [open, setOpen]               = useState(false)

  // ── Guards de tenant ──────────────────────────────────────────────────────
  // Orden: loading → error de config → estado operativo no apto → render normal

  if (tenantLoading) return <TenantLoader />

  if (!gestoriaId) return <ErrorConfigTenant />

  if (estadoGestoria === 'suspendida') {
    return (
      <TenantBloqueado
        titulo="Cuenta suspendida"
        detalle="El acceso a GestorApp está suspendido. Regularizá tu situación o contactá al soporte para reactivar."
        icon={AlertTriangle}
        color="#F59E0B"
      />
    )
  }

  if (estadoGestoria === 'cancelada') {
    return (
      <TenantBloqueado
        titulo="Suscripción cancelada"
        detalle="Esta cuenta de GestorApp fue cancelada. Contactá al soporte si creés que esto es un error."
        icon={Ban}
        color="#EF4444"
      />
    )
  }

  // ── Render normal ─────────────────────────────────────────────────────────

  const confirmarLogout = () => signOut(auth)

  return (
    <>
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
          {/* Logo — dinámico según el tenant */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={nombreComercial}
                className="w-9 h-9 rounded-full shrink-0 object-cover border-2"
                style={{ borderColor: 'var(--gp-orange)' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              // Fallback: iniciales del nombre comercial
              <div
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center
                           text-white font-bold text-xs border-2"
                style={{ background: 'var(--gp-orange)', borderColor: 'var(--gp-orange)' }}
              >
                {nombreComercial.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-bold text-sm leading-tight">{nombreComercial}</p>
              <p style={{ color: 'var(--gp-orange)' }} className="text-xs font-medium">
                GestorApp
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {[
              ...(rol === 'gestor'
                ? [{ to: '/admin/gestor', icon: FileText, label: 'Mis Trámites', permiso: 'verTramites' }]
                : []),
              ...NAV_ITEMS_ALL,
            ]
              .filter(item => puede(item.permiso as Parameters<typeof puede>[0]))
              .filter(item => !(rol === 'gestor' && item.to === '/admin/tramites'))
              .map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onMouseEnter={() => PREFETCH_MAP[to]?.()}
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
            <button
              onClick={() => setLogoutOpen(true)}
              className="flex items-center gap-2 text-gray-500 hover:text-red-400 text-xs w-full transition-colors"
            >
              <LogOut size={13} /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Overlay mobile */}
        {open && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Topbar */}
          <header
            role="banner"
            className="h-14 bg-white border-b border-gray-100 flex items-center
                       gap-3 px-4 shrink-0 shadow-sm"
          >
            <button
              className="lg:hidden p-1.5 rounded text-gray-500 hover:bg-gray-100 shrink-0"
              onClick={() => setOpen(!open)}
              aria-label="Abrir menú"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="flex-1 max-w-md">
              <BusquedaGlobal />
            </div>

            <div className="flex-1" />

            <NotificacionesPanel />
          </header>

          {/* Content */}
          <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
              <AsistenteIA />
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