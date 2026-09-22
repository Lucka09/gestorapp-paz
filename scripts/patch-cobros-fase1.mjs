// scripts/patch-cobros-fase1.mjs
// ─── FASE 1 — LIBRO ÚNICO DE COBROS (escritores) ─────────────────────────────
// Criterio (confirmado por Matías): el ingreso se cuenta por FECHA DE COBRO.
// Todo pago que entra en septiembre es de septiembre, se cierre cuando se cierre.
//
// Qué hace, sobre TUS versiones actuales:
//   recibos.ts      → campo `fechaCobro` en todo recibo (default: ahora) +
//                     helper `resumirCobros()` (totales ya imputados por trámite)
//   tramites.ts     → registrarPago pasa la fecha elegida como `fechaCobro`
//   multa_types.ts  → RegistroPago: reciboId / numeroRecibo / comisionDestino
//   MultaWorwflow.ts:
//     • confirmarPaso2Multa emite UN RECIBO POR CADA PAGO nuevo del paso 2,
//       fechado cuando se registró (antes: no emitía ninguno) y ya no pisa
//       pagos previos si se reconfirma por rebote (mergea).
//     • agregarPagoMulta reenvía TODO el desglose al recibo (costoSUATS,
//       costoInformePersona, comisionDestino, encargadoId) y marca el pago
//       con su reciboId.
//     • Paso 7: el recibo de cierre imputa solo las deducciones que FALTAN
//       (SUATS / informe / comisión menos lo ya imputado en parciales). Si
//       sobra deducción sin saldo donde imputarla → alerta en alertas_sistema.
//
// Motor: reemplazos exactos (y por rango entre marcadores para funciones
// completas). Si una ancla no aparece exactamente 1 vez → aborta sin escribir.
// Idempotente por archivo. Uso:
//   node scripts/patch-cobros-fase1.mjs            (dry-run)
//   node scripts/patch-cobros-fase1.mjs --apply
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')

// ═══════════════════════════════════════════════════════════════════════════
// CÓDIGO NUEVO
// ═══════════════════════════════════════════════════════════════════════════

const RESUMIR_COBROS = `

// ─── RESUMEN DE LO YA COBRADO / IMPUTADO EN UN TRÁMITE ───────────────────────
// Base para que el recibo de cierre impute solo lo que falta (sin descontar dos
// veces un SUATS o una comisión que ya fue en un parcial).
export interface ResumenCobros {
  cobrado:             number   // suma de cobros (sin devoluciones)
  devuelto:            number   // suma (positiva) de devoluciones
  neto:                number   // cobrado − devuelto
  montoSUATS:          number
  costoSUATS:          number
  montoInformePersona: number
  costoInformePersona: number
  comisionReferido:    number
}

export function resumirCobros(recibos: Recibo[]): ResumenCobros {
  const r: ResumenCobros = {
    cobrado: 0, devuelto: 0, neto: 0,
    montoSUATS: 0, costoSUATS: 0,
    montoInformePersona: 0, costoInformePersona: 0,
    comisionReferido: 0,
  }
  for (const x of recibos) {
    const m = Number(x.monto ?? 0)
    if (m < 0 || x.tipo === 'devolucion') { r.devuelto += Math.abs(m); continue }
    r.cobrado             += m
    r.montoSUATS          += Number(x.montoSUATS ?? 0)
    r.costoSUATS          += Number(x.costoSUATS ?? 0)
    r.montoInformePersona += Number(x.montoInformePersona ?? 0)
    r.costoInformePersona += Number(x.costoInformePersona ?? 0)
    r.comisionReferido    += Number(x.comisionReferido ?? 0)
  }
  r.neto = r.cobrado - r.devuelto
  return r
}
`

