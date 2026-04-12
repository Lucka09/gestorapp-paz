import {
  createBrowserRouter, Navigate, Outlet,
  useNavigate, useLocation,
} from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import { signOut }   from 'firebase/auth'
import { auth }      from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import AdminLayout   from '@/components/layout/AdminLayout'
import ClienteLayout from '@/components/layout/ClienteLayout'
import type { Rol }  from '@/types'

// ─── LAZY IMPORTS — cada ruta es un chunk separado ────────────────────────────
// Admin
const DashboardPage   = lazy(() => import('@/features/dashboard/DashboardPage'))
const ClientesPage    = lazy(() => import('@/features/clientes/ClientesPage'))
const ClienteDetallePage = lazy(() => import('@/features/clientes/ClienteDetallePage'))
const VehiculosPage   = lazy(() => import('@/features/vehiculos/VehiculosPage'))
const TramitesPage    = lazy(() => import('@/features/tramites/TramitesPage'))
const TramiteDetallePage = lazy(() => import('@/features/tramites/TramiteDetallePage'))
const TurnosPage      = lazy(() => import('@/features/turnos/TurnosPage'))
const ImportarPage    = lazy(() => import('@/features/importar/ImportarPage'))
const PipelinePage    = lazy(() => import('@/features/pipeline/PipelinePage'))
// Portal
const PortalHomePage  = lazy(() => import('@/features/auth/PortalHomePage'))
const PortalTramitesPage = lazy(() => import('@/features/tramites/MisTramitesPage'))
const PortalTurnosPage   = lazy(() => import('@/features/turnos/ReservarTurnoPage'))
// Auth
const LoginPage       = lazy(() => import('@/features/auth/LoginPage'))

// ─── LOADING SCREEN ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gp-black)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <div style={{
        width: 56, height: 56,
        background: 'var(--gp-orange)',
        borderRadius: 16,
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
            animationDelay: `${i * 0.18}s`,
            opacity: 0.8,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}

// Suspense wrapper para lazy routes
function PageLoader() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-label="Cargando página">
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid var(--gp-orange-pale)',
        borderTopColor: 'var(--gp-orange)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
      <span className="sr-only">Cargando...</span>
    </div>
  )
}

// ─── GUARDS ───────────────────────────────────────────────────────────────────
function RequireAuth({ roles }: { roles: Rol[] }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles.length > 0 && !roles.includes(user.rol as Rol)) {
    return user.rol === 'cliente'
      ? <Navigate to="/portal"  replace />
      : <Navigate to="/admin"   replace />
  }

  return <Outlet />
}

function RedirectIfAuth() {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingScreen />
  if (!user)   return <Outlet />
  return user.rol === 'cliente'
    ? <Navigate to="/portal" replace />
    : <Navigate to="/admin"  replace />
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
const ROLES_ADMIN: Rol[] = ['admin', 'propietario', 'vendedor', 'operador']

export const router = createBrowserRouter([
  // ── Raíz
  { path: '/', element: <Navigate to="/login" replace /> },

  // ── Login
  {
    element: <RedirectIfAuth />,
    children: [
      {
        path: '/login',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <LoginPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Admin (lazy)
  {
    element: <RequireAuth roles={ROLES_ADMIN} />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true,                 element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',           element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense> },
          { path: 'clientes',            element: <Suspense fallback={<PageLoader />}><ClientesPage /></Suspense> },
          { path: 'clientes/:id',        element: <Suspense fallback={<PageLoader />}><ClienteDetallePage /></Suspense> },
          { path: 'vehiculos',           element: <Suspense fallback={<PageLoader />}><VehiculosPage /></Suspense> },
          { path: 'tramites',            element: <Suspense fallback={<PageLoader />}><TramitesPage /></Suspense> },
          { path: 'tramites/:id',        element: <Suspense fallback={<PageLoader />}><TramiteDetallePage /></Suspense> },
          { path: 'turnos',              element: <Suspense fallback={<PageLoader />}><TurnosPage /></Suspense> },
          { path: 'pipeline',            element: <Suspense fallback={<PageLoader />}><PipelinePage /></Suspense> },
          { path: 'importar',            element: <Suspense fallback={<PageLoader />}><ImportarPage /></Suspense> },
        ],
      },
    ],
  },

  // ── Portal cliente (lazy)
  {
    element: <RequireAuth roles={['cliente']} />,
    children: [
      {
        path: '/portal',
        element: <ClienteLayout />,
        children: [
          { index: true,          element: <Navigate to="inicio" replace /> },
          { path: 'inicio',       element: <Suspense fallback={<PageLoader />}><PortalHomePage /></Suspense> },
          { path: 'tramites',     element: <Suspense fallback={<PageLoader />}><PortalTramitesPage /></Suspense> },
          { path: 'turnos',       element: <Suspense fallback={<PageLoader />}><PortalTurnosPage /></Suspense> },
        ],
      },
    ],
  },

  // ── 404
  { path: '*', element: <Navigate to="/login" replace /> },
])
