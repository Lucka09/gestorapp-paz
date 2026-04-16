import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  Plus, Edit2, Trash2, Bell, AlertTriangle,
  CheckCircle, Calendar, MessageCircle,
} from 'lucide-react'
import {
  crearVencimiento, actualizarVencimiento, eliminarVencimiento,
  calcularEstado, diasRestantes, ESTADO_VENC_CONFIG,
} from '@/lib/firestore/vencimientos'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useVencimientosVehiculo } from '@/hooks/useVencimientos'
import { Button, Input, Select, Spinner } from '@/components/ui'
import Modal        from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  VENCIMIENTO_LABELS, VENCIMIENTO_EMOJI,
  type TipoVencimiento, type Vencimiento,
} from '@/types'
import toast from 'react-hot-toast'

// ─── BADGE DE ESTADO ──────────────────────────────────────────────────────────

export function EstadoVencBadge({ v }: { v: Vencimiento }) {
  const estado = calcularEstado(v)
  const cfg    = ESTADO_VENC_CONFIG[estado]
  const dias   = diasRestantes(v)

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold
                       px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {estado === 'por_vencer' && dias >= 0
        ? `Vence en ${dias}d`
        : estado === 'vencido'
        ? `Vencido hace ${Math.abs(dias)}d`
        : cfg.label}
    </span>
  )
}

// ─── MODAL AGREGAR / EDITAR ───────────────────────────────────────────────────

