// src/features/admin/AdminIndex.tsx
// ─── AdminIndex — REDIRECCIÓN POR ROL ────────────────────────────────────────
// Es el `index` de /admin: a dónde cae alguien que entra a /admin sin ruta.
// Cada rol aterriza en su home natural (usa solo rutas que existen en el router).
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function AdminIndex() {
  const user = useAuthStore(s => s.user)

  // Sin sesión → login
  if (!user) return <Navigate to="/login" replace />

  switch (user.rol) {
    // Multi-tenant (JAH-NISSI)
    case 'superadmin':
      return <Navigate to="/admin/superadmin" replace />

    // Asistente de multas: acceso acotado a multas
    case 'asistente_multas':
      return <Navigate to="/admin/revision-multas" replace />

    // Secretario/a comercial: home del funnel comercial
    // (cambiá a '/admin/tramites' si preferís que aterrice ahí)
    case 'asesor_comercial':
      return <Navigate to="/admin/leads" replace />

    // Gestor / mandatario: su bandeja de trámites a ejecutar
    case 'gestor':
      return <Navigate to="/admin/gestor" replace />

    // CEO (propietario), admin_gral y admin
    default:
      return <Navigate to="/admin/dashboard" replace />
  }
}