// src/components/multas/ModalAlertaDocumentacion.tsx
// ─── ALERTA DE DOCUMENTACIÓN → SECRETARIO COMERCIAL A CARGO ──────────────────
// Cuando la multa está en "Docs. Requerida", un rol de control o el asistente
// de multas describe qué falta / qué está mal y notifica al secretario a cargo
// (campanita in-app + push al celular). Queda registrado en el workflow
// (alertaDocs + historialAlertasDocs) para que se vea en la lista y en la Torre.
// JAH-NISSI Digital Studio · GestorApp
import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { BellRing, Send, AlertTriangle } from 'lucide-react'
import Modal from '@/components/shared/Modal'
import { useAuthStore } from '@/store/authStore'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useEquipo } from '@/hooks/useEquipo'
import { enviarAlertaDocumentacion } from '@/lib/firestore/MultaWorwflow'
import { candidatosResponsableMulta, type MultaWorkflow } from '@/types/multa_types'
import type { Tramite } from '@/types'

interface Props {
  w:        MultaWorkflow | null
  tramite?: Pick<Tramite, 'asignadoA' | 'creadoPor'> | null
  onClose:  () => void
}

// Motivos frecuentes — un click los agrega al detalle (editable).
const MOTIVOS_RAPIDOS = [
  'Falta DNI (frente y/o dorso)',
  'DNI ilegible o cortado',
  'Falta cédula o título',
  'Los datos no coinciden con la patente',
  'Falta DNI del infractor / otro titular',
]

const nombreDe = (m: { nombre?: string; apellido?: string; email?: string }) =>
  `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.email || '—'

export default function ModalAlertaDocumentacion({ w, tramite, onClose }: Props) {
  const { user }   = useAuthStore()
  const gestoriaId = useGestoriaId()
  const { equipo } = useEquipo()

  const [destinatarioId, setDestinatarioId] = useState('')
  const [motivo,         setMotivo]         = useState('')
  const [enviando,       setEnviando]       = useState(false)

  const secretarios = useMemo(
    () => equipo.filter(m => m.rol === 'asesor_comercial' && m.activo),
    [equipo],
  )

  // Secretario a cargo detectado: primer candidato (asignado → cargó → inició)
  // que sea secretario comercial activo.
  const detectado = useMemo(() => {
    if (!w) return ''
    const ids = new Set(secretarios.map(s => s.uid))
    return candidatosResponsableMulta(w, tramite).find(uid => ids.has(uid)) ?? ''
  }, [w, tramite, secretarios])

  // Reset al abrir otra multa
  useEffect(() => { setMotivo(''); setDestinatarioId('') }, [w?.id])
  useEffect(() => { if (detectado && !destinatarioId) setDestinatarioId(detectado) }, [detectado, destinatarioId])

  const agregarMotivo = (m: string) =>
    setMotivo(prev => (prev.trim() ? `${prev.trim()}\n${m}` : m))

  const confirmar = async () => {
    if (!w || !user) return
    const dest = secretarios.find(s => s.uid === destinatarioId)
    if (!dest)          { toast.error('Elegí el secretario a notificar'); return }
    if (!motivo.trim()) { toast.error('Indicá qué falta o qué está mal'); return }
    setEnviando(true)
    try {
      await enviarAlertaDocumentacion({
        tramiteId:          w.id,
        gestoriaId,
        destinatarioId:     dest.uid,
        destinatarioNombre: nombreDe(dest),
        motivo:             motivo.trim(),
        autorId:            user.uid,
        autorNombre:        `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim(),
        patente:            w.paso1?.patente,
        cliente:            w.paso1?.nombreCompleto,
      })
      toast.success(`Alerta enviada a ${nombreDe(dest)}`)
      onClose()
    } catch (e) {
      console.error('[AlertaDocumentacion]', e)
      toast.error('No se pudo enviar la alerta')
    } finally {
      setEnviando(false)
    }
  }

  const ultima = w?.alertaDocs

  return (
    <Modal
      open={!!w}
      onClose={onClose}
      title="Avisar al secretario — Documentación"
      subtitle={w ? `${w.paso1?.patente ?? ''} · ${w.paso1?.nombreCompleto ?? ''}` : ''}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <BellRing size={15} className="shrink-0 mt-0.5" />
          <span>El secretario recibe la alerta en la campanita y en el celular. Queda registrada en la multa.</span>
        </div>

        {ultima && (
          <p className="text-[11px] text-gray-500">
            Última alerta: <strong>{ultima.destinatarioNombre}</strong> ·{' '}
            {ultima.creadoEn?.toDate?.().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' '}— “{ultima.motivo}”
          </p>
        )}

        {/* Destinatario */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Secretario a cargo</label>
          <select
            value={destinatarioId}
            onChange={e => setDestinatarioId(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] bg-white text-gray-700"
          >
            <option value="">— Elegir secretario —</option>
            {secretarios.map(s => (
              <option key={s.uid} value={s.uid}>
                {nombreDe(s)}{s.uid === detectado ? ' (a cargo)' : ''}
              </option>
            ))}
          </select>
          {w && !detectado && secretarios.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> No se detectó el secretario a cargo — elegilo a mano.
            </p>
          )}
        </div>

        {/* Motivo */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">¿Qué falta o qué está mal?</label>
          <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
            {MOTIVOS_RAPIDOS.map(m => (
              <button key={m} type="button" onClick={() => agregarMotivo(m)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#D4621A] transition-colors">
                + {m}
              </button>
            ))}
          </div>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: el DNI del dorso está cortado, pedir foto nueva al cliente…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] resize-none"
          />
        </div>

        <button
          disabled={enviando || !motivo.trim() || !destinatarioId}
          onClick={confirmar}
          className="w-full py-3 bg-[#D4621A] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : <><Send size={15} /> Enviar alerta</>}
        </button>
      </div>
    </Modal>
  )
}
