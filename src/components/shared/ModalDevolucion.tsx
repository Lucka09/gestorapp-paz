import { useState, useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import Modal from '@/components/shared/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import {
  registrarDevolucion, chequearDevolucion,
  MOTIVO_DEVOLUCION_LABELS, type MotivoDevolucion, type ChequeoDevolucion,
} from '@/lib/firestore/devoluciones'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import AdjuntarComprobante from '@/components/shared/AdjuntarComprobante'
import { adjuntarARecibo } from '@/lib/firestore/comprobantes'
import { useGestoriaId } from '@/context/GestoriaContext'

const FORMAS_PAGO = [
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta',       label: 'Reversa de tarjeta' },
  { value: 'otro',          label: 'Otro' },
]

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

interface Props {
  open:       boolean
  tramiteId:  string
  tramiteLabel: string
  onClose:    () => void
  onHecho?:   () => void
  /** Recibo de cobro que se está revirtiendo, si se abre desde uno. */
  reciboOriginalId?: string
}

export default function ModalDevolucion({
  open, tramiteId, tramiteLabel, onClose, onHecho, reciboOriginalId,
}: Props) {
  const { user }   = useAuth()
  const gestoriaId = useGestoriaId()

  const [monto,     setMonto]     = useState('')
  const [motivo,    setMotivo]    = useState<MotivoDevolucion>('tramite_cancelado')
  const [detalle,   setDetalle]   = useState('')
  const [formaPago, setFormaPago] = useState('efectivo')
  const [fecha,     setFecha]     = useState(() => new Date().toISOString().slice(0, 10))
  const [archivo,   setArchivo]   = useState<File | null>(null)
  const [chequeo,   setChequeo]   = useState<ChequeoDevolucion | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Al abrir, se consulta cuánto hay disponible para devolver.
  useEffect(() => {
    if (!open || !tramiteId) return
    let vivo = true
    setError(null)
    chequearDevolucion(tramiteId, gestoriaId, 0, '')
      .then(c => { if (vivo) setChequeo(c) })
      .catch(e => { if (vivo) setError(e?.message ?? 'No se pudo leer el trámite') })
    return () => { vivo = false }
  }, [open, tramiteId, gestoriaId])

  const montoNum   = Number(monto) || 0
  const disponible = chequeo?.disponible ?? 0
  const excede     = montoNum > disponible
  const detalleOk  = detalle.trim().length >= 10
  const puede      = montoNum > 0 && !excede && detalleOk && !!fecha && !saving

  const reset = () => {
    setMonto(''); setDetalle(''); setMotivo('tramite_cancelado')
    setFormaPago('efectivo'); setError(null); setChequeo(null)
    setFecha(new Date().toISOString().slice(0, 10)); setArchivo(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleGuardar = async () => {
    if (!user || !puede) return
    setSaving(true)
    setError(null)
    try {
      const reciboId = await registrarDevolucion(
        {
          tramiteId, gestoriaId,
          monto: montoNum, motivo,
          detalle: detalle.trim(),
          formaPago, fecha,
          ...(reciboOriginalId ? { reciboOriginalId } : {}),
        },
        {
          uid:    user.uid,
          nombre: `${user.nombre} ${user.apellido}`.trim(),
          rol:    user.rol,
        },
      )

      // Comprobante del reintegro. Si falla, la devolución YA quedó registrada:
      // no se revierte, se avisa para adjuntarlo desde Cobranzas → Comprobantes.
      if (archivo && reciboId) {
        try {
          await adjuntarARecibo(archivo, {
            id: reciboId, gestoriaId,
            monto: -Math.abs(montoNum),
            formaPago, tramiteId,
            patente: tramiteLabel,
          }, { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim() })
        } catch (e) {
          console.error('[ModalDevolucion] comprobante:', e)
          toast('La devolución se registró, pero el comprobante no se pudo subir. Adjuntalo desde Cobranzas → Comprobantes.', { icon: '📎' })
        }
      }

      toast.success(`Devolución de ${fmt(montoNum)} registrada`)
      reset()      
      onHecho?.()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar la devolución')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Registrar devolución">
      <div className="space-y-4">

        <p className="text-sm text-gray-500">
          Devolución sobre <strong className="text-gray-800">{tramiteLabel}</strong>.
          Se emite un comprobante y el monto deja de contar como ingreso de la
          gestoría y como premio del secretario que lo cobró.
        </p>

        {/* Disponible */}
        {chequeo && (
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cobrado al cliente</span>
              <span className="tabular-nums text-gray-800">{fmt(chequeo.cobradoTotal)}</span>
            </div>
            {chequeo.devueltoPrevio > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ya devuelto</span>
                <span className="tabular-nums text-red-600">−{fmt(chequeo.devueltoPrevio)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-medium pt-1 border-t border-gray-200">
              <span className="text-gray-700">Disponible para devolver</span>
              <span className="tabular-nums text-gray-900">{fmt(disponible)}</span>
            </div>
          </div>
        )}

        {/* Monto */}
        <div>
          <Input
            label="Monto a devolver *"
            type="number"
            value={monto}
            placeholder="0"
            onChange={e => { setMonto(e.target.value); setError(null) }}
            error={excede ? `Máximo ${fmt(disponible)}` : undefined}
          />
          {disponible > 0 && (
            <button
              type="button"
              onClick={() => setMonto(String(disponible))}
              className="text-xs text-[#D4621A] hover:underline mt-1"
            >
              Devolver todo ({fmt(disponible)})
            </button>
          )}
        </div>

        {/* Motivo */}
        <Select
          label="Motivo *"
          value={motivo}
          onChange={e => setMotivo(e.target.value as MotivoDevolucion)}
        >
          {Object.entries(MOTIVO_DEVOLUCION_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>

        {/* Detalle */}
        <div>
          <Textarea
            label="Detalle *"
            rows={3}
            value={detalle}
            placeholder="Ej: el cliente canceló el descargo antes de presentarlo"
            onChange={e => { setDetalle(e.target.value); setError(null) }}
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-400">Mínimo 10 caracteres.</p>
            <p className={`text-xs tabular-nums ${detalleOk ? 'text-emerald-600' : 'text-gray-300'}`}>
              {detalle.trim().length}/10
            </p>
          </div>
        </div>

        {/* Forma */}
        <Select
          label="Cómo se devolvió"
          value={formaPago}
          onChange={e => setFormaPago(e.target.value)}
        >
          {FORMAS_PAGO.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>

        {/* Fecha real — define en qué mes impacta la salida de plata */}
        <Input
          label="Fecha de la devolución *"
          type="date"
          value={fecha}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setFecha(e.target.value)}
        />

        {/* Comprobante del reintegro (queda en Cobranzas → Comprobantes) */}
        <AdjuntarComprobante
          metodo={formaPago === 'efectivo' ? 'transferencia' : formaPago}
          archivo={archivo}
          onChange={setArchivo}
        />

        {/* Aviso de impacto */}
        {montoNum > 0 && !excede && (
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              El ingreso de la gestoría baja {fmt(montoNum)} en el período, y el
              premio se le descuenta al secretario que registró el cobro
              original, no a vos.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100
                        rounded-lg px-3 py-2 whitespace-pre-line">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={!puede} loading={saving}>
            <RotateCcw className="w-3.5 h-3.5" />
            Registrar devolución
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── DÓNDE ENGANCHARLO ────────────────────────────────────────────────────────
//
// En TramiteDetallePage, junto a los botones de pago:
/*
  const { puede } = usePermisos()
  const [devolviendo, setDevolviendo] = useState(false)

  {puede('registrarDevoluciones') && (tramite.montoRecibidoAcumulado ?? 0) > 0 && (
    <Button variant="secondary" onClick={() => setDevolviendo(true)}>
      <RotateCcw className="w-4 h-4" /> Devolución
    </Button>
  )}

  <ModalDevolucion
    open={devolviendo}
    tramiteId={tramite.id}
    tramiteLabel={`${tramite.numero} · ${tramite.patente}`}
    onClose={() => setDevolviendo(false)}
    onHecho={() => refetch()}
  />
*/
//
// Y el permiso nuevo en src/utils/permisos.ts:
//   registrarDevoluciones: boolean
//   → true  en propietario, admin_gral, superadmin
//   → false en el resto
