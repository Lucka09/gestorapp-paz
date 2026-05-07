import { useState } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle, Copy, MessageCircle } from 'lucide-react'
import { crearAccesoPortal } from '@/lib/firestore/acceso'
import { Button, Input } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import type { Cliente } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  cliente:  Cliente
  open:     boolean
  onClose:  () => void
}

function generarPassword(): string {
  // Mínimo: 1 mayúscula + 1 minúscula + 1 número + 1 especial
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$'
  const all     = upper + lower + numbers + special
  const base = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)])
  ]
  // Mezclar para no predecir la posición de los requeridos
  return base.sort(() => Math.random() - 0.5).join('')
}

function validarPassword(pass: string): string | null {
  if (pass.length < 8)            return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(pass))       return 'Debe tener al menos una mayúscula'
  if (!/[a-z]/.test(pass))       return 'Debe tener al menos una minúscula'
  if (!/[0-9]/.test(pass))       return 'Debe tener al menos un número'
  return null
}

export default function ModalAccesoPortal({ cliente, open, onClose }: Props) {
  const [email, setEmail]       = useState(cliente.email ?? '')
  const [pass, setPass]         = useState(() => generarPassword())
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [creado, setCreado]     = useState(false)

  const handleCrear = async () => {
    if (!email.trim()) { setError('Ingresá un correo'); return }
    const passError = validarPassword(pass)
    if (passError) { setError(passError); return }
    setError('')
    setLoading(true)
    try {
      await crearAccesoPortal({
        email:     email.trim(),
        password:  pass,
        clienteId: cliente.id,
        nombre:    cliente.nombre,
        apellido:  cliente.apellido,
        telefono:  cliente.telefono,
      })
      toast.success('Acceso al portal creado')
      setCreado(true)
    } catch (err: any) {
      if (err.message === 'EMAIL_EN_USO')
        setError('Ese correo ya tiene una cuenta. Usá otro.')
      else
        setError('Error al crear el acceso. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const mensajeWhatsApp = () => {
    const texto = encodeURIComponent(
      `Hola ${cliente.nombre}! 👋 Te creamos tu acceso al portal de Gestoría Paz.\n\n` +
      `🔗 *Ingresá acá:* https://gestorapp-paz.vercel.app\n\n` +
      `📧 *Usuario:* ${email}\n` +
      `🔑 *Contraseña:* ${pass}\n\n` +
      `Desde el portal podés ver el estado de tus trámites y reservar turnos. ` +
      `Te recomendamos cambiar la contraseña al entrar. ¡Cualquier duda estamos acá! 🚗`
    )
    const telefono = cliente.telefono.replace(/\D/g, '')
    const tel = telefono.startsWith('54') ? telefono : `549${telefono}`
    window.open(`https://wa.me/${tel}?text=${texto}`, '_blank')
  }

  const copiar = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto)
    toast.success(`${label} copiado`)
  }

  const handleClose = () => {
    setCreado(false)
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={creado ? 'Acceso creado ✅' : 'Crear acceso al portal'}
      subtitle={creado
        ? `${cliente.nombre} ${cliente.apellido} ya puede ingresar al portal.`
        : `Dar acceso al portal a ${cliente.nombre} ${cliente.apellido}`
      }
      size="md"
    >
      {!creado ? (
        <div className="space-y-5">
          <div className="bg-[#D4621A]/8 border border-[#D4621A]/20 rounded-xl px-4 py-3">
            <p className="text-sm text-[#D4621A] font-medium mb-1">
              ¿Cómo funciona?
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Se crea una cuenta para el cliente con el correo y contraseña que definas.
              Le podés enviar las credenciales por WhatsApp directamente desde acá.
            </p>
          </div>

          <Input
            label="Correo del cliente *"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="cliente@correo.com"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
              Contraseña temporal *
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError('') }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm
                             outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15
                             font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPass(generarPassword())}
                type="button"
              >
                Nueva
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Se genera automáticamente. Mínimo 8 caracteres, una mayúscula y un número.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleCrear} loading={loading} className="flex-1">
              <KeyRound size={15} /> Crear acceso
            </Button>
            <Button variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        // ── Pantalla de éxito ──────────────────────────────────────────────
        <div className="space-y-5">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200
                          rounded-xl px-4 py-3">
            <CheckCircle size={20} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm text-emerald-700 font-medium">
                Cuenta creada correctamente. Ahora enviá las credenciales al cliente.
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                📧 Se envió un email de verificación a {email} — el cliente puede ingresar al portal sin verificar.
              </p>
            </div>
          </div>

          {/* Credenciales */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Credenciales de acceso
            </p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400">Usuario</p>
                <p className="text-sm font-medium text-gray-800">{email}</p>
              </div>
              <button
                onClick={() => copiar(email, 'Correo')}
                className="text-gray-400 hover:text-[#D4621A] transition-colors"
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400">Contraseña temporal</p>
                <p className="text-sm font-bold font-mono text-gray-900 tracking-widest">
                  {pass}
                </p>
              </div>
              <button
                onClick={() => copiar(pass, 'Contraseña')}
                className="text-gray-400 hover:text-[#D4621A] transition-colors"
              >
                <Copy size={15} />
              </button>
            </div>
          </div>

          {/* Enviar por WhatsApp */}
          <button
            onClick={mensajeWhatsApp}
            className="w-full flex items-center justify-center gap-3 bg-[#25D366]
                       hover:bg-[#20ba5a] text-white font-semibold py-3 rounded-xl
                       transition-colors shadow-lg shadow-[#25D366]/20"
          >
            <MessageCircle size={18} />
            Enviar credenciales por WhatsApp
          </button>

          <p className="text-xs text-gray-400 text-center">
            El mensaje incluye el link al portal, el usuario y la contraseña.
          </p>

          <Button variant="secondary" onClick={handleClose} className="w-full">
            Cerrar
          </Button>
        </div>
      )}
    </Modal>
  )
}