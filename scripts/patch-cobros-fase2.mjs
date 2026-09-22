// scripts/patch-cobros-fase2.mjs
// ─── FASE 2 — LECTORES: todas las pantallas leen el MISMO libro ──────────────
// Criterio: ingreso = recibos por FECHA DE COBRO (fechaCobro; si un recibo viejo
// no la tiene, se usa creadoEn). Agrega sobre tu código, no reescribe archivos.
//
//   finanzas.ts        → fechaDeRecibo(); getDesglose / PorSecretario filtran por ella
//   metricasEquipo.ts  → scorecard, resumen y totales por fechaCobro; neto con la
//                        MISMA fórmula que finanzas (antes tenía una propia)
//   dashboard.ts       → ingresos hoy/semana/mes, evolución 6 meses, tipos y top
//                        clientes desde recibos (fallback al cálculo viejo si fallan)
//   reporteMensual.ts  → el PDF usa el desglose de recibos del mes y del anterior
//   ReportesPage.tsx   → formas de pago, tipos, SUATS/informe y PDF desde recibos;
//                        el desglose muestra COSTOS (cuadra con el neto)
//   CobranzasPage.tsx  → "Cobrado total" = recibos del período; "Pendiente" =
//                        saldo real; "Desmarcar" bloqueado si hay recibos
//   useCierreMensual   → totalCobrado del cierre = recibos del mes
//   usePremios         → facturación de multas = cobros del mes sobre sus multas
//
// Uso:  node scripts/patch-cobros-fase2.mjs [--apply]
// Aborta sin escribir NADA si una ancla no aparece como se espera. Idempotente.
import fs from 'node:fs'
const APPLY = process.argv.includes('--apply')

// ═══════════════════════════════════════════════════════════════════════════
const P = []

// ── finanzas.ts ─────────────────────────────────────────────────────────────
P.push({
  files: ['src/lib/firestore/finanzas.ts'],
  marker: 'export function fechaDeRecibo',
  ops: [
    { find: 'export async function cargarRecibos(',
      repl: `/**
 * Fecha contable de un recibo: cuándo ENTRÓ la plata. Los recibos anteriores a
 * la fase 1 no tienen fechaCobro → se usa creadoEn (antes se contaba así).
 */
export function fechaDeRecibo(r: any): any {
  return r?.fechaCobro ?? r?.creadoEn
}

export async function cargarRecibos(` },
    { find: '    if (!enRango(r.creadoEn, desde, hasta)) continue', all: 2,
      repl: '    if (!enRango(fechaDeRecibo(r), desde, hasta)) continue' },
  ],
})

// ── metricasEquipo.ts ───────────────────────────────────────────────────────
P.push({
  files: ['src/lib/firestore/metricasEquipo.ts'],
  marker: 'fechaDeRecibo',
  ops: [
    { find: "import { db } from '@/lib/firebase'",
      repl: "import { db } from '@/lib/firebase'\nimport { fechaDeRecibo, netoDeRecibo as netoDeReciboFinanzas } from './finanzas'" },
    { range: ['function netoDeRecibo(r: any): number {', '/** Quién se lleva el crédito del ingreso. */'],
      repl: `function netoDeRecibo(r: any): number {
  // Misma fórmula que Reportes y Panel (finanzas.ts): una sola fuente de verdad.
  return netoDeReciboFinanzas(r)
}

` },
    { find: '    if (!enRango(r.creadoEn, desde, hasta)) return', all: 2,
      repl: '    if (!enRango(fechaDeRecibo(r), desde, hasta)) return' },
    { find: '    const fecha = r.creadoEn?.toDate?.() as Date | undefined',
      repl: '    const fecha = fechaDeRecibo(r)?.toDate?.() as Date | undefined' },
  ],
})

