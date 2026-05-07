import {
  collection, addDoc, query, where,
  orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db }   from '../firebase'
import type {
  EntradaAudit, AccionAudit, EntidadAudit, Rol,
} from '@/types'

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

export const auditCol = collection(db, 'audit_log')

// ─── REGISTRAR EVENTO ─────────────────────────────────────────────────────────

export async function registrarActividad(
  entrada: Omit<EntradaAudit, 'id' | 'timestamp'>
): Promise<void> {
  try {
    await addDoc(auditCol, {
      ...entrada,
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    // El audit nunca debe romper el flujo principal
    console.warn('[Audit] Error al registrar actividad:', err)
  }
}

// ─── LEER — FEED GENERAL ──────────────────────────────────────────────────────

export function subscribeActividad(
  callback: (entradas: EntradaAudit[]) => void,
  opts: {
    limite?:    number
    entidad?:   EntidadAudit
    entidadId?: string
    usuarioId?: string
  } = {}
): Unsubscribe {
  const { limite = 50, entidad, entidadId, usuarioId } = opts

  let q = query(auditCol, orderBy('timestamp', 'desc'), limit(limite))

  if (entidadId) {
    q = query(auditCol,
      where('entidadId', '==', entidadId),
      orderBy('timestamp', 'desc'),
      limit(limite))
  } else if (entidad) {
    q = query(auditCol,
      where('entidad', '==', entidad),
      orderBy('timestamp', 'desc'),
      limit(limite))
  } else if (usuarioId) {
    q = query(auditCol,
      where('usuarioId', '==', usuarioId),
      orderBy('timestamp', 'desc'),
      limit(limite))
  }

  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as EntradaAudit))
  )
}

// ─── METADATOS DE DISPLAY ─────────────────────────────────────────────────────

export const ACCION_CONFIG: Record<AccionAudit, {
  label:  string
  emoji:  string
  color:  string
  bg:     string
}> = {
  crear:          { label: 'Creó',             emoji: '✨', color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  editar:         { label: 'Editó',            emoji: '✏️', color: 'text-blue-700',    bg: 'bg-blue-50'     },
  eliminar:       { label: 'Eliminó',          emoji: '🗑️', color: 'text-red-700',     bg: 'bg-red-50'      },
  cambiar_estado: { label: 'Cambió estado',    emoji: '🔄', color: 'text-orange-700',  bg: 'bg-orange-50'   },
  registrar_pago: { label: 'Registró cobro',   emoji: '💰', color: 'text-green-700',   bg: 'bg-green-50'    },
  desmarcar_pago: { label: 'Desmarcó cobro',   emoji: '↩️', color: 'text-yellow-700',  bg: 'bg-yellow-50'   },
  crear_acceso:   { label: 'Creó acceso',      emoji: '🔑', color: 'text-purple-700',  bg: 'bg-purple-50'   },
  acceso_denegado: { label: 'Acceso denegado', emoji: '⛔', color: 'text-gray-700',    bg: 'bg-gray-50'     },
  confirmar_turno:{ label: 'Confirmó turno',   emoji: '✅', color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  cancelar_turno: { label: 'Canceló turno',    emoji: '❌', color: 'text-red-700',     bg: 'bg-red-50'      },
  importar:       { label: 'Importó datos',    emoji: '📥', color: 'text-indigo-700',  bg: 'bg-indigo-50'   },
  login:          { label: 'Inició sesión',    emoji: '👤', color: 'text-gray-700',    bg: 'bg-gray-50'     },
}

export const ENTIDAD_CONFIG: Record<EntidadAudit, {
  label: string
  emoji: string
}> = {
  cliente:       { label: 'Cliente',       emoji: '👤' },
  vehiculo:      { label: 'Vehículo',      emoji: '🚗' },
  tramite:       { label: 'Trámite',       emoji: '📋' },
  turno:         { label: 'Turno',         emoji: '📅' },
  usuario:       { label: 'Usuario',       emoji: '👥' },
  sistema:       { label: 'Sistema',       emoji: '🖥️' },
  configuracion: { label: 'Configuración', emoji: '⚙️' },
  presupuesto:   { label: 'Presupuesto',   emoji: '📄' },
}

// ─── HELPERS PARA CONSTRUIR ENTRADAS ─────────────────────────────────────────

interface ContextoUsuario {
  uid:    string
  nombre: string
  rol:    Rol
}

export function buildAudit(
  ctx:    ContextoUsuario,
  accion: AccionAudit,
  entidad: EntidadAudit,
  entidadId:    string,
  entidadLabel: string,
  extra: {
    antes?:   Record<string, any>
    despues?: Record<string, any>
    nota?:    string
  } = {}
): Omit<EntradaAudit, 'id' | 'timestamp'> {
  return {
    accion,
    entidad,
    entidadId,
    entidadLabel,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    ...extra,
  }
}
