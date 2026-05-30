// src/features/clientes/ClienteForm.tsx
import { useState } from 'react'
import { z }        from 'zod'
import { Input, Select, Textarea, Button } from '@/components/ui'
import type { Cliente }      from '@/types'
import type { OrigenCanal }  from '@/types'
import { ORIGEN_CANAL_LABELS, ORIGEN_COMERCIAL } from '@/types'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const clienteSchema = z.object({
  nombre:       z.string().min(1, 'Requerido').max(80),
  apellido:     z.string().min(1, 'Requerido').max(80),
  dni:          z.string()
                  .min(1, 'Requerido')
                  .regex(/^\d{7,8}$/, 'DNI inválido — 7 u 8 dígitos sin puntos'),
  cuit:         z.string()
                  .max(20)
                  .refine(v => v === '' || /^\d{2}-\d{6,8}-\d$/.test(v), {
                    message: 'Formato: 20-12345678-3',
                  }),
  telefono:     z.string().min(1, 'Requerido').max(20),
  email:        z.string()
                  .max(100)
                  .refine(v => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
                    message: 'Email inválido',
                  }),
  direccion:    z.string().max(120),
  localidad:    z.string().max(80),
  userId:       z.string().nullable(),
  observaciones: z.string().max(500),
  origen:        z.string().max(80),
  origenCanal:   z.enum([
    'referido_persona','concesionaria','agencia','reventa',
    'encargado_multas','instagram','facebook','google',
    'cartel_local','whatsapp','otro',
  ] as const).optional(),
  origenNombre:  z.string().max(120).optional(),
})

export type ClienteFormData = z.infer<typeof clienteSchema>

type Errors = Partial<Record<keyof ClienteFormData, string>>

// ─── CANALES RÁPIDOS (botones pill) ──────────────────────────────────────────

const CANALES_DIRECTOS: OrigenCanal[] = [
  'instagram', 'facebook', 'google', 'cartel_local', 'whatsapp',
]

const CANALES_REFERIDO: OrigenCanal[] = [
  'referido_persona', 'concesionaria', 'agencia', 'reventa', 'encargado_multas',
]

// Etiquetas cortas para los botones pill
const LABEL_CORTO: Partial<Record<OrigenCanal, string>> = {
  referido_persona: 'Referido',
  concesionaria:    'Concesionaria',
  agencia:          'Agencia',
  reventa:          'Reventa',
  encargado_multas: 'Enc. Multas',
  instagram:        'Instagram',
  facebook:         'Facebook',
  google:           'Google',
  cartel_local:     'Cartel / Local',
  whatsapp:         'WhatsApp',
  otro:             'Otro',
}

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const EMPTY: ClienteFormData = {
  nombre: '', apellido: '', dni: '', cuit: '',
  telefono: '', email: '', direccion: '',
  localidad: '', userId: null, observaciones: '',
  origen: '', origenCanal: undefined, origenNombre: undefined,
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  initial?:     Partial<Cliente>
  onSubmit:     (data: ClienteFormData) => Promise<void>
  onCancel:     () => void
  submitLabel?: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Determina si el canal seleccionado requiere ingresar un nombre */
function requiereNombre(canal: OrigenCanal | undefined): boolean {
  if (!canal) return false
  return [...CANALES_REFERIDO, 'otro'].includes(canal)
}

/** Construye el campo legacy `origen` para compatibilidad con código existente */
function buildOrigenLegacy(canal: OrigenCanal | undefined, nombre: string): string {
  if (!canal) return ''
  const label = LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]
  if (nombre.trim()) return `${label}: ${nombre.trim()}`
  return label
}