// ── dashboard.ts ────────────────────────────────────────────────────────────
const DASH_HELPERS = `
// ─── HELPERS DE RECIBOS (libro único de cobros) ──────────────────────────────
// Devoluciones restan, se hayan guardado con monto negativo o positivo.
function montoConSigno(r: any): number {
  const m = Number(r?.monto) || 0
  return (r?.tipo === 'devolucion' || m < 0) ? -Math.abs(m) : m
}

function sumarRecibosPor(
  recibos: any[],
  clave:   (r: any) => string | undefined,
  desde?:  Date,
  hasta?:  Date,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of recibos) {
    if (desde || hasta) {
      const f = fechaDeRecibo(r)?.toDate?.() as Date | undefined
      if (!f) continue
      if (desde && f < desde) continue
      if (hasta && f > hasta) continue
    }
    const k = clave(r)
    if (!k) continue
    out[k] = (out[k] ?? 0) + montoConSigno(r)
  }
  return out
}
`

P.push({
  files: ['src/lib/firestore/dashboard.ts'],
  marker: 'fechaDeRecibo',
  ops: [
    { find: "import type { Tramite, Turno } from '@/types'",
      repl: "import type { Tramite, Turno } from '@/types'\nimport { cargarRecibos, getDesglose, fechaDeRecibo } from './finanzas'\n" + DASH_HELPERS },
    { range: ['  const ingresosMes = snapPagados', '    tramitesHoy, tramitesPendientes, tramitesActivos,'],
      repl: `  // Ingresos = recibos por FECHA DE COBRO (misma fuente que Reportes y
  // Cobranzas). Si la carga de recibos falla, cae al cálculo anterior.
  let ingresosHoy = 0, ingresosSemana = 0, ingresosMes = 0
  try {
    const recibos = await cargarRecibos(gestoriaId)
    const ahora   = new Date()
    ingresosMes    = (await getDesglose(gestoriaId, mesInicio,    ahora,  recibos)).cobradoNeto
    ingresosSemana = (await getDesglose(gestoriaId, semanaInicio, ahora,  recibos)).cobradoNeto
    ingresosHoy    = (await getDesglose(gestoriaId, hoyInicio,    hoyFin, recibos)).cobradoNeto
  } catch (e) {
    console.error('[getMetricas] falló "ingresos (recibos)":', e)
    errores.push('ingresos')
    ingresosMes = snapPagados?.docs.reduce(
      (a, d) => a + (d.data().totalCobradoCliente ?? d.data().honorarios ?? 0), 0) ?? 0
  }

  return {
` },
    { range: ['export async function getIngresosPorMes(', '// ─── TIPOS AUXILIARES'],
      repl: `export async function getIngresosPorMes(gestoriaId: string, _meses = 6): Promise<IngresoMes[]> {
  // Recibos por FECHA DE COBRO. \`tramites\` = trámites distintos con cobro en el mes.
  const desde = new Date(); desde.setMonth(desde.getMonth() - 6); desde.setDate(1); desde.setHours(0, 0, 0, 0)
  const recibos = await cargarRecibos(gestoriaId)
  const nm = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const meses: Record<string, { mes: string; ingresos: number; ids: Set<string> }> = {}
  for (const r of recibos) {
    const f = fechaDeRecibo(r)?.toDate?.() as Date | undefined
    if (!f || f < desde) continue
    const key = \`\${f.getFullYear()}-\${String(f.getMonth()).padStart(2, '0')}\`
    meses[key] ??= { mes: nm[f.getMonth()], ingresos: 0, ids: new Set<string>() }
    const m = montoConSigno(r)
    meses[key].ingresos += m
    if (m > 0 && r.tramiteId) meses[key].ids.add(String(r.tramiteId))
  }
  return Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ mes: v.mes, ingresos: v.ingresos, tramites: v.ids.size }))
}

` },
    { range: ['export async function getTiposTramiteFrecuentes(', '// ─── TOP CLIENTES POR TRÁMITES'],
      repl: `export async function getTiposTramiteFrecuentes(
  gestoriaId: string,
  desde?:     Date,
  hasta?:     Date,
): Promise<TipoCount[]> {
  const snap = await getDocs(query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    limit(500),
  ))
  const conteo: Record<string, number> = {}
  snap.docs.forEach(d => {
    const tipo = d.data().tipo as string
    conteo[tipo] = (conteo[tipo] ?? 0) + 1
  })
  // Ingresos por tipo = recibos (por fecha de cobro si se pasa rango).
  const conteoIngresos = sumarRecibosPor(
    await cargarRecibos(gestoriaId), r => r.tipoTramite ? String(r.tipoTramite) : undefined, desde, hasta,
  )
  const labels: Record<string, string> = {
    transferencia: 'Transferencia', inscripcion_inicial: 'Inscripción Inicial',
    baja: 'Baja', formulario_08: 'Form. 08', duplicado_titulo: 'Dup. Título',
    duplicado_cedula: 'Dup. Cédula', cambio_radicacion: 'Cambio Radicación',
    informe_dominio: 'Informe Dominio', certificado_dominio: 'Cert. Dominio',
    prenda: 'Prenda', descargo_multa: 'Revisión de Multas', vtv: 'VTV',
    inhibicion: 'Inhibición', levantamiento_inhibicion: 'Lev. Inhibición',
  }
  return Object.entries(conteo)
    .map(([tipo, cantidad]) => ({ tipo, label: labels[tipo] ?? tipo, cantidad, ingresos: conteoIngresos[tipo] ?? 0 }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)
}

` },
    { range: ['export async function getTopClientes(', '// ─── ORIGEN DE CLIENTES'],
      repl: `export async function getTopClientes(
  gestoriaId: string,
  cantidad = 5,
  desde?:  Date,
  hasta?:  Date,
): Promise<TopCliente[]> {
  const snap = await getDocs(query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    limit(500),
  ))
  const conteo: Record<string, number> = {}
  snap.docs.forEach(d => {
    const cid = d.data().clienteId as string
    if (cid) conteo[cid] = (conteo[cid] ?? 0) + 1
  })
  // Ingresos por cliente = recibos (por fecha de cobro si se pasa rango).
  const ingresosPorCliente = sumarRecibosPor(
    await cargarRecibos(gestoriaId), r => r.clienteId ? String(r.clienteId) : undefined, desde, hasta,
  )
  const top = Object.entries(conteo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, cantidad)

  // Resolver nombres reales en paralelo (solo \`cantidad\` lecturas extra)
  const clienteSnaps = await Promise.all(
    top.map(([clienteId]) => getDoc(doc(clientesCol, clienteId)).catch(() => null))
  )

  return top.map(([clienteId, tramites], i) => {
    const data = clienteSnaps[i]?.data() as { nombre?: string; apellido?: string; razonSocial?: string } | undefined
    const nombre = data
      ? (data.razonSocial ?? (\`\${data.nombre ?? ''} \${data.apellido ?? ''}\`.trim() || clienteId))
      : clienteId
    return {
      clienteId,
      nombre,
      tramites,
      ingresos: ingresosPorCliente[clienteId] ?? 0,
    }
  })
}

` },
  ],
})