function ModalVencimiento({
  open, onClose,
  vehiculoId, clienteId, patente,
  editando,
}: {
  open:       boolean
  onClose:    () => void
  vehiculoId: string
  clienteId:  string
  patente:    string
  editando?:  Vencimiento | null
}) {
  const gestoriaId = useGestoriaId()
  const esEdit = !!editando

  const [tipo,      setTipo]      = useState<TipoVencimiento>(editando?.tipo ?? 'vtv')
  const [fecha,     setFecha]     = useState(() => {
    const f = editando?.fechaVencimiento?.toDate?.()
    return f ? f.toISOString().split('T')[0] : ''
  })
  const [compania,  setCompania]  = useState(editando?.compania  ?? '')
  const [nroPoliza, setNroPoliza] = useState(editando?.nroPóliza ?? '')
  const [notas,     setNotas]     = useState(editando?.notas     ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const TIPOS: TipoVencimiento[] = [
    'vtv', 'seguro', 'cedula_verde', 'poliza',
    'oblea_gnc', 'revision_tecnica', 'habilitacion', 'otro',
  ]

  const handleGuardar = async () => {
    if (!fecha) { setError('La fecha es obligatoria'); return }
    setSaving(true); setError('')
    try {
      if (esEdit && editando) {
        await actualizarVencimiento(editando.id, {
          tipo,
          fechaVencimiento: Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          compania:  compania  || undefined,
          nroPóliza: nroPoliza || undefined,
          notas:     notas     || undefined,
        })
        toast.success('Vencimiento actualizado')
      } else {
        // gestoriaId es inyectado aquí — el modal no lo recibe como prop
        await crearVencimiento({
          gestoriaId,
          vehiculoId, clienteId, patente, tipo,
          fechaVencimiento: Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          compania:  compania  || undefined,
          nroPóliza: nroPoliza || undefined,
          notas:     notas     || undefined,
        })
        toast.success('Vencimiento agregado')
      }
      onClose()
    } catch { setError('Error al guardar') }
    finally  { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esEdit ? 'Editar vencimiento' : 'Agregar vencimiento'}
      subtitle={patente}
      size="sm"
    >
      <div className="space-y-4">

        {/* Tipo */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Tipo de vencimiento
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {TIPOS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs
                            font-medium border-2 transition-all text-left
                            ${tipo === t
                              ? 'border-[var(--gp-orange)] bg-[var(--gp-orange-pale)] text-[var(--gp-orange)]'
                              : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
                            }`}
              >
                <span>{VENCIMIENTO_EMOJI[t]}</span>
                <span className="truncate">{VENCIMIENTO_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Fecha de vencimiento *"
          type="date"
          value={fecha}
          onChange={e => { setFecha(e.target.value); setError('') }}
        />

        {(tipo === 'seguro' || tipo === 'poliza') && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Compañía aseguradora"
              value={compania}
              onChange={e => setCompania(e.target.value)}
              placeholder="MAPFRE, Zurich..."
            />
            <Input
              label="N° de póliza"
              value={nroPoliza}
              onChange={e => setNroPoliza(e.target.value)}
              placeholder="123456789"
            />
          </div>
        )}

        <Input
          label="Notas (opcional)"
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones, recordatorios..."
        />

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleGuardar} loading={saving} className="flex-1">
            {esEdit ? <><Edit2 size={14} /> Guardar</> : <><Plus size={14} /> Agregar</>}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── PANEL DE VENCIMIENTOS ────────────────────────────────────────────────────

export function PanelVencimientos({
  vehiculoId, clienteId, patente, telefono,
}: {
  vehiculoId: string
  clienteId:  string
  patente:    string
  telefono?:  string
}) {
  const { vencimientos, loading } = useVencimientosVehiculo(vehiculoId)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState<Vencimiento | null>(null)
  const [elimId,    setElimId]    = useState<string | null>(null)

  const handleEliminar = async () => {
    if (!elimId) return
    try {
      await eliminarVencimiento(elimId)
      toast.success('Vencimiento eliminado')
      setElimId(null)
    } catch { toast.error('Error') }
  }

  const handleWhatsApp = (v: Vencimiento) => {
    if (!telefono) return
    const tel  = telefono.replace(/\D/g, '')
    const num  = tel.startsWith('54') ? tel : `549${tel}`
    const dias = diasRestantes(v)
    const msg  = encodeURIComponent(
      `Hola! Te contactamos desde Gestoría Paz 👋\n\n` +
      `${VENCIMIENTO_EMOJI[v.tipo]} Tu *${VENCIMIENTO_LABELS[v.tipo]}* del vehículo ${patente} ` +
      `${dias < 0
        ? `venció hace ${Math.abs(dias)} días (${v.fechaVencimiento?.toDate?.()?.toLocaleDateString('es-AR') ?? ''}).`
        : `vence en ${dias} días (${v.fechaVencimiento?.toDate?.()?.toLocaleDateString('es-AR') ?? ''}).`
      }\n\nPodemos ayudarte con la renovación. ¿Hablamos?\n📞 11 3614-1431`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  if (loading) return <Spinner />

  const vencidos = vencimientos.filter(v => calcularEstado(v) === 'vencido')
  const proximos = vencimientos.filter(v => calcularEstado(v) === 'por_vencer')

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Vencimientos
          </span>
          {(vencidos.length + proximos.length) > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                               ${vencidos.length > 0
                                 ? 'bg-red-100 text-red-700'
                                 : 'bg-amber-100 text-amber-700'}`}>
              {vencidos.length > 0
                ? `${vencidos.length} vencido${vencidos.length > 1 ? 's' : ''}`
                : `${proximos.length} por vencer`}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => { setEditando(null); setModalOpen(true) }}>
          <Plus size={13} /> Agregar
        </Button>
      </div>

      {/* Sin vencimientos */}
      {vencimientos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-300
                        border-2 border-dashed border-gray-100 rounded-2xl">
          <Calendar size={28} className="mb-2 opacity-40" />
          <p className="text-sm text-gray-400">Sin vencimientos registrados</p>
          <button
            onClick={() => { setEditando(null); setModalOpen(true) }}
            className="mt-2 text-xs font-medium"
            style={{ color: 'var(--gp-orange)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={12} className="inline mr-1" />Agregar primero
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {vencimientos.map(v => {
            const estado = calcularEstado(v)
            const cfg    = ESTADO_VENC_CONFIG[estado]
            return (
              <div
                key={v.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border
                             ${cfg.bg} ${cfg.border} group`}
              >
                <span className="text-xl shrink-0" aria-hidden="true">
                  {VENCIMIENTO_EMOJI[v.tipo]}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${cfg.color}`}>
                      {VENCIMIENTO_LABELS[v.tipo]}
                    </span>
                    <EstadoVencBadge v={v} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {v.fechaVencimiento?.toDate?.()?.toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      }) ?? '—'}
                    </span>
                    {v.compania  && <span className="text-xs text-gray-400">{v.compania}</span>}
                    {v.nroPóliza && <span className="text-xs text-gray-400 font-mono">#{v.nroPóliza}</span>}
                  </div>
                  {v.notas && <p className="text-xs text-gray-400 mt-0.5 italic">{v.notas}</p>}
                </div>

                <div className="flex items-center gap-1.5 shrink-0
                                opacity-0 group-hover:opacity-100 transition-opacity">
                  {telefono && (estado === 'por_vencer' || estado === 'vencido') && (
                    <button
                      onClick={() => handleWhatsApp(v)}
                      aria-label="Enviar recordatorio por WhatsApp"
                      className="w-7 h-7 bg-[#25D366]/10 text-[#25D366] rounded-lg flex items-center
                                 justify-center hover:bg-[#25D366]/20 transition-colors"
                    >
                      <MessageCircle size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => { setEditando(v); setModalOpen(true) }}
                    aria-label="Editar vencimiento"
                    className="w-7 h-7 bg-white text-gray-400 rounded-lg flex items-center
                               justify-center hover:text-gray-700 transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => setElimId(v.id)}
                    aria-label="Eliminar vencimiento"
                    className="w-7 h-7 bg-white text-red-400 rounded-lg flex items-center
                               justify-center hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ModalVencimiento
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null) }}
        vehiculoId={vehiculoId}
        clienteId={clienteId}
        patente={patente}
        editando={editando}
      />

      <ConfirmDialog
        open={!!elimId}
        onClose={() => setElimId(null)}
        onConfirm={handleEliminar}
        titulo="¿Eliminar vencimiento?"
        descripcion="Se eliminará el registro permanentemente."
        labelConfirm="Eliminar"
        tipo="danger"
      />
    </div>
  )
}