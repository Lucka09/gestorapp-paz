// functions/src/automatizaciones/motor.ts
// Motor: onCreate('/eventos') → evalúa automatizaciones activas del tenant →
// ejecuta acciones en orden. Idempotente por (automatizacion, evento).
// Despliegue: firebase deploy --only functions:motorAutomatizaciones,functions:seedAutomatizaciones
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { evaluarCondiciones } from './condiciones'
import { EJECUTORES, COLECCION_POR_ENTIDAD, type CtxAutomatizacion } from './ejecutores'

const db = admin.firestore()
const FV = admin.firestore.FieldValue

export const motorAutomatizaciones = onDocumentCreated(
  { document: 'eventos/{eventoId}', region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 60 },
  async (event) => {
    const evento = event.data?.data() as any
    if (!evento?.gestoriaId || !evento?.tipo) return
    if (String(evento.tipo).startsWith('automatizacion.')) return  // anti-recursión

    const snap = await db.collection('automatizaciones')
      .where('gestoriaId', '==', evento.gestoriaId)
      .where('activo', '==', true)
      .get()
    if (snap.empty) return

    // Cargar la entidad de referencia (para condiciones, placeholders y acciones)
    let entidadDoc: any = null
    const col = COLECCION_POR_ENTIDAD[evento.entidad]
    if (col && evento.entidadId) {
      try {
        const e = await db.collection(col).doc(evento.entidadId).get()
        entidadDoc = e.exists ? { id: e.id, ...e.data() } : null
      } catch { entidadDoc = null }
    }

    const ctxCondiciones = { ...evento, ...(evento.payload ?? {}), ...(entidadDoc ?? {}) }

    for (const doc of snap.docs) {
      const auto = { id: doc.id, ...doc.data() } as any
      if (auto.trigger !== evento.tipo) continue
      if (!evaluarCondiciones(auto.condiciones ?? [], ctxCondiciones)) continue

      // Idempotencia: una ejecución por (automatización, evento)
      const execRef = db.collection('ejecucionesAutomatizacion').doc(`${auto.id}_${event.params.eventoId}`)
      const ya = await execRef.get()
      if (ya.exists) continue

      const ctx: CtxAutomatizacion = { evento, gestoriaId: evento.gestoriaId, entidadDoc, automatizacion: auto }
      let ejecutadas = 0, fallidas = 0
      const errores: string[] = []

      for (const accion of auto.acciones ?? []) {
        const fn = EJECUTORES[accion.tipo]
        if (!fn) { fallidas++; errores.push(`Ejecutor no implementado: ${accion.tipo}`); continue }
        try { await fn(accion, ctx); ejecutadas++ }
        catch (e: any) {
          fallidas++
          errores.push(`${accion.tipo}: ${e?.message}`)
          logger.warn('[motor] acción falló', { auto: auto.id, accion: accion.tipo, error: e?.message })
        }
      }

      // Log de ejecución (doc con id determinístico = idempotencia)
      await execRef.set({
        gestoriaId: evento.gestoriaId,
        automatizacionId: auto.id,
        automatizacionNombre: auto.nombre ?? '',
        eventoId: event.params.eventoId,
        eventoTipo: evento.tipo,
        entidad: evento.entidad ?? null,
        entidadId: evento.entidadId ?? null,
        estado: fallidas === 0 ? 'ejecutada' : 'fallida',
        accionesEjecutadas: ejecutadas,
        accionesFallidas: fallidas,
        errores,
        timestamp: FV.serverTimestamp(),
      }).catch(() => {})

      // Stats de la automatización
      await doc.ref.update({
        ejecucionesTotales: FV.increment(1),
        ...(fallidas > 0 ? { ejecucionesFallidas: FV.increment(1) } : { ejecucionesExitosas: FV.increment(1) }),
        ultimaEjecucion: FV.serverTimestamp(),
      }).catch(() => {})
    }
  }
)

// ─── SEED: activa las automatizaciones sugeridas del tenant (una sola vez) ───
export const seedAutomatizaciones = onCall(
  { 
    region: 'us-central1',
    cors: [                                    // ← AGREGAR ESTE BLOQUE
      'https://gestorapp-paz.web.app',
      'https://gestorapp-paz.firebaseapp.com',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Requiere login')
    const userSnap = await db.doc(`users/${request.auth.uid}`).get()
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'Usuario no encontrado')
    const u = userSnap.data() as any
    if (!['propietario', 'admin', 'admin_gral'].includes(u.rol)) {
      throw new HttpsError('permission-denied', 'Solo propietarios/admins')
    }
    const gestoriaId = u.gestoriaId
    if (!gestoriaId) throw new HttpsError('failed-precondition', 'Usuario sin gestoría')

    const plantillas = [
      {
        nombre: 'Lead nuevo → asignación rotativa + tarea de contacto',
        descripcion: 'Asigna el lead al equipo y crea tarea de contacto en 4 h.',
        trigger: 'lead.creado',
        condiciones: [],
        acciones: [
          { tipo: 'asignar_rotativo', params: {} },
          { tipo: 'crear_tarea', params: { titulo: 'Contactar lead {nombre}', vencimientoHoras: 4, prioridad: 'alta' } },
        ],
      },
      {
        nombre: 'Lead convertido → notificación al responsable',
        descripcion: 'Avisa cuando un lead pasa a prospecto.',
        trigger: 'lead.convertido',
        condiciones: [],
        acciones: [
          { tipo: 'crear_notificacion', params: { titulo: 'Lead {nombre} convertido en prospecto' } },
        ],
      },
      {
        nombre: 'Prospecto ganado → tarea de alta y recibo',
        descripcion: 'Crea la tarea de cierre cuando se gana el prospecto.',
        trigger: 'prospecto.cerrado_ganado',
        condiciones: [],
        acciones: [
          { tipo: 'crear_tarea', params: { titulo: 'Alta y recibo: {nombre}', vencimientoHoras: 24 } },
        ],
      },
    ]

    let creadas = 0
    for (const p of plantillas) {
      const existente = await db.collection('automatizaciones')
        .where('gestoriaId', '==', gestoriaId)
        .where('nombre', '==', p.nombre)
        .limit(1).get()
      if (!existente.empty) continue
      await db.collection('automatizaciones').add({
        gestoriaId, ...p,
        activo: true,
        ejecucionesTotales: 0, ejecucionesExitosas: 0, ejecucionesFallidas: 0,
        creadoEn: FV.serverTimestamp(), creadoPor: request.auth.uid,
      })
      creadas++
    }
    return { ok: true, creadas }
  }
)