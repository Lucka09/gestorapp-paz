import { useState } from 'react'
import {
  UserPlus, Edit2, Power, KeyRound,
  CheckCircle, Copy, Eye, EyeOff,
  ShieldCheck, UserX, Users, Mail,
  Phone as PhoneIcon, AlertTriangle,
} from 'lucide-react'
import { useGestoria, useGestoriaId } from '@/context/GestoriaContext'
import { useEquipo }    from '@/hooks/useEquipo'
import { useAuth }      from '@/hooks/useAuth'
import { usePermisos }  from '@/hooks/usePermisos'
import { usePlanLimites } from '@/hooks/usePlanLimites'
import {
  crearMiembro, actualizarMiembro,
  desactivarMiembro, activarMiembro,
  enviarResetPassword, generarPasswordTemporal,
  PERMISOS_POR_ROL, type MiembroEquipo,
} from '@/lib/firestore/equipo'
import { LimitePlanError } from '@/lib/firestore/planlimits'
import { PageHeader, Button, Input, Select, Spinner } from '@/components/ui'
import Modal        from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { ROL_LABELS, ROL_COLORS } from '@/utils/permisos'
import { getMensajeError } from '@/utils/errores'
import type { Rol } from '@/types'
import { formatFecha } from '@/utils'
import toast from 'react-hot-toast'

// ─── ROL BADGE ───────────────────────────────────────────────────────────────

function RolBadge({ rol }: { rol: Rol }) {
  const cls = (ROL_COLORS as Record<string, string>)[rol] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {(ROL_LABELS as Record<string, string>)[rol]}
    </span>
  )
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────

function Avatar({ miembro, size = 40 }: { miembro: MiembroEquipo; size?: number }) {
  const colors = [
    'bg-orange-100 text-orange-700', 'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700', 'bg-emerald-100 text-emerald-700',
    'bg-pink-100 text-pink-700',
  ]
  const idx     = (miembro.nombre.charCodeAt(0) ?? 0) % colors.length
  const initials = miembro.iniciales ?? `${miembro.nombre[0]}${miembro.apellido[0]}`.toUpperCase()
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${colors[idx]}
                  ${!miembro.activo ? 'opacity-50 grayscale' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )
}

// ─── INDICADOR DE USO ─────────────────────────────────────────────────────────

