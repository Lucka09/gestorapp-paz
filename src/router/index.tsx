import {
  createBrowserRouter, Navigate, Outlet, useLocation,
} from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore }    from '@/store/authStore'
import AdminLayout         from '@/components/layout/AdminLayout'
import ClienteLayout       from '@/components/layout/ClienteLayout'
import { FeatureBoundary } from '@/components/shared/ErrorBoundary'
import { registrarActividad } from '@/lib/firestore/audit'
import type { Rol }        from '@/types'

// ─── LAZY IMPORTS ─────────────────────────────────────────────────────────────
const DashboardPage       = lazy(() => import('@/features/dashboard/DashboardPage'))
const ClientesPage        = lazy(() => import('@/features/clientes/ClientesPage'))
const ClienteDetallePage  = lazy(() => import('@/features/clientes/ClienteDetallePage'))
const VehiculosPage       = lazy(() => import('@/features/vehiculos/VehiculosPage'))
const VehiculoDetallePage = lazy(() => import('@/features/vehiculos/VehiculoDetallePage'))
const TramitesPage        = lazy(() => import('@/features/tramites/TramitesPage'))
const TramiteDetallePage  = lazy(() => import('@/features/tramites/TramiteDetallePage'))
const TurnosPage          = lazy(() => import('@/features/turnos/TurnosPage'))
const ImportarPage        = lazy(() => import('@/features/importar/ImportarPage'))
const PipelinePage        = lazy(() => import('@/features/pipeline/PipelinePage'))
const CobranzasPage       = lazy(() => import('@/features/cobranzas/CobranzasPage'))
const ReportesPage        = lazy(() => import('@/features/reportes/ReportesPage'))
const ConfiguracionPage   = lazy(() => import('@/features/configuracion/ConfiguracionPage'))
const AlertasPage         = lazy(() => import('@/features/alertas/AlertasPage'))
const EquipoPage          = lazy(() => import('@/features/equipo/EquipoPage'))
const ActividadPage       = lazy(() => import('@/features/actividad/ActividadPage'))
const AnalyticsPage       = lazy(() => import('@/features/analytics/AnalyticsPage'))
const TareasPage          = lazy(() => import('@/features/tareas/TareasPage'))
const VencimientosPage    = lazy(() => import('@/features/vehiculos/VencimientosPage'))
const BackupPage          = lazy(() => import('@/features/backup/BackupPage'))
const CalculadoraPage     = lazy(() => import('@/features/calculadora/CalculadoraPage'))
const SuperAdminPage      = lazy(() => import('@/features/superadmin/SuperAdminPage'))
const PortalHomePage      = lazy(() => import('@/features/auth/PortalHomePage'))
const PortalTramitesPage  = lazy(() => import('@/features/tramites/MisTramitesPage'))
const PortalTurnosPage    = lazy(() => import('@/features/turnos/ReservarTurnoPage'))
const LoginPage               = lazy(() => import('@/features/auth/LoginPage'))
const SeguimientoPublicoPage  = lazy(() => import('@/features/tramites/SeguimientoPublicoPage'))

// ─── LOADING SCREENS ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--gp-black)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <div style={{
        width: 56, height: 56, background: 'var(--gp-orange)', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--shadow-gp)',
      }}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"
                stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <rect x="9" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
          <circle cx="12" cy="20" r="1" fill="white"/>
          <circle cx="20" cy="20" r="1" fill="white"/>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--gp-orange)',
            animation: 'bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.18}s`, opacity: 0.8,
          }} />
        ))}
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-label="Cargando página">
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid var(--gp-orange-pale)',
        borderTopColor: 'var(--gp-orange)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span className="sr-only">Cargando...</span>
    </div>
  )
}

// ─── HELPER F — feature route ─────────────────────────────────────────────────
// FeatureBoundary + Suspense en una sola línea por ruta.
// Si falla Dashboard, Clientes sigue funcionando, y vice versa.

function F({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <FeatureBoundary nombre={name}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </FeatureBoundary>
  )
}

// ─── GUARDS ───────────────────────────────────────────────────────────────────