// ── reporteMensual.ts (PDF) ─────────────────────────────────────────────────
P.push({
  files: ['src/utils/reporteMensual.ts'],
  marker: 'finanzasMes',
  ops: [
    { find: "import type { IngresoMes, TipoCount, TopCliente } from '@/lib/firestore/dashboard'",
      repl: "import type { IngresoMes, TipoCount, TopCliente } from '@/lib/firestore/dashboard'\nimport type { DesgloseFinanciero } from '@/lib/firestore/finanzas'" },
    { find: '  totalSUATSMes?: number',
      repl: '  finanzasMes?:         DesgloseFinanciero   // recibos del mes (fecha de cobro)\n  finanzasMesAnterior?: DesgloseFinanciero\n  totalSUATSMes?: number' },
    { find: '  const ingresosTotalMes = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)',
      repl: '  const ingresosTotalMes = datos.finanzasMes\n    ? datos.finanzasMes.cobradoNeto\n    : cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)' },
    { find: '  const ingresosAnt = cobradosAnt.reduce((a, t) => a + (t.honorarios ?? 0), 0)',
      repl: '  const ingresosAnt = datos.finanzasMesAnterior\n    ? datos.finanzasMesAnterior.cobradoNeto\n    : cobradosAnt.reduce((a, t) => a + (t.honorarios ?? 0), 0)' },
    { find: '  const totalCobrado    = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)',
      repl: '  const totalCobrado    = datos.finanzasMes\n    ? datos.finanzasMes.cobradoNeto\n    : cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)' },
    { find: "    ['Pendiente de cobro',",
      repl: "    ...(datos.finanzasMes ? [['Honorarios gestoría (neto)', fp(datos.finanzasMes.netoGestoria), NARANJA]] : []),\n    ['Pendiente de cobro'," },
  ],
})

