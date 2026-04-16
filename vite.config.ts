import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
  react(),
  tailwindcss(),
  {
    name: 'inject-sw-env',
    generateBundle() {
      // se hace automáticamente con las variables de entorno en Vercel
    }
  }
],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  build: {
    // Target moderno — elimina polyfills innecesarios
    target: 'es2020',

    // Chunks manuales — agrupa librerías pesadas
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Firebase — chunk separado
          if (id.includes('node_modules/firebase/')) {
            if (id.includes('firestore')) return 'firebase-firestore'
            if (id.includes('auth'))      return 'firebase-auth'
            return 'firebase-core'
          }
          // React + router
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('react-router')) {
            return 'react-vendor'
          }
          // xlsx — chunk aislado (carga lazy)
          if (id.includes('node_modules/xlsx')) return 'xlsx-vendor'
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) return 'ui-icons'
          // dnd-kit (solo se usa en pipeline)
          if (id.includes('node_modules/@dnd-kit')) return 'dnd-vendor'
        },
        // Nombres legibles para debugging
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Reportar chunks grandes
    chunkSizeWarningLimit: 600,

    // Minificación agresiva
    sourcemap: false,
  },

  // Optimización de dependencias en dev
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'zustand',
      'react-router-dom',
    ],
    exclude: [
      'xlsx',  // excluir del pre-bundling — se carga lazy
    ],
  },
})
