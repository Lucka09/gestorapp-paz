import { useState } from 'react'
import {
  Phone, MessageCircle, Users, Mail,
  Plus, Check, RotateCcw, Trash2,
  CalendarDays, ChevronDown, ChevronUp, Target
} from 'lucide-react'
import {
  crearSeguimiento, actualizarSeguimiento,
  eliminarSeguimiento, setProximoContacto,
  TIPO_CONTACTO_LABELS, TIPO_CONTACTO_ICONS,
  type TipoContacto, type EstadoSeguimiento,
} from '@/lib/firestore/seguimientos'
import { useSeguimientos, useProximoContacto } from '@/hooks/useSeguimientos'
import { useAuth } from '@/hooks/useAuth'
import { Button, Select } from '@/components/ui'
import { formatFecha, formatRelativo } from '@/utils'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'

const TIPO_ICON_COMP: Record<TipoContacto, React.ReactNode> = {
  llamada:  <Phone size={13} />,
  whatsapp: <MessageCircle size={13} />,
  visita:   <Users size={13} />,
  email:    <Mail size={13} />,
}

const ESTADO_STYLES: Record<EstadoSeguimiento, string> = {
  pendiente:    'bg-yellow-100 text-yellow-700',
  realizado:    'bg-emerald-100 text-emerald-700',
  reprogramado: 'bg-blue-100 text-blue-700',
}

interface Props {
  clienteId: string
  telefono:  string
  nombre:    string
}

