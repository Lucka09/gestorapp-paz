import { useState, useMemo, useCallback } from 'react'
import { useNavigate }           from 'react-router-dom'
import {
  Calculator, RefreshCw, FileText,
  ChevronDown, ChevronUp, AlertCircle,
  CheckCircle, DollarSign, Info,
  Sparkles, ArrowRight, Copy,
} from 'lucide-react'
import {
  calcularHonorarios, REQUIERE_VALOR_FISCAL,
  type ParametrosCalculo, type ResultadoCalculo,
  type ConceptoCalculo,
} from '@/utils/calculadoraDNRPA'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import { PageHeader, Button, Input, Select, Card } from '@/components/ui'
import toast from 'react-hot-toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fp(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

// ─── FILA DE CONCEPTO ────────────────────────────────────────────────────────

function FilaConcepto({ c }: { c: ConceptoCalculo }) {
  return (
    <div className={`flex items-start justify-between py-3 border-b border-gray-50 last:border-0 ${
      !c.obligatorio ? 'opacity-70' : ''
    }`}>
      <div className="flex-1 pr-4">
        <p className="text-sm font-semibold text-gray-800">{c.concepto}</p>
        <p className="text-xs text-gray-400 mt-0.5">{c.descripcion}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-gray-900">{fp(c.monto)}</p>
        <p className="text-xs text-gray-400">
          {c.obligatorio ? 'Sellado DNRPA' : 'Gastos'}
        </p>
      </div>
    </div>
  )
}

// ─── RESULTADO CARD ──────────────────────────────────────────────────────────

