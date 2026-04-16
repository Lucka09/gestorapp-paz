import { useNavigate } from 'react-router-dom'
import { useVencimientos }         from '@/hooks/useVencimientos'
import { useClientes }             from '@/hooks/useClientes'
import { useVehiculos }            from '@/hooks/useVehiculos'
import { calcularEstado, diasRestantes, ESTADO_VENC_CONFIG } from '@/lib/firestore/vencimientos'
import { VENCIMIENTO_LABELS, VENCIMIENTO_EMOJI } from '@/types'
import { PageHeader, Spinner, Card } from '@/components/ui'
import { EstadoVencBadge }         from './PanelVencimientos'
import { AlertTriangle, Car, Calendar, MessageCircle } from 'lucide-react'
import type { Vencimiento } from '@/types'

function VencimientoRow({
  v, clienteNombre, onClick, onWhatsApp,
}: {
  v:             Vencimiento
  clienteNombre: string
  onClick:       () => void
  onWhatsApp:    () => void
}) {
  const estado = calcularEstado(v)
  const cfg    = ESTADO_VENC_CONFIG[estado]

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 border-b border-gray-50
                   last:border-0 cursor-pointer hover:bg-gray-50 transition-colors`}
    >
      <span className="text-xl shrink-0">{VENCIMIENTO_EMOJI[v.tipo]}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-bold text-gray-900 font-mono">{v.patente}</span>
          <EstadoVencBadge v={v} />
        </div>
        <p className="text-xs text-gray-500">
          {VENCIMIENTO_LABELS[v.tipo]} · {clienteNombre}
        </p>
        {v.compania && (
          <p className="text-xs text-gray-400">{v.compania}</p>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className="text-xs text-gray-400">
          {v.fechaVencimiento?.toDate?.()?.toLocaleDateString('es-AR', {
            day: 'numeric', month: 'short', year: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}

export default function VencimientosPage() {
  const navigate              = useNavigate()
  const { vencimientos, loading, vencidos, porVencer } = useVencimientos()
  const { clientes }          = useClientes()
  const { vehiculos }         = useVehiculos()

  const clienteMap  = Object.fromEntries(clientes.map(c  => [c.id,  c]))
  const vehiculoMap = Object.fromEntries(vehiculos.map(v => [v.id,  v]))

  const ordenados = [...vencimientos].sort((a, b) => {
    const da = diasRestantes(a)
    const db = diasRestantes(b)
    return da - db
  })

  const handleWhatsApp = (v: Vencimiento) => {
    const cliente = clienteMap[v.clienteId]
    if (!cliente?.telefono) return
    const tel = cliente.telefono.replace(/\D/g,'')
    const num = tel.startsWith('54') ? tel : `549${tel}`
    const dias = diasRestantes(v)
    const msg = encodeURIComponent(
      `Hola ${cliente.nombre}! Te contactamos desde Gestoría Paz 👋\n\n` +
      `${VENCIMIENTO_EMOJI[v.tipo]} Tu *${VENCIMIENTO_LABELS[v.tipo]}* ` +
      `del vehículo ${v.patente} ` +
      `${dias < 0
        ? `venció hace ${Math.abs(dias)} días.`
        : `vence en ${dias} días.`}\n\n` +
      `Podemos ayudarte con la renovación. ¿Hablamos?\n📞 11 3614-1431`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  if (loading) return <Spinner label="Cargando vencimientos..." />

  return (
    <div className="space-y-5 animate-fadein">

      <PageHeader
        title="Vencimientos"
        subtitle="VTV, seguros, cédulas y documentación de los vehículos"
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Vencidos',    value: vencidos.length,  color: '#EF4444', bg: '#FEF2F2',  icon: AlertTriangle },
          { label: 'Por vencer',  value: porVencer.length, color: '#F59E0B', bg: '#FFFBEB',  icon: Calendar      },
          { label: 'Registrados', value: vencimientos.length, color: '#D4621A', bg: '#FFF7F0', icon: Car         },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                 style={{ background: k.bg }}>
              <k.icon size={16} style={{ color: k.color }} />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-gray-900"
               style={{ fontFamily: 'var(--font-display)', color: k.value > 0 && k.label !== 'Registrados' ? k.color : undefined }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {/* Cabecera */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Todos los vencimientos ({ordenados.length})
          </p>
        </div>

        {ordenados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Calendar size={36} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-gray-400">Sin vencimientos registrados</p>
            <p className="text-xs text-gray-300 mt-1">
              Agregalos desde la ficha de cada vehículo
            </p>
          </div>
        ) : (
          ordenados.map(v => (
            <VencimientoRow
              key={v.id}
              v={v}
              clienteNombre={
                clienteMap[v.clienteId]
                  ? `${clienteMap[v.clienteId].apellido}, ${clienteMap[v.clienteId].nombre}`
                  : '—'
              }
              onClick={() => navigate(`/admin/vehiculos`)}
              onWhatsApp={() => handleWhatsApp(v)}
            />
          ))
        )}
      </Card>

      {/* Tip */}
      {vencidos.length + porVencer.length > 0 && (
        <div className="bg-[var(--gp-orange-pale)] border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
          <MessageCircle size={18} style={{ color:'var(--gp-orange)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {vencidos.length + porVencer.length} vehículo{vencidos.length + porVencer.length > 1 ? 's' : ''} con vencimientos pendientes
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Hacé click en cualquier fila para ir al vehículo y enviar el recordatorio por WhatsApp al cliente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