function RequireAuth({ roles }: { roles: Rol[] }) {
  const { user, loading } = useAuthStore()
  const location          = useLocation()

  // Registrar intentos de acceso no autorizado
  useEffect(() => {
    if (!loading && user && roles.length > 0 && !roles.includes(user.rol as Rol)) {
      registrarActividad({
        accion:        'acceso_denegado',
        entidad:       'sistema',
        entidadId:     user.uid,
        entidadLabel:  `Intento de acceso a ${location.pathname}`,
        usuarioId:     user.uid,
        usuarioNombre: `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email,
        usuarioRol:    user.rol as Rol,
        gestoriaId:    (user as any).gestoriaId,
        nota: `Rol '${user.rol}' intentó acceder a ruta restringida para: [${roles.join(', ')}]`,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  if (loading) return <LoadingScreen />
  if (!user)   return <Navigate to="/login" state={{ from: location }} replace />

  if (roles.length > 0 && !roles.includes(user.rol as Rol)) {
    if (user.rol === 'superadmin') return <Navigate to="/superadmin" replace />
    if (user.rol === 'cliente')    return <Navigate to="/portal"     replace />
    return                                <Navigate to="/admin"       replace />
  }

  return <Outlet />
}

function RedirectIfAuth() {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingScreen />
  if (!user)   return <Outlet />
  if (user.rol === 'superadmin') return <Navigate to="/superadmin" replace />
  if (user.rol === 'cliente')    return <Navigate to="/portal"     replace />
  return                                <Navigate to="/admin"       replace />
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

const ROLES_ADMIN: Rol[] = ['admin', 'propietario', 'vendedor', 'operador']

export const router = createBrowserRouter([

  { path: '/', element: <Navigate to="/login" replace /> },

  // ── Login
  {
    element: <RedirectIfAuth />,
    children: [{
      path: '/login',
      element: <Suspense fallback={<LoadingScreen />}><LoginPage /></Suspense>,
    }],
  },

  // ── Panel Admin — cada ruta con FeatureBoundary propio
  {
    element: <RequireAuth roles={ROLES_ADMIN} />,
    children: [{
      path: '/admin',
      element: <AdminLayout />,
      children: [
        { index: true,            element: <Navigate to="dashboard" replace /> },
        { path: 'dashboard',      element: <F name="Dashboard">    <DashboardPage /></F>       },
        { path: 'clientes',       element: <F name="Clientes">     <ClientesPage /></F>        },
        { path: 'clientes/:id',   element: <F name="Cliente">      <ClienteDetallePage /></F>  },
        { path: 'vehiculos',      element: <F name="Vehículos">    <VehiculosPage /></F>       },
        { path: 'vehiculos/:id',  element: <F name="Vehículo">     <VehiculoDetallePage /></F> },
        { path: 'tramites',       element: <F name="Trámites">     <TramitesPage /></F>        },
        { path: 'tramites/:id',   element: <F name="Trámite">      <TramiteDetallePage /></F>  },
        { path: 'turnos',         element: <F name="Turnos">       <TurnosPage /></F>          },
        { path: 'pipeline',       element: <F name="Pipeline">     <PipelinePage /></F>        },
        { path: 'cobranzas',      element: <F name="Cobranzas">    <CobranzasPage /></F>       },
        { path: 'reportes',       element: <F name="Reportes">     <ReportesPage /></F>        },
        { path: 'configuracion',  element: <F name="Configuración"><ConfiguracionPage /></F>   },
        { path: 'alertas',        element: <F name="Alertas">      <AlertasPage /></F>         },
        { path: 'equipo',         element: <F name="Equipo">       <EquipoPage /></F>          },
        { path: 'actividad',      element: <F name="Actividad">    <ActividadPage /></F>       },
        { path: 'analytics',      element: <F name="Analytics">    <AnalyticsPage /></F>       },
        { path: 'tareas',         element: <F name="Tareas">       <TareasPage /></F>          },
        { path: 'vencimientos',   element: <F name="Vencimientos"> <VencimientosPage /></F>    },
        { path: 'backup',         element: <F name="Backup">       <BackupPage /></F>          },
        { path: 'calculadora',    element: <F name="Calculadora">  <CalculadoraPage /></F>     },
        { path: 'importar',       element: <F name="Importar">     <ImportarPage /></F>        },
      ],
    }],
  },

  // ── Portal cliente
  {
    element: <RequireAuth roles={['cliente']} />,
    children: [{
      path: '/portal',
      element: <ClienteLayout />,
      children: [
        { index: true,     element: <Navigate to="inicio" replace /> },
        { path: 'inicio',  element: <F name="Portal inicio"><PortalHomePage /></F>      },
        { path: 'tramites',element: <F name="Mis trámites"><PortalTramitesPage /></F>  },
        { path: 'turnos',  element: <F name="Mis turnos">  <PortalTurnosPage /></F>    },
      ],
    }],
  },

  // ── Super-admin JAH-NISSI (protegido — solo rol 'superadmin')
  {
    element: <RequireAuth roles={['superadmin']} />,
    children: [{
      path: '/superadmin',
      element: <Suspense fallback={<LoadingScreen />}><SuperAdminPage /></Suspense>,
    }],
  },

  // ── Seguimiento público (sin login — acceso por QR)
  {
    path: '/seguimiento/:token',
    element: (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#1A1A1A' }} />}>
        <SeguimientoPublicoPage />
      </Suspense>
    ),
  },

  { path: '*', element: <Navigate to="/login" replace /> },
])