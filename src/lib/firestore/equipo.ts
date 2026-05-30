import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  signOut,
  deleteUser,
} from 'firebase/auth'
import {
  setDoc, updateDoc, query,
  where, orderBy, onSnapshot, serverTimestamp,
  doc, collection,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, secondaryAuth, secondaryDb } from '../firebase'
import { userDoc, usersCol } from './collections'
import { verificarLimiteUsuarios } from './planlimits'
import type { Usuario, Rol, PlanGestoria } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface MiembroEquipo extends Usuario {
  iniciales?: string
}

export interface NuevoMiembroInput {
  gestoriaId: string      // requerido — tenant scope + para asignar al nuevo usuario
  nombre:     string
  apellido:   string
  email:      string
  password:   string
  telefono:   string
  rol:        Rol
}

// ─── READ ─────────────────────────────────────────────────────────────────────
//
// Filtra por gestoriaId para evitar que una gestoría vea usuarios de otra.
// Bug original: no filtraba por gestoriaId → cross-tenant data leak.

export function subscribeEquipo(
  gestoriaId: string,
  callback:   (miembros: MiembroEquipo[]) => void
): Unsubscribe {
  const q = query(
    usersCol,
    where('gestoriaId', '==', gestoriaId),
    where('rol', 'in', ['propietario', 'admin', 'vendedor', 'operador', 'gestor', 'asesor_comercial']),
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

// ─── CREATE ───────────────────────────────────────────────────────────────────

export function subscribeGestoresMulta(
  gestoriaId: string,
  callback:   (miembros: MiembroEquipo[]) => void
): Unsubscribe {
  // Trae roles que pueden verificar y gestionar multas: admin, propietario, gestor
  const q = query(
    usersCol,
    where('gestoriaId', '==', gestoriaId),
    where('rol', 'in', ['propietario', 'admin', 'gestor']),
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

export async function crearMiembro(
  data:        NuevoMiembroInput,
  creadoPor:   string,
  limites?:    { maxUsuarios: number; plan: PlanGestoria }
): Promise<string> {
  // 1. Verificar límite de plan (si se pasan los límites)
  if (limites) {
    await verificarLimiteUsuarios(
      data.gestoriaId,
      limites.maxUsuarios,
      limites.plan
    )
  }

  // 2. Verificar email disponible
  const methods = await fetchSignInMethodsForEmail(auth, data.email)
  if (methods.length > 0) throw new Error('EMAIL_EN_USO')

  // 3. Crear en Firebase Auth (usando instancia secundaria para no cerrar la sesión del propietario)
  const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password)
  const uid  = cred.user.uid

  // 4. Crear perfil en Firestore usando el secondaryDb
  //    → request.auth.uid == uid pasa directamente sin necesitar get() anidado en las reglas
  try {
    const docRef = doc(collection(secondaryDb, 'users'), uid)
    await setDoc(docRef, {
      uid,
      email:        data.email,
      nombre:       data.nombre,
      apellido:     data.apellido,
      telefono:     data.telefono,
      rol:          data.rol,
      gestoriaId:   data.gestoriaId,
      clienteId:    null,
      activo:       true,
      creadoEn:     serverTimestamp(),
      ultimoAcceso: serverTimestamp(),
    })
  } catch (firestoreError) {
    // Si falla el Firestore, eliminar el usuario de Auth para evitar cuentas huérfanas
    await deleteUser(cred.user).catch(() => {})
    throw firestoreError
  }

  // 5. Cerrar sesión secundaria
  await signOut(secondaryAuth)

  return uid
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function actualizarMiembro(
  uid:  string,
  data: Partial<Pick<Usuario, 'nombre' | 'apellido' | 'telefono' | 'rol' | 'activo'>>
): Promise<void> {
  await updateDoc(userDoc(uid), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

export async function cambiarRol(uid: string, rol: Rol): Promise<void> {
  await updateDoc(userDoc(uid), {
    rol,
    actualizadoEn: serverTimestamp(),
  })
}

export async function desactivarMiembro(uid: string): Promise<void> {
  await updateDoc(userDoc(uid), {
    activo:        false,
    actualizadoEn: serverTimestamp(),
  })
}

export async function activarMiembro(uid: string): Promise<void> {
  await updateDoc(userDoc(uid), {
    activo:        true,
    actualizadoEn: serverTimestamp(),
  })
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