const PASO2 = `export async function confirmarPaso2Multa(
  tramiteId: string,
  data: Omit<MultaPaso2Data, 'completadoEn'>,
): Promise<void> {
  // Merge con lo ya guardado: si se reconfirma (rebote), NO se pierden pagos
  // previos ni se duplican. Clave de un pago = registradoEn + monto.
  const snap    = await getDoc(workflowDoc(tramiteId))
  const previos = (snap.exists() ? (snap.data() as MultaWorkflow).paso2?.historialPagos : undefined) ?? []
  const claves  = new Set(previos.map(clavePago))
  const nuevos  = (data.historialPagos ?? []).filter(p => !claves.has(clavePago(p)))
  const historialPagos = [...previos, ...nuevos]
  const montoTotal     = historialPagos.reduce((s, p) => s + (p.monto ?? 0), 0)

  await updateDoc(workflowDoc(tramiteId), {
    paso2:          { ...data, historialPagos, montoTotal, completadoEn: Timestamp.now() },
    pasoActual:     3,
    estadoWorkflow: 'en_revision',
    actualizadoEn:  serverTimestamp(),
  })

  // Un recibo por cada pago NUEVO, fechado cuando se registró el pago.
  // (Los previos sin reciboId son históricos: los resuelve el script de
  //  reconciliación, no acá — podrían estar ya absorbidos en un cierre.)
  const marcas = new Map<string, { reciboId: string; numeroRecibo: string }>()
  let acumulado = previos.reduce((s, p) => s + (p.monto ?? 0), 0)
  for (const p of nuevos) {
    if (p.reciboId || !(p.monto > 0)) continue
    acumulado += p.monto
    try {
      marcas.set(clavePago(p), await emitirReciboPagoMulta(tramiteId, p, acumulado))
    } catch (e) {
      await alertarReciboFallido(tramiteId, p, e)
    }
  }
  if (marcas.size) {
    await marcarRecibosEnHistorial(tramiteId, marcas)
      .catch(e => console.error('[confirmarPaso2Multa] no se pudo marcar reciboId:', e))
  }
}

`

const PASO7_RECIBO = `  // 3. Recibo de CIERRE por el saldo + deducciones que falten imputar (best-effort).
  //    La suma de recibos del trámite = total cobrado, y cada deducción
  //    (SUATS / informe / comisión) queda imputada UNA sola vez.
  try {
    const tramiteSnap = await getDoc(doc(tramitesCol, tramiteId))
    if (tramiteSnap.exists()) {
      const tramite = tramiteSnap.data() as any
      const previos = resumirCobros(await getRecibosPorTramite(tramiteId))
      const montoCierre = Math.max(0, data.pagoTotalRecibo - previos.neto)

      const suatsTotal      = data.suatsAbonado ? (data.montoSUATS ?? 0) : 0
      const costoSuatsTotal = data.suatsAbonado ? (data.costoSUATS ?? 0) : 0
      const informeTotal    = data.informePersonaRealizado ? (data.montoInformePersona ?? 0) : 0
      const comisionTotal   = data.comisionReferido ?? 0

      const faltaSuats    = Math.max(0, suatsTotal      - previos.montoSUATS)
      const faltaCosto    = Math.max(0, costoSuatsTotal - previos.costoSUATS)
      const faltaInforme  = Math.max(0, informeTotal    - previos.montoInformePersona)
      const faltaComision = Math.max(0, comisionTotal   - previos.comisionReferido)

      let suatsImp = 0, informeImp = 0, comisionImp = 0

      if (montoCierre > 0) {
        suatsImp    = Math.min(faltaSuats,    montoCierre)
        informeImp  = Math.min(faltaInforme,  montoCierre - suatsImp)
        comisionImp = Math.min(faltaComision, montoCierre - suatsImp - informeImp)

        const numeroRecibo = await generarNumeroRecibo(gestoriaId)
        const reciboId = await crearRecibo({
          numeroRecibo,
          tramiteId,
          clienteId:    tramite.clienteId,
          gestoriaId,
          tipo:         'total',
          monto:        montoCierre,
          montoCobradoAcumulado: data.pagoTotalRecibo,
          honorariosTotales:     data.pagoTotalRecibo,
          formaPago,
          notas:        data.observacionFinal ?? '',
          patente:      tramite.patente,
          numeroTramite: tramite.numero,
          tipoTramite:  tramite.tipo,
          emitidoPor:       data.completadoPor,
          emitidoPorNombre: data.completadoPorNombre,
          atribuidoA:       tramite.atribuidoA       ?? data.completadoPor,
          atribuidoANombre: tramite.atribuidoANombre ?? data.completadoPorNombre,
          montoSUATS:          suatsImp,
          costoSUATS:          suatsImp > 0 ? faltaCosto : 0,
          montoInformePersona: informeImp,
          comisionReferido:    comisionImp,
          comisionDestino:     tramite.origenNombre ?? '',
          montoAcreditado:     data.montoAcreditado,
          cuotasTarjeta:       data.cuotasTarjeta,
          encargadoId:         tramite.encargadoId,
          encargadoNombre:     tramite.encargadoNombre,
          fechaCobro:          Timestamp.now(),
        })
        await notificarRecibo({
          gestoriaId, tramiteId, reciboId, numeroRecibo,
          monto: montoCierre, tipo: 'total', patente: tramite.patente,
        })
      }

      // Deducción sin saldo donde imputarla (ej: todo se cobró en parciales y
      // el SUATS recién se declara al cierre) → no se inventa un recibo en $0:
      // queda una alerta para ajustarlo a mano. Así el neto no queda inflado
      // en silencio.
      const sinImputar = (faltaSuats - suatsImp) + (faltaInforme - informeImp) + (faltaComision - comisionImp)
      if (sinImputar > 0) {
        await addDoc(collection(db, 'alertas_sistema'), {
          gestoriaId,
          tipo:        'deducciones_sin_recibo',
          titulo:      'Deducciones del cierre sin imputar',
          descripcion: \`\${tramite.numero ?? tramiteId} (\${tramite.patente ?? 's/patente'}): quedaron \` +
                       \`$\${sinImputar.toLocaleString('es-AR')} de SUATS/informe/comisión sin recibo \` +
                       \`porque todo el cobro ya estaba en recibos parciales.\`,
          tramiteId,
          monto:       sinImputar,
          detalle: {
            suats:    faltaSuats - suatsImp,
            informe:  faltaInforme - informeImp,
            comision: faltaComision - comisionImp,
          },
          estado:      'pendiente',
          prioridad:   'media',
          creadoEn:    serverTimestamp(),
        }).catch(e => console.error('[confirmarPaso7Multa] alerta deducciones:', e))
      }
    }
  } catch (e) {
    console.error('[confirmarPaso7Multa] No se pudo generar el recibo/alerta de cierre:', e)
  }

`

