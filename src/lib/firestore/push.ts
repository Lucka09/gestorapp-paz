import {
  getMessaging, getToken, onMessage,
  type Messaging,
} from 'firebase/messaging'
import {
  doc, updateDoc, arrayUnion, arrayRemove,
  getDoc, serverTimestamp,
} from 'firebase/firestore'
import { app, db } from '../firebase'
import { userDoc } from './collections'

// ─── CONFIG ───────────────────────────────────────────────────────────────────

// La VAPID key se obtiene en Firebase Console →
// Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? ''

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface PayloadNotifPush {
  titulo:  string
  cuerpo:  string
  url?:    string
  icono?:  string
  tag?:    string
}

// ─── INSTANCIA LAZY DE MESSAGING ─────────────────────────────────────────────

let _messaging: Messaging | null = null

function getMsg(): Messaging | null {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator))  return null
  try {
    if (!_messaging) _messaging = getMessaging(app)
    return _messaging
  } catch { return null }
}

// ─── PERMISO ──────────────────────────────────────────────────────────────────

export async function pedirPermiso(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return await Notification.requestPermission()
}

export function getPermisoActual(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// ─── OBTENER Y GUARDAR TOKEN FCM ──────────────────────────────────────────────

export async function obtenerYGuardarToken(uid: string): Promise<string | null> {
  const messaging = getMsg()
  if (!messaging || !VAPID_KEY) return null

  try {
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    })

    const token = await getToken(messaging, {
      vapidKey:           VAPID_KEY,
      serviceWorkerRegistration: sw,
    })

    if (token) {
      // Guardar token en el perfil del usuario (array para multi-dispositivo)
      await updateDoc(userDoc(uid), {
        fcmTokens:    arrayUnion(token),
        actualizadoEn: serverTimestamp(),
      })
    }

    return token ?? null
  } catch (err) {
    console.warn('[Push] Error al obtener token FCM:', err)
    return null
  }
}

// ─── ELIMINAR TOKEN (logout / desactivar) ────────────────────────────────────

export async function eliminarToken(uid: string, token: string): Promise<void> {
  try {
    await updateDoc(userDoc(uid), {
      fcmTokens: arrayRemove(token),
    })
  } catch { /* silencioso */ }
}

// ─── ESCUCHAR MENSAJES EN FOREGROUND ─────────────────────────────────────────

export function onMensajeForeground(
  callback: (payload: any) => void
): (() => void) {
  const messaging = getMsg()
  if (!messaging) return () => {}

  const unsub = onMessage(messaging, payload => {
    callback(payload)
    // Mostrar notificación browser nativa aunque la app esté abierta
    const { title, body, icon } = payload.notification ?? {}
    if (Notification.permission === 'granted' && title) {
      new Notification(title, {
        body:  body ?? '',
        icon:  icon ?? '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
      })
    }
  })

  return unsub
}

// ─── NOTIFICACIÓN LOCAL (sin servidor) ───────────────────────────────────────
// Para disparar notificaciones directamente desde el cliente
// Útil para recordatorios locales (ej: alerta de turno)

export function mostrarNotificacionLocal(
  payload: PayloadNotifPush
): void {
  if (Notification.permission !== 'granted') return

  const notif = new Notification(payload.titulo, {
    body:    payload.cuerpo,
    icon:    payload.icono ?? '/android-chrome-192x192.png',
    badge:   '/favicon-32x32.png',
    tag:     payload.tag ?? 'gestorapp',
  })

  if (payload.url) {
    notif.onclick = () => {
      window.focus()
      window.location.href = payload.url!
      notif.close()
    }
  }
}

// ─── NOTIFICACIONES PROGRAMADAS LOCALES ──────────────────────────────────────
// Para recordar al operador sobre turnos próximos

const _timers: Record<string, ReturnType<typeof setTimeout>> = {}

export function programarRecordatorio(
  id:        string,
  en_ms:     number,   // milisegundos desde ahora
  payload:   PayloadNotifPush
): void {
  if (_timers[id]) clearTimeout(_timers[id])
  if (en_ms <= 0)  return

  _timers[id] = setTimeout(() => {
    mostrarNotificacionLocal(payload)
    delete _timers[id]
  }, en_ms)
}

export function cancelarRecordatorio(id: string): void {
  if (_timers[id]) {
    clearTimeout(_timers[id])
    delete _timers[id]
  }
}

// ─── VERIFICAR SOPORTE ───────────────────────────────────────────────────────

export function pushSoportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification'    in window &&
    'serviceWorker'   in navigator &&
    'PushManager'     in window
  )
}

export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function esInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (navigator as any).standalone === true
}
