// ─────────────────────────────────────────────────────────────────────────────
// ENV — Validación de variables de entorno al arrancar la app
//
// Si alguna variable VITE_ requerida está ausente, la app falla ruidosamente
// en development y en CI/CD con un mensaje claro — en lugar de silenciosamente
// enviar `undefined` a Firebase y obtener un error críptico horas después.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

type EnvKey = typeof REQUIRED_VARS[number]

// Validar al importar el módulo (antes de inicializar Firebase)
const missing = REQUIRED_VARS.filter(k => !import.meta.env[k])

if (missing.length > 0) {
  const list = missing.map(k => `  ✗ ${k}`).join('\n')
  throw new Error(
    `[GestorApp] Variables de entorno faltantes:\n${list}\n\n` +
    `Verificá tu archivo .env o las variables de entorno en tu hosting.`
  )
}

// Exportar las variables tipadas — import.meta.env[key] está garantizado string
export const ENV = Object.fromEntries(
  REQUIRED_VARS.map(k => [k, import.meta.env[k] as string])
) as Record<EnvKey, string>