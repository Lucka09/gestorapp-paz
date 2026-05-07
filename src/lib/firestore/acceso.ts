import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  fetchSignInMethodsForEmail,
  signOut,
} from 'firebase/auth'
import { updateDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, secondaryAuth } from '@/lib/firebase'
import { clienteDoc, userDoc } from './collections'
import type { Rol } from '@/types'

// ─── CREAR ACCESO AL PORTAL PARA UN CLIENTE EXISTENTE ────────────────────────

export type AccesoPortalInput = {
  email:     string
  password:  string
  clienteId: string
  nombre:    string
  apellido:  string
  telefono:  string
}

export async function crearAccesoPortal(data: AccesoPortalInput): Promise<string> {
  // 1. Verificar que el email no esté en uso
  const methods = await fetchSignInMethodsForEmail(auth, data.email)
  if (methods.length > 0) throw new Error('EMAIL_EN_USO')

  // 2. Crear usuario en Firebase Auth
  const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password)
  const uid = cred.user.uid

  // Enviar email de verificación — mejora la seguridad y confirma que el
  // cliente es dueño del correo. El cliente puede ingresar al portal antes
  // de verificar, pero se lo incentiva a hacerlo.
  try {
    await sendEmailVerification(cred.user, {
      url: `${window.location.origin}/portal`,   // link de redirección post-verificación
      handleCodeInApp: false,
    })
  } catch {
    // No bloquear el flujo si el email de verificación falla
    // (puede ser error temporal de Firebase)
    console.warn('[acceso] No se pudo enviar email de verificación')
  }

  // 3. Crear perfil en Firestore /users
  await setDoc(userDoc(uid), {
    uid,
    email:      data.email,
    gestoriaId: '',  // se asigna luego desde SuperAdminPage
    nombre:     data.nombre,
    apellido:   data.apellido,
    telefono:   data.telefono,
    rol:        'cliente' as Rol,
    clienteId:  data.clienteId,
    activo:     true,
    creadoEn:   serverTimestamp(),
    ultimoAcceso: serverTimestamp(),
  })

  // 4. Vincular userId al cliente en Firestore /clientes
  await updateDoc(clienteDoc(data.clienteId), {
    userId: uid,
  })

  // Cierra la sesión secundaria para evitar estado residual.
  await signOut(secondaryAuth)

  return uid
}

// ─── ENVIAR EMAIL DE RESET (si el cliente olvida la contraseña) ───────────────

export async function enviarResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

// ─── VERIFICAR SI UN CLIENTE YA TIENE ACCESO ─────────────────────────────────

export async function clienteTieneAcceso(clienteId: string): Promise<boolean> {
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(clienteDoc(clienteId))
  if (!snap.exists()) return false
  return !!snap.data()?.userId
}