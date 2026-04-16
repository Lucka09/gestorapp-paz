import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from 'firebase/auth'
import {
  getDocs, setDoc, updateDoc, query,
  where, orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth }          from '../firebase'
import { userDoc, usersCol } from './collections'
import { verificarLimiteUsuarios, LimitePlanError } from './planLimits'
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
    where('rol', 'in', ['propietario', 'admin', 'vendedor', 'operador']),
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
    // ^^ lanza LimitePlanError si el límite fue alcanzado
  }

  // 2. Verificar email disponible
  const methods = await fetchSignInMethodsForEmail(auth, data.email)
  if (methods.length > 0) throw new Error('EMAIL_EN_USO')

  // 3. Crear en Firebase Auth
  const cred = await createUserWithEmailAndPassword(auth, data.email, data.password)
  const uid  = cred.user.uid

  // 4. Crear perfil en Firestore
  //    gestoriaId se almacena aquí para que el usuario quede asociado al tenant
  await setDoc(userDoc(uid), {
    uid,
    email:        data.email,
    nombre:       data.nombre,
    apellido:     data.apellido,
    telefono:     data.telefono,
    rol:          data.rol,
    gestoriaId:   data.gestoriaId,   // ← asignación de tenant
    clienteId:    null,
    activo:       true,
    creadoEn:     serverTimestamp(),
    ultimoAcceso: serverTimestamp(),
  })

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
  admin: [
    'Acceso total a todos los módulos',
    'Ver y editar honorarios y pagos',
    'Exportar datos y reportes',
    'Gestionar equipo y roles',
    'Configuración de la gestoría',
    'Eliminar clientes y trámites',
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
}