// functions/src/equipo/gestionarEquipo.ts
// ─── GESTIÓN SEGURA DE EQUIPO ────────────────────────────────────────────────
// Reemplaza el patrón cliente (secondaryAuth + setDoc), que quedaba bloqueado por
// la regla `allow create, update: if esSuperAdmin()` de users/{uid}.
//
// Por qué en una Cloud Function y NO en reglas de Firestore:
//   En un create de users/{uid} el único contexto de auth disponible es el del
//   usuario NUEVO, no el del Propietario que lo autoriza. Las reglas no pueden
//   distinguir "Matías creó este admin" de "un atacante se auto-registró como
//   admin con el gestoriaId de otra gestoría". Solo el servidor, verificando el
//   perfil de QUIEN LLAMA, puede hacerlo. Por eso el gestoriaId se toma SIEMPRE
//   del perfil del que llama, nunca del cliente.
//
// El Admin SDK bypassea las reglas → NO hay que tocar ni publicar firestore.rules.
//
// Cubre: crear, actualizar (nombre/apellido/telefono), cambiar rol, activar y
// desactivar. Todas esas escrituras sobre el perfil de OTRO usuario estaban
// bloqueadas por las reglas, no solo el alta.
//
// Despliegue:  firebase deploy --only functions:gestionarEquipo

import * as admin from 'firebase-admin'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

// initializeApp ya corre en index.ts; este guard lo hace idempotente por si la
// función se aísla en cold start.
if (!admin.apps.length) admin.initializeApp()

// ─── ROLES ────────────────────────────────────────────────────────────────────

type Rol =
  | 'propietario' | 'admin_gral' | 'admin' | 'vendedor' | 'operador'
  | 'gestor' | 'asesor_comercial' | 'superadmin' | 'cliente'

// Quién puede gestionar equipo. admin_gral queda AFUERA a propósito:
// tiene gestionarEquipo:false en permisos.ts.
const ROLES_QUE_GESTIONAN: Rol[] = ['propietario', 'admin', 'superadmin']

// Roles que se pueden asignar por esta vía. NO incluye propietario/superadmin
// (anti-escalada) ni cliente. Cuando exista, agregar 'asistente_multas' acá.
const ROLES_ASIGNABLES: Rol[] = [
  'admin_gral', 'admin', 'vendedor', 'operador', 'gestor', 'asesor_comercial',
]

// Roles que solo un propietario/superadmin puede asignar.
const ROLES_SOLO_PROPIETARIO: Rol[] = ['admin_gral']

// Targets que solo un superadmin puede modificar (protege al dueño de que un
// admin lo degrade o desactive).
const ROLES_INTOCABLES: Rol[] = ['propietario', 'superadmin']

// ─── TIPOS DE PAYLOAD ────────────────────────────────────────────────────────

interface CrearData {
  accion:     'crear'
  nombre:     string
  apellido:   string
  email:      string
  password:   string
  telefono?:  string
  rol:        Rol
  gestoriaId?: string   // solo lo respeta un superadmin; el resto usa el suyo
}

interface ActualizarData {
  accion:    'actualizar'
  targetUid: string
  nombre?:   string
  apellido?: string
  telefono?: string
  rol?:      Rol
  activo?:   boolean
}

type Data = CrearData | ActualizarData

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const db = () => admin.firestore()

function validarRolAsignable(rol: Rol, callerRol: Rol, esSuper: boolean): void {
  if (!ROLES_ASIGNABLES.includes(rol)) {
    throw new HttpsError('invalid-argument', 'ROL_NO_PERMITIDO')
  }
  if (ROLES_SOLO_PROPIETARIO.includes(rol) && !(esSuper || callerRol === 'propietario')) {
    throw new HttpsError('permission-denied', 'ROL_REQUIERE_PROPIETARIO')
  }
}

// admin_gral es único por gestoría. `exceptoUid` permite reasignarle el rol al
// mismo usuario que ya lo tiene sin falso positivo.
async function verificarAdminGralUnico(gestoriaId: string, exceptoUid?: string): Promise<void> {
  const snap = await db().collection('users')
    .where('gestoriaId', '==', gestoriaId)
    .where('rol', '==', 'admin_gral')
    .where('activo', '==', true)
    .get()
  const yaExiste = snap.docs.some(d => d.id !== exceptoUid)
  if (yaExiste) {
    throw new HttpsError('failed-precondition', 'ADMIN_GRAL_YA_EXISTE')
  }
}