const AGREGAR_PAGO = `// ─── HELPERS DE COBRO DE MULTAS ──────────────────────────────────────────────

const FORMA_PAGO_METODO: Record<string, string> = {
  efectivo:      'efectivo',
  transferencia: 'transferencia',
  mercadopago:   'mercadopago',
  tarjeta:       'tarjeta',
  cheque:        'cheque',
  mixto:         'mixto',
}

// Identidad de un pago dentro de historialPagos (registradoEn es Timestamp.now()
// al momento de cargarlo → único en la práctica).
function clavePago(p: RegistroPago): string {
  const ms = (p.registradoEn as any)?.toMillis?.() ?? 0
  return \`\${ms}_\${p.monto}\`
}

// Emite el recibo PARCIAL de un pago de multa con TODO su desglose.
async function emitirReciboPagoMulta(
  tramiteId: string,
  pago:      RegistroPago,
  acumulado: number,
): Promise<{ reciboId: string; numeroRecibo: string }> {
  const snap = await getDoc(doc(tramitesCol, tramiteId))
  if (!snap.exists()) throw new Error('Trámite no encontrado')
  const t = snap.data() as any
  const gestoriaId = t.gestoriaId as string

  const mismoEncargado = !pago.encargadoId || pago.encargadoId === t.encargadoId
  const numeroRecibo = await generarNumeroRecibo(gestoriaId)
  const reciboId = await crearRecibo({
    numeroRecibo,
    tramiteId,
    clienteId:    t.clienteId,
    gestoriaId,
    tipo:         'parcial',
    monto:        pago.monto,
    montoSUATS:          pago.montoSUATS,
    costoSUATS:          pago.costoSUATS,
    montoInformePersona: pago.montoInformePersona,
    costoInformePersona: pago.costoInformePersona,
    comisionReferido:    pago.comisionReferido,
    comisionDestino:     pago.comisionDestino,
    montoAcreditado:     pago.montoAcreditado,
    cuotasTarjeta:       pago.cuotasTarjeta,
    encargadoId:         pago.encargadoId ?? t.encargadoId,
    encargadoNombre:     mismoEncargado ? t.encargadoNombre : pago.comisionDestino,
    montoCobradoAcumulado: acumulado,
    honorariosTotales:     acumulado,
    formaPago:    FORMA_PAGO_METODO[pago.metodoPago] ?? 'mixto',
    notas:        pago.nota ?? '',
    patente:      t.patente,
    numeroTramite: t.numero,
    tipoTramite:  t.tipo,
    emitidoPor:       pago.registradoPor,
    emitidoPorNombre: pago.registradoPorNombre,
    atribuidoA:       pago.registradoPor,
    atribuidoANombre: pago.registradoPorNombre,
    fechaCobro:       pago.registradoEn ?? Timestamp.now(),
  })
  await notificarRecibo({
    gestoriaId, tramiteId, reciboId, numeroRecibo,
    monto: pago.monto, tipo: 'parcial', patente: t.patente,
  }).catch(e => console.error('[emitirReciboPagoMulta] alerta:', e))
  return { reciboId, numeroRecibo }
}

// Escribe reciboId/numeroRecibo en los pagos del historial (reescritura del
// array — arrayUnion no puede modificar un elemento existente).
async function marcarRecibosEnHistorial(
  tramiteId: string,
  marcas:    Map<string, { reciboId: string; numeroRecibo: string }>,
): Promise<void> {
  const snap = await getDoc(workflowDoc(tramiteId))
  if (!snap.exists()) return
  const hist = (snap.data() as MultaWorkflow).paso2?.historialPagos ?? []
  const nuevo = hist.map(p => {
    const m = marcas.get(clavePago(p))
    return m && !p.reciboId ? { ...p, ...m } : p
  })
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': nuevo,
    actualizadoEn:          serverTimestamp(),
  } as any)
}

// El pago YA quedó registrado: no se revierte. El fallo se hace visible.
// Un pago sin reciboId en el historial = pendiente para el script de reconciliación.
async function alertarReciboFallido(tramiteId: string, pago: RegistroPago, e: unknown): Promise<void> {
  console.error('[cobro multa] recibo NO emitido:', e)
  try {
    const snap = await getDoc(doc(tramitesCol, tramiteId))
    const t = snap.exists() ? (snap.data() as any) : {}
    await addDoc(collection(db, 'alertas_sistema'), {
      gestoriaId:  t.gestoriaId ?? '',
      tipo:        'recibo_fallido',
      titulo:      'Pago sin comprobante',
      descripcion: \`Se cobró $\${pago.monto.toLocaleString('es-AR')} en \` +
                   \`\${t.numero ?? tramiteId} (\${t.patente ?? 's/patente'}) \` +
                   \`y no se pudo emitir el recibo.\`,
      tramiteId,
      monto:        pago.monto,
      registradoPor: pago.registradoPor ?? '',
      registradoPorNombre: pago.registradoPorNombre ?? '',
      error:       String((e as Error)?.message ?? e),
      estado:      'pendiente',
      prioridad:   'alta',
      creadoEn:    serverTimestamp(),
    })
  } catch (e2) {
    console.error('[cobro multa] tampoco se pudo crear la alerta:', e2)
  }
}

// ─── AGREGAR PAGO POST-PASO2 ─────────────────────────────────────────────────

export async function agregarPagoMulta(
  tramiteId:   string,
  pago:        RegistroPago,
  pagosPrevios: RegistroPago[],
): Promise<void> {
  const nuevoTotal = [...pagosPrevios, pago].reduce((s, p) => s + p.monto, 0)

  // 1. Escribir el pago en el workflow
  await updateDoc(workflowDoc(tramiteId), {
    'paso2.historialPagos': arrayUnion(pago),
    'paso2.montoTotal':     nuevoTotal,
    'paso2.pagoConfirmado': true,
    actualizadoEn:          serverTimestamp(),
  })

  // 2. Propagar el monto al trámite principal (caché; la verdad son los recibos)
  await updateDoc(doc(tramitesCol, tramiteId), {
    honorarios:          nuevoTotal,
    totalCobradoCliente: nuevoTotal,
    formaPago:           FORMA_PAGO_METODO[pago.metodoPago] ?? 'mixto',
    // pagado=false mientras no se complete el workflow — solo se marca true en paso7
    actualizadoEn: serverTimestamp(),
  })

  // 3. Recibo PARCIAL con todo el desglose + marcar el pago con su reciboId
  try {
    const r = await emitirReciboPagoMulta(tramiteId, pago, nuevoTotal)
    await marcarRecibosEnHistorial(tramiteId, new Map([[clavePago(pago), r]]))
      .catch(e => console.error('[agregarPagoMulta] no se pudo marcar reciboId:', e))
  } catch (e) {
    await alertarReciboFallido(tramiteId, pago, e)
  }
}

`

