// src/components/multas/ModalReporteControl.tsx
// ─── REPORTAR A CONTROL — pestaña "A Controlar" de Revisión de Multas ─────────
// Un rol de control (CEO / Admin Gral. / Admin) describe brevemente el problema
// (no se puede cerrar, falta doc, estado erróneo, muy demorada…). La multa sale
// del tablero activo y queda en "A Controlar" con motivo + autor, hasta resolver.
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { ShieldAlert, CheckCircle2 } from 'lucide-react'
import Modal from '@/components/shared/Modal'
import { useAuthStore } from '@/store/authStore'
import { reportarMultaControl } from '@/lib/firestore/MultaWorwflow'
import type { MultaWorkflow } from '@/types/multa_types'

interface Props {
  w:       MultaWorkflow | null
  onClose: () => void
}

export default function ModalReporteControl({ w, onClose }: Props) {
  const { user } = useAuthStore()
  const [motivo,    setMotivo]    = useState('')
  const [guardando, setGuardando] = useState(false)

  // Precargar el motivo si la multa ya estaba reportada (edición).
  useEffect(() => { setMotivo(w?.reporteControl?.motivo ?? '') }, [w])

  const confirmar = async () => {
    if (!w || !user) return
    if (!motivo.trim()) { toast.error('Describí brevemente el problema'); return }
    setGuardando(true)
    try {
      await reportarMultaControl(
        w.id,
        motivo.trim(),
        user.uid,
        `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim(),
      )
      toast.success('Multa enviada a "A Controlar"')
      onClose()
    } catch (e) {
      console.error('[ReporteControl]', e)
      toast.error('No se pudo reportar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={!!w}
      onClose={onClose}
      title="Reportar a control"
      subtitle={w ? `${w.paso1?.patente ?? ''} · ${w.paso1?.nombreCompleto ?? ''}` : ''}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <ShieldAlert size={15} className="shrink-0 mt-0.5" />
          <span>La multa sale del tablero activo y queda en "A Controlar" hasta que se resuelva. Queda registrado quién la reportó.</span>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">¿Qué problema tiene?</label>
          <textarea
            autoFocus
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: no se puede cerrar, falta documentación, estado erróneo, muy demorada…"
            className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] resize-none"
          />
        </div>

        <button
          disabled={guardando || !motivo.trim()}
          onClick={confirmar}
          className="w-full py-3 bg-[#D4621A] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {guardando ? 'Reportando…' : <><CheckCircle2 size={16} /> Enviar a A Controlar</>}
        </button>
      </div>
    </Modal>
  )
}