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

    const horasLimite = Number(cfg?.horasLimite ?? 4)
    const ahora = Date.now()
    const limiteSup = admin.firestore.Timestamp.fromMillis(ahora - horasLimite * HORA_MS) // más viejo que esto
    const limiteInf = admin.firestore.Timestamp.fromMillis(ahora - 7 * DIA_MS)            // pero no más de 7 días

    // Un solo rango de desigualdad (ultimaActividad); el resto se filtra en memoria.
    const snap = await db.collection('conversacionesWA')
      .where('ultimaActividad', '>=', limiteInf)
      .where('ultimaActividad', '<=', limiteSup)
      .get()

    if (snap.empty) { logger.info('[SLA] sin conversaciones en ventana'); return }

    let liberadas = 0, saltadas = 0

    for (const doc of snap.docs) {
      const c = doc.data() as any
      if ((c.noLeidos ?? 0) <= 0)      { saltadas++; continue } // ya lo abrieron
      if (c.alertaSinRespuestaEn)      { saltadas++; continue } // ya se procesó

      const gestoriaId = String(c.gestoriaId ?? '')
      if (!gestoriaId) { saltadas++; continue }

      const duenoPrevio = String(c.asignadoA ?? '')
      const nombre = String(c.nombre ?? c.telefono ?? 'un cliente')
      const horas  = Math.floor((ahora - (c.ultimaActividad?.toMillis?.() ?? ahora)) / HORA_MS)

      const batch = db.batch()

      // 1) PASAR AL POOL: se libera para que cualquiera lo tome. Si ya estaba en
      //    el pool (sin dueño), no hace falta re-liberar pero igual marcamos.
      batch.update(doc.ref, {
        asignadoA: '',
        asignadoNombre: '',
        alertaSinRespuestaEn: FV.serverTimestamp(),
      })

      // 2) Avisar al dueño anterior (si tenía y sigue activo) que se liberó.
      if (duenoPrevio && await estaActivo(duenoPrevio)) {
        const notiRef = db.collection('notificaciones').doc()
        batch.set(notiRef, {
          gestoriaId,
          destinatarioId: duenoPrevio,
          titulo: 'Chat liberado al pool',
          mensaje: `${nombre} quedó ${horas} h sin respuesta, así que pasó al pool "Sin asignar" para que otro secretario lo tome. Si querés seguirlo vos, reabrilo desde la Bandeja.`,
          tipo: 'general',
          entidadTipo: 'conversacionWA',
          entidadId: doc.id,
          leida: false,
          creadoEn: FV.serverTimestamp(),
        })
      }

      await batch.commit().then(() => { liberadas++ }).catch(err => {
        logger.warn('[SLA] no se pudo liberar', { conv: doc.id, error: err?.message })
        saltadas++
      })
    }

    logger.info('[SLA] fin', { total: snap.size, liberadas, saltadas, horasLimite })
  },
)