import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Los tests de utils son funciones puras — no necesitan DOM
    environment: 'node',

    // Reportes
    reporters: ['verbose'],

    // Cobertura opcional: `vitest run --coverage`
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'html'],
      include:    ['src/utils/**', 'src/lib/firestore/**'],
      exclude:    ['src/utils/exportar.ts', 'src/utils/importador.ts'],
    },

    // Excluir archivos no testeables (Firebase SDK, UI, etc.)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.stories.*',
    ],
  },

  resolve: {
    alias: {
      // Mismo alias que vite.config.ts — permite `import from '@/types'`
      '@': path.resolve(__dirname, './src'),
    },
  },
})