// Límite de plan — SOFT: si algo del conteo falla (índice faltante, etc.),
// no bloquea el alta. Solo frena si pudo contar y realmente se superó el tope.
async function verificarLimiteUsuarios(gestoriaId: string): Promise<void> {
  try {
    const gSnap = await db().doc(`gestionarias/${gestoriaId}`).get()
    const max = gSnap.get('maxUsuarios')
    if (typeof max !== 'number' || max <= 0) return   // sin tope válido → no chequear

    const cnt = await db().collection('users')
      .where('gestoriaId', '==', gestoriaId)
      .where('activo', '==', true)
      .where('rol', 'in', [...ROLES_ASIGNABLES, 'propietario'])
      .count().get()

    const actual = cnt.data().count
    if (actual >= max) {
      throw new HttpsError('resource-exhausted', 'LIMITE_USUARIOS', {
        tipo:   'usuarios',
        actual,
        maximo: max,
        plan:   (gSnap.get('plan') as string | undefined) ?? 'starter',
      })
    }
  } catch (e) {
    // El único error que propagamos es el tope real; cualquier otro (índice,
    // permisos internos, red) se ignora para no bloquear al Propietario.
    if (e instanceof HttpsError && e.code === 'resource-exhausted') throw e
  }
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export const gestionarEquipo = onCall(
  {
    region:         'us-central1',
    timeoutSeconds: 30,
    memory:         '256MiB',
    maxInstances:   5,
  },
  async (request) => {
    // ── 1. Autenticación ──────────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Se requiere autenticación.')
    }
    const callerUid = request.auth.uid

    // ── 2. Perfil de quien llama (fuente de verdad de rol + gestoriaId) ───────
    const callerSnap = await db().doc(`users/${callerUid}`).get()
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'PERFIL_NO_ENCONTRADO')
    }
    const caller = callerSnap.data() as { rol?: Rol; gestoriaId?: string; activo?: boolean }

    if (caller.activo === false) {
      throw new HttpsError('permission-denied', 'USUARIO_INACTIVO')
    }
    const callerRol = caller.rol
    if (!callerRol || !ROLES_QUE_GESTIONAN.includes(callerRol)) {
      throw new HttpsError('permission-denied', 'SIN_PERMISO_EQUIPO')
    }
    const esSuper       = callerRol === 'superadmin'
    const callerGestoria = caller.gestoriaId

    const data = request.data as Data
    const accion = data?.accion

    // ── 3A. CREAR ─────────────────────────────────────────────────────────────
    if (accion === 'crear') {
      const d = data as CrearData

      if (!d.nombre?.trim() || !d.apellido?.trim()) {
        throw new HttpsError('invalid-argument', 'FALTAN_NOMBRE_APELLIDO')
      }
      if (!d.email?.trim()) {
        throw new HttpsError('invalid-argument', 'FALTA_EMAIL')
      }
      if (!d.password || d.password.length < 8) {
        throw new HttpsError('invalid-argument', 'PASSWORD_CORTA')
      }

      // gestoriaId SIEMPRE server-side. Un superadmin puede especificar otra.
      const gestoriaId = (esSuper && typeof d.gestoriaId === 'string' && d.gestoriaId)
        ? d.gestoriaId
        : callerGestoria
      if (!gestoriaId) {
        throw new HttpsError('invalid-argument', 'SIN_GESTORIA')
      }

      validarRolAsignable(d.rol, callerRol, esSuper)
      if (d.rol === 'admin_gral') {
        await verificarAdminGralUnico(gestoriaId)
      }
      await verificarLimiteUsuarios(gestoriaId)

      // Crear cuenta en Auth
      let uid: string
      try {
        const userRecord = await admin.auth().createUser({
          email:       d.email.trim(),
          password:    d.password,
          displayName: `${d.nombre} ${d.apellido}`.trim(),
        })
        uid = userRecord.uid
      } catch (e: any) {
        if (e?.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'EMAIL_EN_USO')
        if (e?.code === 'auth/invalid-password')      throw new HttpsError('invalid-argument', 'PASSWORD_DEBIL')
        if (e?.code === 'auth/invalid-email')         throw new HttpsError('invalid-argument', 'EMAIL_INVALIDO')
        throw new HttpsError('internal', 'ERROR_AUTH')
      }

      // Crear perfil en Firestore (Admin SDK → bypassea reglas)
      try {
        await db().doc(`users/${uid}`).set({
          uid,
          email:        d.email.trim(),
          nombre:       d.nombre,
          apellido:     d.apellido,
          telefono:     d.telefono ?? '',
          rol:          d.rol,
          gestoriaId,
          clienteId:    null,
          activo:       true,
          creadoEn:     admin.firestore.FieldValue.serverTimestamp(),
          ultimoAcceso: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (e) {
        // Rollback: si falla el perfil, borrar la cuenta Auth para no dejar huérfanos.
        await admin.auth().deleteUser(uid).catch(() => {})
        throw new HttpsError('internal', 'ERROR_PERFIL')
      }

      return { ok: true, uid }
    }

    // ── 3B. ACTUALIZAR (nombre/apellido/telefono/rol/activo) ──────────────────
    if (accion === 'actualizar') {
      const d = data as ActualizarData

      if (!d.targetUid) {
        throw new HttpsError('invalid-argument', 'SIN_TARGET')
      }
      const tSnap = await db().doc(`users/${d.targetUid}`).get()
      if (!tSnap.exists) {
        throw new HttpsError('not-found', 'TARGET_NO_ENCONTRADO')
      }
      const target = tSnap.data() as { rol?: Rol; gestoriaId?: string }

      // Mismo tenant (salvo superadmin)
      if (!esSuper && target.gestoriaId !== callerGestoria) {
        throw new HttpsError('permission-denied', 'FUERA_DE_GESTORIA')
      }
      // No tocar dueño/superadmin salvo que quien llama sea superadmin
      if (!esSuper && target.rol && ROLES_INTOCABLES.includes(target.rol)) {
        throw new HttpsError('permission-denied', 'TARGET_PROTEGIDO')
      }

      const updates: Record<string, unknown> = {}
      if (typeof d.nombre === 'string')   updates.nombre   = d.nombre
      if (typeof d.apellido === 'string') updates.apellido = d.apellido
      if (typeof d.telefono === 'string') updates.telefono = d.telefono
      if (typeof d.activo === 'boolean')  updates.activo   = d.activo

      if (typeof d.rol === 'string' && d.rol !== target.rol) {
        validarRolAsignable(d.rol, callerRol, esSuper)
        if (d.rol === 'admin_gral') {
          await verificarAdminGralUnico(target.gestoriaId ?? callerGestoria ?? '', d.targetUid)
        }
        updates.rol = d.rol
      }

      if (Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'SIN_CAMBIOS')
      }
      updates.actualizadoEn = admin.firestore.FieldValue.serverTimestamp()

      await db().doc(`users/${d.targetUid}`).update(updates)
      return { ok: true }
    }

    throw new HttpsError('invalid-argument', 'ACCION_INVALIDA')
  },
)