// src/features/clientes/ClienteForm.tsx
import { useState } from 'react'
import { z }        from 'zod'
import { Input, Select, Textarea, Button } from '@/components/ui'
import type { Cliente } from '@/types'

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
  origen:        z.string().max(80),   // canal de captación / referido
})

export type ClienteFormData = z.infer<typeof clienteSchema>

type Errors = Partial<Record<keyof ClienteFormData, string>>

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const EMPTY: ClienteFormData = {
  nombre: '', apellido: '', dni: '', cuit: '',
  telefono: '', email: '', direccion: '',
  localidad: '', userId: null, observaciones: '', origen: '',
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  initial?:     Partial<Cliente>
  onSubmit:     (data: ClienteFormData) => Promise<void>
  onCancel:     () => void
  submitLabel?: string
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function ClienteForm({
  initial, onSubmit, onCancel, submitLabel = 'Guardar',
}: Props) {
  const [form, setForm]     = useState<ClienteFormData>({
    ...EMPTY, ...(initial ?? {}), userId: initial?.userId ?? null,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  const set = (field: keyof ClienteFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      // Limpiar error del campo al editar
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

  // Validación campo a campo on-blur para feedback inmediato
  const validateField = (field: keyof ClienteFormData) => {
    const result = clienteSchema.shape[field].safeParse(form[field])
    if (!result.success) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try { await onSubmit(form) }
    finally { setLoading(false) }
  }

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

      {/* Origen / Canal de captación */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Origen / Cómo llegó
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {['Referido', 'Instagram', 'Facebook', 'Google', 'Cartel / Local', 'WhatsApp', 'Otro'].map(op => (
            <button
              key={op}
              type="button"
              onClick={() => setForm(prev => ({
                ...prev,
                origen: prev.origen === op ? '' : op,
              }))}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                form.origen === op
                  ? 'bg-[#D4621A] border-[#D4621A] text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {op}
            </button>
          ))}
        </div>
        {form.origen === 'Referido' && (
          <Input
            label="Nombre del referente"
            value={form.origen === 'Referido' ? '' : form.origen}
            placeholder="¿Quién lo recomendó?"
            onChange={e => setForm(prev => ({ ...prev, origen: `Referido: ${e.target.value}` }))}
          />
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