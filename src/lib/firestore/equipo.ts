// src/lib/firestore/equipo.ts
// ─── GESTIÓN DE EQUIPO (CLIENTE) ─────────────────────────────────────────────
// Las escrituras (crear / actualizar / cambiar rol / activar / desactivar) van
// ahora por la Cloud Function `gestionarEquipo`, que valida server-side quién
// llama y toma el gestoriaId del perfil del que llama (nunca del cliente).
//
// Antes esto usaba secondaryAuth + setDoc, que quedaba bloqueado por la regla
// `allow create, update: if esSuperAdmin()` de users/{uid}. Con la función +
// Admin SDK NO hace falta tocar firestore.rules.
//
// Las lecturas (subscribe*) siguen siendo Firestore directo — el read de staff
// dentro de la misma gestoría sí está permitido por las reglas.

import { sendPasswordResetEmail } from 'firebase/auth'
import {
  query, where, orderBy, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth, app } from '../firebase'
import { usersCol } from './collections'
import { LimitePlanError } from './planlimits'
import type { Usuario, Rol, PlanGestoria } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface MiembroEquipo extends Usuario {
  iniciales?: string
}

export interface NuevoMiembroInput {
  gestoriaId: string      // se mantiene por compatibilidad de firma; el servidor
  nombre:     string      // usa el gestoriaId del perfil de quien llama, no este.
  apellido:   string
  email:      string
  password:   string
  telefono:   string
  rol:        Rol
}

// ─── CALLABLE ──────────────────────────────────────────────────────────────────

type AccionEquipo =
  | {
      accion:   'crear'
      nombre:   string
      apellido: string
      email:    string
      password: string
      telefono: string
      rol:      Rol
    }
  | {
      accion:    'actualizar'
      targetUid: string
      nombre?:   string
      apellido?: string
      telefono?: string
      rol?:      Rol
      activo?:   boolean
    }

function callGestionarEquipo(payload: AccionEquipo) {
  const fns = getFunctions(app, 'us-central1')
  const fn  = httpsCallable<AccionEquipo, { ok: boolean; uid?: string }>(fns, 'gestionarEquipo')
  return fn(payload)
}

// Traduce el error de la callable a los tipos que EquipoPage ya espera
// (LimitePlanError → mensajeUpgrade, y Error('EMAIL_EN_USO')).
function traducirError(err: any): Error {
  const msg     = String(err?.message ?? '')
  const code    = String(err?.code ?? '')
  const details = err?.details

  if (msg.includes('EMAIL_EN_USO') || code === 'functions/already-exists') {
    return new Error('EMAIL_EN_USO')
  }
  if (
    (code === 'functions/resource-exhausted' || msg.includes('LIMITE_USUARIOS')) &&
    details?.tipo === 'usuarios'
  ) {
    return new LimitePlanError(
      'usuarios',
      Number(details.actual ?? 0),
      Number(details.maximo ?? 0),
      (details.plan as PlanGestoria) ?? 'starter',
    )
  }
  return err instanceof Error ? err : new Error(msg || 'ERROR_EQUIPO')
}

// ─── READ ─────────────────────────────────────────────────────────────────────
//
// Filtra por gestoriaId para evitar que una gestoría vea usuarios de otra.

