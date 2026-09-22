import { useState, useMemo, useEffect } from 'react'
import {
  FileText, Download, Eye, Calendar,
  TrendingUp, DollarSign, CheckCircle,
  Loader2, RefreshCw, BarChart2,
} from 'lucide-react'
import { useTramites }         from '@/hooks/useTramites'
import { useClientes }         from '@/hooks/useClientes'
import { PageHeader, Card, Button, Spinner } from '@/components/ui'
import { generarReporteMensual } from '@/utils/reporteMensual'
import {
  getIngresosPorMes, getTiposTramiteFrecuentes, getTopClientes,
} from '@/lib/firestore/dashboard'
import { formatPesos } from '@/utils'
import { ESTADO_TRAMITE_LABELS , TIPO_TRAMITE_LABELS} from '@/types'
import { descargarPDF, previsualizarPDF } from '@/utils/presupuesto'
import toast from 'react-hot-toast'
import { useGestoriaId, useGestoria } from '@/context/GestoriaContext'
import { useConfiguracion }             from '@/hooks/useConfiguracion'
import { usePaginacion } from '@/hooks/usePaginacion'
import { usePageTitle } from '@/hooks/usePageTitle'
import ControlPaginacion from '@/components/shared/ControlPaginacion'
import { useCierreMensual } from '@/hooks/useCierreMensual'
import { Archive, AlertTriangle as AlertWarn, ChevronDown, ChevronUp } from 'lucide-react'
import MetricasSecretariosPanel from '@/features/reportes/MetricasSecretariosPanel'
import DesgloseIngresos from '@/components/shared/DesgloseIngresos'
import { useFinanzas } from '@/hooks/useFinanzas'
import { cargarRecibos, getDesglose, fechaDeRecibo } from '@/lib/firestore/finanzas'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ─── FORMAS DE PAGO — catálogo visual (coincide con FORMA_PAGO_OPTS de Cobranzas) ─
const FORMA_PAGO_META: Record<string, { label: string; color: string }> = {
  efectivo:            { label: 'Efectivo',        color: '#22c55e' },
  transferencia:       { label: 'Transferencia',   color: '#6366f1' },
  mercadopago:         { label: 'Mercado Pago',    color: '#0EA5E9' },
  cheque:              { label: 'Cheque',          color: '#F59E0B' },
  mixto:               { label: 'Mixto',           color: '#A855F7' },
  sin_especificar:     { label: 'Sin especificar', color: '#9CA3AF' },
}

