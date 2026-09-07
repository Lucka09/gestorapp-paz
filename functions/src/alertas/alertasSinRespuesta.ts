// functions/src/alertas/alertasSinRespuesta.ts
// ─── ALERTA DE LEAD / CHAT SIN RESPUESTA (SLA) ───────────────────────────────
// Corre cada hora en horario laboral (9–20 ART). Busca conversaciones de
// WhatsApp donde el cliente escribió y NADIE respondió/abrió en X horas, y le
// crea al secretario una TAREA + una NOTIFICACIÓN (que dispara push por el
// trigger de notificaciones). Objetivo: que ningún lead se caiga por demora.
//
// Señal usada: noLeidos > 0 (el secretario ni lo abrió) + ultimaActividad
// vieja (más de horasLimite) pero reciente (últimos 7 días, para no perseguir
// chats abandonados). Idempotente: marca `alertaSinRespuestaEn` en la conv.
//
// Config (configuracion/gestor.alertasSinRespuesta):
//   activo:      boolean   (default true)
//   horasLimite: number    (default 3)
//
// Despliegue: firebase deploy --only functions:alertasSinRespuesta

import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'

const HORA_MS = 3600_000
const DIA_MS  = 86_400_000
const FV = admin.firestore.FieldValue

interface CfgSLA { activo?: boolean; horasLimite?: number }

async function propietarioDe(gestoriaId: string): Promise<string | null> {
  const db = admin.firestore()
  const q = await db.collection('users')
    .where('gestoriaId', '==', gestoriaId)
    .where('rol', '==', 'propietario')
    .limit(1).get()
  return q.empty ? null : q.docs[0].id
}

async function estaActivo(uid: string): Promise<boolean> {
  if (!uid) return false
  const s = await admin.firestore().doc(`users/${uid}`).get()
  return s.exists && (s.data() as any)?.activo !== false
}

export const alertasSinRespuesta = onSchedule(
  {
    schedule:       '0 9-20 * * *',
    timeZone:       'America/Argentina/Buenos_Aires',
    region:         'southamerica-east1',
    memory:         '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore()

    const cfgSnap = await db.doc('configuracion/gestor').get()
    const cfg = (cfgSnap.data() as any)?.alertasSinRespuesta as CfgSLA | undefined
    if (cfg?.activo === false) { logger.info('[SLA] desactivado'); return }

    const horasLimite = Number(cfg?.horasLimite ?? 3)
    const ahora = Date.now()
    const limiteSup = admin.firestore.Timestamp.fromMillis(ahora - horasLimite * HORA_MS) // más viejo que esto
    const limiteInf = admin.firestore.Timestamp.fromMillis(ahora - 7 * DIA_MS)            // pero no más de 7 días

    // Un solo rango de desigualdad (ultimaActividad); el resto se filtra en memoria.
    const snap = await db.collection('conversacionesWA')
      .where('ultimaActividad', '>=', limiteInf)
      .where('ultimaActividad', '<=', limiteSup)
      .get()

    if (snap.empty) { logger.info('[SLA] sin conversaciones en ventana'); return }

    let alertadas = 0, saltadas = 0

    for (const doc of snap.docs) {
      const c = doc.data() as any
      if ((c.noLeidos ?? 0) <= 0)      { saltadas++; continue } // ya lo abrieron
      if (c.alertaSinRespuestaEn)      { saltadas++; continue } // ya se alertó

      const gestoriaId = String(c.gestoriaId ?? '')
      if (!gestoriaId) { saltadas++; continue }

      // Destinatario: el asignado (si sigue activo), si no el propietario.
      let destinatario = String(c.asignadoA ?? '')
      if (destinatario && !(await estaActivo(destinatario))) destinatario = ''
      if (!destinatario) destinatario = (await propietarioDe(gestoriaId)) ?? ''
      if (!destinatario) { saltadas++; continue }

      const nombre = String(c.nombre ?? c.telefono ?? 'un cliente')
      const horas  = Math.floor((ahora - (c.ultimaActividad?.toMillis?.() ?? ahora)) / HORA_MS)

      const batch = db.batch()

      // Tarea trackeable
      const tareaRef = db.collection('tareas').doc()
      batch.set(tareaRef, {
        gestoriaId,
        titulo: `Responder a ${nombre} (WhatsApp)`,
        descripcion: `El cliente escribió y no tuvo respuesta hace ${horas} h.`,
        prioridad: 'alta',
        estado: 'pendiente',
        leadId: c.leadId ?? null,
        clienteId: c.clienteId ?? null,
        asignadoA: destinatario,
        asignadoNombre: c.asignadoNombre ?? '',
        creadoPor: 'automatizacion',
        creadoPorNombre: 'Alerta sin respuesta',
        vencimiento: admin.firestore.Timestamp.fromMillis(ahora + 2 * HORA_MS),
        creadoEn: FV.serverTimestamp(),
        actualizadoEn: FV.serverTimestamp(),
      })

      // Notificación (dispara push por el trigger de notificaciones)
      const notiRef = db.collection('notificaciones').doc()
      batch.set(notiRef, {
        gestoriaId,
        destinatarioId: destinatario,
        titulo: 'Lead sin responder',
        mensaje: `${nombre} escribió hace ${horas} h por WhatsApp y sigue sin respuesta. Abrí la Bandeja.`,
        tipo: 'general',
        entidadTipo: 'conversacionWA',
        entidadId: doc.id,
        leida: false,
        creadoEn: FV.serverTimestamp(),
      })

      // Marca de idempotencia en la conversación
      batch.update(doc.ref, { alertaSinRespuestaEn: FV.serverTimestamp() })

      await batch.commit().then(() => { alertadas++ }).catch(err => {
        logger.warn('[SLA] no se pudo alertar', { conv: doc.id, error: err?.message })
        saltadas++
      })
    }

    logger.info('[SLA] fin', { total: snap.size, alertadas, saltadas, horasLimite })
  },
)