export function subscribeEquipo(
  gestoriaId: string,
  callback:   (miembros: MiembroEquipo[]) => void
): Unsubscribe {
  const q = query(
    usersCol,
    where('gestoriaId', '==', gestoriaId),
    where('rol', 'in', ['propietario', 'admin_gral', 'admin', 'vendedor', 'operador', 'gestor', 'asesor_comercial']),
    orderBy('creadoEn', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(
      snap.docs.map(d => {
        const data = d.data() as Usuario
        return {
          ...data,
          iniciales: `${data.nombre?.[0] ?? ''}${data.apellido?.[0] ?? ''}`.toUpperCase(),
        }
      })
    )
  )
}

export function subscribeGestores(
  gestoriaId: string,
  callback:   (miembros: MiembroEquipo[]) => void
): Unsubscribe {
  const q = query(
    usersCol,
    where('gestoriaId', '==', gestoriaId),
    where('rol', '==', 'gestor'),
    orderBy('creadoEn', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(
      snap.docs.map(d => {
        const data = d.data() as Usuario
        return {
          ...data,
          iniciales: `${data.nombre?.[0] ?? ''}${data.apellido?.[0] ?? ''}`.toUpperCase(),
        }
      })
    )
  )
}

export function subscribeGestoresMulta(
  gestoriaId: string,
  callback:   (miembros: MiembroEquipo[]) => void
): Unsubscribe {
  // Trae roles que pueden verificar y gestionar multas: admin_gral, admin, propietario, gestor
  const q = query(
    usersCol,
    where('gestoriaId', '==', gestoriaId),
    where('rol', 'in', ['propietario', 'admin_gral', 'admin', 'gestor']),
    orderBy('creadoEn', 'asc')
  )
  return onSnapshot(q, snap =>
    callback(
      snap.docs.map(d => {
        const data = d.data() as Usuario
        return {
          ...data,
          iniciales: `${data.nombre?.[0] ?? ''}${data.apellido?.[0] ?? ''}`.toUpperCase(),
        }
      })
    )
  )
}

// ─── CREATE ───────────────────────────────────────────────────────────────────
// Firma preservada. `creadoPor` y `limites` ya no se usan: el servidor deriva
// todo del auth de quien llama y valida el límite server-side.

export async function crearMiembro(
  data:       NuevoMiembroInput,
  _creadoPor?: string,
  _limites?:   { maxUsuarios: number; plan: PlanGestoria }
): Promise<string> {
  try {
    const res = await callGestionarEquipo({
      accion:   'crear',
      nombre:   data.nombre,
      apellido: data.apellido,
      email:    data.email.trim(),
      password: data.password,
      telefono: data.telefono,
      rol:      data.rol,
    })
    return (res.data?.uid ?? '') as string
  } catch (err) {
    throw traducirError(err)
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function actualizarMiembro(
  uid:  string,
  data: Partial<Pick<Usuario, 'nombre' | 'apellido' | 'telefono' | 'rol' | 'activo'>>
): Promise<void> {
  try {
    await callGestionarEquipo({ accion: 'actualizar', targetUid: uid, ...data })
  } catch (err) {
    throw traducirError(err)
  }
}

export async function cambiarRol(uid: string, rol: Rol): Promise<void> {
  try {
    await callGestionarEquipo({ accion: 'actualizar', targetUid: uid, rol })
  } catch (err) {
    throw traducirError(err)
  }
}

export async function desactivarMiembro(uid: string): Promise<void> {
  try {
    await callGestionarEquipo({ accion: 'actualizar', targetUid: uid, activo: false })
  } catch (err) {
    throw traducirError(err)
  }
}

export async function activarMiembro(uid: string): Promise<void> {
  try {
    await callGestionarEquipo({ accion: 'actualizar', targetUid: uid, activo: true })
  } catch (err) {
    throw traducirError(err)
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

export async function enviarResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function generarPasswordTemporal(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '@#$'
  const all     = upper + lower + numbers
  const base = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)])
  ]
  return base.sort(() => Math.random() - 0.5).join('')
}

// ─── PERMISOS POR ROL — DESCRIPCIÓN LEGIBLE ──────────────────────────────────

export const PERMISOS_POR_ROL: Record<Exclude<Rol, 'cliente'>, string[]> = {
  superadmin: [
    'Acceso total a todas las gestorías',
    'Crear y gestionar clientes de la plataforma',
    'Panel de administración JAH-NISSI',
  ],
  propietario: [
    'Acceso total a todos los módulos',
    'Ver y editar honorarios y pagos',
    'Exportar datos y reportes',
    'Gestionar equipo y roles',
    'Configuración de la gestoría',
    'Eliminar clientes y trámites',
  ],
  admin_gral: [
    'Acceso operativo completo (clientes, vehículos, trámites, turnos)',
    'Ver y editar honorarios y pagos — acceso financiero elevado',
    'Ver cobranzas y reportes contables/financieros',
    'Exportar datos y reportes',
    'Ver equipo (sin crear ni eliminar miembros)',
    'Ver configuración (sin modificarla)',
    'Torre de Control completa + rendimiento de gestores',
    'No puede eliminar clientes ni cambiar configuración',
    'Solo puede existir un Admin General por gestoría',
  ],
  admin: [
    'Acceso operativo completo (clientes, vehículos, trámites, turnos)',
    'Gestionar equipo y roles',
    'Configuración de la gestoría',
    'Sin acceso a cobranzas ni reportes financieros',
    'Sin acceso a honorarios ni pagos',
    'No puede eliminar clientes (solo el propietario)',
  ],
  vendedor: [
    'Ver y crear clientes',
    'Gestionar pipeline CRM y seguimiento',
    'Ver trámites (solo lectura)',
    'Gestionar turnos',
    'Sin acceso a honorarios ni pagos',
    'Sin acceso a configuración ni exportar',
  ],
  operador: [
    'Ver y crear clientes y vehículos',
    'Crear y cambiar estado de trámites',
    'Gestionar turnos',
    'Sin acceso a CRM ni pipeline',
    'Sin acceso a honorarios ni pagos',
    'Sin acceso a configuración',
  ],
  gestor: [
    'Crear y gestionar sus propios clientes, vehículos y trámites',
    'Trabajar con trámites asignados por el propietario o admin',
    'Torre de Control con vista exclusiva de sus propias gestiones',
    'Gestionar turnos (crear y confirmar)',
    'Sin acceso a Dashboard general, WhatsApp ni bandeja',
    'Sin acceso a honorarios, pagos, cobranzas ni reportes',
  ],
  asesor_comercial: [
    'Crear y gestionar clientes, vehículos y trámites',
    'Cambiar estado de trámites (baja, transferencia, multas, etc.)',
    'Gestionar turnos, tareas y seguimientos',
    'Pipeline CRM y bandeja WhatsApp',
    'Torre de Control completa (todos los trámites)',
    'Panel de Premios & Objetivos personal',
    'Sin acceso a honorarios, cobranzas ni reportes financieros',
  ],
}