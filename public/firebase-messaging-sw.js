// ─────────────────────────────────────────────────────────────────────────────
// GestorApp — Firebase Messaging Service Worker
// Maneja notificaciones push cuando la app está en segundo plano
// ─────────────────────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Config de Firebase — se reemplaza en build con las variables reales
// (el SW no tiene acceso a import.meta.env)
const firebaseConfig = {
  apiKey:            self.__FIREBASE_API_KEY__             || '',
  authDomain:        self.__FIREBASE_AUTH_DOMAIN__         || '',
  projectId:         self.__FIREBASE_PROJECT_ID__          || '',
  storageBucket:     self.__FIREBASE_STORAGE_BUCKET__      || '',
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || '',
  appId:             self.__FIREBASE_APP_ID__              || '',
}

firebase.initializeApp(firebaseConfig)

const messaging = firebase.messaging()

// ─── NOTIFICACIÓN EN BACKGROUND ───────────────────────────────────────────────

messaging.onBackgroundMessage(payload => {
  console.log('[SW] Push recibido en background:', payload)

  const { title, body, icon, click_action, tag, data } = payload.notification ?? {}

  self.registration.showNotification(title ?? 'GestorApp', {
    body:    body  ?? 'Tenés una novedad en Gestoría Paz',
    icon:    icon  ?? '/android-chrome-192x192.png',
    badge:   '/favicon-32x32.png',
    tag:     tag   ?? 'gestorapp-default',
    data:    { url: click_action ?? '/', ...data },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'ver',    title: 'Ver ahora' },
      { action: 'cerrar', title: 'Cerrar'   },
    ],
  })
})

// ─── CLICK EN NOTIFICACIÓN ────────────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close()

  if (event.action === 'cerrar') return

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.postMessage({ type: 'NAVIGATE', url })
          return
        }
      }
      // Si no hay ventana, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

// ─── PUSH MANUAL (sin Firebase Messaging) ────────────────────────────────────
// Fallback para cuando el payload no viene de FCM

self.addEventListener('push', event => {
  if (!event.data) return

  try {
    const data = event.data.json()
    // Si FCM ya lo manejó, no duplicar
    if (data.notification) return

    event.waitUntil(
      self.registration.showNotification(data.title ?? 'GestorApp', {
        body:  data.body ?? '',
        icon:  '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        data:  { url: data.url ?? '/' },
      })
    )
  } catch {
    // Payload en texto plano
    event.waitUntil(
      self.registration.showNotification('GestorApp', {
        body: event.data.text(),
        icon: '/android-chrome-192x192.png',
      })
    )
  }
})
