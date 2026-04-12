// Sistema centralizado de mensajes de error con contexto y contacto

const CONTACTO = 'Llamá al 11 3614-1431 o escribinos por WhatsApp.'

export type ErrorContext =
  | 'login'
  | 'turno'
  | 'tramite'
  | 'cliente'
  | 'vehiculo'
  | 'general'

interface MensajeError {
  titulo:     string
  detalle:    string
  accion?:    string
  mostrarContacto?: boolean
}

// ─── FIRESTORE ERROR CODES ────────────────────────────────────────────────────

const FIRESTORE_MENSAJES: Record<string, MensajeError> = {
  'permission-denied': {
    titulo:  'Sin permisos',
    detalle: 'No tenés acceso a esta acción. Si creés que es un error, contactá al administrador.',
    mostrarContacto: true,
  },
  'not-found': {
    titulo:  'No encontrado',
    detalle: 'El registro que buscás no existe o fue eliminado.',
  },
  'already-exists': {
    titulo:  'Ya existe',
    detalle: 'Este registro ya fue creado anteriormente.',
  },
  'resource-exhausted': {
    titulo:  'Servicio temporalmente no disponible',
    detalle: 'El sistema está recibiendo muchas solicitudes. Esperá unos minutos e intentá de nuevo.',
    accion:  'Intentar de nuevo',
  },
  'unavailable': {
    titulo:  'Sin conexión al servidor',
    detalle: 'No podemos conectar con el servidor. Verificá tu internet e intentá de nuevo.',
    accion:  'Reintentar',
  },
  'deadline-exceeded': {
    titulo:  'La operación tardó demasiado',
    detalle: 'La conexión es lenta. Intentá de nuevo en un momento.',
    accion:  'Reintentar',
  },
  'unauthenticated': {
    titulo:  'Sesión expirada',
    detalle: 'Tu sesión venció. Volvé a ingresar.',
    accion:  'Volver al inicio',
  },
}

// ─── MENSAJES POR CONTEXTO ────────────────────────────────────────────────────

const CONTEXTO_MENSAJES: Record<ErrorContext, Record<string, MensajeError>> = {
  login: {
    'auth/invalid-credential': {
      titulo:  'Credenciales incorrectas',
      detalle: 'El correo o la contraseña no coinciden. Verificá los datos e intentá de nuevo.',
    },
    'auth/user-disabled': {
      titulo:  'Cuenta deshabilitada',
      detalle: 'Esta cuenta fue suspendida. Contactá al administrador.',
      mostrarContacto: true,
    },
    'auth/too-many-requests': {
      titulo:  'Demasiados intentos',
      detalle: 'Por seguridad, tu cuenta fue bloqueada temporalmente. Intentá en 15 minutos o restablecé tu contraseña.',
    },
    'auth/network-request-failed': {
      titulo:  'Sin conexión a internet',
      detalle: 'Verificá tu WiFi o datos móviles e intentá de nuevo.',
    },
  },
  turno: {
    'slot-occupied': {
      titulo:  'Horario no disponible',
      detalle: 'Este horario ya fue reservado. Elegí otro horario para continuar.',
    },
    'past-date': {
      titulo:  'Fecha pasada',
      detalle: 'No podés reservar turnos en fechas anteriores. Seleccioná una fecha futura.',
    },
    'default': {
      titulo:  'No se pudo reservar el turno',
      detalle: `Ocurrió un error al guardar el turno. ${CONTACTO}`,
      mostrarContacto: true,
    },
  },
  tramite: {
    'default': {
      titulo:  'Error al actualizar el trámite',
      detalle: `No pudimos guardar los cambios. ${CONTACTO}`,
      mostrarContacto: true,
    },
  },
  cliente: {
    'duplicate-dni': {
      titulo:  'DNI ya registrado',
      detalle: 'Ya existe un cliente con ese DNI en el sistema.',
    },
    'default': {
      titulo:  'Error al guardar el cliente',
      detalle: 'Verificá los datos e intentá de nuevo.',
    },
  },
  vehiculo: {
    'YA_EXISTE': {
      titulo:  'Patente ya registrada',
      detalle: 'Ya existe un vehículo con esa patente en el sistema.',
    },
    'default': {
      titulo:  'Error al registrar el vehículo',
      detalle: 'Verificá los datos e intentá de nuevo.',
    },
  },
  general: {
    'default': {
      titulo:  'Algo salió mal',
      detalle: 'Ocurrió un error inesperado. Recargá la página o contactanos.',
      mostrarContacto: true,
    },
  },
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function getMensajeError(
  error: any,
  contexto: ErrorContext = 'general'
): MensajeError {
  const code = error?.code ?? error?.message ?? 'default'

  // 1. Buscar en mensajes de contexto específico
  const contextoMsgs = CONTEXTO_MENSAJES[contexto]
  if (contextoMsgs?.[code]) return contextoMsgs[code]

  // 2. Buscar en mensajes de Firestore genéricos
  const firestoreCode = code.replace('firestore/', '')
  if (FIRESTORE_MENSAJES[firestoreCode]) return FIRESTORE_MENSAJES[firestoreCode]

  // 3. Buscar en mensajes de auth
  if (code.startsWith('auth/') && CONTEXTO_MENSAJES.login[code]) {
    return CONTEXTO_MENSAJES.login[code]
  }

  // 4. Default del contexto
  return contextoMsgs?.default ?? CONTEXTO_MENSAJES.general.default
}

// ─── COMPONENTE DE ERROR ──────────────────────────────────────────────────────

interface ErrorBoxProps {
  error:    any
  contexto?: ErrorContext
  onRetry?: () => void
}

export function ErrorBox({ error, contexto = 'general', onRetry }: ErrorBoxProps) {
  if (!error) return null
  const msg = getMensajeError(error, contexto)

  return (
    <div
      className="rounded-xl p-4 animate-fadein"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', margin: '0 0 3px' }}>
        {msg.titulo}
      </p>
      <p style={{ fontSize: 12, color: '#991B1B', margin: 0, lineHeight: 1.6 }}>
        {msg.detalle}
      </p>
      {msg.mostrarContacto && (
        <a
          href="https://wa.me/5491136141431"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 8, fontSize: 12, color: '#059669', fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Contactar por WhatsApp →
        </a>
      )}
      {onRetry && msg.accion && (
        <button
          onClick={onRetry}
          style={{
            display: 'block', marginTop: 8,
            fontSize: 12, color: '#B91C1C', fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', padding: 0,
          }}
        >
          {msg.accion} →
        </button>
      )}
    </div>
  )
}

// ─── TOAST HELPER ─────────────────────────────────────────────────────────────

import toast from 'react-hot-toast'

export function toastError(error: any, contexto: ErrorContext = 'general') {
  const msg = getMensajeError(error, contexto)
  toast.error(`${msg.titulo}: ${msg.detalle}`, { duration: 5000 })
}