function IndicadorUso({
  actual, maximo, planLabel,
}: {
  actual: number; maximo: number; planLabel: string
}) {
  const pct      = maximo > 0 ? Math.round((actual / maximo) * 100) : 0
  if (pct < 70) return null

  const enLimite = pct >= 100
  const wrap  = enLimite ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
  const bar   = enLimite ? 'bg-red-500' : 'bg-amber-400'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${wrap}`}>
      <AlertTriangle size={15} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-xs">
          {enLimite
            ? `Límite de usuarios alcanzado — Plan ${planLabel}`
            : `Acercándote al límite — Plan ${planLabel}`}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-xs font-mono shrink-0">{actual} / {maximo}</span>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NUEVO MIEMBRO ─────────────────────────────────────────────────────

function ModalNuevoMiembro({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { user }     = useAuth()
  const gestoriaId   = useGestoriaId()
  const { gestoria } = useGestoria()
  const { refetch }  = usePlanLimites()

  const [nombre,   setNombre]   = useState('')
  const [apellido, setApellido] = useState('')
  const [email,    setEmail]    = useState('')
  const [telefono, setTelefono] = useState('')
  const [rol,      setRol]      = useState<Rol>('operador')
  const [password, setPassword] = useState(() => generarPasswordTemporal())
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [creado,   setCreado]   = useState<{ nombre: string; email: string; password: string } | null>(null)
  const [error,    setError]    = useState('')

  const rolOpciones: Rol[] = ['admin', 'vendedor', 'operador', 'gestor']

  const handleCrear = async () => {
    if (!nombre.trim() || !apellido.trim()) { setError('Completá nombre y apellido'); return }
    if (!email.trim())    { setError('Ingresá el email'); return }
    if (password.length < 8) { setError('La contraseña debe tener mínimo 8 caracteres'); return }
    setError(''); setSaving(true)
    try {
      await crearMiembro(
        { gestoriaId, nombre, apellido, email: email.trim(), password, telefono, rol },
        user?.uid ?? '',
        // Pasar límites para validación — lanza LimitePlanError si se alcanzó
        gestoria ? { maxUsuarios: gestoria.maxUsuarios, plan: gestoria.plan } : undefined
      )
      setCreado({ nombre, email, password })
      refetch()   // actualizar indicador de uso
      toast.success(`${nombre} agregado al equipo`)
    } catch (err: unknown) {
      if (err instanceof LimitePlanError) {
        setError(err.mensajeUpgrade)
      } else if (err instanceof Error && err.message === 'EMAIL_EN_USO') {
        setError('Ese email ya tiene una cuenta. Usá otro.')
      } else {
        const msg = getMensajeError(err, 'general')
        setError(`${msg.titulo}. ${msg.detalle}`)
      }
    } finally { setSaving(false) }
  }

  const copiar = (txt: string, lbl: string) => {
    navigator.clipboard.writeText(txt)
    toast.success(`${lbl} copiado`)
  }

  const handleClose = () => {
    setCreado(null); setNombre(''); setApellido(''); setEmail('')
    setTelefono(''); setRol('operador'); setError('')
    setPassword(generarPasswordTemporal())
    onClose()
  }

  const handleEnviarWA = () => {
    if (!creado) return
    const tel = telefono.replace(/\D/g, '')
    const num = tel.startsWith('54') ? tel : `549${tel}`
    const msg = encodeURIComponent(
      `Hola ${creado.nombre}! 👋\n\n` +
      `Te damos acceso a GestorApp.\n\n` +
      `🔗 URL: ${window.location.origin}\n` +
      `📧 Usuario: ${creado.email}\n` +
      `🔑 Contraseña temporal: ${creado.password}\n\n` +
      `Ingresá y cambiá tu contraseña. ¡Bienvenido al equipo!`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={creado ? '¡Miembro agregado!' : 'Agregar miembro al equipo'}
      subtitle={creado
        ? `${creado.nombre} ya puede ingresar a GestorApp`
        : 'Creá una cuenta para un nuevo miembro del equipo'
      }
      size="md"
    >
      {!creado ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *"   value={nombre}   onChange={e => setNombre(e.target.value)}   placeholder="Ezequiel" />
            <Input label="Apellido *" value={apellido} onChange={e => setApellido(e.target.value)} placeholder="Paz" />
          </div>
          <Input label="Email *" type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="ezequiel@gestoriapaz.com" />
          <Input label="Teléfono" type="tel" value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="1136141431" hint="Para enviar credenciales por WhatsApp" />

          <Select label="Rol *" value={rol} onChange={e => setRol(e.target.value as Rol)}>
            {rolOpciones.map(r => (
              <option key={r} value={r}>{ROL_LABELS[r]}</option>
            ))}
          </Select>

          {/* Permisos del rol */}
          {rol in PERMISOS_POR_ROL && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <ul className="space-y-1">
                {PERMISOS_POR_ROL[rol as keyof typeof PERMISOS_POR_ROL]?.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className={`mt-0.5 shrink-0 ${p.startsWith('Sin') ? 'text-gray-400' : 'text-emerald-500'}`}>
                      {p.startsWith('Sin') ? '○' : '✓'}
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contraseña */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Contraseña temporal *
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             font-mono outline-none focus:border-[#D4621A] pr-10"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <Button variant="secondary" size="sm" type="button"
                onClick={() => setPassword(generarPasswordTemporal())}>
                Nueva
              </Button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleCrear} loading={saving} className="flex-1">
              <UserPlus size={15} /> Crear cuenta
            </Button>
            <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          </div>
        </div>
      ) : (
        // ── Pantalla de éxito ──────────────────────────────────────────────
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Credenciales de acceso
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm font-semibold text-gray-800">{creado.email}</p>
              </div>
              <button onClick={() => copiar(creado.email, 'Email')}
                className="text-gray-400 hover:text-gp-orange transition-colors">
                <Copy size={14} />
              </button>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Contraseña temporal</p>
                <p className="text-sm font-bold font-mono tracking-widest text-gray-900">
                  {creado.password}
                </p>
              </div>
              <button onClick={() => copiar(creado.password, 'Contraseña')}
                className="text-gray-400 hover:text-gp-orange transition-colors">
                <Copy size={14} />
              </button>
            </div>
          </div>

          {telefono && (
            <button onClick={handleEnviarWA}
              className="w-full flex items-center justify-center gap-3 bg-[#25D366]
                         hover:bg-[#20ba5a] text-white font-semibold py-3 rounded-xl transition-colors"
              style={{ boxShadow: '0 4px 16px rgba(37,211,102,0.25)' }}>
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar credenciales por WhatsApp
            </button>
          )}
          <Button variant="secondary" onClick={handleClose} className="w-full">Cerrar</Button>
        </div>
      )}
    </Modal>
  )
}

// ─── MODAL EDITAR MIEMBRO ─────────────────────────────────────────────────────

function ModalEditarMiembro({
  miembro, open, onClose,
}: { miembro: MiembroEquipo; open: boolean; onClose: () => void }) {
  const { user }   = useAuth()
  const [nombre,   setNombre]   = useState(miembro.nombre)
  const [apellido, setApellido] = useState(miembro.apellido)
  const [telefono, setTelefono] = useState(miembro.telefono)
  const [rol,      setRol]      = useState<Rol>(miembro.rol as Rol)
  const [saving,   setSaving]   = useState(false)
  const esMiMismo = user?.uid === miembro.uid

  const handleGuardar = async () => {
    setSaving(true)
    try {
      await actualizarMiembro(miembro.uid, { nombre, apellido, telefono, rol })
      toast.success('Datos actualizados')
      onClose()
    } catch { toast.error('Error al actualizar') }
    finally  { setSaving(false) }
  }

  const handleResetPassword = async () => {
    try {
      await enviarResetPassword(miembro.email)
      toast.success(`Email de reset enviado a ${miembro.email}`)
    } catch { toast.error('Error al enviar el email') }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar — ${miembro.nombre} ${miembro.apellido}`}
      subtitle={miembro.email}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre"   value={nombre}   onChange={e => setNombre(e.target.value)} />
          <Input label="Apellido" value={apellido} onChange={e => setApellido(e.target.value)} />
        </div>
        <Input label="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} />

        <Select label="Rol" value={rol} onChange={e => setRol(e.target.value as Rol)}>
          {(['propietario', 'admin', 'vendedor', 'operador', 'gestor'] as Rol[]).map(r => (
            <option key={r} value={r} disabled={esMiMismo && r !== miembro.rol}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </Select>

        {rol in PERMISOS_POR_ROL && (
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <ul className="space-y-1">
              {PERMISOS_POR_ROL[rol as keyof typeof PERMISOS_POR_ROL]?.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className={`mt-0.5 shrink-0 ${p.startsWith('Sin') ? 'text-gray-400' : 'text-emerald-500'}`}>
                    {p.startsWith('Sin') ? '○' : '✓'}
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleGuardar} loading={saving} className="flex-1">
            <CheckCircle size={15} /> Guardar
          </Button>
          <Button variant="secondary" onClick={handleResetPassword} title="Enviar email para restablecer contraseña">
            <KeyRound size={15} /> Reset pass
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── CARD DE MIEMBRO ──────────────────────────────────────────────────────────

function MiembroCard({
  miembro, esMiMismo, onEditar, onDesactivar, onActivar,
}: {
  miembro:      MiembroEquipo
  esMiMismo:    boolean
  onEditar:     (m: MiembroEquipo) => void
  onDesactivar: (m: MiembroEquipo) => void
  onActivar:    (m: MiembroEquipo) => void
}) {
  return (
    <div className={`bg-white border rounded-2xl p-5 shadow-sm transition-all
                     ${!miembro.activo ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:shadow-md'}`}>
      <div className="flex items-start gap-4">
        <Avatar miembro={miembro} size={46} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-gray-900 text-base">
              {miembro.apellido}, {miembro.nombre}
            </span>
            {esMiMismo && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Vos</span>
            )}
            {!miembro.activo && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                Inactivo
              </span>
            )}
          </div>
          <RolBadge rol={miembro.rol as Rol} />
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Mail size={12} /> {miembro.email}
            </span>
            {miembro.telefono && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <PhoneIcon size={12} /> {miembro.telefono}
              </span>
            )}
          </div>
          {miembro.ultimoAcceso && (
            <p className="text-xs text-gray-300 mt-1.5">
              Último acceso: {formatFecha(miembro.ultimoAcceso)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => onEditar(miembro)} aria-label={`Editar ${miembro.nombre}`}
            className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center
                       justify-center text-gray-500 transition-colors">
            <Edit2 size={14} />
          </button>
          {!esMiMismo && (
            miembro.activo ? (
              <button onClick={() => onDesactivar(miembro)} aria-label={`Desactivar ${miembro.nombre}`}
                className="w-9 h-9 bg-red-50 hover:bg-red-100 rounded-xl flex items-center
                           justify-center text-red-500 transition-colors">
                <UserX size={14} />
              </button>
            ) : (
              <button onClick={() => onActivar(miembro)} aria-label={`Reactivar ${miembro.nombre}`}
                className="w-9 h-9 bg-emerald-50 hover:bg-emerald-100 rounded-xl flex items-center
                           justify-center text-emerald-600 transition-colors">
                <Power size={14} />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function EquipoPage() {
  const { user }  = useAuth()
  const { puede } = usePermisos()
  const { activos, inactivos, loading } = useEquipo()
  const {
    totalUsuarios, maxUsuarios, planLabel,
    enLimiteUsuarios,
  } = usePlanLimites()

  const [modalNuevo,   setModalNuevo]   = useState(false)
  const [miembroEdit,  setMiembroEdit]  = useState<MiembroEquipo | null>(null)
  const [confirmDesac, setConfirmDesac] = useState<MiembroEquipo | null>(null)
  const [mostrarInact, setMostrarInact] = useState(false)

  const handleDesactivar = async () => {
    if (!confirmDesac) return
    try {
      await desactivarMiembro(confirmDesac.uid)
      toast.success(`${confirmDesac.nombre} desactivado`)
      setConfirmDesac(null)
    } catch { toast.error('Error al desactivar') }
  }

  const handleActivar = async (m: MiembroEquipo) => {
    try {
      await activarMiembro(m.uid)
      toast.success(`${m.nombre} reactivado`)
    } catch { toast.error('Error al reactivar') }
  }

  const abrirModalNuevo = () => {
    if (enLimiteUsuarios) {
      toast.error(
        `Límite de ${maxUsuarios} usuarios alcanzado (Plan ${planLabel}). Actualizá tu plan.`,
        { duration: 5000, icon: '🔒' }
      )
      return
    }
    setModalNuevo(true)
  }

  if (loading) return <Spinner label="Cargando equipo..." />

  return (
    <div className="space-y-5 animate-fadein max-w-3xl">

      <PageHeader
        title="Gestión del equipo"
        subtitle={`${activos.length} miembro${activos.length !== 1 ? 's' : ''} activo${activos.length !== 1 ? 's' : ''}`}
        action={
          puede('editarConfiguracion') && (
            <Button onClick={abrirModalNuevo}>
              <UserPlus size={15} /> Agregar miembro
            </Button>
          )
        }
      />

      {/* Indicador de límite (visible desde el 70%) */}
      <IndicadorUso actual={totalUsuarios} maximo={maxUsuarios} planLabel={planLabel} />

      {/* Resumen por rol */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['propietario', 'admin', 'vendedor', 'operador', 'gestor'] as Rol[]).map(r => {
          const n = activos.filter(m => m.rol === r).length
          return (
            <div key={r} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <RolBadge rol={r} />
                <span className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                  {n}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Lista activos */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Equipo activo ({activos.length})
          </p>
        </div>
        {activos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300">
            <Users size={36} className="mb-3 opacity-40" />
            <p className="text-sm text-gray-400">Sin miembros activos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activos.map(m => (
              <MiembroCard
                key={m.uid}
                miembro={m}
                esMiMismo={user?.uid === m.uid}
                onEditar={setMiembroEdit}
                onDesactivar={setConfirmDesac}
                onActivar={handleActivar}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lista inactivos */}
      {inactivos.length > 0 && (
        <div>
          <button
            onClick={() => setMostrarInact(!mostrarInact)}
            className="flex items-center gap-2 text-xs font-bold text-gray-400
                       uppercase tracking-wider hover:text-gray-600 transition-colors"
          >
            <UserX size={14} />
            Inactivos ({inactivos.length})
            <span className="text-xs font-normal normal-case tracking-normal">
              {mostrarInact ? '▲ Ocultar' : '▼ Mostrar'}
            </span>
          </button>
          {mostrarInact && (
            <div className="space-y-3 mt-3">
              {inactivos.map(m => (
                <MiembroCard
                  key={m.uid}
                  miembro={m}
                  esMiMismo={false}
                  onEditar={setMiembroEdit}
                  onDesactivar={() => {}}
                  onActivar={handleActivar}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info de roles */}
      <div className="bg-gp-orange-pale border border-orange-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} style={{ color: 'var(--gp-orange)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Sobre los roles y permisos</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Cada rol define exactamente a qué módulos puede acceder el miembro.
              Los <strong>vendedores</strong> pueden gestionar clientes y el pipeline pero no ven honorarios.
              Los <strong>operadores</strong> gestionan trámites y turnos pero no el CRM.
              Solo <strong>propietarios y admins</strong> ven cobranzas, reportes y configuración.
            </p>
          </div>
        </div>
      </div>

      {/* Modales */}
      <ModalNuevoMiembro open={modalNuevo} onClose={() => setModalNuevo(false)} />

      {miembroEdit && (
        <ModalEditarMiembro
          miembro={miembroEdit}
          open={!!miembroEdit}
          onClose={() => setMiembroEdit(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDesac}
        onClose={() => setConfirmDesac(null)}
        onConfirm={handleDesactivar}
        titulo={`¿Desactivar a ${confirmDesac?.nombre}?`}
        descripcion="Ya no podrá ingresar a GestorApp. Podés reactivarlo cuando quieras."
        labelConfirm="Desactivar"
        tipo="warning"
      />
    </div>
  )
}