import { useState, useRef, useEffect } from 'react'
import { Star, Pencil, Trash2, Send, MessageSquare } from 'lucide-react'
import { useAuth }  from '@/hooks/useAuth'
import { useNotas } from '@/hooks/useNotas'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  crearNota, editarNota,
  toggleImportante, eliminarNota,
} from '@/lib/firestore/notas'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  NOTA_TIPO_CONFIG, type TipoNota, type NotaInterna,
} from '@/types'
import toast from 'react-hot-toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatTime(ts: Date | number | { toDate(): Date }): string {
  if (!ts) return ''
  const d    = typeof ts === 'object' && 'toDate' in ts ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)    return 'ahora'
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hs`
  return d.toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const TIPOS_NOTA: TipoNota[] = [
  'general', 'llamada', 'reunion',
  'importante', 'advertencia', 'seguimiento',
]

// ─── NOTA ITEM ────────────────────────────────────────────────────────────────

function NotaItem({
  nota, mia, onEditar, onEliminar, onTogglePin,
}: {
  nota:        NotaInterna
  mia:         boolean
  onEditar:    (n: NotaInterna) => void
  onEliminar:  (id: string) => void
  onTogglePin: (n: NotaInterna) => void
}) {
  const cfg = NOTA_TIPO_CONFIG[nota.tipo]

  return (
    <div className={`group relative rounded-2xl p-4 border transition-all
                     ${nota.importante
                       ? 'bg-amber-50/50 border-amber-200'
                       : 'bg-white border-gray-100 hover:border-gray-200'
                     }`}>
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                             ${cfg.bg} ${cfg.color}`}>
            {cfg.emoji} {cfg.label}
          </span>
          {nota.importante && (
            <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <Star size={10} className="fill-amber-400" /> Destacada
            </span>
          )}
        </div>

        {/* Acciones (aparecen al hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onTogglePin(nota)}
            aria-label={nota.importante ? 'Quitar destacado' : 'Destacar nota'}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400
                       hover:text-amber-500 hover:bg-amber-50 transition-colors"
          >
            <Star size={11} className={nota.importante ? 'fill-amber-400 text-amber-400' : ''} />
          </button>
          {mia && (
            <>
              <button
                onClick={() => onEditar(nota)}
                aria-label="Editar nota"
                className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400
                           hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => onEliminar(nota.id)}
                aria-label="Eliminar nota"
                className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400
                           hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contenido */}
      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
        {nota.contenido}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2.5">
        <span className="text-xs text-gray-400">{nota.autorNombre}</span>
        <span className="text-gray-200">·</span>
        <span className="text-xs text-gray-400">{formatTime(nota.creadoEn)}</span>
        {nota.editadoEn && (
          <>
            <span className="text-gray-200">·</span>
            <span className="text-xs text-gray-400 italic">editada</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── PANEL DE NOTAS ───────────────────────────────────────────────────────────

interface PanelNotasProps {
  entidad:   'cliente' | 'tramite'
  entidadId: string
  compact?:  boolean
}

export function PanelNotas({
  entidad, entidadId, compact = false,
}: PanelNotasProps) {
  const { user }     = useAuth()
  const gestoriaId   = useGestoriaId()
  const { notas, loading, importantes, normales } = useNotas(entidad, entidadId)

  const [texto,    setTexto]    = useState('')
  const [tipo,     setTipo]     = useState<TipoNota>('general')
  const [pinned,   setPinned]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editando, setEditando] = useState<NotaInterna | null>(null)
  const [elimId,   setElimId]   = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [texto])

  const handleEnviar = async () => {
    if (!texto.trim()) return
    setSaving(true)
    try {
      if (editando) {
        await editarNota(editando.id, texto, tipo)
        toast.success('Nota editada')
        setEditando(null)
      } else {
        // gestoriaId es inyectado aquí — el panel lo obtiene del contexto
        await crearNota({
          gestoriaId,
          contenido:  texto,
          tipo,
          entidad,
          entidadId,
          importante: pinned,
          ctx: {
            uid:    user?.uid    ?? '',
            nombre: user?.nombre ?? 'Usuario',
            rol:    user?.rol    ?? 'admin',
          },
        })
      }
      setTexto(''); setTipo('general'); setPinned(false)
    } catch { toast.error('Error al guardar la nota') }
    finally  { setSaving(false) }
  }

  const handleEditar = (n: NotaInterna) => {
    setEditando(n)
    setTexto(n.contenido)
    setTipo(n.tipo)
    setPinned(n.importante)
    textareaRef.current?.focus()
  }

  const handleCancelarEdicion = () => {
    setEditando(null)
    setTexto(''); setTipo('general'); setPinned(false)
  }

  const handleEliminar = async () => {
    if (!elimId) return
    try {
      await eliminarNota(elimId)
      toast.success('Nota eliminada')
      setElimId(null)
    } catch { toast.error('Error') }
  }

  const handleTogglePin = async (n: NotaInterna) => {
    try {
      await toggleImportante(n.id, !n.importante)
    } catch { toast.error('Error') }
  }

  const todasOrdenadas = [...importantes, ...normales]

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare size={15} className="text-gray-400" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Notas internas
        </p>
        {notas.length > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {notas.length}
          </span>
        )}
      </div>

      {/* Compositor */}
      <div className={`border-2 rounded-2xl transition-all overflow-hidden
                       ${texto
                         ? 'border-[var(--gp-orange)] shadow-[0_0_0_3px_var(--gp-orange-subtle)]'
                         : 'border-gray-200 hover:border-gray-300'
                       }`}>

        {/* Selector de tipo (visible al escribir o editar) */}
        {(texto || editando) && (
          <div className="flex items-center gap-1.5 px-3 pt-3 flex-wrap">
            {TIPOS_NOTA.map(t => {
              const cfg = NOTA_TIPO_CONFIG[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`text-xs font-semibold px-2 py-1 rounded-lg transition-all
                               flex items-center gap-1
                               ${tipo === t
                                 ? `${cfg.bg} ${cfg.color}`
                                 : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                               }`}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              handleEnviar()
            }
          }}
          placeholder={
            editando
              ? 'Editando nota...'
              : compact
              ? 'Escribí una nota interna... (Ctrl+Enter para enviar)'
              : `Escribí una nota sobre este ${entidad === 'cliente' ? 'cliente' : 'trámite'}... (Ctrl+Enter para guardar)`
          }
          rows={compact ? 2 : 3}
          className="w-full px-4 py-3 text-sm text-gray-800 placeholder-gray-400
                     outline-none resize-none bg-transparent"
          style={{ minHeight: compact ? 56 : 72 }}
        />

        {/* Footer del compositor */}
        {texto && (
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={e => setPinned(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-amber-400"
              />
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Star size={11} className="text-amber-400" />
                Destacar
              </span>
            </label>
            <div className="flex gap-2">
              {editando && (
                <button
                  onClick={handleCancelarEdicion}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleEnviar}
                disabled={saving || !texto.trim()}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5
                             rounded-xl transition-all text-white
                             ${saving || !texto.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                style={{ background: 'var(--gp-orange)' }}
              >
                <Send size={12} />
                {saving ? 'Guardando...' : editando ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : todasOrdenadas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-300
                        border-2 border-dashed border-gray-100 rounded-2xl">
          <MessageSquare size={28} className="mb-2 opacity-40" />
          <p className="text-sm text-gray-400">Sin notas todavía</p>
          <p className="text-xs text-gray-300 mt-0.5">
            Las notas son privadas — solo las ve el equipo
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {todasOrdenadas.map(n => (
            <NotaItem
              key={n.id}
              nota={n}
              mia={n.autorId === user?.uid}
              onEditar={handleEditar}
              onEliminar={setElimId}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!elimId}
        onClose={() => setElimId(null)}
        onConfirm={handleEliminar}
        titulo="¿Eliminar nota?"
        descripcion="Esta nota no se puede recuperar."
        labelConfirm="Eliminar"
        tipo="danger"
      />
    </div>
  )
}