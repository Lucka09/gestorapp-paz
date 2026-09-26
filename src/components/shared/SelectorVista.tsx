import type { Vista } from '@/lib/visibilidad'

interface Miembro { uid: string; nombre: string; apellido?: string; activo?: boolean }

interface Props {
  vista:         Vista
  onChange:      (v: Vista) => void
  verTodo:       boolean
  conteos:       { todos: number; mios: number; sin_asignar: number; porUid: Record<string, number> }
  equipo?:       Miembro[]
  permitirPool?: boolean       // secretarios: mostrar "Sin asignar" (pool para reclamar)
  etiquetaMios?: string        // "Mis leads" / "Mis prospectos"
}

const pill = (activa: boolean) =>
  `px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
    activa ? 'bg-gray-900 text-white shadow-sm' : 'bg-white border border-gray-100 text-gray-600 hover:border-gray-300'}`

const badge = (activa: boolean) =>
  `text-xs px-1.5 py-0.5 rounded-full font-bold ${activa ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`

export default function SelectorVista({
  vista, onChange, verTodo, conteos, equipo = [], permitirPool = true, etiquetaMios = 'Míos',
}: Props) {
  // Secretario: solo "lo mío" (+ pool si corresponde)
  if (!verTodo) {
    return (
      <div className="flex items-center gap-2 mb-4" role="group" aria-label="Qué ver">
        <button className={pill(vista === 'mios')} onClick={() => onChange('mios')}>
          {etiquetaMios} <span className={badge(vista === 'mios')}>{conteos.mios}</span>
        </button>
        {permitirPool && (
          <button className={pill(vista === 'sin_asignar')} onClick={() => onChange('sin_asignar')}>
            Sin asignar <span className={badge(vista === 'sin_asignar')}>{conteos.sin_asignar}</span>
          </button>
        )}
      </div>
    )
  }

  // Admin / CEO: todo, sin asignar, o una persona puntual
  const miembros = equipo
    .filter(m => m.activo !== false || (conteos.porUid[m.uid] ?? 0) > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <label htmlFor="selector-vista" className="text-sm text-gray-500">Ver:</label>
      <select
        id="selector-vista"
        value={vista}
        onChange={e => onChange(e.target.value as Vista)}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D4621A]/30"
      >
        <option value="todos">Todo el equipo ({conteos.todos})</option>
        <option value="mios">Asignados a mí ({conteos.mios})</option>
        <option value="sin_asignar">Sin asignar ({conteos.sin_asignar})</option>
        {miembros.map(m => (
          <option key={m.uid} value={`uid:${m.uid}`}>
            {m.nombre} {m.apellido ?? ''} ({conteos.porUid[m.uid] ?? 0})
          </option>
        ))}
      </select>
    </div>
  )
}