// ── ReportesPage.tsx ────────────────────────────────────────────────────────
P.push({
  files: ['src/features/reportes/ReportesPage.tsx', 'src/features/ReportesPage.tsx', 'src/pages/ReportesPage.tsx'],
  marker: 'recibosMes',
  ops: [
    { find: "import { useState, useMemo } from 'react'",
      repl: "import { useState, useMemo, useEffect } from 'react'" },
    { find: "import { useFinanzas } from '@/hooks/useFinanzas'",
      repl: "import { useFinanzas } from '@/hooks/useFinanzas'\nimport { cargarRecibos, getDesglose, fechaDeRecibo } from '@/lib/firestore/finanzas'" },
    { find: '  const [verHistorial, setVerHistorial] = useState(false)',
      repl: `  const [verHistorial, setVerHistorial] = useState(false)

  // Recibos (libro único de cobros): se cargan una vez y alimentan tipos y el
  // PDF, filtrando por FECHA DE COBRO. Mismo dato que Panel y Cobranzas.
  const [recibos, setRecibos] = useState<any[]>([])
  useEffect(() => {
    if (!gestoriaId) return
    let vivo = true
    cargarRecibos(gestoriaId)
      .then(r => { if (vivo) setRecibos(r) })
      .catch(e => console.error('[Reportes] recibos:', e))
    return () => { vivo = false }
  }, [gestoriaId])` },
    { find: '  const pag = usePaginacion(tramitesMes, { porPagina: 20 })',
      repl: `  const pag = usePaginacion(tramitesMes, { porPagina: 20 })

  const recibosMes = useMemo(() => recibos.filter(r => {
    const f = fechaDeRecibo(r)?.toDate?.() as Date | undefined
    return !!f && f >= inicioMes && f <= finMes
  }), [recibos, inicioMes, finMes])` },
    { range: ['  // Top tipos del mes', '  // ─── Desglose real por forma de pago'],
      repl: `  // Top tipos del mes — cantidad = trámites creados en el mes;
  // ingresos = recibos cobrados en el mes de ese tipo (fecha de cobro).
  const porTipo = useMemo(() => {
    const conteo: Record<string, { n: number; ingresos: number }> = {}
    tramitesMes.forEach(t => {
      if (!conteo[t.tipo]) conteo[t.tipo] = { n: 0, ingresos: 0 }
      conteo[t.tipo].n++
    })
    recibosMes.forEach(r => {
      const tipo = String(r.tipoTramite ?? '')
      if (!tipo) return
      if (!conteo[tipo]) conteo[tipo] = { n: 0, ingresos: 0 }
      const m = Number(r.monto) || 0
      conteo[tipo].ingresos += (r.tipo === 'devolucion' || m < 0) ? -Math.abs(m) : m
    })
    return Object.entries(conteo)
      .map(([tipo, d]) => ({ tipo, label: (TIPO_TRAMITE_LABELS as any)[tipo] ?? tipo, ...d }))
      .sort((a, b) => b.n - a.n || b.ingresos - a.ingresos)
      .slice(0, 6)
  }, [tramitesMes, recibosMes])

` },
    { range: ['  const porFormaPago = useMemo(() => {', '  // Total SUATS del mes'],
      repl: `  const porFormaPago = useMemo(() => {
    // Desde los recibos del período (fecha de cobro) — cuadra con "Total ingresado".
    const conteo: Record<string, number> = gestoria?.porFormaPago ?? {}
    return Object.entries(conteo)
      .map(([forma, monto]) => ({
        forma,
        monto,
        meta: FORMA_PAGO_META[forma] ?? { label: forma, color: '#9CA3AF' },
      }))
      .filter(f => f.monto > 0)
      .sort((a, b) => b.monto - a.monto)
  }, [gestoria])

` },
    { range: ['  // Total SUATS del mes', '  const handleGenerar = async () => {'],
      repl: `  // SUATS e informe de persona del mes — desde los recibos (fecha de cobro).
  // Precio = lo cobrado al cliente; costo = lo que realmente sale de la gestoría.
  const suatsMes         = gestoria?.suatsCobrado ?? 0
  const suatsCostoMes    = gestoria?.suatsCosto   ?? 0
  const informesCostoMes = gestoria?.informeCosto ?? 0
` },
    { find: '        getTiposTramiteFrecuentes(gestoriaId),',
      repl: '        getTiposTramiteFrecuentes(gestoriaId, inicioMes, finMes),' },
    { find: '        getTopClientes(gestoriaId, 8),',
      repl: '        getTopClientes(gestoriaId, 8, inicioMes, finMes),' },
    { find: '      const totalSUATSMes = suatsMes',
      repl: `      const totalSUATSMes = suatsMes
      const inicioAnt = new Date(anio, mes - 1, 1)
      const finAnt    = new Date(anio, mes, 0, 23, 59, 59)
      const precarga  = recibos.length ? recibos : undefined
      const [finanzasMes, finanzasMesAnterior] = await Promise.all([
        getDesglose(gestoriaId, inicioMes, finMes, precarga),
        getDesglose(gestoriaId, inicioAnt, finAnt, precarga),
      ])` },
    { find: '        totalSUATSMes,',
      repl: '        totalSUATSMes,\n        finanzasMes,\n        finanzasMesAnterior,' },
    { find: '<span className="text-sm text-gray-600">SUATS abonado</span>',
      repl: '<span className="text-sm text-gray-600">Costo SUATS</span>' },
    { find: '−{formatPesos(suatsMes || 0)}',
      repl: '−{formatPesos(suatsCostoMes)}' },
    { find: '<span className="text-sm text-gray-600">Informe persona</span>',
      repl: '<span className="text-sm text-gray-600">Costo informe persona</span>' },
    { find: '−{formatPesos(informesPersonaMes || 0)}',
      repl: '−{formatPesos(informesCostoMes)}' },
    { find: '<div className="flex justify-between items-center py-3 bg-emerald-50 px-3 rounded-lg">',
      repl: `{gestoria.deducComision > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Comisiones a referidos</span>
                      <span className="font-bold text-red-600">−{formatPesos(gestoria.deducComision)}</span>
                    </div>
                  )}
                  {gestoria.deducFinanciero > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Costo financiero (tarjeta)</span>
                      <span className="font-bold text-red-600">−{formatPesos(gestoria.deducFinanciero)}</span>
                    </div>
                  )}
                  {gestoria.devoluciones > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Devoluciones</span>
                      <span className="font-bold text-red-600">−{formatPesos(gestoria.devoluciones)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-3 bg-emerald-50 px-3 rounded-lg">` },
  ],
})

