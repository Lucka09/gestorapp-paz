#!/usr/bin/env node

/**
 * SINCRONIZAR TODOS LOS TRÁMITES CON DINERO PERO SIN MARCAR PAGADO
 * ─────────────────────────────────────────────────────────────
 * Busca TODOS los trámites (cualquier tipo) donde:
 * - totalCobradoCliente > 0 (hay dinero registrado)
 * - pagado: false (pero no está marcado como pagado)
 * 
 * Ejecutar: node sincronizar-tramites-con-dinero.mjs
 */

import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'serviceAccount.json'), 'utf8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gestorapp-paz',
})

const db = admin.firestore()

async function sincronizarTramitesConDinero() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Buscando TODOS los trámites con dinero pero sin marcar pagado...\n`)

  try {
    // Buscar TODOS los trámites donde:
    // 1. pagado = false
    // 2. totalCobradoCliente > 0 (hay dinero)
    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('pagado', '==', false)
      .get()

    // Filtrar en memoria los que tengan totalCobradoCliente > 0
    const conDinero = snapshot.docs.filter(doc => {
      const t = doc.data()
      return (t.totalCobradoCliente ?? 0) > 0
    })

    console.log(`📋 Encontrados ${conDinero.length} trámites con dinero pero sin marcar pagado\n`)

    if (conDinero.length === 0) {
      console.log('✅ No hay trámites con dinero sin sincronizar.')
      console.log('\nSi aún hay diferencia en Reportes, la causa podría ser:')
      console.log('- Trámites con honorarios > 0 pero totalCobradoCliente = null')
      console.log('- Datos inconsistentes en Firestore')
      console.log('- Pago registrado en otra colección (recibos)')
      process.exit(0)
    }

    let actualizadas = 0
    let errores = 0
    const resultados = []
    let totalMontos = 0

    for (const doc of conDinero) {
      try {
        const tramite = doc.data()
        const totalCobrado = tramite.totalCobradoCliente ?? 0

        console.log(`⏳ Sincronizando ${tramite.numero} (${tramite.tipo})...`)
        console.log(`   Total cobrado: $${totalCobrado.toLocaleString('es-AR')}`)
        console.log(`   Estado actual: ${tramite.estado}`)
        console.log(`   SUATS: $${(tramite.costosSUATS ?? 0).toLocaleString('es-AR')}`)

        // Actualizar: marcar como pagado
        await doc.ref.update({
          pagado: true,
          fechaPago: tramite.fechaPago || admin.firestore.FieldValue.serverTimestamp(),
          totalCobradoCliente: totalCobrado,
          costosSUATS: tramite.costosSUATS ?? 0,
          costosInformePersona: tramite.costosInformePersona ?? 0,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        actualizadas++
        totalMontos += totalCobrado
        console.log(`   ✅ Sincronizado\n`)
        resultados.push({
          numero: tramite.numero,
          tipo: tramite.tipo,
          totalCobrado,
          suats: tramite.costosSUATS ?? 0,
          estado: 'éxito',
        })
      } catch (e) {
        console.error(`   ❌ Error:`, e.message, '\n')
        errores++
      }
    }

    // Resumen
    console.log('='.repeat(70))
    console.log('✅ SINCRONIZACIÓN COMPLETADA')
    console.log('='.repeat(70))
    console.log(`
📊 RESULTADOS:
   Total trámites encontrados: ${conDinero.length}
   Sincronizados:              ${actualizadas}
   Errores:                    ${errores}
   Total dinero sincronizado:  $${totalMontos.toLocaleString('es-AR')}
    
Trámites sincronizados:
${resultados
  .map(
    r =>
      `   ✅ ${r.numero} (${r.tipo}) - Total: $${r.totalCobrado.toLocaleString('es-AR')}`
  )
  .join('\n')}
    `)

    console.log(`
🎉 ¡CIERRE DE JUNIO COMPLETADO!

Ahora:
1. Recarga GestorApp (F5)
2. Ve a Reportes → Junio 2026
3. Los números deberían cuadrar correctamente
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

sincronizarTramitesConDinero()
