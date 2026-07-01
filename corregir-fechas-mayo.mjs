#!/usr/bin/env node

/**
 * CORREGIR FECHAPAGO - MOVER TRÁMITES DE JULIO A MAYO
 * ─────────────────────────────────────────────────────
 * Los trámites de Mayo que se pagaron tienen fechaPago en Julio
 * Este script los corrige a Mayo basándose en su creadoEn
 * 
 * Ejecutar: node corregir-fechas-mayo.mjs
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

async function corregirFechasMayo() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Buscando trámites con pagado=true pero fechaPago en Julio (creados en Mayo)...\n`)

  try {
    // Buscar trámites que:
    // 1. Están pagadas (pagado: true)
    // 2. Fueron creadas en Mayo (creadoEn entre 1 y 31 de mayo)

    const mayoInicio = admin.firestore.Timestamp.fromDate(new Date(2026, 4, 1, 0, 0, 0))
    const mayoFin = admin.firestore.Timestamp.fromDate(new Date(2026, 5, 1, 0, 0, 0))

    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('pagado', '==', true)
      .where('creadoEn', '>=', mayoInicio)
      .where('creadoEn', '<', mayoFin)
      .get()

    console.log(`📋 Encontrados ${snapshot.size} trámites de Mayo que fueron pagados\n`)

    if (snapshot.empty) {
      console.log('⚠️  No hay trámites de Mayo para corregir')
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
      console.log('✅ No hay trámites de Mayo con fechaPago en Julio')
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
    console.log('✅ CORRECCIÓN DE FECHAS (MAYO) COMPLETADA')
    console.log('='.repeat(70))
    console.log(`
📊 RESULTADOS:
   Trámites corregidos: ${corregidas}
   Errores:             ${errores}
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

corregirFechasMayo()