// ── CobranzasPage.tsx ───────────────────────────────────────────────────────
P.push({
  files: ['src/features/cobranzas/CobranzasPage.tsx'],
  marker: 'cobradoRecibos',
  ops: [
    { find: "import { useState, useMemo } from 'react'",
      repl: "import { useState, useMemo, useEffect } from 'react'" },
    { find: "import { adjuntarARecibo } from '@/lib/firestore/comprobantes'",
      repl: "import { adjuntarARecibo } from '@/lib/firestore/comprobantes'\nimport { cargarRecibos, getDesglose } from '@/lib/firestore/finanzas'" },
    { find: '  const [confirmDesm,  setConfirmDesm]  = useState<string | null>(null)',
      repl: `  const [confirmDesm,  setConfirmDesm]  = useState<string | null>(null)

  // "Cobrado total" = recibos con FECHA DE COBRO en el período (todas las
  // áreas, multas incluidas) — el mismo número que Reportes y el Panel.
  // Se recarga al cerrar el modal de cobro para reflejar el pago recién hecho.
  const gestoriaIdCob = useGestoriaId()
  const [cobradoRecibos, setCobradoRecibos] = useState<{ total: number; recibos: number } | null>(null)
  useEffect(() => {
    if (!gestoriaIdCob) return
    let vivo = true
    ;(async () => {
      try {
        const recibos = await cargarRecibos(gestoriaIdCob)
        const d = await getDesglose(gestoriaIdCob, periodoInicio ?? new Date(2000, 0, 1), new Date(), recibos)
        if (vivo) setCobradoRecibos({ total: d.cobradoNeto, recibos: d.recibos })
      } catch (e) {
        console.error('[Cobranzas] recibos:', e)
        if (vivo) setCobradoRecibos(null)
      }
    })()
    return () => { vivo = false }
  }, [gestoriaIdCob, periodoInicio, modalPago])` },
    { find: '    const totalPend  = pendientes.reduce((a, t) => a + t.honorarios, 0)',
      repl: `    // Saldo real: honorarios menos lo ya cobrado en parciales.
    const totalPend  = pendientes.reduce(
      (a, t) => a + Math.max(0, t.honorarios - Number((t as any).montoCobrado ?? 0)), 0)` },
    { find: '      totalPend, totalCob,',
      repl: '      totalPend, totalCob,\n      totalFacturado: todos.reduce((a, t) => a + t.honorarios, 0),' },
    { find: '            value: formatPesos(kpis.totalCob),',
      repl: '            value: formatPesos(cobradoRecibos?.total ?? kpis.totalCob),' },
    { find: "            sub:   `${kpis.cobrados} pagado${kpis.cobrados !== 1 ? 's' : ''} · ${PERIODO_LABELS[periodo]}`,",
      repl: "            sub:   cobradoRecibos\n              ? `${cobradoRecibos.recibos} recibo${cobradoRecibos.recibos !== 1 ? 's' : ''} · ${PERIODO_LABELS[periodo]}`\n              : `${kpis.cobrados} pagado${kpis.cobrados !== 1 ? 's' : ''} · ${PERIODO_LABELS[periodo]}`," },
    { find: '            value: formatPesos(kpis.totalPend + kpis.totalCob),',
      repl: '            value: formatPesos(kpis.totalFacturado),' },
    { find: '  const handleDesmarcar = async (id: string) => {',
      repl: `  const handleDesmarcar = async (id: string) => {
    // Con recibos emitidos, "desmarcar" dejaría el trámite en $0 mientras los
    // reportes siguen contando esa plata. Se revierte con una devolución.
    const tr = tramites.find(x => x.id === id) as any
    const tieneRecibos = Number(tr?.montoRecibidoAcumulado ?? 0) > 0
      || (tr?.historialPagos ?? []).some((p: any) => !!p?.reciboId)
    if (tieneRecibos) {
      toast.error(
        'Este trámite tiene recibos emitidos. Para revertir un cobro registrá una devolución desde el detalle del trámite: así queda reflejado en los reportes.',
        { duration: 7000 },
      )
      setConfirmDesm(null)
      return
    }` },
  ],
})

