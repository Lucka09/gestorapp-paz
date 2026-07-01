#!/usr/bin/env node

/**
 * SINCRONIZAR TRÁMITES CON RECIBO PERO SIN MARCAR COMO PAGADO
 * ─────────────────────────────────────────────────────────────
 * Busca Recibos creados en Junio que su trámite NO está marcado como pagado
 * y los sincroniza correctamente.
 * 
 * Ejecutar: node sincronizar-recibos-faltantes.mjs
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

async function sincronizarRecibos() {
  const gestoriaId = 'gestoria-paz'
  console.log(`\n🔍 Buscando trámites con recibo pero sin marcar como pagado...\n`)

  try {
    // Buscar recibos de JUNIO 2026
    const inicioJunio = new Date(2026, 5, 1) // Junio es mes 5 (0-indexed)
    const finJunio = new Date(2026, 6, 1)

    const recibosSnap = await db
      .collection('recibos')
      .where('gestoriaId', '==', gestoriaId)
      .where('creadoEn', '>=', admin.firestore.Timestamp.fromDate(inicioJunio))
      .where('creadoEn', '<', admin.firestore.Timestamp.fromDate(finJunio))
      .get()

    console.log(`📋 Encontrados ${recibosSnap.size} recibos de Junio\n`)

    const tramitesParaSincronizar = []

    // Verificar cada recibo
    for (const reciboDoc of recibosSnap.docs) {
      const recibo = reciboDoc.data()
      const tramiteSnap = await db.collection('tramites').doc(recibo.tramiteId).get()

      if (!tramiteSnap.exists()) {
        console.log(`⚠️  Recibo ${recibo.numeroRecibo} - Trámite no existe`)
        continue
      }

      const tramite = tramiteSnap.data()

      // Si el trámite está pagado, saltar
      if (tramite.pagado) {
        console.log(`⏭️  ${tramite.numero} - Ya está marcado como pagado`)
        continue
      }

      // SI NO ESTÁ PAGADO, agregarlo a la lista para sincronizar
      console.log(`⚠️  ${tramite.numero} - Tiene recibo pero pagado=false`)
      tramitesParaSincronizar.push({
        tramiteId: recibo.tramiteId,
        tramite,
        reciboId: reciboDoc.id,
        numeroRecibo: recibo.numeroRecibo,
        monto: recibo.monto,
        creadoEn: recibo.creadoEn,
      })
    }

    if (tramitesParaSincronizar.length === 0) {
      console.log('✅ No hay trámites sin sincronizar. ¡Listo!')
      process.exit(0)
    }

    console.log(`\n⏳ Sincronizando ${tramitesParaSincronizar.length} trámites...\n`)

    let actualizadas = 0
    let errores = 0

    for (const item of tramitesParaSincronizar) {
      try {
        const { tramiteId, tramite, numeroRecibo, monto, creadoEn } = item

        // Buscar el workflow para saber si requiere SUATS
        let montoSUATS = 0
        try {
          const workflowSnap = await db.collection('multaWorkflow').doc(tramiteId).get()
          const workflow = workflowSnap.data()
          if (workflow?.paso1?.requiereSUATS) {
            montoSUATS = 16000
          }
        } catch (e) {
          // Si no es multa, no tiene workflow
          montoSUATS = 0
        }

        console.log(`⏳ Sincronizando ${tramite.numero}...`)
        console.log(`   Recibo: ${numeroRecibo}`)
        console.log(`   Monto: $${monto.toLocaleString('es-AR')}`)
        console.log(`   SUATS: ${montoSUATS > 0 ? `$${montoSUATS}` : 'No'}`)

        await db.collection('tramites').doc(tramiteId).update({
          pagado: true,
          fechaPago: creadoEn, // Usar fecha del recibo
          costosSUATS: montoSUATS,
          costosInformePersona: tramite.costosInformePersona ?? 0,
          totalCobradoCliente: monto,
          honorarios: Math.max(0, monto - montoSUATS - (tramite.costosInformePersona ?? 0)),
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        actualizadas++
        console.log(`   ✅ Sincronizado\n`)
      } catch (e) {
        console.error(`   ❌ Error:`, e.message, '\n')
        errores++
      }
    }

    // Resumen
    console.log('='.repeat(60))
    console.log('✅ SINCRONIZACIÓN COMPLETADA')
    console.log('='.repeat(60))
    console.log(`
📊 RESULTADOS:
   Total con recibo sin pagar: ${tramitesParaSincronizar.length}
   Sincronizadas:              ${actualizadas}
   Errores:                    ${errores}

✅ Ahora:
1. Recarga GestorApp (F5)
2. Ve a Reportes → Junio 2026
3. Deberías ver los 53 trámites pagos correctamente
4. SUATS debería aparecer si la multa lo requiere
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

sincronizarRecibos()
