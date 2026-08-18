// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'

// ─── LAYOUTS ──────────────────────────────────────────────────────────────────
import AdminLayout   from '@/components/layout/AdminLayout'
import ClienteLayout from '@/components/layout/ClienteLayout'

// ─── AUTH ─────────────────────────────────────────────────────────────────────
import LoginPage from '@/features/auth/LoginPage'

import ConsultasMultasPage from '@/features/multas/ConsultasMultasPage'
import { usePermisos } from '@/hooks/usePermisos'
import AdminIndex from '@/features/admin/AdminIndex'



// ─── LAZY PAGES — Admin ───────────────────────────────────────────────────────
const DashboardPage            = lazy(() => import('@/features/dashboard/DashboardPage'))
const ClientesPage             = lazy(() => import('@/features/clientes/ClientesPage'))
const ClienteDetallePage       = lazy(() => import('@/features/clientes/ClienteDetallePage'))
const VehiculosPage            = lazy(() => import('@/features/vehiculos/VehiculosPage'))
const VehiculoDetallePage      = lazy(() => import('@/features/vehiculos/VehiculoDetallePage'))
const TramitesPage             = lazy(() => import('@/features/tramites/TramitesPage'))
const TramiteDetallePage       = lazy(() => import('@/features/tramites/TramiteDetallePage'))
const TorreDeControlPage       = lazy(() => import('@/features/torre/TorreDeControlPage'))
const TurnosPage               = lazy(() => import('@/features/turnos/TurnosPage'))
const PipelinePage             = lazy(() => import('@/features/pipeline/PipelinePage'))
const LeadsPage                = lazy(() => import('@/features/leads/LeadsPage').then(m => ({ default: m.default })))
const BandejaWAPage            = lazy(() => import('@/features/bandeja/BandejaWAPage'))
const CobranzasPage            = lazy(() => import('@/features/cobranzas/CobranzasPage'))
const RecibosPage               = lazy(() => import('@/features/cobranzas/RecibosPage'))
const ReportesPage             = lazy(() => import('@/features/reportes/ReportesPage'))
const TareasPage               = lazy(() => import('@/features/tareas/TareasPage'))
const EquipoPage               = lazy(() => import('@/features/equipo/EquipoPage'))
const CalculadoraPage          = lazy(() => import('@/features/calculadora/CalculadoraPage'))
const ImportarPage             = lazy(() => import('@/features/importar/ImportarPage'))
const ImportadorWA             = lazy(() => import('@/features/importar/ImportadorWA'))
const ConfiguracionPage        = lazy(() => import('@/features/configuracion/ConfiguracionPage'))
const AlertasPage              = lazy(() => import('@/features/alertas/AlertasPage'))
const AnalyticsPage            = lazy(() => import('@/features/analytics/AnalyticsPage'))
const ActividadPage            = lazy(() => import('@/features/actividad/ActividadPage'))
const BackupPage               = lazy(() => import('@/features/backup/BackupPage'))
const VencimientosPage         = lazy(() => import('@/features/vehiculos/VencimientosPage'))
const SuperAdminPage           = lazy(() => import('@/features/superadmin/SuperAdminPage'))
const PremiosPage              = lazy(() => import('@/features/premios/PremiosPage'))
const RevisionMultasPage       = lazy(() => import('@/features/revision-multas/RevisionMultasPage'))


// ─── GESTOR (mandatario) ──────────────────────────────────────────────────────
const GestorHomePage           = lazy(() => import('@/features/gestor/GestorHomePage'))
const GestorTramitePage        = lazy(() => import('@/features/gestor/GestorTramitePage'))

// ─── CAMPAÑAS ─────────────────────────────────────────────────────────────────
const CampanasPage             = lazy(() => import('@/features/campanas/CampanasPage'))
const CampanaDetallePage       = lazy(() => import('@/features/campanas/CampanaDetallePage'))

// ─── PORTAL CLIENTE ───────────────────────────────────────────────────────────
const PortalHomePage           = lazy(() => import('@/features/auth/PortalHomePage'))
const MisTramitesPage          = lazy(() => import('@/features/tramites/MisTramitesPage'))
const ReservarTurnoPage        = lazy(() => import('@/features/turnos/ReservarTurnoPage'))
const PortalNotificacionesPage = lazy(() => import('@/features/notificaciones/PortalNotificacionesPage'))
// OnboardingPortal is rendered via PortalHomePage which handles the props
// const OnboardingPortal = lazy(() => import('@/features/auth/OnboardingPortal'))