/** Placeholder del campo nombre según el canal */
function placeholderNombre(canal: OrigenCanal | undefined): string {
  switch (canal) {
    case 'referido_persona':  return 'Nombre y apellido de quien refirió'
    case 'concesionaria':     return 'Nombre de la concesionaria'
    case 'agencia':           return 'Nombre de la agencia'
    case 'reventa':           return 'Nombre de la reventa / automotora'
    case 'encargado_multas':  return 'Nombre del encargado'
    default:                  return 'Nombre o detalle adicional'
  }
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function ClienteForm({
  initial, onSubmit, onCancel, submitLabel = 'Guardar',
}: Props) {
  // Inicializar origenCanal desde datos existentes
  const initialCanal = (initial as any)?.origenCanal as OrigenCanal | undefined
  const initialNombre = (initial as any)?.origenNombre ?? ''

  const [form, setForm]     = useState<ClienteFormData>({
    ...EMPTY,
    ...(initial ?? {}),
    userId:       initial?.userId ?? null,
    origenCanal:  initialCanal,
    origenNombre: initialNombre,
    origen:       initial?.origen ?? buildOrigenLegacy(initialCanal, initialNombre),
  })
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  const set = (field: keyof ClienteFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

  const validateField = (field: keyof ClienteFormData) => {
    const result = clienteSchema.shape[field]?.safeParse(form[field])
    if (result && !result.success) {
      setErrors(prev => ({ ...prev, [field]: result.error.issues[0]?.message }))
    }
  }

  const validate = (): boolean => {
    const result = clienteSchema.safeParse(form)
    if (result.success) { setErrors({}); return true }
    const flat   = result.error.flatten().fieldErrors
    const errs: Errors = {}
    for (const [k, v] of Object.entries(flat)) {
      if (v?.[0]) errs[k as keyof ClienteFormData] = v[0]
    }
    setErrors(errs)
    return false
  }

  // Seleccionar un canal
  const selectCanal = (canal: OrigenCanal) => {
    const nuevo = form.origenCanal === canal ? undefined : canal
    const nombre = nuevo ? (form.origenNombre ?? '') : ''
    setForm(prev => ({
      ...prev,
      origenCanal:  nuevo,
      origenNombre: nombre,
      origen:       buildOrigenLegacy(nuevo, nombre),
    }))
  }

  // Cambiar el nombre del referente
  const setNombreReferente = (nombre: string) => {
    setForm(prev => ({
      ...prev,
      origenNombre: nombre,
      origen:       buildOrigenLegacy(prev.origenCanal as OrigenCanal, nombre),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try { await onSubmit(form) }
    finally { setLoading(false) }
  }

  const canalActivo = form.origenCanal as OrigenCanal | undefined
  const esReferido  = requiereNombre(canalActivo)

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Nombre y Apellido */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nombre *" value={form.nombre} placeholder="Juan"
          onChange={set('nombre')} onBlur={() => validateField('nombre')}
          error={errors.nombre}
        />
        <Input
          label="Apellido *" value={form.apellido} placeholder="García"
          onChange={set('apellido')} onBlur={() => validateField('apellido')}
          error={errors.apellido}
        />
      </div>

      {/* DNI y CUIT */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="DNI *" value={form.dni} placeholder="20123456"
          maxLength={8} inputMode="numeric"
          onChange={set('dni')} onBlur={() => validateField('dni')}
          error={errors.dni}
        />
        <Input
          label="CUIT / CUIL" value={form.cuit} placeholder="20-20123456-3"
          onChange={set('cuit')} onBlur={() => validateField('cuit')}
          error={errors.cuit}
        />
      </div>

      {/* Teléfono y Email */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Teléfono *" value={form.telefono} placeholder="11 4123-4567"
          onChange={set('telefono')} onBlur={() => validateField('telefono')}
          error={errors.telefono}
        />
        <Input
          label="Email" type="email" value={form.email} placeholder="juan@mail.com"
          onChange={set('email')} onBlur={() => validateField('email')}
          error={errors.email}
        />
      </div>

      {/* Dirección y Localidad */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Dirección" value={form.direccion} placeholder="Av. San Martín 1234"
          onChange={set('direccion')}
        />
        <Input
          label="Localidad" value={form.localidad} placeholder="San Martín"
          onChange={set('localidad')}
        />
      </div>

      {/* ─── ORIGEN / CANAL DE CAPTACIÓN ───────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Origen / Cómo llegó
        </label>

        {/* Canales digitales directos */}
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
          Canal digital
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {CANALES_DIRECTOS.map(canal => (
            <button
              key={canal}
              type="button"
              onClick={() => selectCanal(canal)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                canalActivo === canal
                  ? 'bg-[#D4621A] border-[#D4621A] text-white'
                  : 'border-gray-200 text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
              }`}
            >
              {LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectCanal('otro')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              canalActivo === 'otro'
                ? 'bg-[#D4621A] border-[#D4621A] text-white'
                : 'border-gray-200 text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
            }`}
          >
            Otro
          </button>
        </div>

        {/* Canales de referido comercial */}
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
          Referido por
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {CANALES_REFERIDO.map(canal => (
            <button
              key={canal}
              type="button"
              onClick={() => selectCanal(canal)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                canalActivo === canal
                  ? 'bg-[#D4621A] border-[#D4621A] text-white'
                  : 'border-gray-200 text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
              }`}
            >
              {LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]}
            </button>
          ))}
        </div>

        {/* Campo de nombre — aparece solo cuando se requiere */}
        {esReferido && (
          <div className="mt-1 animate-fadein">
            <Input
              label={
                ORIGEN_COMERCIAL.includes(canalActivo!)
                  ? `Nombre de la ${LABEL_CORTO[canalActivo!] ?? 'entidad'} *`
                  : 'Nombre del referente *'
              }
              value={form.origenNombre ?? ''}
              placeholder={placeholderNombre(canalActivo)}
              onChange={e => setNombreReferente(e.target.value)}
            />
            {ORIGEN_COMERCIAL.includes(canalActivo!) && (
              <p className="text-xs text-[#D4621A] mt-1 flex items-center gap-1">
                <span>📊</span>
                Se registrará en las métricas de{' '}
                {ORIGEN_CANAL_LABELS[canalActivo!].toLowerCase()} para seguimiento comercial.
              </p>
            )}
          </div>
        )}

        {/* Badge resumen del canal elegido */}
        {canalActivo && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-400">Canal registrado:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                             text-xs font-semibold bg-orange-50 text-[#D4621A] border border-orange-100">
              {buildOrigenLegacy(canalActivo, form.origenNombre ?? '') || ORIGEN_CANAL_LABELS[canalActivo]}
            </span>
          </div>
        )}
      </div>

      {/* Observaciones */}
      <Textarea
        label="Observaciones" value={form.observaciones}
        onChange={set('observaciones')}
        placeholder="Notas internas sobre el cliente..."
        rows={3}
      />

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1">{submitLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}