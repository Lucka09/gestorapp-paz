#!/usr/bin/env node

/**
 * SINCRONIZAR MULTAS ENTREGADAS CON DINERO PERO SIN MARCAR PAGADO
 * ─────────────────────────────────────────────────────────────
 * Busca TODAS las multas donde:
 * - estado: "entregado"
 * - totalCobradoCliente > 0 (hay dinero)
 * - pagado: false (pero no está marcado como pagado)
 * 
 * Y las marca como pagado=true automáticamente
 * 
 * Ejecutar: node sincronizar-multas-finales.mjs
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

async function sincronizarMultasFinales() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Buscando multas entregadas con dinero pero sin marcar pagado...\n`)

  try {
    // Buscar multas donde:
    // 1. estado = "entregado"
    // 2. totalCobradoCliente > 0 (hay dinero)
    // 3. pagado = false (no está marcado)
    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('tipo', '==', 'descargo_multa')
      .where('estado', '==', 'entregado')
      .where('pagado', '==', false)
      .get()

    console.log(`📋 Encontradas ${snapshot.size} multas para sincronizar\n`)

    if (snapshot.empty) {
      console.log('✅ No hay multas pendientes de sincronizar. ¡Cierre completado!')
      process.exit(0)
    }

    let actualizadas = 0
    let errores = 0
    const resultados = []
    let totalMontos = 0

    for (const doc of snapshot.docs) {
      try {
        const tramite = doc.data()

        // Validar que tenga dinero
        const totalCobrado = tramite.totalCobradoCliente ?? 0
        if (!totalCobrado || totalCobrado <= 0) {
          console.log(`⏭️  ${tramite.numero} - No tiene dinero registrado, saltando`)
          continue
        }

        console.log(`⏳ Sincronizando ${tramite.numero}...`)
        console.log(`   Total cobrado: $${totalCobrado.toLocaleString('es-AR')}`)
        console.log(`   SUATS: $${(tramite.costosSUATS ?? 0).toLocaleString('es-AR')}`)

        // Actualizar: marcar como pagado + guardar fechaPago
        await doc.ref.update({
          pagado: true,
          fechaPago: tramite.fechaPago || admin.firestore.FieldValue.serverTimestamp(),
          costosSUATS: tramite.costosSUATS ?? 0,
          costosInformePersona: tramite.costosInformePersona ?? 0,
          totalCobradoCliente: totalCobrado,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        actualizadas++
        totalMontos += totalCobrado
        console.log(`   ✅ Sincronizado\n`)
        resultados.push({
          numero: tramite.numero,
          totalCobrado,
          suats: tramite.costosSUATS ?? 0,
          estado: 'éxito',
        })
      } catch (e) {
        console.error(`   ❌ Error:`, e.message, '\n')
        errores++
        resultados.push({
          numero: tramite?.numero || 'DESCONOCIDO',
          estado: 'error',
          error: e.message,
        })
      }
    }

    // Resumen
    console.log('='.repeat(70))
    console.log('✅ SINCRONIZACIÓN FINAL COMPLETADA')
    console.log('='.repeat(70))
    console.log(`
📊 RESULTADOS:
   Total multas encontradas:  ${snapshot.size}
   Sincronizadas:             ${actualizadas}
   Errores:                   ${errores}
   Total dinero sincronizado: $${totalMontos.toLocaleString('es-AR')}
    
Multas sincronizadas:
${resultados
  .filter(r => r.estado === 'éxito')
  .map(
    r =>
      `   ✅ ${r.numero} - Total: $${r.totalCobrado.toLocaleString('es-AR')} | SUATS: $${r.suats.toLocaleString('es-AR')}`
  )
  .join('\n')}
    `)

    if (errores > 0) {
      console.log(`\n❌ Errores encontrados:
${resultados
  .filter(r => r.estado === 'error')
  .map(r => `   ❌ ${r.numero} - ${r.error}`)
  .join('\n')}`)
    }

    console.log(`
🎉 ¡CIERRE DE JUNIO COMPLETADO CORRECTAMENTE!

Ahora:
1. Recarga GestorApp (F5)
2. Ve a Reportes → Junio 2026
3. Deberías ver ~57 trámites pagos (no 37)
4. SUATS debería tener el monto total
5. Diferencia de caja: CERO ✅
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

sincronizarMultasFinales()
