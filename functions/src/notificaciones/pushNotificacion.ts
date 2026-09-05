// functions/src/notificaciones/pushNotificacion.ts
// ─── PUSH AL CELULAR AL CREARSE UNA NOTIFICACIÓN ─────────────────────────────
// Trigger onCreate sobre `notificaciones/{id}`: lee los tokens FCM del
// destinatario (users/{uid}.fcmTokens, que guarda el cliente vía push.ts) y
// manda un push web. Así CUALQUIER notificación in-app (auto-encolado de multas,
// tareas, avisos del motor de automatizaciones, etc.) llega también al teléfono
// sin tocar cada emisor: el que crea la notificación no cambia.
//
// Limpia tokens inválidos/expirados para no acumular basura.
//
// Requisitos de entorno (ya del lado cliente):
//   • VITE_FIREBASE_VAPID_KEY seteado (push.ts obtiene el token con esa VAPID).
//   • public/firebase-messaging-sw.js presente (service worker de background).
//   • El usuario aceptó notificaciones y guardó su token (obtenerYGuardarToken).
//
// Despliegue: firebase deploy --only functions:enviarPushNotificacion

import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'

export const enviarPushNotificacion = onDocumentCreated(
  {
    document: 'notificaciones/{notifId}',
    region:   'southamerica-east1',
    memory:   '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const notif = event.data?.data() as any
    if (!notif?.destinatarioId) return

    const db  = admin.firestore()
    const uid = String(notif.destinatarioId)

    const userSnap = await db.doc(`users/${uid}`).get()
    if (!userSnap.exists) return

    const tokens: string[] = ((userSnap.data() as any)?.fcmTokens ?? [])
      .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
    if (tokens.length === 0) return

    const titulo = String(notif.titulo ?? 'Gestoría Paz')
    const cuerpo = String(notif.mensaje ?? '')

    let resp: admin.messaging.BatchResponse
    try {
      resp = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: titulo, body: cuerpo },
        webpush: {
          notification: {
            icon:  '/android-chrome-192x192.png',
            badge: '/favicon-32x32.png',
            tag:   String(notif.entidadId ?? notif.tipo ?? 'gp-notif'),
          },
          fcmOptions: { link: '/' },   // TODO: deep-link según entidadTipo/entidadId
        },
        data: {
          tipo:        String(notif.tipo ?? 'general'),
          entidadTipo: String(notif.entidadTipo ?? ''),
          entidadId:   String(notif.entidadId ?? ''),
        },
      })
    } catch (e: any) {
      logger.error('[push] error enviando', { uid, message: e?.message })
      return
    }

    // Limpieza de tokens muertos (desinstalados / expirados).
    const invalidos: string[] = []
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? ''
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidos.push(tokens[i])
        }
      }
    })
    if (invalidos.length > 0) {
      await db.doc(`users/${uid}`).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidos),
      }).catch(() => {})
    }

    logger.info('[push] enviado', {
      uid, ok: resp.successCount, fail: resp.failureCount, limpiados: invalidos.length,
    })
  },
)