import { useState, useMemo } from 'react'
import {
  FileText, Download, Eye, Calendar, TrendingUp, DollarSign, CheckCircle,
  Loader2, RefreshCw, BarChart2, PieChart, Zap, AlertTriangle,
} from 'lucide-react'
import { useTramites } from '@/hooks/useTramites'
import { useClientes } from '@/hooks/useClientes'
import { PageHeader, Card, Button, Spinner } from '@/components/ui'
import { generarReporteMensual } from '@/utils/reporteMensual'
import { getIngresosPorMes, getTiposTramiteFrecuentes, getTopClientes } from '@/lib/firestore/dashboard'
import { formatPesos } from '@/utils'
import {
  calcularHonorariosNetos, calcularTotalCobrado, agruparPorFormaPago, calcularMontoSUATS,
  agruparPorDia, agruparPorSemana, FORMA_PAGO_LABELS, FORMA_PAGO_COLORS,
} from '../../utils/reportesUtility'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS , TYPE_TRAMITE, } from '@/types'
import { descargarPDF, previsualizarPDF } from '@/utils/presupuesto'
import toast from 'react-hot-toast'
import { useGestoriaId, useGestoria , useGestoriaContext } from '@/context/GestoriaContext'
import { useConfiguracion } from '@/hooks/useConfiguracion'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePaginacion } from '@/hooks/usePaginacion'
import { getDocs, query, where, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Tramite } from '@/types/tramite_types'
import Modal from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ControlPaginacion from '@/components/shared/ControlPaginacion'
import { useCierreMensual } from '@/hooks/useCierreMensual'
import { Archive, ChevronDown, ChevronUp } from 'lucide-react'


const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

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
  const ahora = new Date()
  const { tramites, loading: loadT } = useTramites()
  const { clientes } = useClientes()

  const [mes, setMes] = useState(ahora.getMonth())
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [generando, setGenerando] = useState(false)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [vistaPeriodo, setVistaPeriodo] = useState<'diario' | 'semanal' | 'mensual'>('mensual')

  // Cierre mensual
  const {
    puedeGestionar,
    mesCerrado, cerrando, loadingPendiente,
    anioPend, mesPend, mesPendLabel,
    cierrePendiente, historial,
    notas, setNotas,
    ejecutarCierre,
  } = useCierreMensual()

  const aniosDisp = [ahora.getFullYear(), ahora.getFullYear() - 1, ahora.getFullYear() - 2]

  const inicioMes = useMemo(() => new Date(anio, mes, 1), [mes, anio])
  const finMes = useMemo(() => new Date(anio, mes + 1, 0, 23, 59, 59), [mes, anio])

  const tramitesMes = useMemo(() =>
    tramites.filter(t => {
      const d = t.creadoEn?.toDate?.()
      return d && d >= inicioMes && d <= finMes
    }),
  [tramites, inicioMes, finMes])

  const cobradosMes = useMemo(() =>
    tramites.filter(t => {
      const d = t.fechaPago?.toDate?.()
      return t.pagado && d && d >= inicioMes && d <= finMes
    }),
  [tramites, inicioMes, finMes])