// ═══════════════════════════════════════════════════════════════════════════
// PARCHES
// ═══════════════════════════════════════════════════════════════════════════

const PATCHES = [
  {
    file: 'src/lib/firestore/recibos.ts',
    marker: 'export function resumirCobros',
    ops: [
      { find: `  type Timestamp, type Unsubscribe,`, repl: `  Timestamp, type Unsubscribe,` },
      { find: `  encargadoNombre?: string`,
        repl: `  encargadoNombre?: string\n  fechaCobro?:      Timestamp   // cuándo ENTRÓ la plata — base de todos los reportes por mes` },
      { find: `    netoGestoria, baseComisionable, costoFinanciero, margenSUATS,`,
        repl: `    netoGestoria, baseComisionable, costoFinanciero, margenSUATS,\n    // Criterio de caja: si el caller no la manda, el cobro es de hoy.\n    fechaCobro: data.fechaCobro ?? Timestamp.now(),` },
      { append: RESUMIR_COBROS },
    ],
  },
  {
    file: 'src/lib/firestore/tramites.ts',
    marker: 'fechaCobro:',
    ops: [
      { find: `    encargadoNombre:     tramite.encargadoNombre,`,
        repl: `    encargadoNombre:     tramite.encargadoNombre,\n    // Fecha que eligió el usuario en el formulario = fecha de cobro del recibo\n    fechaCobro:          Timestamp.fromDate(new Date(pago.fecha + 'T12:00:00')),` },
    ],
  },
  {
    file: 'src/types/multa_types.ts',
    marker: 'reciboId?:',
    ops: [
      { find: `encargadoId?:        string   // encargado que gestionó el cobro (si no fue propio)`,
        repl: `encargadoId?:        string   // encargado que gestionó el cobro (si no fue propio)\n  comisionDestino?:    string   // a quién va la comisión (nombre)\n  reciboId?:           string   // recibo emitido por este pago (vacío = pendiente de reconciliar)\n  numeroRecibo?:       string` },
    ],
  },
  {
    file: 'src/lib/firestore/MultaWorwflow.ts',
    marker: 'async function emitirReciboPagoMulta',
    ops: [
      { find: `import { crearRecibo, generarNumeroRecibo, getRecibosPorTramite } from '@/lib/firestore/recibos'`,
        repl: `import { crearRecibo, generarNumeroRecibo, getRecibosPorTramite, resumirCobros } from '@/lib/firestore/recibos'` },
      { range: [`export async function confirmarPaso2Multa(`, `// ─── PASO 3: Pre-revisión Admin`], repl: PASO2 },
      { range: [`  // 3. Recibo TOTAL de cierre + alerta al propietario (best-effort).`, `  // 4. Marcar como entregado`], repl: PASO7_RECIBO },
      { range: [`// ─── AGREGAR PAGO POST-PASO2`, `export async function sincronizarPagoMultaAlTramite(`], repl: AGREGAR_PAGO },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR
// ═══════════════════════════════════════════════════════════════════════════
const contar = (s, sub) => s.split(sub).length - 1
const resultados = []
let errores = 0

for (const p of PATCHES) {
  if (!fs.existsSync(p.file)) { console.error(`✗ No existe ${p.file}`); errores++; continue }
  const raw  = fs.readFileSync(p.file, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')
  if (s.includes(p.marker)) { console.log(`• ${p.file}: ya parcheado — se saltea`); continue }

  let ok = true
  for (const [i, op] of p.ops.entries()) {
    if (op.append) { s = s.replace(/\s*$/, '\n') + op.append.replace(/^\n+/, '\n'); continue }
    if (op.range) {
      const [ini, fin] = op.range
      if (contar(s, ini) !== 1) { console.error(`✗ ${p.file} — inicio de rango #${i + 1} aparece ${contar(s, ini)} veces: ${ini.trim()}`); ok = false; break }
      const a = s.indexOf(ini)
      const b = s.indexOf(fin, a + ini.length)
      if (b < 0) { console.error(`✗ ${p.file} — fin de rango #${i + 1} no encontrado después del inicio: ${fin.trim()}`); ok = false; break }
      s = s.slice(0, a) + op.repl + s.slice(b)
      continue
    }
    const n = contar(s, op.find)
    if (n !== 1) { console.error(`✗ ${p.file} — ancla #${i + 1} aparece ${n} veces (se esperaba 1): ${op.find.split('\n')[0].trim()}`); ok = false; break }
    s = s.replace(op.find, () => op.repl)
  }
  if (!ok) { errores++; continue }
  resultados.push({ file: p.file, out: crlf ? s.replace(/\n/g, '\r\n') : s })
  console.log(`✓ ${p.file}: ${p.ops.length} cambios listos`)
}

if (errores) { console.error(`\n${errores} error(es). No se escribió NINGÚN archivo.`); process.exit(1) }
if (!APPLY)  { console.log('\nDry-run OK. Corré con --apply para escribir.'); process.exit(0) }
for (const r of resultados) fs.writeFileSync(r.file, r.out, 'utf8')
console.log(`\n✔ ${resultados.length} archivo(s) escritos.`)
