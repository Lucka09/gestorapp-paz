#!/usr/bin/env node

/**
 * CORREGIR TRÁMITES DE MAYO - MOVERLOS DE JUNIO A MAYO
 * ─────────────────────────────────────────────────────
 * Los 9 trámites que se crearon en Mayo pero tienen fechaPago en Junio
 * deben tener su fechaPago corregida a Mayo
 * 
 * Ejecutar: node mover-mayo-a-mayo.mjs
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

async function moverMayoAMayo() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Buscando trámites creados en Mayo pero con fechaPago en Junio...\n`)

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

    console.log(`📋 Encontrados ${snapshot.size} trámites de Mayo\n`)

    // Filtrar solo los que tienen fechaPago en Junio
    const aCorregir = snapshot.docs.filter(doc => {
      const t = doc.data()
      const fp = t.fechaPago?.toDate?.()
      if (!fp) return false
      // Si fechaPago está en Junio, necesita corrección
      return fp.getMonth() === 5 // Junio es mes 5 (0-indexed)
    })

    console.log(`🔧 Necesitan corrección: ${aCorregir.length} trámites\n`)

    if (aCorregir.length === 0) {
      console.log('✅ No hay trámites de Mayo con fechaPago en Junio')
      process.exit(0)
    }

    let corregidas = 0
    let errores = 0
    let totalMovido = 0

    console.log(`Detalle de trámites a corregir:`)
    console.log(`=`.repeat(70))

    for (const doc of aCorregir) {
      try {
        const tramite = doc.data()
        const creadoEn = tramite.creadoEn?.toDate?.()
        const fechaPagoActual = tramite.fechaPago?.toDate?.()
        const total = tramite.totalCobradoCliente ?? 0

        console.log(`⏳ Corrigiendo ${tramite.numero}...`)
        console.log(`   Creado: ${creadoEn?.toLocaleDateString('es-AR')}`)
        console.log(`   Pagado actual (Junio): ${fechaPagoActual?.toLocaleDateString('es-AR')}`)
        console.log(`   Corrección: → ${creadoEn?.toLocaleDateString('es-AR')} (Mayo)`)
        console.log(`   Monto: $${total.toLocaleString('es-AR')}`)

        // Asignar fechaPago como la fecha de creación (Mayo)
        await doc.ref.update({
          fechaPago: admin.firestore.Timestamp.fromDate(creadoEn),
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        corregidas++
        totalMovido += total
        console.log(`   ✅ Corregido\n`)
      } catch (e) {
        console.error(`   ❌ Error:`, e.message, '\n')
        errores++
      }
    }

    console.log(`=`.repeat(70))
    console.log(`
✅ CORRECCIÓN COMPLETADA
================================================================================

📊 RESULTADOS:
   Trámites movidos de Junio a Mayo: ${corregidas}
   Total movido: $${totalMovido.toLocaleString('es-AR')}
   Errores: ${errores}
    
🎉 Ahora:
1. Recarga GestorApp (F5)
2. Ve a Reportes → Mayo 2026 (debería aumentar ~$7.7 millones)
3. Ve a Reportes → Junio 2026 (debería bajar ~$7.7 millones)
4. Ve a Reportes → Julio 2026 (debería estar vacío)
5. Los números deberían cuadrar perfectamente ✅
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

moverMayoAMayo()