// ── useCierreMensual.ts ─────────────────────────────────────────────────────
P.push({
  files: ['src/hooks/useCierreMensual.ts'],
  marker: 'getDesglose',
  ops: [
    { find: "import { usePremios } from '@/hooks/usePremios'",
      repl: "import { usePremios } from '@/hooks/usePremios'\nimport { getDesglose } from '@/lib/firestore/finanzas'" },
    { range: ['      const totalCobrado    = tramitesPeriodo', '      // 2. Construir snapshot'],
      repl: `      // Cobrado del mes = recibos con FECHA DE COBRO en el período (caja).
      const totalCobrado = (await getDesglose(gestoriaId, inicio, fin)).cobradoNeto

` },
  ],
})

// ── usePremios.ts ───────────────────────────────────────────────────────────
P.push({
  files: ['src/hooks/usePremios.ts'],
  marker: 'fechaDeRecibo',
  ops: [
    { find: "import { periodoDesde }          from '@/lib/firestore/cierresMensuales'",
      repl: "import { periodoDesde }          from '@/lib/firestore/cierresMensuales'\nimport { cargarRecibos, baseDeRecibo, fechaDeRecibo } from '@/lib/firestore/finanzas'" },
    { range: ["  const multas = todos.filter(t => t.tipo === 'descargo_multa' && t.estado !== 'cancelado')", '  const facturacionMultas'],
      repl: `  const multas = todos.filter(t => t.tipo === 'descargo_multa' && t.estado !== 'cancelado')
  const totalMultasCreadas = multas.length

  // Facturación de multas = COBROS DEL MES (fecha de cobro) sobre las multas de
  // este asesor, creadas en cualquier mes. Base = baseComisionable del recibo
  // (bruto − SUATS − informe − comisión − costo financiero), la misma de finanzas.
  const multasPropias = new Set(
    snap.docs
      .filter(d => d.data().tipo === 'descargo_multa' && d.data().estado !== 'cancelado')
      .map(d => d.id),
  )
  const porTramite: Record<string, DesgloseMulTa> = {}
  for (const r of await cargarRecibos(gestoriaId)) {
    if (!multasPropias.has(r.tramiteId)) continue
    const f = fechaDeRecibo(r)?.toDate?.() as Date | undefined
    if (!f || f < inicio || f > fin) continue
    const d = (porTramite[r.tramiteId] ??= {
      tramiteId: r.tramiteId, honorariosGestoria: 0,
      montoSUATS: 0, montoInformePersona: 0, totalCobradoCliente: 0,
    })
    const m     = Number(r.monto) || 0
    const esDev = r.tipo === 'devolucion' || m < 0
    d.honorariosGestoria  += baseDeRecibo(r)
    d.totalCobradoCliente += esDev ? -Math.abs(m) : m
    if (!esDev) {
      d.montoSUATS          += Number(r.montoSUATS ?? 0)
      d.montoInformePersona += Number(r.montoInformePersona ?? 0)
    }
  }
  const desgloseMultas: DesgloseMulTa[] = Object.values(porTramite)

` },
  ],
})

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR
// ═══════════════════════════════════════════════════════════════════════════
const contar = (s, sub) => s.split(sub).length - 1
const resultados = []
let errores = 0