function KpiMes({
  label, value, sub, color = '#D4621A',
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900" style={{ fontFamily:'var(--font-display)', color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ReportesPage() {
  usePageTitle('Reportes')
  const gestoriaId = useGestoriaId()
  const { nombreComercial, colorPrimario, logoUrl } = useGestoria()
  const { config } = useConfiguracion()
  const ahora  = new Date()
  const { tramites, loading: loadT } = useTramites()
  const { clientes }                 = useClientes()

  const [mes,       setMes]       = useState(ahora.getMonth())
  const [anio,      setAnio]      = useState(ahora.getFullYear())
  const [generando, setGenerando] = useState(false)
  const [pdfBlob,   setPdfBlob]   = useState<Blob | null>(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)

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
  }, [gestoriaId])

  // Cierre mensual
  const {
    puedeGestionar,
    mesCerrado, cerrando, loadingPendiente,
    anioPend, mesPend, mesPendLabel,
    cierrePendiente, historial,
    notas, setNotas,
    ejecutarCierre,
  } = useCierreMensual()

  // Años disponibles (último 3 años)
  const aniosDisp = [ahora.getFullYear(), ahora.getFullYear() - 1, ahora.getFullYear() - 2]

  // Trámites del mes seleccionado
  const inicioMes = useMemo(() => new Date(anio, mes, 1), [mes, anio])
  const finMes    = useMemo(() => new Date(anio, mes + 1, 0, 23, 59, 59), [mes, anio])
  const { gestoria, proyeccion, loading: loadingFinanzas, error: errorFinanzas } =
    useFinanzas(inicioMes, finMes)

  const tramitesMes = useMemo(() =>
    tramites.filter(t => {
      const d = t.creadoEn?.toDate?.()
      return d && d >= inicioMes && d <= finMes
    }),
  [tramites, inicioMes, finMes])

  const pag = usePaginacion(tramitesMes, { porPagina: 20 })

  const recibosMes = useMemo(() => recibos.filter(r => {
    const f = fechaDeRecibo(r)?.toDate?.() as Date | undefined
    return !!f && f >= inicioMes && f <= finMes
  }), [recibos, inicioMes, finMes])

  const cobradosMes = useMemo(() =>
    tramites.filter(t => {
      const d = t.fechaPago?.toDate?.()
      return t.pagado && d && d >= inicioMes && d <= finMes
    }),
  [tramites, inicioMes, finMes])

  // Métricas del mes
  const kpis = useMemo(() => {
    const ingresos   = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
    const facturado  = tramitesMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
    const entregados = tramitesMes.filter(t => t.estado === 'entregado').length
    const activos    = tramitesMes.filter(t => !['entregado','cancelado'].includes(t.estado)).length
    const clientes_u = new Set(tramitesMes.map(t => t.clienteId)).size
    return { ingresos, facturado, entregados, activos, total: tramitesMes.length, clientes_u }
  }, [tramitesMes, cobradosMes])

  // Distribución por estado
  const porEstado = useMemo(() => {
    const conteo: Record<string, number> = {}
    tramitesMes.forEach(t => {
      conteo[t.estado] = (conteo[t.estado] ?? 0) + 1
    })
    return Object.entries(conteo)
      .map(([estado, n]) => ({ estado, label: (ESTADO_TRAMITE_LABELS as Record<string,string>)[estado] ?? estado, n }))
      .sort((a, b) => b.n - a.n)
  }, [tramitesMes])

  // Top tipos del mes — cantidad = trámites creados en el mes;
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

  // ─── Desglose real por forma de pago (reemplaza los valores hardcodeados) ────
  // Agrupa cobradosMes por t.formaPago y suma honorarios — coincide 1:1 con
  // kpis.ingresos (misma fuente: cobradosMes.honorarios).
  const porFormaPago = useMemo(() => {
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

  // SUATS e informe de persona del mes — desde los recibos (fecha de cobro).
  // Precio = lo cobrado al cliente; costo = lo que realmente sale de la gestoría.
  const suatsMes         = gestoria?.suatsCobrado ?? 0
  const suatsCostoMes    = gestoria?.suatsCosto   ?? 0
  const informesCostoMes = gestoria?.informeCosto ?? 0
  const handleGenerar = async () => {
    setGenerando(true)
    setPdfBlob(null)
    try {
      const [ingresosMes, tiposTramite, topClientes] = await Promise.all([
        getIngresosPorMes(gestoriaId, 6),
        getTiposTramiteFrecuentes(gestoriaId, inicioMes, finMes),
        getTopClientes(gestoriaId, 8, inicioMes, finMes),
      ])
      const totalSUATSMes = suatsMes
      const inicioAnt = new Date(anio, mes - 1, 1)
      const finAnt    = new Date(anio, mes, 0, 23, 59, 59)
      const precarga  = recibos.length ? recibos : undefined
      const [finanzasMes, finanzasMesAnterior] = await Promise.all([
        getDesglose(gestoriaId, inicioMes, finMes, precarga),
        getDesglose(gestoriaId, inicioAnt, finAnt, precarga),
      ])
      const { blob, nombre } = await generarReporteMensual({
        mes, anio, tramites, clientes, ingresosMes, tiposTramite, topClientes,
        totalSUATSMes,
        finanzasMes,
        finanzasMesAnterior,
        // Branding dinámico del tenant
        gestoriaNombre:    config.nombreComercial    ?? nombreComercial,
        gestoriaSubtitulo: config.responsable ? `Mandataria — ${config.responsable}` : undefined,
        gestoriaLocalidad: config.localidad          ?? undefined,
        gestoriaTelefono:  config.telefono1           ?? undefined,
        gestoriaEmail:     config.email               ?? undefined,
        gestoriaWeb:       config.redesSociales?.web  ?? undefined,
        colorPrimario,
        logoUrl,
      })
      setPdfBlob(blob)
      setPdfNombre(nombre)
      toast.success('Reporte generado')
    } catch (err: any) {
      console.error(err)
      toast.error('Error al generar el reporte')
    } finally {
      setGenerando(false)
    }
  }

  if (loadT || loadingFinanzas || !gestoria) return <Spinner label="Cargando datos..." />

  const mesLabel = `${MESES[mes]} ${anio}`

  return (
    <div className="space-y-5 animate-fadein">
    <MetricasSecretariosPanel />
      <PageHeader
        title="Reportes"
        subtitle="Resúmenes mensuales para análisis y contaduría"
      />

      {errorFinanzas && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo cargar el desglose financiero: {errorFinanzas}
        </div>
      )}

      {/* ── CIERRE MENSUAL (propietario / admin_gral) ─────────────────────── */}
      {puedeGestionar && (
        <div className={`rounded-2xl border p-5 ${
          mesCerrado
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              {mesCerrado
                ? <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                : <AlertWarn  size={20} className="text-amber-600 shrink-0 mt-0.5" />
              }
              <div>
                <p className={`font-bold text-sm ${mesCerrado ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {mesCerrado
                    ? `Cierre de ${mesPendLabel} registrado`
                    : `Cierre de ${mesPendLabel} pendiente`
                  }
                </p>
                <p className={`text-xs mt-0.5 ${mesCerrado ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {mesCerrado
                    ? `Cerrado por ${cierrePendiente?.cerradoPorNombre} · Los premios del asesor quedaron guardados.`
                    : 'Al cerrar el mes se guarda el snapshot de premios del asesor y se reinicia el contador para el nuevo mes.'
                  }
                </p>
              </div>
            </div>

            {!mesCerrado && !loadingPendiente && (
              <div className="flex flex-col gap-2 min-w-[240px]">
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Notas del cierre (opcional)..."
                  rows={2}
                  className="w-full px-3 py-2 border border-amber-200 rounded-xl text-xs
                             bg-white outline-none resize-none focus:border-amber-400"
                />
                <button
                  onClick={ejecutarCierre}
                  disabled={cerrando}
                  className="flex items-center justify-center gap-2 px-4 py-2.5
                             bg-[#D4621A] hover:bg-[#c05518] text-white font-bold
                             text-sm rounded-xl transition-all disabled:opacity-50"
                >
                  <Archive size={15} />
                  {cerrando ? 'Cerrando...' : `Cerrar ${mesPendLabel}`}
                </button>
              </div>
            )}
          </div>

          {/* Historial de cierres */}
          {historial.length > 0 && (
            <div className="mt-4 border-t border-amber-200/60 pt-3">
              <button
                onClick={() => setVerHistorial(v => !v)}
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  mesCerrado ? 'text-emerald-700' : 'text-amber-700'
                } hover:opacity-80 transition-opacity`}
              >
                {verHistorial ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Ver historial de cierres ({historial.length})
              </button>
              {verHistorial && (
                <div className="mt-3 space-y-2">
                  {historial.map(c => (
                    <div key={c.id}
                      className="flex items-center justify-between bg-white/70
                                 rounded-xl px-4 py-2.5 border border-white/80">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{c.mesLabel}</p>
                        <p className="text-xs text-gray-500">
                          Cerrado por {c.cerradoPorNombre} · {c.totalTramites} trámites
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-700">
                          ${c.totalCobrado.toLocaleString('es-AR')} cobrado
                        </p>
                        {c.snapshotPremios?.[0] && (
                          <p className="text-[10px] text-gray-400">
                            Asesor: {c.snapshotPremios[0].premiosA_ganados} premios A
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selector de período */}
      <Card className="p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Período:</span>
          </div>

          {/* Selector mes */}
          <div className="flex gap-1.5 flex-wrap">
            {MESES.map((m, i) => (
              <button
                key={m}
                onClick={() => { setMes(i); setPdfBlob(null) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                            ${mes === i
                              ? 'text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                style={mes === i ? { background: 'var(--gp-orange)' } : undefined}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>

          {/* Selector año */}
          <select
            value={anio}
            onChange={e => { setAnio(Number(e.target.value)); setPdfBlob(null) }}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm
                       outline-none focus:border-[var(--gp-orange)] bg-white cursor-pointer"
          >
            {aniosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <div className="ml-auto flex gap-2">
            {pdfBlob ? (
              <>
                <Button variant="secondary" size="sm"
                  onClick={() => previsualizarPDF(pdfBlob)}>
                  <Eye size={14} /> Previsualizar
                </Button>
                <Button size="sm"
                  onClick={() => descargarPDF(pdfBlob, pdfNombre)}>
                  <Download size={14} /> Descargar PDF
                </Button>
                <Button variant="secondary" size="sm"
                  onClick={() => { setPdfBlob(null); handleGenerar() }}>
                  <RefreshCw size={14} />
                </Button>
              </>
            ) : (
              <Button onClick={handleGenerar} loading={generando}>
                <FileText size={15} />
                {generando ? 'Generando...' : `Generar reporte ${mesLabel}`}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs del período */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          {mesLabel} — resumen
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiMes label="Trámites"       value={String(kpis.total)}          color="#D4621A" />
          <KpiMes label="Entregados"     value={String(kpis.entregados)}     color="#059669" />
          <KpiMes label="Activos"        value={String(kpis.activos)}        color="#3B82F6" />
          <KpiMes label="Clientes"       value={String(kpis.clientes_u)}     color="#7C3AED" />
          <KpiMes label="Facturado"      value={formatPesos(kpis.facturado)} color="#F97316" />
          <KpiMes label="Cobrado neto"    value={formatPesos(gestoria.cobradoNeto)} color="#059669"
            sub="Recibos del período; puede diferir del facturado" />
        </div>
      </div>

      <DesgloseIngresos d={gestoria} proyeccion={proyeccion} />

      {/* Preview de datos del reporte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Por tipo */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={15} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Trámites por tipo en {MESES[mes]}
            </p>
          </div>
          {porTipo.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Sin trámites en {mesLabel}
            </p>
          ) : (
            <div className="space-y-2.5">
              {porTipo.map((t, i) => {
                const pct = Math.round((t.n / kpis.total) * 100)
                return (
                  <div key={t.tipo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{t.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {t.ingresos > 0 ? formatPesos(t.ingresos) : '—'}
                        </span>
                        <span className="text-xs font-bold text-gray-900 w-6 text-right">
                          {t.n}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'var(--gp-orange)' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Por estado */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={15} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Estados al cierre de {MESES[mes]}
            </p>
          </div>

          {porEstado.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Sin trámites en {mesLabel}
            </p>
          ) : (
            <div className="space-y-2">
              {porEstado.map(e => {
                const pct = Math.round((e.n / kpis.total) * 100)
                const color =
                  e.estado === 'entregado'  ? '#22C55E' :
                  e.estado === 'cancelado'  ? '#9CA3AF' :
                  e.estado === 'pendiente'  ? '#EAB308' :
                  e.estado === 'en_proceso' ? '#3B82F6' :
                  e.estado === 'documentacion_requerida' ? '#EF4444' :
                  e.estado === 'en_organismo' ? '#F97316' : '#D4621A'
                return (
                  <div key={e.estado} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-sm text-gray-700 flex-1">{e.label}</span>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-xs font-bold text-gray-900 w-4 text-right">{e.n}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Lista de trámites del mes */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Trámites de {mesLabel} ({tramitesMes.length})
          </p>
        </div>

        {tramitesMes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <FileText size={36} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-gray-400">Sin trámites en {mesLabel}</p>
          </div>
        ) : (
          <>
            {/* KPIs Principales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <Card className="p-4">
                <p className="text-xs font-bold text-gray-400 mb-2">TOTAL COBRADO</p>
                <p className="text-2xl font-extrabold text-emerald-700">{formatPesos(gestoria.cobradoBruto)}</p>
                <p className="text-[10px] text-gray-400 mt-1">{gestoria.recibos} recibos</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold text-gray-400 mb-2">HONORARIOS GESTORÍA</p>
                <p className="text-2xl font-extrabold" style={{color: '#D4621A'}}>{formatPesos(gestoria.netoGestoria)}</p>
                <p className="text-[10px] text-gray-400 mt-1">Neto de deducciones</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold text-gray-400 mb-2">SUATS ABONADO</p>
                                <p className="text-2xl font-extrabold text-orange-600">
                  {formatPesos(gestoria.suatsCobrado)}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">{gestoria.suatsCobrado > 0
                  ? `${Math.ceil(gestoria.suatsCobrado / (config.costosMulta?.suats ?? 25000))} × $${(config.costosMulta?.suats ?? 25000).toLocaleString('es-AR')} · margen ${formatPesos(gestoria.suatsMargen)}`
                  : 'Sin SUATS abonados'}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold text-gray-400 mb-2">ENTREGADOS</p>
                <p className="text-2xl font-extrabold text-blue-600">{kpis.entregados}</p>
                <p className="text-[10px] text-gray-400 mt-1">de {kpis.total}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold text-gray-400 mb-2">CLIENTES</p>
                <p className="text-2xl font-extrabold text-purple-600">{kpis.clientes_u}</p>
                <p className="text-[10px] text-gray-400 mt-1">únicos</p>
              </Card>
            </div>

            {suatsMes > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex gap-3">
                <AlertWarn size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-900">Cuidado con la diferencia de caja</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Se abonaron {formatPesos(suatsMes)} en SUATS. Este monto <strong>no impacta en premios de la Asesora Comercial</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Desglose de Ingresos y Formas de Pago */}
            <Card className="p-5 mb-5 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-gray-400" />
                <p className="font-bold text-gray-700">DESGLOSE DE INGRESOS</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total ingresado</span>
                    <span className="font-bold text-emerald-600">{formatPesos(gestoria.cobradoBruto)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Costo SUATS</span>
                    <span className="font-bold text-orange-600">−{formatPesos(suatsCostoMes)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Costo informe persona</span>
                    <span className="font-bold text-red-600">−{formatPesos(informesCostoMes)}</span>
                  </div>
                  {gestoria.deducComision > 0 && (
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
                  <div className="flex justify-between items-center py-3 bg-emerald-50 px-3 rounded-lg">
                    <span className="font-bold text-gray-800">Honorarios gestoría</span>
                    <span className="font-extrabold text-emerald-700 text-lg">{formatPesos(gestoria.netoGestoria)}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="font-bold text-gray-700 text-sm">FORMAS DE PAGO</p>
                  {porFormaPago.length === 0 ? (
                    <p className="text-xs text-gray-400">Sin cobros registrados en {mesLabel}</p>
                  ) : (
                    porFormaPago.map(f => {
                      const pct = gestoria.cobradoBruto > 0 ? (f.monto / gestoria.cobradoBruto) * 100 : 0
                      return (
                        <div key={f.forma} className="space-y-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">{f.meta.label}</span>
                            <span className="font-semibold">
                              {formatPesos(f.monto)}
                              <span className="text-gray-400 font-normal ml-1">({Math.round(pct)}%)</span>
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: f.meta.color }}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </Card>

            {/* Cabecera */}
            <div className="grid grid-cols-5 gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100
                            text-xs font-bold text-gray-400 uppercase tracking-wider">
              <span className="col-span-2">Tipo / Patente</span>
              <span>Estado</span>
              <span className="text-right">Honorarios</span>
              <span className="text-right">Cobrado</span>
            </div>

            {pag.itemsPagina.map(t => (
              <div key={t.id}
                className="grid grid-cols-5 gap-2 px-5 py-2.5 border-b border-gray-50
                           last:border-0 hover:bg-gray-50 transition-colors text-sm">
                <div className="col-span-2 min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {TIPO_TRAMITE_LABELS[t.tipo]}
                  </p>
                  <p className="text-xs font-mono text-gray-400">{t.patente}</p>
                </div>
                <div className="flex items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    t.estado === 'entregado' ? 'bg-emerald-100 text-emerald-700' :
                    t.estado === 'cancelado' ? 'bg-gray-100 text-gray-500' :
                    t.estado === 'documentacion_requerida' ? 'bg-red-100 text-red-600' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {ESTADO_TRAMITE_LABELS[t.estado]}
                  </span>
                </div>
                <p className="text-right font-medium text-gray-700">
                  {t.honorarios > 0 ? formatPesos(t.honorarios) : '—'}
                </p>
                <p className={`text-right font-semibold ${t.pagado ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {t.pagado ? '✓' : '—'}
                </p>
              </div>
            ))}

            {/* Paginación real — antes solo se veían los primeros 20 de N */}
            <div className="px-5 py-3">
              <ControlPaginacion
                pagina={pag.pagina}
                paginas={pag.paginas}
                desde={pag.desde}
                hasta={pag.hasta}
                total={pag.total}
                onChange={pag.setPagina}
                labelItem="trámites"
              />
            </div>

            {tramitesMes.length > pag.itemsPagina.length && (
              <div className="px-5 pb-3 text-center text-[11px] text-gray-400">
                El PDF exportado incluye los {tramitesMes.length} trámites del mes, no solo la página actual.
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between px-5 py-3.5
                            bg-gray-50 border-t-2 border-gray-100">
              <span className="text-sm font-bold text-gray-600">
                Total del mes
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-gray-400">Facturado</p>
                  <p className="text-sm font-bold text-gray-800">{formatPesos(kpis.facturado)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Cobrado</p>
                  <p className="text-sm font-bold text-emerald-600">{formatPesos(gestoria.cobradoNeto)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* CTA si no hay reporte generado */}
      {!pdfBlob && tramitesMes.length > 0 && (
        <div className="flex items-center justify-between bg-[var(--gp-orange-pale)]
                        border border-orange-100 rounded-2xl p-5">
          <div>
            <p className="font-semibold text-gray-900">
              ¿Todo listo para exportar?
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              El PDF incluye portada, gráficos, tabla completa y resumen financiero.
            </p>
          </div>
          <Button onClick={handleGenerar} loading={generando}>
            <FileText size={15} />
            Generar PDF {mesLabel}
          </Button>
        </div>
      )}

      {/* PDF listo */}
      {pdfBlob && (
        <div className="flex items-center justify-between bg-emerald-50
                        border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-800">Reporte listo</p>
              <p className="text-xs text-emerald-600 mt-0.5">{pdfNombre}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => previsualizarPDF(pdfBlob)}>
              <Eye size={14} /> Ver
            </Button>
            <Button size="sm" onClick={() => descargarPDF(pdfBlob, pdfNombre)}>
              <Download size={14} /> Descargar
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}