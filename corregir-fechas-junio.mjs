#!/usr/bin/env node

/**
 * CORREGIR FECHAPAGO - MOVER TRÁMITES DE JULIO A JUNIO
 * ─────────────────────────────────────────────────────
 * Los 21 trámites sincronizados tienen fechaPago en Julio
 * Este script los corrige a Junio basándose en su creadoEn
 * 
 * Ejecutar: node corregir-fechas-junio.mjs
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

async function corregirFechasJunio() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Buscando trámites con pagado=true pero fechaPago en Julio...\n`)

  try {
    // Buscar multas que:
    // 1. Están pagadas (pagado: true)
    // 2. Fueron creadas en Junio (creadoEn entre 1 y 30 de junio)
    // 3. Pero tienen fechaPago en Julio (actualizado hoy)

    const junioInicio = admin.firestore.Timestamp.fromDate(new Date(2026, 5, 1, 0, 0, 0))
    const junioFin = admin.firestore.Timestamp.fromDate(new Date(2026, 6, 1, 0, 0, 0))

    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('pagado', '==', true)
      .where('creadoEn', '>=', junioInicio)
      .where('creadoEn', '<', junioFin)
      .get()

    console.log(`📋 Encontrados ${snapshot.size} trámites de Junio que fueron pagados\n`)

    if (snapshot.empty) {
      console.log('⚠️  No hay trámites para corregir')
      process.exit(0)
    }

    // Filtrar solo los que tienen fechaPago en Julio (aproximadamente hoy)
    const aCorregir = snapshot.docs.filter(doc => {
      const t = doc.data()
      if (!t.fechaPago) return true // Si no tiene fechaPago, corregir

      const fp = t.fechaPago?.toDate?.()
      if (!fp) return true

      // Si fechaPago está en Julio, necesita corrección
      return fp.getMonth() === 6 // Julio es mes 6 (0-indexed)
    })

    console.log(`🔧 Necesitan corrección: ${aCorregir.length} trámites\n`)

    if (aCorregir.length === 0) {
      console.log('✅ Todos los trámites ya tienen la fecha correcta')
      process.exit(0)
    }

    let corregidas = 0
    let errores = 0

    for (const doc of aCorregir) {
      try {
        const tramite = doc.data()
        const creadoEn = tramite.creadoEn?.toDate?.() || new Date()

        // Asignar fechaPago como la fecha de creación
        console.log(`⏳ Corrigiendo ${tramite.numero}...`)
        console.log(`   Creado: ${creadoEn.toLocaleDateString('es-AR')}`)

        await doc.ref.update({
          fechaPago: admin.firestore.Timestamp.fromDate(creadoEn),
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        corregidas++
        console.log(`   ✅ Corregido\n`)
      } catch (e) {
        console.error(`   ❌ Error:`, e.message, '\n')
        errores++
      }
    }

    console.log('='.repeat(70))
    console.log('✅ CORRECCIÓN DE FECHAS COMPLETADA')
    console.log('='.repeat(70))
    console.log(`
📊 RESULTADOS:
   Trámites corregidos: ${corregidas}
   Errores:             ${errores}
    
🎉 Ahora:
1. Recarga GestorApp (F5)
2. Ve a Reportes → Junio 2026
3. Los números deberían ser correctos
4. Verifica Julio también
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

corregirFechasJunio()
