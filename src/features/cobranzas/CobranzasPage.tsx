import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePaginacion }     from '@/hooks/usePaginacion'
import ControlPaginacion     from '@/components/shared/ControlPaginacion'
import {
  DollarSign, CheckCircle, Clock, AlertTriangle,
  MessageCircle, Search, Filter, ChevronDown,
  X, ArrowUpDown, Banknote, CreditCard, FileCheck,
  RotateCcw, TrendingUp, Download
} from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { useConfiguracion } from '@/hooks/useConfiguracion'
import { clienteDoc }       from '@/lib/firestore/collections'
import { useTramites }   from '@/hooks/useTramites'
import { useClientes }   from '@/hooks/useClientes'
import { useAuth }          from '@/hooks/useAuth'
import { registrarPago, desmarcarPago } from '@/lib/firestore/tramites'
import { PageHeader, Card, Button, Input, Select, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useGestoriaId }    from '@/context/GestoriaContext'
import { EstadoBadge } from '@/features/tramites/EstadoBadge'
import { TIPO_TRAMITE_LABELS } from '@/types'
import type { Tramite } from '@/types'
import { formatFecha, formatPesos } from '@/utils'
import toast from 'react-hot-toast'
import { usePageTitle } from '@/hooks/usePageTitle'
import { generarComprobantePago, descargarRecibo } from '@/utils/comprobantePago'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type FiltroEstadoPago = 'todos' | 'pendiente' | 'pagado' | 'vencido'
type OrdenCobranza   = 'monto-desc' | 'monto-asc' | 'antiguedad' | 'estado'
type FormaPago = 'efectivo' | 'transferencia' | 'mercadopago' | 'cheque' | 'mixto'
type PeriodoCobranza = 'semana' | 'mes' | 'todos'

interface TramiteConCliente extends Tramite {
  clienteNombreCompleto: string
  clienteTelefono:       string
  diasDesdeEntrega:      number
}

const FORMA_PAGO_OPTS = [
  { value: 'efectivo',      label: '💵 Efectivo',          icon: Banknote   },
  { value: 'transferencia', label: '📱 Transferencia',      icon: CreditCard },
  { value: 'mercadopago',   label: '🔵 Mercado Pago',       icon: CreditCard },
  { value: 'cheque',        label: '📄 Cheque',             icon: FileCheck  },
  { value: 'mixto',         label: '🔀 Mixto',              icon: Banknote   },
]

const PERIODO_LABELS: Record<PeriodoCobranza, string> = {
  semana: 'Esta semana',
  mes:    'Este mes',
  todos:  'Todo',
}

// ─── HELPERS DE FECHA ─────────────────────────────────────────────────────────

