import { useState, useMemo } from 'react'
import type { ElementType } from 'react'
import {
  CheckCircle2, Circle, Clock, AlertCircle,
  Plus, User, Link, Calendar,
  ChevronDown, Trash2, Edit2, Filter,
  CheckCheck, ListTodo,
} from 'lucide-react'
import { useAuth }     from '@/hooks/useAuth'
import { useEquipo }   from '@/hooks/useEquipo'
import { useClientes } from '@/hooks/useClientes'
import { useTareas, useMisTareas } from '@/hooks/useTareas'
import {
  crearTarea, cambiarEstadoTarea,
  eliminarTarea, actualizarTarea,
  PRIORIDAD_BORDER, PRIORIDAD_DOT,
  estaVencida, venceHoy, diasParaVencer,
} from '@/lib/firestore/tareas'
import {
  PageHeader, Button, Input, Select,
  Textarea, Spinner,
} from '@/components/ui'
import Modal        from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  PRIORIDAD_LABELS, PRIORIDAD_COLORS,
  type PrioridadTarea, type Tarea,
} from '@/types'
import toast from 'react-hot-toast'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Timestamp } from 'firebase/firestore'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatVencimiento(tarea: Tarea): { label: string; cls: string } {
  if (!tarea.vencimiento) return { label: 'Sin fecha', cls: 'text-gray-400' }
  const dias = diasParaVencer(tarea)
  if (dias === null)      return { label: 'Sin fecha', cls: 'text-gray-400' }
  if (dias < 0)           return { label: `Vencida hace ${Math.abs(dias)}d`, cls: 'text-red-600 font-bold' }
  if (dias === 0)         return { label: 'Vence hoy',  cls: 'text-orange-600 font-bold' }
  if (dias === 1)         return { label: 'Mañana',     cls: 'text-amber-600 font-semibold' }
  if (dias <= 7)          return { label: `En ${dias} días`, cls: 'text-blue-600' }
  const d = tarea.vencimiento.toDate?.()
  return {
    label: d?.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) ?? '',
    cls:   'text-gray-500',
  }
}

// ─── MODAL NUEVA / EDITAR TAREA ───────────────────────────────────────────────

