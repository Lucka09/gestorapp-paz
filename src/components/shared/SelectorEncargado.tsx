// src/components/shared/SelectorEncargado.tsx
// ─── ELEGIR O CREAR UN ENCARGADO ─────────────────────────────────────────────
//
// Se monta en dos lugares:
//   · ClienteForm — cuando el origen no es lead propio
//   · Los tres formularios de pago — para saber a quién va la comisión
//
// Muestra solo los encargados del secretario que está cargando (salvo que sea
// admin). Si no está, se crea sin salir del formulario: el alta en otra
// pantalla haría que nadie la use y se siga escribiendo el nombre a mano.

import { useState, useEffect, useMemo } from 'react'
import { Plus, Phone, Search, X } from 'lucide-react'
import { Input, Select, Button } from '@/components/ui'
import {
  subscribeEncargados, crearEncargado, validarEncargado,
  TIPO_ENCARGADO_LABELS,
  type Encargado, type EncargadoInput, type TipoEncargado,
} from '@/lib/firestore/encargados'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { useGestoriaId } from '@/context/GestoriaContext'

interface Props {
  value?:    string                       // encargadoId elegido
  onChange:  (id: string, e: Encargado | null) => void
  /** Restringe los tipos ofrecidos. Por defecto, todos. */
  tipos?:    TipoEncargado[]
  label?:    string
  required?: boolean
  error?:    string
}

export default function SelectorEncargado({
  value, onChange, tipos, label = 'Encargado / Referido', required, error,
}: Props) {
  const { user }   = useAuth()
  const { puede }  = usePermisos()
  const gestoriaId = useGestoriaId()

  const [lista,   setLista]   = useState<Encargado[]>([])
  const [q,       setQ]       = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevo,   setNuevo]   = useState({
    nombre: '', apellido: '', telefono: '', email: '', instagram: '',
    tipo: (tipos?.[0] ?? 'encargado_multas') as TipoEncargado,
  })
  const [errNuevo, setErrNuevo] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  // Un admin ve todos; un secretario, solo los suyos.
  const verTodos = puede('verPanelMando') || puede('gestionarEquipo')

  useEffect(() => {
    if (!gestoriaId || !user) return
    return subscribeEncargados(gestoriaId, { uid: user.uid, verTodos }, setLista)
  }, [gestoriaId, user, verTodos])

  const filtrados = useMemo(() => {
    let l = lista.filter(e => e.activo !== false)
    if (tipos?.length) l = l.filter(e => tipos.includes(e.tipo))
    const t = q.trim().toLowerCase()
    if (t) l = l.filter(e =>
      `${e.nombre} ${e.apellido} ${e.telefono}`.toLowerCase().includes(t))
    return l
  }, [lista, q, tipos])

  const elegido = lista.find(e => e.id === value) ?? null

  const handleCrear = async () => {
    if (!user || !gestoriaId) return
    const chk = validarEncargado({ ...nuevo, gestoriaId })
    if (!chk.ok) { setErrNuevo(chk.errores); return }

    setGuardando(true)
    setErrNuevo([])
    try {
      const id = await crearEncargado(
        {
          gestoriaId,
          nombre: nuevo.nombre.trim(),
          apellido: nuevo.apellido.trim(),
          telefono: nuevo.telefono,
          email: nuevo.email.trim() || undefined,
          instagram: nuevo.instagram.trim() || undefined,
          tipo: nuevo.tipo,
          asignadoA:       user.uid,
          asignadoANombre: `${user.nombre} ${user.apellido}`.trim(),
          activo: true,
          creadoPor: user.uid,
        } satisfies EncargadoInput,
        { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim(), rol: user.rol },
      )
      onChange(id, {
        id,
        ...nuevo,
        gestoriaId,
        asignadoA: user.uid,
        asignadoANombre: `${user.nombre} ${user.apellido}`.trim(),
        activo: true,
        creadoPor: user.uid,
      } as Encargado)
      setCreando(false)
      setNuevo({ nombre:'', apellido:'', telefono:'', email:'', instagram:'',
                 tipo: (tipos?.[0] ?? 'encargado_multas') as TipoEncargado })
    } catch (e: unknown) {
      setErrNuevo([e instanceof Error ? e.message : 'No se pudo crear'])
    } finally {
      setGuardando(false)
    }
  }

  // ── Alta inline ───────────────────────────────────────────────────────────
  if (creando) {
    return (
      <div className="rounded-xl border border-[#D4621A]/30 bg-orange-50/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Nuevo encargado</p>
          <button type="button" onClick={() => { setCreando(false); setErrNuevo([]) }}
            className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Select
          label="Tipo *"
          value={nuevo.tipo}
          onChange={e => setNuevo({ ...nuevo, tipo: e.target.value as TipoEncargado })}
        >
          {(tipos ?? Object.keys(TIPO_ENCARGADO_LABELS) as TipoEncargado[]).map(t => (
            <option key={t} value={t}>{TIPO_ENCARGADO_LABELS[t]}</option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre *" value={nuevo.nombre}
            onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <Input label="Apellido *" value={nuevo.apellido}
            onChange={e => setNuevo({ ...nuevo, apellido: e.target.value })} />
        </div>

        <Input label="Teléfono *" value={nuevo.telefono} placeholder="11 4123-4567"
          onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })}
          hint="Obligatorio: es el dato que queda si algún día cambia el secretario." />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" value={nuevo.email}
            onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
          <Input label="Instagram" value={nuevo.instagram} placeholder="@usuario"
            onChange={e => setNuevo({ ...nuevo, instagram: e.target.value })} />
        </div>

        {errNuevo.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-2.5 space-y-1">
            {errNuevo.map((e, i) => (
              <p key={i} className="text-xs text-red-700">{e}</p>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setCreando(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCrear} loading={guardando}>
            Crear y seleccionar
          </Button>
        </div>
      </div>
    )
  }

  // ── Selector ──────────────────────────────────────────────────────────────
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}{required && ' *'}
      </label>

      {elegido ? (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {elegido.nombre} {elegido.apellido}
            </p>
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span>{TIPO_ENCARGADO_LABELS[elegido.tipo]}</span>
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />{elegido.telefono}
              </span>
              {verTodos && elegido.asignadoANombre && (
                <span>· {elegido.asignadoANombre}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={() => onChange('', null)}
            className="text-xs text-[#D4621A] hover:underline shrink-0 ml-3">
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm
                          focus:outline-none focus:border-[#D4621A] ${
                            error ? 'border-red-300' : 'border-gray-200'
                          }`}
            />
          </div>

          {filtrados.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {filtrados.map(e => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onChange(e.id, e)}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 transition-colors"
                >
                  <p className="text-sm text-gray-900">{e.nombre} {e.apellido}</p>
                  <p className="text-xs text-gray-400">
                    {TIPO_ENCARGADO_LABELS[e.tipo]} · {e.telefono}
                    {e.clientesAportados ? ` · ${e.clientesAportados} clientes` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}

          {q.trim() && filtrados.length === 0 && (
            <p className="text-xs text-gray-400 px-1">
              No hay ninguno con ese nombre entre los tuyos.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setCreando(true)
              // Precarga lo tipeado como nombre, para no escribirlo dos veces
              const partes = q.trim().split(' ')
              setNuevo(n => ({ ...n, nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') }))
            }}
            className="flex items-center gap-1.5 text-sm text-[#D4621A] hover:underline px-1"
          >
            <Plus className="w-4 h-4" />
            Agregar uno nuevo
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