function diasDesde(t: Tramite): number {
  const d = t.actualizadoEn?.toDate?.()
  if (!d) return 0
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function badgeAntiguedad(dias: number) {
  if (dias === 0) return { label: 'Hoy',         cls: 'bg-emerald-100 text-emerald-700' }
  if (dias <= 7)  return { label: `${dias}d`,     cls: 'bg-blue-100 text-blue-700' }
  if (dias <= 30) return { label: `${dias}d`,     cls: 'bg-yellow-100 text-yellow-700' }
  return              { label: `+${dias}d ⚠️`,    cls: 'bg-red-100 text-red-600 font-bold' }
}

/** Rango de fechas según el período elegido. inicio=null significa "todos". */
function rangoPeriodo(p: PeriodoCobranza): { inicio: Date | null; fin: Date } {
  const fin = new Date()
  if (p === 'todos') return { inicio: null, fin }

  if (p === 'mes') {
    const inicio = new Date(); inicio.setDate(1); inicio.setHours(0, 0, 0, 0)
    return { inicio, fin }
  }

  // 'semana' — lunes de esta semana a hoy (mismo criterio que el Panel de Mando)
  const inicio = new Date()
  const dia = inicio.getDay()
  const diffLunes = dia === 0 ? 6 : dia - 1
  inicio.setDate(inicio.getDate() - diffLunes)
  inicio.setHours(0, 0, 0, 0)
  return { inicio, fin }
}

// ─── MODAL REGISTRAR PAGO ─────────────────────────────────────────────────────

function ModalPago({
  tramite, clienteNombre, open, onClose,
}: {
  tramite:       Tramite
  clienteNombre: string
  open:          boolean
  onClose:       () => void
}) {
  const hoy = new Date().toISOString().split('T')[0]
  const { user }     = useAuth()
  const gestoriaId    = useGestoriaId()
  const { config }    = useConfiguracion()

  const cobradoPrevio   = ((tramite as any).historialPagos ?? []).reduce(
    (a: number, p: any) => a + p.monto, 0,
  )
  const saldoPendiente  = Math.max(0, tramite.honorarios - cobradoPrevio)

  const [monto,     setMonto]     = useState(String(saldoPendiente || tramite.honorarios || ''))
  const [formaPago, setFormaPago] = useState<string>('efectivo')
  const [fecha,     setFecha]     = useState(hoy)
  const [notas,     setNotas]     = useState('')
  const [saving,    setSaving]    = useState(false)

  const handleGuardar = async () => {
    if (tramite.tipo === 'descargo_multa') {
      toast.error('Las multas se cobran desde Trámites → Workflow, no desde aquí')
      return
    }
    if (!monto || parseFloat(monto) <= 0) { toast.error('Ingresá el monto cobrado'); return }
    if (!fecha)  { toast.error('Seleccioná la fecha del cobro'); return }
    if (!user)   { toast.error('Sesión no encontrada — recargá la página'); return }
    setSaving(true)
    try {
      const montoNum = parseFloat(monto)
      const resultado = await registrarPago(
        tramite.id,
        { monto: montoNum, formaPago: formaPago as FormaPago, fecha, notas },
        {
          uid:        user.uid,
          nombre:     `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email || 'Usuario',
          rol:        user.rol,
          gestoriaId,
        },
      )

      toast.success(
        resultado.tipo === 'total'
          ? 'Pago total registrado ✅ — trámite saldado'
          : 'Pago parcial registrado ✅',
      )

      try {
        const clienteSnap = await getDoc(clienteDoc(tramite.clienteId)).catch(() => null)
        const cliente = clienteSnap?.exists() ? ({ ...clienteSnap.data(), id: clienteSnap.id } as any) : null
        const blob = await generarComprobantePago({
          tramite, cliente,
          gestoriaNombre:      config.nombreComercial ?? 'Gestoría',
          gestoriaTelefono:    config.telefono1 ?? '',
          gestoriaWeb:         (config as any).sitioWeb ?? '',
          gestoriaEmail:       config.email,
          gestoriaDireccion:   config.direccion,
          gestoriaResponsable: config.responsable,
          colorPrimario:       '#D4621A',
          logoUrl:             '/logo-gp.jpg',
          reciboNumero:        resultado.numeroRecibo,
          metodoPago:          formaPago,
          montoOverride:       montoNum,
          periodoServicio:     resultado.tipo === 'parcial'
            ? `Pago parcial — saldo pendiente ${formatPesos(Math.max(0, saldoPendiente - montoNum))}`
            : undefined,
        })
        descargarRecibo(blob, `${resultado.numeroRecibo}.pdf`)
      } catch (e) {
        console.error('[ModalPago] No se pudo descargar el PDF al instante:', e)
        toast('El recibo se guardó — podés descargarlo desde Notificaciones', { icon: '📄' })
      }

      onClose()
    } catch {
      toast.error('Error al registrar el pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar cobro" size="sm"
           subtitle={`${TIPO_TRAMITE_LABELS[tramite.tipo]} — ${clienteNombre}`}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">{TIPO_TRAMITE_LABELS[tramite.tipo]}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{tramite.patente}</p>
            {cobradoPrevio > 0 && (
              <p className="text-xs text-emerald-600 mt-1">
                Ya cobrado: {formatPesos(cobradoPrevio)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Saldo pendiente</p>
            <p className="text-base font-bold" style={{ color: 'var(--gp-orange)' }}>
              {formatPesos(saldoPendiente)}
            </p>
          </div>
        </div>

        <Input
          label="Monto cobrado ($) *"
          type="number" min={0} value={monto}
          onChange={e => setMonto(e.target.value)}
          hint="Si es menor al saldo pendiente, queda registrado como pago parcial"
        />

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Forma de pago *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FORMA_PAGO_OPTS.map(opt => (
              <button
                key={opt.value} type="button"
                onClick={() => setFormaPago(opt.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm
                            font-medium transition-all
                            ${formaPago === opt.value
                              ? 'border-gp-orange bg-gp-orange-pale text-gp-orange'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
              >
                <span className="text-base">{opt.label.split(' ')[0]}</span>
                {opt.label.split(' ').slice(1).join(' ')}
              </button>
            ))}
          </div>
        </div>

        <Input label="Fecha del cobro *" type="date" value={fecha} max={hoy}
               onChange={e => setFecha(e.target.value)} />

        <Input label="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)}
               placeholder="Número de transferencia, cheque, etc." />

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleGuardar} loading={saving} className="flex-1">
            <Download size={15} /> Confirmar y descargar recibo
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── FILA DE COBRANZA ─────────────────────────────────────────────────────────

function FilaCobranza({
  item, onMarcarPago, onDesmarcar, onWhatsApp,
}: {
  item:          TramiteConCliente
  onMarcarPago:  (t: Tramite) => void
  onDesmarcar:   (id: string) => void
  onWhatsApp:    (t: TramiteConCliente) => void
}) {
  const antiguedad = badgeAntiguedad(item.diasDesdeEntrega)
  const vencido    = !item.pagado && item.diasDesdeEntrega > 30

  return (
    <div className={`flex items-center gap-4 py-3.5 px-4 border-b border-gray-50
                     last:border-0 hover:bg-gray-50/70 transition-colors
                     ${vencido ? 'bg-red-50/30' : ''}`}>

      <div className="shrink-0">
        {item.pagado
          ? <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle size={16} className="text-emerald-600" />
            </div>
          : <div className={`w-8 h-8 rounded-full flex items-center justify-center
                             ${vencido ? 'bg-red-100' : 'bg-yellow-100'}`}>
              <Clock size={16} className={vencido ? 'text-red-500' : 'text-yellow-600'} />
            </div>
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-bold text-gray-900 truncate">
            {item.clienteNombreCompleto}
          </span>
          <EstadoBadge estado={item.estado} showDot={false} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">
            {TIPO_TRAMITE_LABELS[item.tipo]}
          </span>
          {item.patente && (
            <span className="patente">{item.patente}</span>
          )}
          {item.pagado && item.formaPago && (
            <span className="text-xs text-gray-400 capitalize">
              · {item.formaPago}
            </span>
          )}
          {item.pagado && item.fechaPago && (
            <span className="text-xs text-gray-400">
              · {formatFecha(item.fechaPago)}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-base font-bold
                       ${item.pagado ? 'text-emerald-600' : vencido ? 'text-red-600' : 'text-gray-900'}`}>
          {formatPesos(item.honorarios)}
        </p>
        {!item.pagado && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${antiguedad.cls}`}>
            {antiguedad.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!item.pagado ? (
          <>
            <button
              onClick={() => onWhatsApp(item)}
              aria-label="Enviar recordatorio por WhatsApp"
              className="w-8 h-8 bg-[#25D366]/10 text-[#25D366] rounded-lg flex items-center
                         justify-center hover:bg-[#25D366]/20 transition-colors touch-xs"
            >
              <MessageCircle size={14} />
            </button>
            <Button size="sm" onClick={() => onMarcarPago(item)}>
              Cobrado
            </Button>
          </>
        ) : (
          <button
            onClick={() => onDesmarcar(item.id)}
            aria-label="Desmarcar pago"
            className="w-8 h-8 bg-gray-100 text-gray-400 rounded-lg flex items-center
                       justify-center hover:bg-gray-200 transition-colors touch-xs"
            title="Desmarcar como cobrado"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function CobranzasPage() {
  const { tramites, loading: loadT } = useTramites()
  usePageTitle('Cobranzas')
  const { clientes }                 = useClientes()

  // ── Período (lee ?periodo=semana de la URL — click desde el Panel de Mando) ──
  const [searchParams, setSearchParams] = useSearchParams()
  const periodoInicial = (searchParams.get('periodo') as PeriodoCobranza) ?? 'mes'
  const [periodo, setPeriodo] = useState<PeriodoCobranza>(
    ['semana', 'mes', 'todos'].includes(periodoInicial) ? periodoInicial : 'mes'
  )
  const cambiarPeriodo = (p: PeriodoCobranza) => {
    setPeriodo(p)
    setSearchParams(p === 'mes' ? {} : { periodo: p })
  }
  const { inicio: periodoInicio, fin: periodoFin } = useMemo(() => rangoPeriodo(periodo), [periodo])

  const [search,       setSearch]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoPago>('pendiente')
  const [orden,        setOrden]        = useState<OrdenCobranza>('antiguedad')
  const [modalPago,    setModalPago]    = useState<Tramite | null>(null)
  const [confirmDesm,  setConfirmDesm]  = useState<string | null>(null)

  const clienteMap = useMemo(() =>
    Object.fromEntries(clientes.map(c => [c.id, c])),
  [clientes])

  const tramitesConHonorarios = useMemo<TramiteConCliente[]>(() => {
    return tramites
      .filter(t => t.honorarios > 0 &&
         t.estado !== 'cancelado' &&
         t.tipo !== 'descargo_multa')
      .map(t => {
        const c = clienteMap[t.clienteId]
        return {
          ...t,
          clienteNombreCompleto: c
            ? `${c.apellido}, ${c.nombre}`
            : '—',
          clienteTelefono: c?.telefono ?? '',
          diasDesdeEntrega: diasDesde(t),
        }
      })
  }, [tramites, clienteMap])

  // Filtros — el período SOLO se aplica a lo que ya está pagado.
  // Lo pendiente/vencido siempre se ve completo (es "pendiente ahora", no
  // de un período pasado — no tendría sentido ocultarlo por fecha).
  const filtrados = useMemo(() => {
    let r = tramitesConHonorarios

    if (filtroEstado === 'pendiente') r = r.filter(t => !t.pagado)
    if (filtroEstado === 'vencido')   r = r.filter(t => !t.pagado && t.diasDesdeEntrega > 30)

    if (filtroEstado === 'pagado') {
      r = r.filter(t => {
        if (!t.pagado) return false
        if (!periodoInicio) return true
        const fp = t.fechaPago?.toDate?.()
        return fp && fp >= periodoInicio && fp <= periodoFin
      })
    }

    if (filtroEstado === 'todos' && periodoInicio) {
      r = r.filter(t => {
        if (!t.pagado) return true
        const fp = t.fechaPago?.toDate?.()
        return fp && fp >= periodoInicio && fp <= periodoFin
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(t =>
        t.clienteNombreCompleto.toLowerCase().includes(q) ||
        t.patente?.toLowerCase().includes(q) ||
        TIPO_TRAMITE_LABELS[t.tipo].toLowerCase().includes(q)
      )
    }

    if (orden === 'monto-desc')  r = [...r].sort((a, b) => b.honorarios - a.honorarios)
    if (orden === 'monto-asc')   r = [...r].sort((a, b) => a.honorarios - b.honorarios)
    if (orden === 'antiguedad')  r = [...r].sort((a, b) => b.diasDesdeEntrega - a.diasDesdeEntrega)
    if (orden === 'estado')      r = [...r].sort((a, b) => Number(a.pagado) - Number(b.pagado))

    return r
  }, [tramitesConHonorarios, filtroEstado, search, orden, periodoInicio, periodoFin])

  const pag = usePaginacion(filtrados, { porPagina: 30 })

  // KPIs — "Cobrado total" respeta el período elegido
  const kpis = useMemo(() => {
    const todos      = tramitesConHonorarios
    const pendientes = todos.filter(t => !t.pagado)
    const cobradosTodos = todos.filter(t => t.pagado)
    const cobradosPeriodo = cobradosTodos.filter(t => {
      if (!periodoInicio) return true
      const fp = t.fechaPago?.toDate?.()
      return fp && fp >= periodoInicio && fp <= periodoFin
    })
    const vencidos   = pendientes.filter(t => t.diasDesdeEntrega > 30)
    const totalPend  = pendientes.reduce((a, t) => a + t.honorarios, 0)
    const totalCob   = cobradosPeriodo.reduce((a, t) => a + t.honorarios, 0)
    return {
      pendientes: pendientes.length,
      cobrados:   cobradosPeriodo.length,
      vencidos:   vencidos.length,
      totalPend, totalCob,
    }
  }, [tramitesConHonorarios, periodoInicio, periodoFin])

  const handleDesmarcar = async (id: string) => {
    try {
      await desmarcarPago(id)
      toast.success('Pago desmarcado')
      setConfirmDesm(null)
    } catch { toast.error('Error al desmarcar') }
  }

  const handleWhatsApp = (item: TramiteConCliente) => {
    const tel = item.clienteTelefono.replace(/\D/g, '')
    const num = tel.startsWith('54') ? tel : `549${tel}`
    const msg = encodeURIComponent(
      `Hola ${item.clienteNombreCompleto.split(',')[1]?.trim() ?? ''}! 👋\n\n` +
      `Te contactamos desde Gestoría Paz para recordarte que tenés un cobro pendiente:\n\n` +
      `📋 *Trámite:* ${TIPO_TRAMITE_LABELS[item.tipo]}\n` +
      (item.patente ? `🚗 *Patente:* ${item.patente}\n` : '') +
      `💰 *Monto:* ${formatPesos(item.honorarios)}\n\n` +
      `Ante cualquier consulta estamos a tu disposición.\n` +
      `📞 11 3614-1431`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  if (loadT) return <SkeletonCobranzas />

  return (
    <div className="space-y-5 animate-fadein">

      <PageHeader
        title="Cobranzas"
        subtitle="Control de honorarios cobrados y pendientes"
      />

      {/* Selector de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Período:</span>
        <div className="flex gap-1.5">
          {(['semana', 'mes', 'todos'] as PeriodoCobranza[]).map(p => (
            <button
              key={p}
              onClick={() => cambiarPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${periodo === p
                            ? 'text-white shadow-sm'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              style={periodo === p ? { background: 'var(--gp-orange)' } : undefined}
            >
              {PERIODO_LABELS[p]}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-1">
          (aplica a "Cobrado total" — lo pendiente siempre se ve completo)
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Pendiente de cobro',
            value: formatPesos(kpis.totalPend),
            sub:   `${kpis.pendientes} trámite${kpis.pendientes !== 1 ? 's' : ''}`,
            color: '#EF4444', bg: '#FEF2F2',
            icon:  Clock,
            active: filtroEstado === 'pendiente',
            onClick: () => setFiltroEstado('pendiente'),
          },
          {
            label: 'Vencidos (+30 días)',
            value: String(kpis.vencidos),
            sub:   'sin cobrar',
            color: '#F97316', bg: '#FFF7ED',
            icon:  AlertTriangle,
            active: filtroEstado === 'vencido',
            onClick: () => setFiltroEstado('vencido'),
          },
          {
            label: 'Cobrado total',
            value: formatPesos(kpis.totalCob),
            sub:   `${kpis.cobrados} pagado${kpis.cobrados !== 1 ? 's' : ''} · ${PERIODO_LABELS[periodo]}`,
            color: '#059669', bg: '#F0FDF4',
            icon:  CheckCircle,
            active: filtroEstado === 'pagado',
            onClick: () => setFiltroEstado('pagado'),
          },
          {
            label: 'Total facturado',
            value: formatPesos(kpis.totalPend + kpis.totalCob),
            sub:   `${tramitesConHonorarios.length} trámites`,
            color: '#D4621A', bg: 'var(--gp-orange-pale)',
            icon:  TrendingUp,
            active: filtroEstado === 'todos',
            onClick: () => setFiltroEstado('todos'),
          },
        ].map(k => (
          <button
            key={k.label}
            onClick={k.onClick}
            className={`text-left p-4 rounded-2xl border-2 transition-all
                        ${k.active
                          ? 'border-gp-orange shadow-md'
                          : 'border-transparent bg-white shadow-sm hover:shadow-md'
                        }`}
            style={{ background: k.active ? k.bg : undefined }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                 style={{ background: k.bg }}>
              <k.icon size={17} style={{ color: k.color }} />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {k.label}
            </p>
            <p className="text-xl font-bold text-gray-900"
               style={{ fontFamily: 'var(--font-display)' }}>
              {k.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente, patente o trámite..."
              aria-label="Buscar cobranzas"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                         outline-none focus:border-gp-orange transition-colors"
            />
          </div>

          <div className="relative">
            <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={orden}
              onChange={e => setOrden(e.target.value as OrdenCobranza)}
              aria-label="Ordenar cobranzas"
              className="border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm
                         outline-none focus:border-gp-orange bg-white cursor-pointer"
            >
              <option value="antiguedad">Más antiguos primero</option>
              <option value="monto-desc">Mayor monto primero</option>
              <option value="monto-asc">Menor monto primero</option>
              <option value="estado">Por estado</option>
            </select>
          </div>

          <div className="flex items-center text-sm text-gray-400 px-1">
            {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
          </div>
        </div>
      </Card>

      {/* Tabla de cobranzas */}
      <Card className="overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <CheckCircle size={40} className="mb-3 opacity-40" />
            <p className="text-base font-semibold text-gray-400">
              {filtroEstado === 'pendiente'
                ? '¡Todo cobrado! No hay pendientes.'
                : filtroEstado === 'vencido'
                ? 'Sin cobros vencidos. ¡Excelente!'
                : 'Sin resultados para esta búsqueda.'}
            </p>
            {filtroEstado === 'pendiente' && (
              <p className="text-sm text-gray-300 mt-1">
                Todos los honorarios están al día.
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-4 gap-4 px-4 py-2.5 bg-gray-50
                            border-b border-gray-100 text-xs font-bold text-gray-400
                            uppercase tracking-wider">
              <span className="col-span-2">Cliente / Trámite</span>
              <span className="text-right">Monto</span>
              <span className="text-right">Acción</span>
            </div>

            {pag.itemsPagina.map(item => (
              <FilaCobranza
                key={item.id}
                item={item}
                onMarcarPago={t => setModalPago(t)}
                onDesmarcar={id => setConfirmDesm(id)}
                onWhatsApp={handleWhatsApp}
              />
            ))}

            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-600">
                  Total página ({pag.itemsPagina.length})
                </span>
                <span className="text-base font-bold"
                      style={{ color: 'var(--gp-orange)', fontFamily: 'var(--font-display)' }}>
                  {formatPesos(pag.itemsPagina.reduce((a, t) => a + t.honorarios, 0))}
                </span>
              </div>
              <ControlPaginacion
                pagina={pag.pagina} paginas={pag.paginas}
                desde={pag.desde}   hasta={pag.hasta} total={pag.total}
                onChange={pag.setPagina} labelItem="cobranzas"
              />
            </div>
          </div>
        )}
      </Card>

      {modalPago && (
        <ModalPago
          tramite={modalPago}
          clienteNombre={
            clienteMap[modalPago.clienteId]
              ? `${clienteMap[modalPago.clienteId].apellido}, ${clienteMap[modalPago.clienteId].nombre}`
              : '—'
          }
          open={!!modalPago}
          onClose={() => setModalPago(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDesm}
        onClose={() => setConfirmDesm(null)}
        onConfirm={async () => { if (confirmDesm) await handleDesmarcar(confirmDesm) }}
        titulo="¿Desmarcar como pagado?"
        descripcion="El trámite volverá a aparecer como pendiente de cobro."
        labelConfirm="Desmarcar"
        tipo="warning"
      />

    </div>
  )
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function SkeletonCobranzas() {
  return (
    <div className="space-y-5 animate-fadein">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-3.5 w-56 bg-gray-100 rounded-full animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="w-9 h-9 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-6 w-28 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-3 w-16 bg-gray-100 rounded-full animate-pulse" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3">
          <div className="h-10 flex-1 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-10 w-40 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="grid grid-cols-4 gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          {[2,1,1,1].map((s,i) => (
            <div key={i} className={`h-2.5 bg-gray-200 rounded-full animate-pulse col-span-${s}`} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-4 gap-4 px-4 py-4 border-b border-gray-50 last:border-0 items-center">
            <div className="col-span-2 space-y-2">
              <div className="h-4 w-36 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded-full animate-pulse" />
            </div>
            <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse ml-auto" />
            <div className="h-8 w-24 bg-gray-100 rounded-xl animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}