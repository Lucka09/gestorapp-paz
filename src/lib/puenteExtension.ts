// src/lib/puenteExtension.ts
// ─── PUENTE GESTORAPP → EXTENSIÓN (token de sesión) ─────────────────────────
//
// La extensión corre en el portal de PBA, no en GestorApp, así que no tiene la
// sesión de Firebase. Este módulo publica el ID token del usuario logueado por
// window.postMessage; el content script `bridge.js` de la extensión (que corre
// en el origen de GestorApp) lo escucha y lo guarda en chrome.storage.local.
//
// Seguridad:
//   • Solo publica si la extensión marcó este equipo (flag `gp_ext` en
//     localStorage, que setea bridge.js). En equipos sin extensión, no difunde
//     nada.
//   • postMessage con targetOrigin = origen propio (no cruza dominios).
//   • El token es de corta vida (1 h) y se refresca solo vía onIdTokenChanged.
//   • Un atacante con ejecución de scripts en este origen ya podría emitir
//     tokens por su cuenta, así que esto no agranda la superficie real.
//
// Uso: llamar UNA vez al arrancar la app, después de inicializar Firebase Auth.
//   import { auth } from '@/lib/firebase'
//   import { iniciarPuenteExtension } from '@/lib/puenteExtension'
//   iniciarPuenteExtension(auth)

import { onIdTokenChanged, type Auth } from 'firebase/auth'

const SRC_TOKEN = 'GESTORAPP_TOKEN'
const SRC_READY = 'GP_EXT_READY'

let authRef: Auth | null = null

export function iniciarPuenteExtension(auth: Auth): void {
  authRef = auth

  // 1) Publica el token en cada cambio de sesión (login, refresh horario, logout).
  onIdTokenChanged(auth, async (user) => {
    if (!user) { publicar(null); return }
    try { publicar(await user.getIdToken()) } catch { publicar(null) }
  })

  // 2) Si la extensión se activa DESPUÉS del login, pide el token con GP_EXT_READY.
  window.addEventListener('message', async (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return
    if ((e.data as any)?.source !== SRC_READY) return
    const u = authRef?.currentUser
    if (!u) { publicar(null); return }
    try { publicar(await u.getIdToken()) } catch { publicar(null) }
  })
}

function publicar(token: string | null): void {
  // Solo en equipos con la extensión instalada (bridge.js setea gp_ext=1).
  try { if (localStorage.getItem('gp_ext') !== '1') return } catch { return }
  window.postMessage({ source: SRC_TOKEN, token }, window.location.origin)
}