const pag = usePaginacion(tramitesMes, { porPagina: 20 })
  // ─── CÁLCULOS CORRECTOS DE INGRESOS ───────────────────────────────────
  // Métricas del mes (CORREGIDO: resta SUATS)
  const kpis = useMemo(() => {
    // INGRESOS = suma de totalCobradoCliente (lo que realmente ingresó)
    const totalCobrado = cobradosMes.reduce((a, t) => a + calcularTotalCobrado(t), 0)
    // HONORARIOS = suma de (totalCobrado - SUATS - informe)
    const honorariosGestoria = cobradosMes.reduce((a, t) => a + calcularHonorariosNetos(t), 0)
    // SUATS abonados
    const suatsAbonado = cobradosMes.reduce((a, t) => a + (t.costosSUATS ?? 0), 0)
    // Informe de persona
    const informeAbonado = cobradosMes.reduce((a, t) => a + (t.costosInformePersona ?? 0), 0)
    // FACTURADO = suma de honorarios en trámites creados
    const facturado = tramitesMes.reduce((a, t) => a + calcularHonorariosNetos(t), 0)

    const entregados = tramitesMes.filter(t => t.estado === 'entregado').length
    const activos    = tramitesMes.filter(t => !['entregado','cancelado'].includes(t.estado)).length
    const clientes_u = new Set(tramitesMes.map(t => t.clienteId)).size

    return { totalCobrado, honorariosGestoria, suatsAbonado, informeAbonado, facturado, entregados, activos, total: tramitesMes.length, clientes_u }
  }, [tramitesMes, cobradosMes])

  // ─── DESGLOSE POR FORMA DE PAGO ───────────────────────────────────────
  const porFormaPago = useMemo(() => {
    const agrupado = agruparPorFormaPago(cobradosMes)
    return Object.entries(agrupado)
      .filter(([, monto]) => monto > 0)
      .map(([forma, monto]) => ({
        forma: forma as keyof typeof FORMA_PAGO_LABELS,
        label: FORMA_PAGO_LABELS[forma],
        monto,
        color: FORMA_PAGO_COLORS[forma],
      }))
      .sort((a, b) => b.monto - a.monto)
  }, [cobradosMes])

  // ─── INGRESOS POR PERÍODO ─────────────────────────────────────────────
  const ingresosPeriodo = useMemo(() => {
    if (vistaPeriodo === 'diario') {
      return agruparPorDia(cobradosMes, inicioMes, finMes)
    } else if (vistaPeriodo === 'semanal') {
      return agruparPorSemana(cobradosMes, inicioMes, finMes)
    } else {
      // mensual — retorna un solo período
      return [{
        periodo: MESES[mes],
        totalCobrado: kpis.totalCobrado,
        honorariosGestoria: kpis.honorariosGestoria,
        costosSUATS: kpis.suatsAbonado,
        costosInformePersona: kpis.informeAbonado,
        cantidad: cobradosMes.length,
      }]
    }
  }, [vistaPeriodo, cobradosMes, inicioMes, finMes, mes, kpis])

  // ─── DISTRIBUCIÓN POR ESTADO ──────────────────────────────────────────
  const porEstado = useMemo(() => {
    const conteo: Record<string, number> = {}
    tramitesMes.forEach(t => {
      conteo[t.estado] = (conteo[t.estado] ?? 0) + 1
    })
    return Object.entries(conteo)
      .map(([estado, n]) => ({
        estado,
        label: (ESTADO_TRAMITE_LABELS as Record<string, string>)[estado] ?? estado,
        n,
      }))
      .sort((a, b) => b.n - a.n)
  }, [tramitesMes])

  // ─── TOP TIPOS DEL MES ────────────────────────────────────────────────
  const porTipo = useMemo(() => {
    const conteo: Record<string, { n: number; honorarios: number }> = {}
    tramitesMes.forEach(t => {
      if (!conteo[t.tipo]) conteo[t.tipo] = { n: 0, honorarios: 0 }
      conteo[t.tipo].n++
      if (t.pagado) conteo[t.tipo].honorarios += calcularHonorariosNetos(t)
    })
    return Object.entries(conteo)
      .map(([tipo, d]) => ({
        tipo,
        label: (TIPO_TRAMITE_LABELS as any)[tipo] ?? tipo,
        ...d,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
  }, [tramitesMes])

  const handleGenerar = async () => {
    setGenerando(true)
    setPdfBlob(null)
    try {
      const [ingresosMes, tiposTramite, topClientes, totalSUATSMes] = await Promise.all([
        getIngresosPorMes(gestoriaId, 6),
        getTiposTramiteFrecuentes(gestoriaId),
        getTopClientes(gestoriaId, 8),
        (async () => {
          try {
            const inicio = new Date(anio, mes, 1)
            const fin = new Date(anio, mes + 1, 0, 23, 59, 59)
            const snap = await getDocs(
              query(collection(db, 'multaWorkflow'), where('gestoriaId', '==', gestoriaId))
            )
            let total = 0
            snap.docs.forEach(d => {
              const data = d.data() as any
              if (data.paso7?.suatsAbonado && data.paso7?.montoSUATS > 0) {
                const fecha = data.paso7?.completadoEn?.toDate?.()
                if (fecha && fecha >= inicio && fecha <= fin) {
                  total += Number(data.paso7.montoSUATS)
                }
              }
            })
            return total
          } catch {
            return 0
          }
        })(),
      ])

      const { blob, nombre } = await generarReporteMensual({
        mes, anio, tramites, clientes, ingresosMes, tiposTramite, topClientes,
        totalSUATSMes,
        gestoriaNombre: config.nombreComercial ?? nombreComercial,
        gestoriaSubtitulo: config.responsable ? `Mandataria — ${config.responsable}` : undefined,
        gestoriaLocalidad: config.localidad ?? undefined,
        gestoriaTelefono: config.telefono1 ?? undefined,
        gestoriaEmail: config.email ?? undefined,
        gestoriaWeb: config.redesSociales?.web ?? undefined,
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

  if (loadT) return <Spinner label="Cargando datos..." />

  const mesLabel = `${MESES[mes]} ${anio}`

  return (
    <div className="space-y-5 animate-fadein">

      <PageHeader
        title="Reportes"
        subtitle={`Cierre financiero de ${mesLabel}`}
      />

      {/* ─── SELECTOR MES/AÑO ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <select
          value={mes}
          onChange={e => setMes(parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium
                     focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {MESES.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>

        <select
          value={anio}
          onChange={e => setAnio(parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium
                     focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {aniosDisp.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {mesCerrado && (
          <div className="col-span-2 sm:col-span-1 flex items-center gap-2 px-3 py-2 bg-emerald-50
                          border border-emerald-200 rounded-lg">
            <CheckCircle size={16} className="text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Cerrado</span>
          </div>
        )}
      </div>

      {/* ─── KPIs DEL MES ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiMes
          label="Total cobrado"
          value={formatPesos(kpis.totalCobrado)}
          sub={`${cobradosMes.length} pagos`}
          color="#10B981"
        />
        <KpiMes
          label="Honorarios gestoría"
          value={formatPesos(kpis.honorariosGestoria)}
          sub="(Sin SUATS ni informe)"
        />
        <KpiMes
          label="SUATS abonado"
          value={formatPesos(kpis.suatsAbonado)}
          sub={`$16.000 × ${kpis.suatsAbonado / 16000}`}
          color="#F59E0B"
        />
        <KpiMes
          label="Trámites entregados"
          value={kpis.entregados.toString()}
          sub={`de ${kpis.total} creados`}
          color="#3B82F6"
        />
        <KpiMes
          label="Clientes únicos"
          value={kpis.clientes_u.toString()}
          sub={`${kpis.activos} trámites activos`}
        />
      </div>

      {/* ─── BANDERA DIFERENCIA DE CAJA ──────────────────────────────────── */}
      {kpis.suatsAbonado > 0 && (
        <div className="rounded-xl overflow-hidden border border-amber-200 bg-amber-50">
          <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-white" />
            <p className="text-white text-sm font-bold">Cuidado con la diferencia de caja</p>
          </div>
          <div className="px-5 py-3 text-sm text-amber-700">
            <p>
              Se abonaron <strong>{formatPesos(kpis.suatsAbonado)}</strong> en SUATS.
              Este monto <strong>no impacta</strong> en premios de la Asesora Comercial.
            </p>
          </div>
        </div>
      )}

      {/* ─── DESGLOSE INGRESOS ────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={15} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Desglose de ingresos
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Tabla desglose */}
          <div className="space-y-2">
            {[
              { label: 'Total ingresado', valor: kpis.totalCobrado, color: '#10B981' },
              { label: 'SUATS abonado', valor: -kpis.suatsAbonado, color: '#F59E0B' },
              { label: 'Informe persona', valor: -kpis.informeAbonado, color: '#EF4444' },
              { label: 'Honorarios gestoría', valor: kpis.honorariosGestoria, color: '#D4621A', bold: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{item.label}</span>
                <span className="text-sm font-semibold" style={{ color: item.color }}>
                  {item.valor >= 0 ? '+' : ''}{formatPesos(item.valor)}
                </span>
              </div>
            ))}
          </div>

          {/* Gráfico pastel por forma de pago */}
          {porFormaPago.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Formas de pago
              </p>
              {porFormaPago.map(item => (
                <div key={item.forma}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <span className="text-xs font-semibold text-gray-600">
                      {formatPesos(item.monto)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.monto / kpis.totalCobrado) * 100}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ─── INGRESOS POR PERÍODO ─────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Ingresos por período
            </p>
          </div>
          <div className="flex gap-2">
            {(['diario', 'semanal', 'mensual'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVistaPeriodo(v)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  vistaPeriodo === v
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {v === 'diario' ? 'Diario' : v === 'semanal' ? 'Semanal' : 'Mensual'}
              </button>
            ))}
          </div>
        </div>

        {ingresosPeriodo.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin pagos en este período</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {ingresosPeriodo.map((periodo, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-900">{periodo.periodo}</span>
                  <span className="text-xs text-gray-400">{periodo.cantidad} pago(s)</span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total ingresado:</span>
                    <span className="font-semibold text-green-600">
                      {formatPesos(periodo.totalCobrado)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Honorarios gestoría:</span>
                    <span className="font-semibold text-orange-600">
                      {formatPesos(periodo.honorariosGestoria)}
                    </span>
                  </div>
                  {periodo.costosSUATS > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">SUATS:</span>
                      <span className="font-semibold text-amber-600">
                        {formatPesos(periodo.costosSUATS)}
                      </span>
                    </div>
                  )}
                  {periodo.costosInformePersona > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Informe:</span>
                      <span className="font-semibold text-red-600">
                        {formatPesos(periodo.costosInformePersona)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── POR TIPO DE TRÁMITE ──────────────────────────────────────────── */}
      {porTipo.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={15} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Top tipos de trámite
            </p>
          </div>

          <div className="space-y-3">
            {porTipo.map(t => {
              const pct = Math.round((t.n / kpis.total) * 100)
              return (
                <div key={t.tipo}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{t.label}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">{t.n} trámites</span>
                      {t.honorarios > 0 && (
                        <span className="font-semibold text-orange-600">
                          {formatPesos(t.honorarios)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: 'var(--gp-orange)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ─── POR ESTADO ────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle size={15} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Estados al cierre de {MESES[mes]}
          </p>
        </div>

        {porEstado.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin trámites en {mesLabel}</p>
        ) : (
          <div className="space-y-2">
            {porEstado.map(e => {
              const pct = Math.round((e.n / kpis.total) * 100)
              const color =
                e.estado === 'entregado' ? '#22C55E' :
                e.estado === 'cancelado' ? '#9CA3AF' :
                e.estado === 'pendiente' ? '#EAB308' :
                e.estado === 'en_proceso' ? '#3B82F6' :
                e.estado === 'documentacion_requerida' ? '#EF4444' :
                e.estado === 'en_organismo' ? '#F97316' : '#D4621A'
              return (
                <div key={e.estado} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm text-gray-700 flex-1">{e.label}</span>
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-xs font-bold text-gray-900 w-4 text-right">{e.n}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ─── LISTA DETALLADA DE TRÁMITES ──────────────────────────────────── */}
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
            <div className="grid grid-cols-5 gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100
                            text-xs font-bold text-gray-400 uppercase tracking-wider">
              <span className="col-span-2">Tipo / Patente</span>
              <span>Estado</span>
              <span className="text-right">Honorarios</span>
              <span className="text-right">Estado pago</span>
            </div>

            {pag.itemsPagina.map(t => (
              <div key={t.id} className="grid grid-cols-5 gap-2 px-5 py-2.5 border-b border-gray-50
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
                  {calcularHonorariosNetos(t) > 0 ? formatPesos(calcularHonorariosNetos(t)) : '—'}
                </p>
                <p className={`text-right font-semibold ${t.pagado ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {t.pagado ? '✓' : '—'}
                </p>
              </div>
            ))}

            <div className="px-5 py-4 border-t border-gray-100 space-y-2">
              {tramitesMes.length > 20 && (
                <ControlPaginacion
                  pagina={pag.pagina}
                  paginas={pag.paginas}
                  desde={pag.desde}
                  hasta={pag.hasta}
                  total={pag.total}
                  onChange={pag.setPagina}
                  labelItem="trámites"
                />
              )}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-t-2 border-gray-100">
              <span className="text-sm font-bold text-gray-600">Total del mes</span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-gray-400">Total cobrado</p>
                  <p className="text-sm font-bold text-green-600">{formatPesos(kpis.totalCobrado)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Honorarios gestoría</p>
                  <p className="text-sm font-bold text-orange-600">{formatPesos(kpis.honorariosGestoria)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Entregados</p>
                  <p className="text-sm font-bold text-blue-600">{kpis.entregados}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ─── GENERAR PDF ───────────────────────────────────────────────────── */}
      {!pdfBlob && tramitesMes.length > 0 && (
        <div className="flex items-center justify-between bg-[var(--gp-orange-pale)]
                        border border-orange-100 rounded-2xl p-5">
          <div>
            <p className="font-semibold text-gray-900">¿Todo listo para exportar?</p>
            <p className="text-sm text-gray-500 mt-0.5">
              El PDF incluye portada, gráficos, tabla completa y resumen financiero detallado.
            </p>
          </div>
          <Button onClick={handleGenerar} loading={generando}>
            <FileText size={15} />
            Generar PDF {mesLabel}
          </Button>
        </div>
      )}

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