for (const p of P) {
  const file = p.files.find(f => fs.existsSync(f))
  if (!file) { console.error(`✗ No existe ninguno de: ${p.files.join(' | ')}`); errores++; continue }
  const raw  = fs.readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')
  if (s.includes(p.marker)) { console.log(`• ${file}: ya parcheado — se saltea`); continue }

  let ok = true
  for (const [i, op] of p.ops.entries()) {
    const tag = `${file} — op #${i + 1}`
    if (op.range) {
      const [ini, fin] = op.range
      const n = contar(s, ini)
      if (n !== 1) { console.error(`✗ ${tag}: inicio de rango aparece ${n} veces: ${ini.trim()}`); ok = false; break }
      const a = s.indexOf(ini)
      const b = s.indexOf(fin, a + ini.length)
      if (b < 0) { console.error(`✗ ${tag}: fin de rango no encontrado: ${fin.trim()}`); ok = false; break }
      s = s.slice(0, a) + op.repl + s.slice(b)
      continue
    }
    const n = contar(s, op.find)
    const esperado = op.all ?? 1
    if (n !== esperado) {
      console.error(`✗ ${tag}: ancla aparece ${n} veces (se esperaba ${esperado}): ${op.find.split('\n')[0].trim()}`)
      ok = false; break
    }
    s = s.split(op.find).join(op.repl)
  }
  if (!ok) { errores++; continue }
  resultados.push({ file, out: crlf ? s.replace(/\n/g, '\r\n') : s })
  console.log(`✓ ${file}: ${p.ops.length} cambios listos`)
}

if (errores) { console.error(`\n${errores} archivo(s) con error. No se escribió NINGÚN archivo.`); process.exit(1) }
if (!APPLY)  { console.log('\nDry-run OK. Corré con --apply para escribir.'); process.exit(0) }
for (const r of resultados) fs.writeFileSync(r.file, r.out, 'utf8')
console.log(`\n✔ ${resultados.length} archivo(s) escritos.`)