// ─── PÚBLICAS ─────────────────────────────────────────────────────────────────
const SeguimientoPublicoPage   = lazy(() => import('@/features/tramites/SeguimientoPublicoPage'))



// ─── SPINNER FALLBACK ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-7 h-7 border-2 border-[#D4621A] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // ── Auth ──────────────────────────────────────────────────────────────────
  { path: '/login', element: <LoginPage /> },

  // ── Seguimiento público (sin auth) ────────────────────────────────────────
  { path: '/seguimiento/:token', element: <L><SeguimientoPublicoPage /></L> },

  // ── Panel Admin ───────────────────────────────────────────────────────────
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminIndex /> },
      { path: 'dashboard',         element: <L><DashboardPage /></L> },

      // Clientes
      { path: 'clientes',          element: <L><ClientesPage /></L> },
      { path: 'clientes/:id',      element: <L><ClienteDetallePage /></L> },

      // Vehículos
      { path: 'vehiculos',         element: <L><VehiculosPage /></L> },
      { path: 'vehiculos/:id',     element: <L><VehiculoDetallePage /></L> },

      // Trámites
      { path: 'tramites',          element: <L><TramitesPage /></L> },
      { path: 'tramites/:id',      element: <L><TramiteDetallePage /></L> },

      // Torre de Control
      { path: 'torre-de-control',  element: <L><TorreDeControlPage /></L> },

      // Turnos
      { path: 'turnos',            element: <L><TurnosPage /></L> },

      // Pipeline / CRM
      { path: 'pipeline',          element: <L><PipelinePage /></L> },
      { path: 'leads',             element: <L><LeadsPage /></L> },

      // WhatsApp
      { path: 'bandeja',           element: <L><BandejaWAPage /></L> },
      { path: 'campanas',          element: <L><CampanasPage /></L> },
      { path: 'campanas/:id',      element: <L><CampanaDetallePage /></L> },

      // Finanzas (solo propietario/superadmin)
      { path: 'cobranzas',         element: <L><CobranzasPage /></L> },
      { path: 'recibos/:id',       element: <L><RecibosPage /></L> },
      { path: 'reportes',          element: <L><ReportesPage /></L> },

      // Operaciones
      { path: 'tareas',            element: <L><TareasPage /></L> },
      { path: 'vencimientos',      element: <L><VencimientosPage /></L> },

      // Equipo
      { path: 'equipo',            element: <L><EquipoPage /></L> },

      // Premios & Objetivos (asesor_comercial + propietario)
      { path: 'premios',           element: <L><PremiosPage /></L> },

      // Herramientas
      { path: 'calculadora',       element: <L><CalculadoraPage /></L> },
      { path: 'importar',          element: <L><ImportarPage /></L> },
      { path: 'importar/whatsapp', element: <L><ImportadorWA /></L> },
      { path: 'referidos',         lazy: () => import('@/features/referidos/ReferidosPage').then(m => ({ Component: m.default })),},
      { path: 'actividad',         element: <L><ActividadPage /></L> },
      { path: 'analytics',         element: <L><AnalyticsPage /></L> },
      { path: 'alertas',           element: <L><AlertasPage /></L> },
      { path: 'backup',            element: <L><BackupPage /></L> },
      { path: 'consultas-multas', element: <L><ConsultasMultasPage /></L> },
      { path: 'revision-multas', element: <L><RevisionMultasPage /></L> },
      
      // Configuración
      { path: 'configuracion',     element: <L><ConfiguracionPage /></L> },

      // SuperAdmin (solo JAH-NISSI)
      { path: 'superadmin',        element: <L><SuperAdminPage /></L> },

      // Gestor / Mandatario
      { path: 'gestor',            element: <L><GestorHomePage /></L> },
      { path: 'gestor/:tramiteId', element: <L><GestorTramitePage /></L> },
    ],
  },

  // ── Portal Cliente ────────────────────────────────────────────────────────
  {
    path: '/portal',
    element: <ClienteLayout />,
    children: [
      { index: true,            element: <Navigate to="/portal/inicio" replace /> },
      { path: 'inicio',         element: <L><PortalHomePage /></L> },
      { path: 'tramites',       element: <L><MisTramitesPage /></L> },
      { path: 'turnos',         element: <L><ReservarTurnoPage /></L> },
      { path: 'notificaciones', element: <L><PortalNotificacionesPage /></L> },
      // onboarding route handled from PortalHomePage
    ],
  },

  // ── Raíz → login ──────────────────────────────────────────────────────────
  { path: '/',  element: <Navigate to="/login" replace /> },
  { path: '*',  element: <Navigate to="/login" replace /> },
])