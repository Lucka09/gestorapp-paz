#!/usr/bin/env node

/**
 * AUDITORÍA - VERIFICAR INTEGRIDAD DE FECHAS EN JUNIO
 * ─────────────────────────────────────────────────────
 * Lista TODOS los trámites pagados en Junio
 * Verifica que fueron creados en Junio (no en otro mes)
 * 
 * Ejecutar: node auditar-junio.mjs
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

async function auditarJunio() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n📊 AUDITORÍA - Verificando pagos de Junio 2026\n`)

  try {
    // Buscar TODOS los trámites con fechaPago en Junio
    const junioInicio = admin.firestore.Timestamp.fromDate(new Date(2026, 5, 1, 0, 0, 0))
    const junioFin = admin.firestore.Timestamp.fromDate(new Date(2026, 6, 1, 0, 0, 0))

    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('pagado', '==', true)
      .where('fechaPago', '>=', junioInicio)
      .where('fechaPago', '<', junioFin)
      .get()

    console.log(`📋 Encontrados ${snapshot.size} trámites pagados en Junio\n`)
    console.log(`=`.repeat(80))

    let correctos = 0
    let incorrectos = 0
    const erroresDetallados = []

    for (const doc of snapshot.docs) {
      const t = doc.data()
      const creadoEn = t.creadoEn?.toDate?.()
      const fechaPago = t.fechaPago?.toDate?.()

      const mesCreacion = creadoEn ? creadoEn.getMonth() : null
      const mesPago = fechaPago ? fechaPago.getMonth() : null

      const esIncorrecto = mesCreacion !== 5 // 5 = Junio (0-indexed)

      if (esIncorrecto) {
        incorrectos++
        const mesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio']
        erroresDetallados.push({
          numero: t.numero,
          tipo: t.tipo,
          creadoEn: creadoEn?.toLocaleDateString('es-AR'),
          fechaPago: fechaPago?.toLocaleDateString('es-AR'),
          mesCreacion: mesNombres[mesCreacion] || 'Desconocido',
        })
        console.log(`❌ ${t.numero}`)
        console.log(`   Tipo: ${t.tipo}`)
        console.log(`   Creado: ${creadoEn?.toLocaleDateString('es-AR')} (${mesNombres[mesCreacion]})`)
        console.log(`   Pagado: ${fechaPago?.toLocaleDateString('es-AR')} (Junio)`)
        console.log(`   Total: $${(t.totalCobradoCliente ?? 0).toLocaleString('es-AR')}`)
        console.log()
      } else {
        correctos++
      }
    }

    console.log(`=`.repeat(80))
    console.log(`
📊 RESUMEN DE AUDITORÍA:
   Total trámites pagados en Junio: ${snapshot.size}
   ✅ Correctos (creados en Junio): ${correctos}
   ❌ Incorrectos (creados en otro mes): ${incorrectos}
    `)

    if (incorrectos > 0) {
      console.log(`\n⚠️  TRÁMITES CON FECHAS INCONSISTENTES:\n`)
      let totalIncorrecto = 0
      for (const err of erroresDetallados) {
        const snap = await db.collection('tramites').where('numero', '==', err.numero).limit(1).get()
        if (!snap.empty) {
          const total = snap.docs[0].data().totalCobradoCliente ?? 0
          totalIncorrecto += total
        }
        console.log(`   ${err.numero} - Creado en ${err.mesCreacion}, monto $${total.toLocaleString('es-AR')}`)
      }
      console.log(`\n   Total de montos inconsistentes: $${totalIncorrecto.toLocaleString('es-AR')}`)
      console.log(`\n   ⚠️  Estos deberían estar en ${erroresDetallados[0]?.mesCreacion} en lugar de Junio`)
    } else {
      console.log(`✅ ¡PERFECTO! Todos los pagos de Junio son de trámites creados en Junio`)
    }

    console.log(`
🔍 PRÓXIMOS PASOS:
   1. Si hay incorrectos, necesitan ser movidos al mes correcto
   2. Luego verifica Reportes → Mayo, Junio, Julio
   3. Los números deberían cuadrar sin diferencias
    `)

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

auditarJunio()
