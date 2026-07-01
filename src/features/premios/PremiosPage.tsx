import { useState, useMemo } from 'react'
import { Trophy, TrendingUp, Award, Target, Zap, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { usePremios } from '@/hooks/usePremios'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { formatPesos } from '@/utils'
import { PageHeader, Card, Button, Spinner } from '@/components/ui'
import { usePageTitle } from '@/hooks/usePageTitle'
import toast from 'react-hot-toast'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useTramites } from '@/hooks/useTramites'
import { calcularHonorariosNetos } from '@/utils/reportesUtility'

interface PremioDetalle {
  id: string
  tipoTramite: 'auto' | 'moto'
  tipo: 'por_cantidad' | 'por_monto'
  titulo: string
  descripcion?: string
  montoUmbral?: number // Para premios por monto
  tramitesPorPremio?: number // Para premios por cantidad
  montoMonto?: number // $ del premio si es por monto
  montoTramites?: number // $ del premio si es por cantidad
  alcanzado: boolean
  progreso: number // 0-100
  valorActual: number
  faltaAlcanzar: number
}

export default function PremiosPage() {
  usePageTitle('Premios & Logros')
  const { uid } = useAuth()
  const puede = usePermisos()
  const gestoriaId = useGestoriaId()
  const { tramites, loading: loadT } = useTramites()
  const { data: rawPremios, isLoading: isLoadingPremios, asesores } = usePremios(uid)

  const [expandidoAuto, setExpandidoAuto] = useState(true)
  const [expandidoMoto, setExpandidoMoto] = useState(true)
  const [expandidoHitos, setExpandidoHitos] = useState(true)
  const [expandidoHistorial, setExpandidoHistorial] = useState(false)

  // Calcular premios con la data actual
  const dataPremios = useMemo(() => {
    if (!uid || loadT || !rawPremios) return null

    const data = rawPremios

    // Filtrar solo trámites pagados para cálculos de premios
    const tramitesPagados = tramites.filter(t => t.pagado && t.estado !== 'cancelado')

    // PREMIOS POR CANTIDAD (Solo honorarios, SIN SUATS)
    const tramitesAutoCalificantes = tramitesPagados.filter(t => {
      const esAuto = !['moto', 'ciclomotor'].some(m => t.tipo?.toLowerCase().includes(m))
      return esAuto
    })

    const tramitesMotoCalificantes = tramitesPagados.filter(t => {
      const esMoto = ['moto', 'ciclomotor'].some(m => t.tipo?.toLowerCase().includes(m))
      return esMoto
    })

    const enCicloAuto = tramitesAutoCalificantes.length % (data.cfg.tramitesPorPremioAuto || 1)
    const enCicloMoto = tramitesMotoCalificantes.length % (data.cfg.tramitesPorPremioMoto || 1)

    // PREMIOS POR MONTO (Facturación de gestoría, SIN SUATS)
    const facturacionAutoHonorarios = tramitesAutoCalificantes.reduce(
      (s, t) => s + calcularHonorariosNetos(t),
      0
    )
    const facturacionMotoHonorarios = tramitesMotoCalificantes.reduce(
      (s, t) => s + calcularHonorariosNetos(t),
      0
    )
    const facturacionTotalHonorarios = facturacionAutoHonorarios + facturacionMotoHonorarios

    // Calcular hitos alcanzados basados en honorarios (SIN SUATS)
    const hitosOrdenados = [...data.cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral)
    const hitosAlcanzadosAhora = hitosOrdenados.filter(h => facturacionTotalHonorarios >= h.montoUmbral)
    const proximoHito = hitosOrdenados.find(h => facturacionTotalHonorarios < h.montoUmbral)

    return {
      ...data,
      facturacionAutoHonorarios,
      facturacionMotoHonorarios,
      facturacionTotalHonorarios,
      tramitesAutoCalificantes: tramitesAutoCalificantes.length,
      tramitesMotoCalificantes: tramitesMotoCalificantes.length,
      enCicloAuto,
      enCicloMoto,
      hitosAlcanzadosAhora,
      proximoHito,
    }
  }, [uid, tramites, loadT])

  if (isLoadingPremios || !asesores) return <Spinner label="Cargando historial de premios..." />
  if (!dataPremios) return null

  const cfg = dataPremios.cfg
  const nombreAsesor = dataPremios.cicloAuto?.tipoTramite === 'Automóviles / Camiones' ? 'Automóviles' : 'Motos'

  // ─── DETALLES DE PREMIOS POR CANTIDAD (AUTOS) ───────────────────────
  const premiosAutoPorCantidad: PremioDetalle[] = []
  for (let i = 1; i <= dataPremios.cicloAuto.premiosGanados + 3; i++) {
    const yoGane = i <= dataPremios.cicloAuto.premiosGanados
    premiosAutoPorCantidad.push({
      id: `auto-cantidad-${i}`,
      tipoTramite: 'auto',
      tipo: 'por_cantidad',
      titulo: `Premio #${i} (Automóviles)`,
      descripcion: `${cfg.tramitesPorPremioAuto} trámites`,
      tramitesPorPremio: cfg.tramitesPorPremioAuto,
      montoTramites: cfg.montoPremioAuto,
      alcanzado: yoGane,
      progreso: Math.min(100, (dataPremios.enCicloAuto / cfg.tramitesPorPremioAuto) * 100),
      valorActual: dataPremios.enCicloAuto,
      faltaAlcanzar: Math.max(0, cfg.tramitesPorPremioAuto - dataPremios.enCicloAuto),
    })
  }

  const premiosMotoPorCantidad: PremioDetalle[] = []
  for (let i = 1; i <= dataPremios.cicloMoto.premiosGanados + 3; i++) {
    const yoGane = i <= dataPremios.cicloMoto.premiosGanados
    premiosMotoPorCantidad.push({
      id: `moto-cantidad-${i}`,
      tipoTramite: 'moto',
      tipo: 'por_cantidad',
      titulo: `Premio #${i} (Motos)`,
      descripcion: `${cfg.tramitesPorPremioMoto} trámites`,
      tramitesPorPremio: cfg.tramitesPorPremioMoto,
      montoTramites: cfg.montoPremioMoto,
      alcanzado: yoGane,
      progreso: Math.min(100, (dataPremios.enCicloMoto / cfg.tramitesPorPremioMoto) * 100),
      valorActual: dataPremios.enCicloMoto,
      faltaAlcanzar: Math.max(0, cfg.tramitesPorPremioMoto - dataPremios.enCicloMoto),
    })
  }

  // ─── DETALLES DE PREMIOS POR MONTO (HITOS) ────────────────────────────
  const hitosPremios: PremioDetalle[] = cfg.hitosMultas
    .sort((a, b) => a.montoUmbral - b.montoUmbral)
    .map((hito, idx) => {
      const alcanzado = dataPremios.hitosAlcanzadosAhora.some(h => h.id === hito.id)
      const esProximo = dataPremios.proximoHito?.id === hito.id
      return {
        id: `hito-${hito.id}`,
        tipoTramite: 'auto',
        tipo: 'por_monto',
        titulo: hito.nombre || `Hito ${idx + 1}`,
        descripcion: hito.descripcion,
        montoUmbral: hito.montoUmbral,
        montoMonto: hito.premioMonto,
        alcanzado,
        progreso: Math.min(
          100,
          (dataPremios.facturacionTotalHonorarios / hito.montoUmbral) * 100
        ),
        valorActual: dataPremios.facturacionTotalHonorarios,
        faltaAlcanzar: Math.max(0, hito.montoUmbral - dataPremios.facturacionTotalHonorarios),
      }
    })

  const premiosGanados = [
    ...premiosAutoPorCantidad.filter(p => p.alcanzado),
    ...premiosMotoPorCantidad.filter(p => p.alcanzado),
    ...hitosPremios.filter(p => p.alcanzado),
  ].length

  const montoTotalPremios = [
    ...premiosAutoPorCantidad.filter(p => p.alcanzado).reduce((s, p) => s + (p.montoTramites ?? 0), 0),
    ...premiosMotoPorCantidad.filter(p => p.alcanzado).reduce((s, p) => s + (p.montoTramites ?? 0), 0),
    ...hitosPremios.filter(p => p.alcanzado).reduce((s, p) => s + (p.montoMonto ?? 0), 0),
  ].reduce((s, x) => s + x, 0)

  return (
    <div className="space-y-5 animate-fadein">

      <PageHeader
        title="Premios & Logros"
        subtitle="Sistema de incentivos para Asesores Comerciales"
      />

      {/* ─── KPI RESUMEN ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-50 border-emerald-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                Premios ganados
              </p>
              <p className="text-3xl font-bold text-emerald-700" style={{ fontFamily: 'var(--font-display)' }}>
                {premiosGanados}
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                {formatPesos(montoTotalPremios)}
              </p>
            </div>
            <Trophy size={28} className="text-emerald-400" />
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-50 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                Trámites totales
              </p>
              <p className="text-3xl font-bold text-blue-700" style={{ fontFamily: 'var(--font-display)' }}>
                {dataPremios.tramitesAutoCalificantes + dataPremios.tramitesMotoCalificantes}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                (Solo trámites pagados)
              </p>
            </div>
            <TrendingUp size={28} className="text-blue-400" />
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-orange-50 to-orange-50 border-orange-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                Honorarios facturados
              </p>
              <p className="text-2xl font-bold text-orange-700" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPesos(dataPremios.facturacionTotalHonorarios)}
              </p>
              <p className="text-xs text-orange-600 mt-1">
                (Sin SUATS ni informe)
              </p>
            </div>
            <Award size={28} className="text-orange-400" />
          </div>
        </Card>
      </div>

      {/* ─── INFORMACIÓN IMPORTANTE ────────────────────────────────────────── */}
      <Card className="p-4 border-blue-200 bg-blue-50">
        <div className="flex gap-3">
          <Zap size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">⚡ Cálculo correcto de premios</p>
            <p className="text-xs leading-relaxed">
              Los premios se calculan sobre <strong>honorarios de gestoría</strong> únicamente.
              El costo de SUATS ($16.000) y el informe de persona se excluyen de estos cálculos
              para no afectar tu desempeño.
            </p>
          </div>
        </div>
      </Card>

      {/* ─── PREMIOS POR CANTIDAD — AUTOMÓVILES ──────────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandidoAuto(!expandidoAuto)}
          className="w-full flex items-center justify-between p-4 bg-white border border-gray-200
                     rounded-xl hover:border-orange-300 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-lg">🚗</span>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Premios por cantidad (Automóviles)</p>
              <p className="text-xs text-gray-500">
                {dataPremios.cicloAuto.premiosGanados} ganados · {cfg.tramitesPorPremioAuto} trámites por premio
              </p>
            </div>
          </div>
          {expandidoAuto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandidoAuto && (
          <div className="space-y-2 pl-3">
            {premiosAutoPorCantidad.map((premio, idx) => (
              <div
                key={premio.id}
                className={`p-4 rounded-lg border transition-all ${
                  premio.alcanzado
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{premio.titulo}</p>
                    <p className="text-xs text-gray-500">
                      {premio.alcanzado
                        ? `✅ Ganado · ${formatPesos(premio.montoTramites)}`
                        : `⏳ En progreso · Falta ${premio.faltaAlcanzar} trámite(s)`
                      }
                    </p>
                  </div>
                  {premio.alcanzado && <Trophy size={20} className="text-emerald-600" />}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        premio.alcanzado ? 'bg-emerald-500' : 'bg-orange-400'
                      }`}
                      style={{ width: `${Math.min(100, premio.progreso)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-10 text-right">
                    {Math.round(premio.progreso)}%
                  </span>
                </div>

                <div className="text-xs text-gray-600 mt-2">
                  {premio.valorActual} / {premio.tramitesPorPremio} trámites
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── PREMIOS POR CANTIDAD — MOTOS ─────────────────────────────────── */}
      {dataPremios.tramitesMotoCalificantes > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setExpandidoMoto(!expandidoMoto)}
            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200
                       rounded-xl hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">🏍️</span>
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Premios por cantidad (Motos)</p>
                <p className="text-xs text-gray-500">
                  {dataPremios.cicloMoto.premiosGanados} ganados · {cfg.tramitesPorPremioMoto} trámites por premio
                </p>
              </div>
            </div>
            {expandidoMoto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandidoMoto && (
            <div className="space-y-2 pl-3">
              {premiosMotoPorCantidad.map((premio) => (
                <div
                  key={premio.id}
                  className={`p-4 rounded-lg border transition-all ${
                    premio.alcanzado
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{premio.titulo}</p>
                      <p className="text-xs text-gray-500">
                        {premio.alcanzado
                          ? `✅ Ganado · ${formatPesos(premio.montoTramites)}`
                          : `⏳ En progreso · Falta ${premio.faltaAlcanzar} trámite(s)`
                        }
                      </p>
                    </div>
                    {premio.alcanzado && <Trophy size={20} className="text-emerald-600" />}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          premio.alcanzado ? 'bg-emerald-500' : 'bg-blue-400'
                        }`}
                        style={{ width: `${Math.min(100, premio.progreso)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 w-10 text-right">
                      {Math.round(premio.progreso)}%
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 mt-2">
                    {premio.valorActual} / {premio.tramitesPorPremio} trámites
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── PREMIOS POR MONTO (HITOS) ────────────────────────────────────── */}
      {hitosPremios.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setExpandidoHitos(!expandidoHitos)}
            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200
                       rounded-xl hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Target size={20} className="text-purple-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Hitos por facturación</p>
                <p className="text-xs text-gray-500">
                  {dataPremios.hitosAlcanzadosAhora.length} alcanzado(s) · Basado en honorarios netos
                </p>
              </div>
            </div>
            {expandidoHitos ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandidoHitos && (
            <div className="space-y-2 pl-3">
              {hitosPremios.map((hito) => (
                <div
                  key={hito.id}
                  className={`p-4 rounded-lg border transition-all ${
                    hito.alcanzado
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{hito.titulo}</p>
                      <p className="text-xs text-gray-500">
                        {hito.alcanzado
                          ? `✅ Alcanzado · ${formatPesos(hito.montoMonto)} de premio`
                          : `⏳ En progreso · Falta ${formatPesos(hito.faltaAlcanzar)}`
                        }
                      </p>
                    </div>
                    {hito.alcanzado && <Trophy size={20} className="text-emerald-600" />}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          hito.alcanzado ? 'bg-emerald-500' : 'bg-purple-400'
                        }`}
                        style={{ width: `${Math.min(100, hito.progreso)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 w-10 text-right">
                      {Math.round(hito.progreso)}%
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 mt-2">
                    {formatPesos(hito.valorActual)} / {formatPesos(hito.montoUmbral ?? 0)} objetivo
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── INFORMACIÓN SOBRE EL CÁLCULO ─────────────────────────────────── */}
      <Card className="p-4 bg-gray-50 border-gray-200">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
          ℹ️ Cómo se calcula
        </p>
        <ul className="space-y-1 text-xs text-gray-600">
          <li>• <strong>Premios por cantidad:</strong> 1 premio cada {cfg.tramitesPorPremioAuto} (Autos) o {cfg.tramitesPorPremioMoto} (Motos) trámites pagados</li>
          <li>• <strong>Premios por monto:</strong> Hitos de facturación alcanzados (sin SUATS ni informe)</li>
          <li>• <strong>Base de cálculo:</strong> Honorarios de gestoría únicamente (excluye costos de SUATS e informe de persona)</li>
          <li>• <strong>Trámites calificantes:</strong> Solo trámites pagados y no cancelados</li>
        </ul>
      </Card>

    </div>
  )
}