export default function SeguimientoPanel({ clienteId, telefono, nombre }: Props) {
  const { user } = useAuth()
  const { seguimientos, loading } = useSeguimientos(clienteId)
  const { proximoContacto }       = useProximoContacto(clienteId)

  const [formOpen, setFormOpen]     = useState(false)
  const [pcOpen, setPcOpen]         = useState(false)
  const [expandido, setExpandido]   = useState(false)

  // Form nuevo seguimiento
  const [tipo, setTipo]         = useState<TipoContacto>('llamada')
  const [nota, setNota]         = useState('')
  const [resultado, setResult]  = useState('')
  const [saving, setSaving]     = useState(false)

  // Form próximo contacto
  const [pcFecha, setPcFecha]   = useState('')
  const [pcTipo, setPcTipo]     = useState<TipoContacto>('llamada')
  const [pcMotivo, setPcMotivo] = useState('')
  const [pcSaving, setPcSaving] = useState(false)

  const handleRegistrar = async () => {
    if (!user || !nota.trim()) { toast.error('Agregá una nota del contacto'); return }
    setSaving(true)
    try {
      await crearSeguimiento(clienteId, {
        clienteId,
        fechaContacto: Timestamp.now(),
        tipo,
        estado:    'realizado',
        nota,
        resultado,
        creadoPor: user.uid,
      })
      toast.success('Contacto registrado')
      setNota(''); setResult(''); setFormOpen(false)
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const handleSetProximo = async () => {
    if (!pcFecha) { toast.error('Seleccioná una fecha'); return }
    setPcSaving(true)
    try {
      await setProximoContacto(clienteId, {
        fecha:  Timestamp.fromDate(new Date(pcFecha + 'T09:00:00')),
        tipo:   pcTipo,
        motivo: pcMotivo,
      })
      toast.success('Próximo contacto programado')
      setPcFecha(''); setPcMotivo(''); setPcOpen(false)
    } catch { toast.error('Error al guardar') }
    finally { setPcSaving(false) }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await eliminarSeguimiento(clienteId, id)
      toast.success('Registro eliminado')
    } catch { toast.error('Error al eliminar') }
  }

  const abrirWhatsApp = () => {
    const tel = telefono.replace(/\D/g, '')
    const num = tel.startsWith('54') ? tel : `549${tel}`
    const txt = encodeURIComponent(
      `Hola ${nombre}! 👋 Te contactamos desde Gestoría Paz. ¿Cómo estás? Quería consultar si pudiste avanzar con el trámite que estabas evaluando.`
    )
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank')
  }

  const pendientes = seguimientos.filter(s => s.estado === 'pendiente').length
  const vencido = proximoContacto &&
    proximoContacto.fecha?.toDate?.() < new Date()

  return (
    <div className="space-y-3">

      {/* Próximo contacto programado */}
      {proximoContacto && (
        <div className={`rounded-xl border px-4 py-3 ${
          vencido
            ? 'bg-red-50 border-red-200'
            : 'bg-[#D4621A]/5 border-[#D4621A]/20'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className={vencido ? 'text-red-500' : 'text-[#D4621A]'} />
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider ${
                  vencido ? 'text-red-600' : 'text-[#D4621A]'
                }`}>
                  {vencido ? '⚠️ Contacto vencido' : 'Próximo contacto'}
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  {formatFecha(proximoContacto.fecha)} · {TIPO_CONTACTO_LABELS[proximoContacto.tipo]}
                </p>
                {proximoContacto.motivo && (
                  <p className="text-xs text-gray-500 mt-0.5">{proximoContacto.motivo}</p>
                )}
              </div>
            </div>
            {/* Acción rápida */}
            {proximoContacto.tipo === 'whatsapp' && (
              <button
                onClick={abrirWhatsApp}
                className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs
                           font-medium px-3 py-1.5 rounded-lg hover:bg-[#20ba5a] transition-colors"
              >
                <MessageCircle size={12} /> Escribir
              </button>
            )}
            {proximoContacto.tipo === 'llamada' && (
              <a href={`tel:${telefono}`}
                className="flex items-center gap-1.5 bg-blue-500 text-white text-xs
                           font-medium px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors">
                <Phone size={12} /> Llamar
              </a>
            )}
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-1.5 bg-[#D4621A] text-white text-xs font-semibold
                     px-3 py-2 rounded-lg hover:bg-[#B8521A] transition-colors"
        >
          <Plus size={13} /> Registrar contacto
        </button>
        <button
          onClick={() => setPcOpen(!pcOpen)}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700
                     text-xs font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <CalendarDays size={13} /> Programar seguimiento
        </button>
        <button
          onClick={abrirWhatsApp}
          className="flex items-center gap-1.5 bg-[#25D366]/10 border border-[#25D366]/30
                     text-[#25D366] text-xs font-medium px-3 py-2 rounded-lg
                     hover:bg-[#25D366]/20 transition-colors"
        >
          <MessageCircle size={13} /> WhatsApp
        </button>
      </div>

      {/* Form registrar contacto */}
      {formOpen && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            Registrar contacto realizado
          </p>
          <Select
            label="Tipo"
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoContacto)}
          >
            {(Object.entries(TIPO_CONTACTO_LABELS) as [TipoContacto, string][]).map(([v, l]) => (
              <option key={v} value={v}>{TIPO_CONTACTO_ICONS[v]} {l}</option>
            ))}
          </Select>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Nota del contacto *
            </label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              placeholder="¿De qué hablaron? ¿Mostró interés?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A] resize-none placeholder-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Resultado
            </label>
            <textarea
              value={resultado}
              onChange={e => setResult(e.target.value)}
              rows={2}
              placeholder="¿Qué acordaron? ¿Quedó en llamar? ¿Quiere presupuesto?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A] resize-none placeholder-gray-400"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRegistrar} loading={saving} size="sm" className="flex-1">
              <Check size={13} /> Guardar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Form programar próximo contacto */}
      {pcOpen && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            Programar próximo contacto
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Fecha *
            </label>
            <input
              type="date"
              value={pcFecha}
              onChange={e => setPcFecha(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none
                         focus:border-[#D4621A]"
            />
          </div>
          <Select
            label="Tipo de contacto"
            value={pcTipo}
            onChange={e => setPcTipo(e.target.value as TipoContacto)}
          >
            {(Object.entries(TIPO_CONTACTO_LABELS) as [TipoContacto, string][]).map(([v, l]) => (
              <option key={v} value={v}>{TIPO_CONTACTO_ICONS[v]} {l}</option>
            ))}
          </Select>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Motivo / recordatorio
            </label>
            <input
              type="text"
              value={pcMotivo}
              onChange={e => setPcMotivo(e.target.value)}
              placeholder="Ej: Llamar por transferencia del VW Gol"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none
                         focus:border-[#D4621A] placeholder-gray-400"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSetProximo} loading={pcSaving} size="sm" className="flex-1">
              <CalendarDays size={13} /> Programar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPcOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Historial */}
      {seguimientos.length > 0 && (
        <div>
          <button
            onClick={() => setExpandido(!expandido)}
            className="flex items-center justify-between w-full py-2 text-xs font-bold
                       text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
          >
            <span>Historial de contactos ({seguimientos.length})</span>
            {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expandido && (
            <div className="space-y-2 mt-1">
              {seguimientos.map(s => (
                <div key={s.id}
                  className="bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center
                                  shrink-0 text-gray-500">
                    {TIPO_ICON_COMP[s.tipo]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-semibold text-gray-700">
                        {TIPO_CONTACTO_LABELS[s.tipo]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                        ${ESTADO_STYLES[s.estado]}`}>
                        {s.estado}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatFecha(s.fechaContacto)}
                      </span>
                    </div>
                    {s.nota && (
                      <p className="text-xs text-gray-600 leading-relaxed">{s.nota}</p>
                    )}
                    {s.resultado && (
                      <p className="text-xs text-gray-400 italic mt-0.5">→ {s.resultado}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleEliminar(s.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && seguimientos.length === 0 && !formOpen && (
        <p className="text-xs text-gray-400 text-center py-2">
          Sin contactos registrados todavía.
        </p>
      )}
    </div>
  )
}
