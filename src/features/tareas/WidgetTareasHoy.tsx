import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Plus, ArrowRight } from 'lucide-react'
import { useAuth }       from '@/hooks/useAuth'
import { useMisTareas }  from '@/hooks/useTareas'
import { cambiarEstadoTarea, estaVencida, PRIORIDAD_DOT } from '@/lib/firestore/tareas'
import { Card }          from '@/components/ui'
import toast from 'react-hot-toast'

export function WidgetTareasHoy() {
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const { paraHoy, vencidas, tareas } = useMisTareas(user?.uid ?? '')

  // Mostrar: vencidas primero, luego las de hoy
  const mostrar = [
    ...vencidas.slice(0, 2),
    ...paraHoy.filter(t => !vencidas.find(v => v.id === t.id)).slice(0, 3),
  ].slice(0, 5)

  const handleToggle = async (id: string, estado: string) => {
    try {
      await cambiarEstadoTarea(id, estado === 'completada' ? 'pendiente' : 'completada')
      if (estado !== 'completada') toast.success('✅ Completada')
    } catch { /* silencioso */ }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Mis tareas
        </p>
        <button
          onClick={() => navigate('/admin/tareas')}
          className="text-xs font-medium flex items-center gap-1"
          style={{ color: 'var(--gp-orange)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {tareas.length > 0 && <span className="text-gray-400 mr-1">{tareas.length}</span>}
          Ver todas <ArrowRight size={12} />
        </button>
      </div>

      {mostrar.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-300">
          <CheckCircle2 size={28} className="mb-2 opacity-40" />
          <p className="text-sm text-gray-400">Sin tareas pendientes</p>
          <button
            onClick={() => navigate('/admin/tareas')}
            className="mt-3 text-xs font-medium flex items-center gap-1"
            style={{ color: 'var(--gp-orange)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={12} /> Nueva tarea
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {mostrar.map(t => {
            const vencida = estaVencida(t)
            return (
              <div key={t.id} className="flex items-start gap-2.5 group">
                <button
                  onClick={() => handleToggle(t.id, t.estado)}
                  className="mt-0.5 text-gray-300 hover:text-emerald-500 transition-colors shrink-0"
                  aria-label="Completar tarea"
                >
                  <Circle size={17} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate
                                 ${vencida ? 'text-red-700' : 'text-gray-800'}`}>
                    {t.titulo}
                  </p>
                  {(vencida || t.clienteNombre) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {vencida && <span className="text-red-500 font-semibold">Vencida · </span>}
                      {t.clienteNombre}
                    </p>
                  )}
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${PRIORIDAD_DOT[t.prioridad]}`}/>
              </div>
            )
          })}
          {tareas.length > 5 && (
            <p className="text-xs text-gray-400 pt-1">
              +{tareas.length - 5} más en la lista
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