function ResultadoCard({
  resultado, honorariosCustom, onUsarEnPresupuesto,
}: {
  resultado:            ResultadoCalculo
  honorariosCustom:     string
  onUsarEnPresupuesto:  () => void
}) {
  const [expandido, setExpandido] = useState(false)

  return (
    <div className="space-y-4 animate-fadein">

      {/* Alerta aproximado */}
      {resultado.esAproximado && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100
                        rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Este cálculo es aproximado. Verificá con el organismo antes de emitir el presupuesto definitivo.
          </p>
        </div>
      )}

      {/* Resumen visual */}
      <Card className="overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 bg-[#1A1A1A] flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {resultado.tipoLabel}
            </p>
            {resultado.valorFiscal > 0 && (
              <p className="text-xs text-gray-500">
                Valor fiscal: {fp(resultado.valorFiscal)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-0.5">Total estimado</p>
            <p className="text-2xl font-bold text-white"
               style={{ fontFamily: 'var(--font-display)' }}>
              {fp(resultado.totalFinal)}
            </p>
          </div>
        </div>

        {/* Desglose por categoría */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {[
            { label: 'Sellados DNRPA',   valor: resultado.subtotalDNRPA,   color: '#3B82F6' },
            { label: 'Gastos operativos',valor: resultado.totalFinal - resultado.subtotalDNRPA - resultado.honorariosGest, color: '#9CA3AF' },
            { label: 'Honorarios',        valor: resultado.honorariosGest,  color: '#D4621A' },
          ].map(item => (
            <div key={item.label} className="px-4 py-4 text-center">
              <p className="text-xs text-gray-400 mb-1 leading-tight">{item.label}</p>
              <p className="text-base font-bold" style={{ color: item.color }}>
                {fp(item.valor)}
              </p>
              <p className="text-xs text-gray-400">
                {resultado.totalFinal > 0
                  ? `${Math.round((item.valor / resultado.totalFinal) * 100)}%`
                  : '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Barra proporcional */}
        <div className="flex h-2 mx-5 mb-4 rounded-full overflow-hidden gap-0.5">
          {[
            { v: resultado.subtotalDNRPA, c: '#3B82F6' },
            { v: resultado.totalFinal - resultado.subtotalDNRPA - resultado.honorariosGest, c: '#E5E7EB' },
            { v: resultado.honorariosGest, c: '#D4621A' },
          ].map((b, i) => (
            <div key={i} style={{
              flex:       Math.max(b.v / resultado.totalFinal, 0.01),
              background: b.c,
              transition: 'flex 0.5s ease',
            }} />
          ))}
        </div>

        {/* Detalle expandible */}
        <div className="px-5 pb-4">
          <button
            onClick={() => setExpandido(!expandido)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400
                       hover:text-gray-600 transition-colors"
          >
            {expandido ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            {expandido ? 'Ocultar desglose' : 'Ver desglose completo'}
          </button>

          {expandido && (
            <div className="mt-4 space-y-0">
              {resultado.conceptos.map((c, i) => (
                <FilaConcepto key={i} c={c} />
              ))}

              {/* Honorarios */}
              <div className="flex items-center justify-between py-3 border-t-2 border-gray-200 mt-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Honorarios Gestoría Paz
                  </p>
                  <p className="text-xs text-gray-400">
                    {honorariosCustom ? 'Monto personalizado' : 'Según tabla de honorarios'}
                  </p>
                </div>
                <p className="text-sm font-bold" style={{ color: 'var(--gp-orange)' }}>
                  {fp(resultado.honorariosGest)}
                </p>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between py-3.5 px-4 rounded-xl
                              mt-2" style={{ background: '#1A1A1A' }}>
                <p className="text-sm font-bold text-white">TOTAL ESTIMADO</p>
                <p className="text-xl font-bold text-white"
                   style={{ fontFamily: 'var(--font-display)' }}>
                  {fp(resultado.totalFinal)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Notas */}
      {resultado.notas.length > 0 && (
        <div className="space-y-1.5">
          {resultado.notas.map((n, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
              <Info size={11} className="shrink-0 mt-0.5 text-gray-400" />
              {n}
            </div>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3">
        <Button onClick={onUsarEnPresupuesto} className="flex-1">
          <FileText size={15} />
          Usar en presupuesto
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(
              `${resultado.tipoLabel}\n` +
              `Sellados DNRPA: ${fp(resultado.subtotalDNRPA)}\n` +
              `Honorarios: ${fp(resultado.honorariosGest)}\n` +
              `TOTAL: ${fp(resultado.totalFinal)}`
            )
            toast.success('Copiado al portapapeles')
          }}
        >
          <Copy size={15} />
        </Button>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function CalculadoraPage() {
  const navigate = useNavigate()
  const anioActual = new Date().getFullYear()

  // Parámetros del formulario
  const [tipo,          setTipo]          = useState<TipoTramite>('transferencia')
  const [valorFiscal,   setValorFiscal]   = useState('')
  const [anioVehiculo,  setAnioVehiculo]  = useState(String(anioActual - 3))
  const [tipoVehiculo,  setTipoVehiculo]  = useState<'auto'|'moto'|'camion'|'utilitario'>('auto')
  const [honorariosC,   setHonorariosC]   = useState('')
  const [incluirGastos, setIncluirGastos] = useState(true)
  const [provincia,     setProvincia]     = useState<'Buenos Aires'|'CABA'|'Otra'>('Buenos Aires')
  const [calculado,     setCalculado]     = useState(false)

  const necesitaValorFiscal = REQUIERE_VALOR_FISCAL.includes(tipo)

  // Calcular en tiempo real
  const resultado = useMemo<ResultadoCalculo | null>(() => {
    if (!calculado) return null
    if (necesitaValorFiscal && (!valorFiscal || parseFloat(valorFiscal) <= 0)) return null

    return calcularHonorarios({
      tipo,
      valorFiscal:   parseFloat(valorFiscal) || 0,
      anioVehiculo:  parseInt(anioVehiculo)  || anioActual,
      tipoVehiculo,
      honorariosCustom: parseFloat(honorariosC) || 0,
      incluirGastos,
      provincia,
    })
  }, [calculado, tipo, valorFiscal, anioVehiculo, tipoVehiculo,
      honorariosC, incluirGastos, provincia, necesitaValorFiscal])

  const handleCalcular = () => {
    if (necesitaValorFiscal && (!valorFiscal || parseFloat(valorFiscal) <= 0)) {
      toast.error('Ingresá el valor fiscal del vehículo')
      return
    }
    setCalculado(true)
  }

  const handleReset = () => {
    setCalculado(false)
    setValorFiscal('')
    setHonorariosC('')
  }

  const handleUsarEnPresupuesto = () => {
    if (!resultado) return
    // Pasar el resultado al módulo de presupuestos via state
    navigate('/admin/clientes', {
      state: {
        abrirPresupuesto: true,
        presupuesto: {
          tipoTramite: tipo,
          honorarios:  resultado.honorariosGest,
          incluyeGastos: incluirGastos,
          gastosAdicionales: resultado.totalFinal - resultado.subtotalDNRPA - resultado.honorariosGest,
        },
      },
    })
    toast.success('Datos cargados en presupuesto')
  }

  // Tipos para el selector — omitir 'vtv' y 'otro' del cálculo específico
  const TIPOS_CALC: TipoTramite[] = [
    'transferencia','alta','baja','tramite_08',
    'duplicado_titulo','duplicado_cedula','cambio_radicacion',
    'informe_dominio','certificado_dominio','inscripcion_inicial',
    'prenda','descargo_multa','inhibicion','levantamiento_inhibicion','otro',
  ]

  return (
    <div className="space-y-5 animate-fadein max-w-2xl">

      <PageHeader
        title="Calculadora DNRPA"
        subtitle="Sellados, tasas y honorarios por tipo de trámite"
      />

      {/* Card formulario */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'var(--gp-orange)' }}>
            <Calculator size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">
              Calculadora de aranceles
            </p>
            <p className="text-xs text-gray-400">
              Tabla DNRPA 2025 · Se actualiza con cada disposición
            </p>
          </div>
        </div>

        <div className="space-y-4">

          {/* Tipo de trámite */}
          <Select
            label="Tipo de trámite *"
            value={tipo}
            onChange={e => { setTipo(e.target.value as TipoTramite); setCalculado(false) }}
          >
            {TIPOS_CALC.map(t => (
              <option key={t} value={t}>{TIPO_TRAMITE_LABELS[t]}</option>
            ))}
          </Select>

          {/* Valor fiscal — solo para transferencia */}
          {necesitaValorFiscal && (
            <div className="space-y-1.5">
              <Input
                label="Valor fiscal del vehículo ($) *"
                type="number"
                min={0}
                value={valorFiscal}
                onChange={e => { setValorFiscal(e.target.value); setCalculado(false) }}
                placeholder="Ej: 15000000"
                hint="Valor que figura en el título de propiedad o valuación fiscal"
              />
              {/* Guía rápida de rangos */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '$3M',  valor: '3000000'  },
                  { label: '$8M',  valor: '8000000'  },
                  { label: '$15M', valor: '15000000' },
                  { label: '$25M', valor: '25000000' },
                  { label: '$50M', valor: '50000000' },
                ].map(v => (
                  <button
                    key={v.valor}
                    type="button"
                    onClick={() => { setValorFiscal(v.valor); setCalculado(false) }}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all
                                ${valorFiscal === v.valor
                                  ? 'border-[var(--gp-orange)] bg-[var(--gp-orange-pale)] text-[var(--gp-orange)]'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Datos del vehículo */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo de vehículo"
              value={tipoVehiculo}
              onChange={e => { setTipoVehiculo(e.target.value as any); setCalculado(false) }}
            >
              <option value="auto">Auto</option>
              <option value="moto">Moto</option>
              <option value="utilitario">Utilitario</option>
              <option value="camion">Camión</option>
            </Select>
            <Input
              label="Año del vehículo"
              type="number"
              min={1980}
              max={anioActual + 1}
              value={anioVehiculo}
              onChange={e => setAnioVehiculo(e.target.value)}
            />
          </div>

          {/* Honorarios personalizados */}
          <Input
            label="Honorarios gestoría ($)"
            type="number"
            min={0}
            value={honorariosC}
            onChange={e => { setHonorariosC(e.target.value); setCalculado(false) }}
            placeholder="Dejar vacío para usar la tabla de honorarios"
            hint="Si lo dejás vacío se usa el valor configurado en la tabla"
          />

          {/* Opciones */}
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={incluirGastos}
                onChange={e => { setIncluirGastos(e.target.checked); setCalculado(false) }}
                className="w-4 h-4 rounded accent-[#D4621A]"
              />
              <span className="text-sm text-gray-700">Incluir gastos operativos</span>
            </label>

            <Select
              label=""
              value={provincia}
              onChange={e => { setProvincia(e.target.value as any); setCalculado(false) }}
            >
              <option value="Buenos Aires">Prov. Buenos Aires</option>
              <option value="CABA">CABA</option>
              <option value="Otra">Otra provincia</option>
            </Select>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button
              onClick={handleCalcular}
              className="flex-1"
              size="lg"
            >
              <Sparkles size={16} />
              Calcular honorarios
            </Button>
            {calculado && (
              <Button variant="secondary" onClick={handleReset}>
                <RefreshCw size={15} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Resultado */}
      {resultado && (
        <ResultadoCard
          resultado={resultado}
          honorariosCustom={honorariosC}
          onUsarEnPresupuesto={handleUsarEnPresupuesto}
        />
      )}

      {/* Info sobre la tabla */}
      {!calculado && (
        <div className="bg-[var(--gp-orange-pale)] border border-orange-100 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info size={16} style={{ color: 'var(--gp-orange)', flexShrink: 0, marginTop: 2 }} />
            <div className="space-y-1.5 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">Sobre la tabla de aranceles</p>
              <p>Los valores DNRPA se actualizan mediante disposiciones del Registro Nacional. Esta calculadora usa los valores vigentes a 2025.</p>
              <p>Para los honorarios de la gestoría, el sistema usa la tabla configurada en <strong>Configuración → Tarifas</strong>. Podés sobrescribirlos en cada cálculo.</p>
              <p>Las transferencias usan escala progresiva sobre el valor fiscal: 1.8% hasta $3M, 2.0% hasta $8M, 2.2% hasta $20M, 2.4% hasta $50M, 2.6% en adelante.</p>
            </div>
          </div>
        </div>
      )}

      {/* Historial rápido de tipos */}
      {!calculado && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Accesos rápidos
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {([
              'transferencia', 'tramite_08', 'duplicado_titulo',
              'informe_dominio', 'cambio_radicacion', 'alta',
            ] as TipoTramite[]).map(t => (
              <button
                key={t}
                onClick={() => { setTipo(t); setCalculado(false) }}
                className={`flex items-center justify-between px-4 py-3 rounded-xl
                             border-2 text-sm font-medium transition-all text-left
                             ${tipo === t
                               ? 'border-[var(--gp-orange)] bg-[var(--gp-orange-pale)] text-[var(--gp-orange)]'
                               : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
                             }`}
              >
                <span className="truncate">{TIPO_TRAMITE_LABELS[t]}</span>
                <ArrowRight size={13} className="shrink-0 ml-2 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