function ModalTarea({
  open, onClose, tareaEdit,
}: {
  open:       boolean
  onClose:    () => void
  tareaEdit?: Tarea | null
}) {
  const { user }     = useAuth()
  const { activos }  = useEquipo()
  const { clientes } = useClientes()
  const esEdicion    = !!tareaEdit

  const [titulo,       setTitulo]       = useState(tareaEdit?.titulo      ?? '')
  const [descripcion,  setDescripcion]  = useState(tareaEdit?.descripcion ?? '')
  const [prioridad,    setPrioridad]    = useState<PrioridadTarea>(tareaEdit?.prioridad ?? 'normal')
  const [asignadoA,    setAsignadoA]    = useState(tareaEdit?.asignadoA   ?? user?.uid ?? '')
  const [vencimiento,  setVencimiento]  = useState(() => {
    const v = tareaEdit?.vencimiento?.toDate?.()
    return v ? v.toISOString().split('T')[0] : ''
  })
  const [recordatorio, setRecordatorio] = useState(() => {
    const r = tareaEdit?.recordatorio?.toDate?.()
    return r ? r.toISOString().split('T')[0] : ''
  })
  const [clienteId, setClienteId] = useState(tareaEdit?.clienteId ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const miembro = activos.find(m => m.uid === asignadoA)

  const handleGuardar = async () => {
  if (!titulo.trim()) { setError('El título es obligatorio'); return }
  if (!asignadoA)     { setError('Asigná la tarea a alguien'); return }
  setSaving(true); setError('')
  try {
    const cliente          = clientes.find(c => c.id === clienteId)
    const vencimientoDate  = vencimiento  ? new Date(vencimiento)  : undefined
    const recordatorioDate = recordatorio ? new Date(recordatorio) : undefined

    const inputBase = {
      gestoriaId:     user?.uid ?? '',
      titulo:         titulo.trim(),
      descripcion:    descripcion.trim() || undefined,
      prioridad,
      asignadoA,
      asignadoNombre: miembro
        ? `${miembro.nombre} ${miembro.apellido}`
        : user?.nombre ?? '',
      clienteId:      clienteId || undefined,
      clienteNombre:  cliente
        ? `${cliente.apellido}, ${cliente.nombre}` : undefined,
    }

    if (esEdicion && tareaEdit) {
      // actualizarTarea espera Timestamp
      await actualizarTarea(tareaEdit.id, {
        ...inputBase,
        vencimiento:  vencimientoDate  ? Timestamp.fromDate(vencimientoDate)  : undefined,
        recordatorio: recordatorioDate ? Timestamp.fromDate(recordatorioDate) : undefined,
      })
      toast.success('Tarea actualizada')
    } else {
      // crearTarea espera Date
      await crearTarea({
        ...inputBase,
        vencimiento:  vencimientoDate,
        recordatorio: recordatorioDate,
      }, {
        uid:    user?.uid    ?? '',
        nombre: user?.nombre ?? '',
        rol:    user?.rol    ?? 'admin',
      })
      toast.success('Tarea creada')
    }
    onClose()
  } catch {
    setError('Error al guardar. Intentá de nuevo.')
  } finally {
    setSaving(false)
  }
}

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esEdicion ? 'Editar tarea' : 'Nueva tarea'}
      size="md"
    >
      <div className="space-y-4">

        <Input
          label="Título *"
          value={titulo}
          onChange={e => { setTitulo(e.target.value); setError('') }}
          placeholder="¿Qué hay que hacer?"
          autoFocus
        />

        <Textarea
          label="Descripción"
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Detalles adicionales, contexto, instrucciones..."
          rows={2}
        />

        <div className="grid grid-cols-2 gap-3">
          {/* Prioridad */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
              Prioridad
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['baja', 'normal', 'alta', 'urgente'] as PrioridadTarea[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridad(p)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs
                              font-semibold border-2 transition-all
                              ${prioridad === p
                                ? 'border-gp-orange bg-gp-orange-pale'
                                : 'border-gray-100 bg-white hover:border-gray-200'
                              }`}
                >
                  <span className={`w-2 h-2 rounded-full ${PRIORIDAD_DOT[p]}`} />
                  {PRIORIDAD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Asignado a */}
          <Select
            label="Asignado a *"
            value={asignadoA}
            onChange={e => setAsignadoA(e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {activos.map(m => (
              <option key={m.uid} value={m.uid}>
                {m.nombre} {m.apellido}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de vencimiento"
            type="date"
            value={vencimiento}
            onChange={e => setVencimiento(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
          <Input
            label="Recordatorio"
            type="date"
            value={recordatorio}
            onChange={e => setRecordatorio(e.target.value)}
            hint="Notificación en esta fecha"
          />
        </div>

        {/* Vincular a cliente */}
        <Select
          label="Vincular a cliente (opcional)"
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
        >
          <option value="">Sin vincular</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.apellido}, {c.nombre}
            </option>
          ))}
        </Select>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleGuardar} loading={saving} className="flex-1">
            {esEdicion
              ? <><Edit2 size={14} /> Guardar cambios</>
              : <><Plus  size={14} /> Crear tarea</>
            }
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── CARD DE TAREA ────────────────────────────────────────────────────────────

function TareaCard({
  tarea, onCompletar, onEditar, onEliminar,
}: {
  tarea:       Tarea
  onCompletar: (t: Tarea) => void
  onEditar:    (t: Tarea) => void
  onEliminar:  (id: string) => void
}) {
  const venc       = formatVencimiento(tarea)
  const completada = tarea.estado === 'completada'
  const prioClr    = PRIORIDAD_COLORS[tarea.prioridad]
  const prioLbl    = PRIORIDAD_LABELS[tarea.prioridad]
  const borderCls  = PRIORIDAD_BORDER[tarea.prioridad]

  return (
    <div className={`bg-white border border-l-4 rounded-2xl px-4 py-3.5 shadow-sm
                     transition-all group
                     ${borderCls}
                     ${completada ? 'opacity-50' : 'hover:shadow-md'}
                     ${estaVencida(tarea) && !completada ? 'bg-red-50/30'    : ''}
                     ${venceHoy(tarea)    && !completada ? 'bg-orange-50/20' : ''}`}>
      <div className="flex items-start gap-3">

        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onCompletar(tarea)}
          aria-label={completada ? 'Marcar como pendiente' : 'Completar tarea'}
          className={`mt-0.5 shrink-0 transition-colors
                      ${completada
                        ? 'text-emerald-500'
                        : 'text-gray-300 hover:text-emerald-400'}`}
        >
          {completada ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug
                         ${completada ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {tarea.titulo}
          </p>

          {tarea.descripcion && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
              {tarea.descripcion}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${prioClr}`}>
              {prioLbl}
            </span>
            <span className={`flex items-center gap-1 text-xs ${venc.cls}`}>
              <Clock size={11} />
              {venc.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <User size={11} />
              {tarea.asignadoNombre}
            </span>
            {tarea.clienteNombre && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
                <Link size={11} />
                {tarea.clienteNombre}
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEditar(tarea)}
            aria-label="Editar tarea"
            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center
                       justify-center text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onEliminar(tarea.id)}
            aria-label="Eliminar tarea"
            className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center
                       justify-center text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

type FiltroVista = 'todas' | 'mis-tareas' | 'hoy' | 'vencidas'

interface VistaConfig {
  id:     FiltroVista
  label:  string
  count:  number
  icon:   ElementType
}

export default function TareasPage() {
  const { user } = useAuth()
  usePageTitle('Tareas')

  const { tareas, loading, vencidas }      = useTareas()
  const { tareas: misTareas, paraHoy }     = useMisTareas(user?.uid ?? '')

  const [vista,       setVista]       = useState<FiltroVista>('mis-tareas')
  const [filtroPrio,  setFiltroPrio]  = useState<PrioridadTarea | 'todas'>('todas')
  const [modalOpen,   setModalOpen]   = useState(false)
  const [tareaEdit,   setTareaEdit]   = useState<Tarea | null>(null)
  const [elimId,      setElimId]      = useState<string | null>(null)
  const [mostrarComp, setMostrarComp] = useState(false)

  const handleCompletar = async (t: Tarea) => {
    const nuevoEstado = t.estado === 'completada' ? 'pendiente' : 'completada'
    try {
      await cambiarEstadoTarea(t.id, nuevoEstado)
      if (nuevoEstado === 'completada') toast.success('✅ Tarea completada')
    } catch { toast.error('Error') }
  }

  const handleEliminar = async () => {
    if (!elimId) return
    try {
      await eliminarTarea(elimId)
      toast.success('Tarea eliminada')
      setElimId(null)
    } catch { toast.error('Error') }
  }

  const tareasVista = useMemo(() => {
    let base: Tarea[] = []
    if      (vista === 'mis-tareas') base = misTareas
    else if (vista === 'hoy')        base = paraHoy
    else if (vista === 'vencidas')   base = vencidas
    else if (vista === 'todas')      base = tareas

    if (filtroPrio !== 'todas') base = base.filter(t => t.prioridad === filtroPrio)
    return base
  }, [vista, filtroPrio, tareas, misTareas, paraHoy, vencidas])

  if (loading) return <Spinner label="Cargando tareas..." />

  const VISTAS: VistaConfig[] = [
    { id: 'mis-tareas', label: 'Mis tareas', count: misTareas.length, icon: User        },
    { id: 'hoy',        label: 'Para hoy',   count: paraHoy.length,   icon: Calendar    },
    { id: 'vencidas',   label: 'Vencidas',   count: vencidas.length,  icon: AlertCircle },
    { id: 'todas',      label: 'Todas',      count: tareas.length,    icon: ListTodo    },
  ]

  return (
    <div className="space-y-5 animate-fadein max-w-3xl">

      <PageHeader
        title="Tareas"
        subtitle="Recordatorios y pendientes del equipo"
        action={
          <Button onClick={() => { setTareaEdit(null); setModalOpen(true) }}>
            <Plus size={15} /> Nueva tarea
          </Button>
        }
      />

      {/* Vistas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {VISTAS.map(v => (
          <button
            key={v.id}
            onClick={() => setVista(v.id)}
            className={`flex items-center justify-between p-3.5 rounded-2xl border-2
                        transition-all text-left
                        ${vista === v.id
                          ? 'border-gp-orange bg-gp-orange-pale'
                          : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                        }`}
          >
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-0.5
                             ${vista === v.id ? 'text-gp-orange' : 'text-gray-400'}`}>
                {v.label}
              </p>
              <p className="text-2xl font-bold text-gray-900"
                 style={{ fontFamily: 'var(--font-display)' }}>
                {v.count}
              </p>
            </div>
            <v.icon size={18} className={vista === v.id ? 'text-gp-orange' : 'text-gray-300'} />
          </button>
        ))}
      </div>

      {/* Filtro prioridad */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          <Filter size={11} className="inline mr-1" />Prioridad:
        </span>
        {(['todas', 'urgente', 'alta', 'normal', 'baja'] as const).map(p => (
          <button
            key={p}
            onClick={() => setFiltroPrio(p)}
            className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors
                        ${filtroPrio === p
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
            style={filtroPrio === p ? { background: 'var(--gp-orange)' } : undefined}
          >
            {p === 'todas' ? 'Todas' : (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORIDAD_DOT[p]}`} />
                {PRIORIDAD_LABELS[p]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de tareas */}
      {tareasVista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <CheckCheck size={36} className="mb-3 opacity-40" />
          <p className="text-sm font-semibold text-gray-400">
            {vista === 'vencidas'   ? '¡Todo al día! Sin tareas vencidas.' :
             vista === 'hoy'        ? 'Sin tareas para hoy 🎉' :
             vista === 'mis-tareas' ? 'No tenés tareas pendientes' :
             'Sin tareas con este filtro'}
          </p>
          <Button
            variant="secondary" size="sm" className="mt-4"
            onClick={() => { setTareaEdit(null); setModalOpen(true) }}
          >
            <Plus size={13} /> Nueva tarea
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tareasVista.map(t => (
            <TareaCard
              key={t.id}
              tarea={t}
              onCompletar={handleCompletar}
              onEditar={t => { setTareaEdit(t); setModalOpen(true) }}
              onEliminar={setElimId}
            />
          ))}
        </div>
      )}

      {/* Tareas completadas — colapsables */}
      {vista === 'todas' && (
        <div>
          <button
            onClick={() => setMostrarComp(!mostrarComp)}
            className="flex items-center gap-2 text-xs font-bold text-gray-400
                       uppercase tracking-wider hover:text-gray-600 transition-colors mt-4"
          >
            <CheckCircle2 size={14} />
            Completadas
            <ChevronDown size={12} className={`transition-transform ${mostrarComp ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {/* Modal */}
      <ModalTarea
        open={modalOpen}
        onClose={() => { setModalOpen(false); setTareaEdit(null) }}
        tareaEdit={tareaEdit}
      />

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={!!elimId}
        onClose={() => setElimId(null)}
        onConfirm={handleEliminar}
        titulo="¿Eliminar tarea?"
        descripcion="Esta acción no se puede deshacer."
        labelConfirm="Eliminar"
        tipo="danger"
      />
    </div>
  )
}