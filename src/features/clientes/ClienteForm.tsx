import { useState } from 'react'
import { Input, Select, Textarea, Button } from '@/components/ui'
import type { Cliente } from '@/types'

export type ClienteFormData = {
  nombre:      string
  apellido:    string
  dni:         string
  cuit:        string
  telefono:    string
  email:       string
  direccion:   string
  localidad:   string
  userId:      string | null
  observaciones: string
}

const EMPTY: ClienteFormData = {
  nombre: '', apellido: '', dni: '', cuit: '',
  telefono: '', email: '', direccion: '',
  localidad: '', userId: null, observaciones: '',
}

interface Props {
  initial?: Partial<Cliente>
  onSubmit: (data: ClienteFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

export default function ClienteForm({
  initial, onSubmit, onCancel, submitLabel = 'Guardar'
}: Props) {
  const [form, setForm] = useState<ClienteFormData>({
    ...EMPTY,
    ...(initial ?? {}),
    userId: initial?.userId ?? null,
  })
  const [errors, setErrors] = useState<Partial<ClienteFormData>>({})
  const [loading, setLoading] = useState(false)

  const set = (field: keyof ClienteFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

  const validate = (): boolean => {
    const errs: Partial<ClienteFormData> = {}
    if (!form.nombre.trim())   errs.nombre   = 'Requerido'
    if (!form.apellido.trim()) errs.apellido  = 'Requerido'
    if (!form.dni.trim())      errs.dni       = 'Requerido'
    if (!form.telefono.trim()) errs.telefono  = 'Requerido'
    if (form.dni && !/^\d{7,8}$/.test(form.dni.trim()))
      errs.dni = 'DNI inválido (7 u 8 dígitos)'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await onSubmit(form)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Nombre y Apellido */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nombre *"
          value={form.nombre}
          onChange={set('nombre')}
          error={errors.nombre}
          placeholder="Juan"
        />
        <Input
          label="Apellido *"
          value={form.apellido}
          onChange={set('apellido')}
          error={errors.apellido}
          placeholder="García"
        />
      </div>

      {/* DNI y CUIT */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="DNI *"
          value={form.dni}
          onChange={set('dni')}
          error={errors.dni}
          placeholder="20123456"
          maxLength={8}
        />
        <Input
          label="CUIT / CUIL"
          value={form.cuit}
          onChange={set('cuit')}
          placeholder="20-20123456-3"
        />
      </div>

      {/* Teléfono y Email */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Teléfono *"
          value={form.telefono}
          onChange={set('telefono')}
          error={errors.telefono}
          placeholder="11 4123-4567"
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="juan@mail.com"
        />
      </div>

      {/* Dirección y Localidad */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Dirección"
          value={form.direccion}
          onChange={set('direccion')}
          placeholder="Av. San Martín 1234"
        />
        <Input
          label="Localidad"
          value={form.localidad}
          onChange={set('localidad')}
          placeholder="San Martín"
        />
      </div>

      {/* Observaciones */}
      <Textarea
        label="Observaciones"
        value={form.observaciones}
        onChange={set('observaciones')}
        placeholder="Notas internas sobre el cliente..."
        rows={3}
      />

      {/* Acciones */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1">
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
