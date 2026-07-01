#!/usr/bin/env node

/**
 * SINCRONIZAR MULTAS INCOMPLETAS - VERSIÓN CORREGIDA
 * ─────────────────────────────────────────────────────────────
 * Ahora guarda el MONTO CORRECTO de SUATS ($16.000 si lo requiere)
 * 
 * Ejecutar: node sincronizar-multas-v2.mjs
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

async function sincronizarMultasV2() {
  const gestoriaId = 'gestoria-paz'

  console.log(`\n🔍 Sincronizando multas (V2 - Con SUATS correcto) de ${gestoriaId}...\n`)

  try {
    // Buscar multas entregadas pero sin campos de SUATS correctos
    const snapshot = await db
      .collection('tramites')
      .where('gestoriaId', '==', gestoriaId)
      .where('tipo', '==', 'descargo_multa')
      .where('estado', '==', 'entregado')
      .get()

    console.log(`📋 Encontradas ${snapshot.size} multas entregadas\n`)

    let actualizadas = 0
    let errores = 0
    const resultados = []

    // Procesar cada documento
    for (const doc of snapshot.docs) {
      try {
        const tramite = doc.data()
        
        // Si ya está pagado Y tiene SUATS correcto, saltar
        if (tramite.pagado && tramite.costosSUATS !== undefined && tramite.costosSUATS > 0) {
          console.log(`⏭️  ${tramite.numero} - Ya está sincronizado correctamente, saltando`)
          continue
        }

        const totalCobrado = tramite.totalCobradoCliente ?? tramite.honorarios ?? 0

        // CLAVE: Leer paso1 del workflow para saber si requiere SUATS
        const workflowSnap = await db
          .collection('multaWorkflow')
          .doc(doc.id)
          .get()

        const workflow = workflowSnap.data()
        const requiereSUATS = workflow?.paso1?.requiereSUATS ?? false
        
        // Si requiere SUATS, el monto es $16.000 (standard en Argentina)
        const montoSUATS = requiereSUATS ? 16000 : 0

        console.log(`⏳ Actualizando ${tramite.numero}...`)
        console.log(`   Total cobrado: $${totalCobrado.toLocaleString('es-AR')}`)
        console.log(`   Requiere SUATS: ${requiereSUATS ? 'SÍ ($16.000)' : 'NO'}`)

        await doc.ref.update({
          pagado: true,
          fechaPago: tramite.fechaPago || admin.firestore.FieldValue.serverTimestamp(),
          costosSUATS: montoSUATS,  // ← Ahora el monto CORRECTO
          costosInformePersona: tramite.costosInformePersona ?? 0,
          totalCobradoCliente: totalCobrado,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })

        actualizadas++
        console.log(`   ✅ ${tramite.numero} actualizado correctamente\n`)
        resultados.push({
          numero: tramite.numero,
          totalCobrado,
          suats: montoSUATS,
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
    console.log('✅ SINCRONIZACIÓN V2 COMPLETADA')
    console.log('='.repeat(60))
    
    const totalSUATS = resultados
      .filter(r => r.estado === 'éxito')
      .reduce((sum, r) => sum + (r.suats ?? 0), 0)
    
    console.log(`
📊 RESULTADOS:
   Total multas:      ${snapshot.size}
   Actualizadas:      ${actualizadas}
   Errores:           ${errores}
   Total SUATS:       $${totalSUATS.toLocaleString('es-AR')}
    
Multas sincronizadas:
${resultados
  .filter(r => r.estado === 'éxito')
  .map(r => `   ✅ ${r.numero} - Total: $${r.totalCobrado.toLocaleString('es-AR')} | SUATS: $${r.suats.toLocaleString('es-AR')}`)
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
      '\n✅ Ahora:\n1. Recarga la página (F5)\n2. Ve a Reportes → Junio 2026\n3. SUATS debería aparecer ahora\n'
    )

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  }
}

// Ejecutar
sincronizarMultasV2()
