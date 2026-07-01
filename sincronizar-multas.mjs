#!/usr/bin/env node

/**
 * SINCRONIZAR MULTAS INCOMPLETAS
 * ─────────────────────────────────────────────────────────────
 * Script con ES modules
 * Ejecutar: node sincronizar-multas.mjs
 */

import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Cargar credenciales
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'serviceAccount.json'), 'utf8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gestorapp-paz',
})

const db = admin.firestore()

async function sincronizarMultas() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Sincronizando multas de ${gestoriaId}...\n`)

  try {
    // Buscar multas entregadas pero no pagadas
    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('tipo', '==', 'descargo_multa')
      .where('estado', '==', 'entregado')
      .where('pagado', '==', false)
      .get()

    console.log(`📋 Encontradas ${snapshot.size} multas para sincronizar\n`)

    if (snapshot.empty) {
      console.log('✅ No hay multas incompletas. ¡Cierre listo!')
      process.exit(0)
    }

    let actualizadas = 0
    let errores = 0
    const resultados = []

    // Procesar cada documento
    for (const doc of snapshot.docs) {
      try {
        const tramite = doc.data()
        const totalCobrado = tramite.totalCobradoCliente ?? tramite.honorarios ?? 0

        console.log(`⏳ Actualizando ${tramite.numero}...`)

        await doc.ref.update({
          pagado: true,
          fechaPago: tramite.fechaPago || admin.firestore.FieldValue.serverTimestamp(),
          costosSUATS: tramite.costosSUATS ?? 0,
          costosInformePersona: tramite.costosInformePersona ?? 0,
          totalCobradoCliente: totalCobrado,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        actualizadas++
        console.log(`   ✅ ${tramite.numero} actualizado correctamente`)
        resultados.push({
          numero: tramite.numero,
          totalCobrado,
          estado: 'éxito',
        })
      } catch (e) {
        console.error(`   ❌ Error en ${tramite?.numero}:`, e.message)
        errores++
        resultados.push({
          numero: tramite?.numero || 'DESCONOCIDO',
          estado: 'error',
          error: e.message,
        })
      }
    }

    // Resumen
    console.log('\n' + '='.repeat(60))
    console.log('✅ SINCRONIZACIÓN COMPLETADA')
    console.log('='.repeat(60))
    console.log(`
📊 RESULTADOS:
   Total encontradas: ${snapshot.size}
   Actualizadas:      ${actualizadas}
   Errores:           ${errores}
    
Multas actualizadas:
${resultados
  .filter(r => r.estado === 'éxito')
  .map(r => `   ✅ ${r.numero} - $${r.totalCobrado.toLocaleString('es-AR')}`)
  .join('\n')}
    `)

    if (errores > 0) {
      console.log(`\n❌ Errores encontrados:
${resultados
  .filter(r => r.estado === 'error')
  .map(r => `   ❌ ${r.numero} - ${r.error}`)
  .join('\n')}`)
    }

    console.log(
      '\n✅ Ahora recarga Reportes en GestorApp para ver los cambios.\n'
    )

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

// Ejecutar
sincronizarMultas()
