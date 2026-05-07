// src/features/vehiculos/VehiculoForm.tsx
import { useState, useEffect } from 'react'
import { z }                   from 'zod'
import { Input, Select, Button } from '@/components/ui'
import { useClientes }           from '@/hooks/useClientes'
import ClienteCombobox           from '@/components/shared/ClienteCombobox'
import type { TipoVehiculo }     from '@/types'
import { TIPO_VEHICULO_LABELS }  from '@/types'
import { formatPatente }         from '@/utils'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const ANIO_ACTUAL = new Date().getFullYear()

// Patente argentina: formato antiguo AAA-000 o nuevo AA-000-AA (sin guión también)
const PATENTE_RE = /^[A-Za-z]{2,3}[\s-]?\d{3}[\s-]?[A-Za-z]{0,2}$/

const vehiculoSchema = z.object({
  patente:   z.string()
               .min(1,  'Requerido')
               .regex(PATENTE_RE, 'Formato inválido — ej: AB 123 CD o ABC 123'),
  tipo:      z.enum(['auto','moto','camion','utilitario','otro']),
  marca:     z.string().min(1, 'Requerido').max(60),
  modelo:    z.string().min(1, 'Requerido').max(60),
  anio:      z.number()
               .int()
               .min(1900, 'Año inválido')
               .max(ANIO_ACTUAL + 1, `Máximo ${ANIO_ACTUAL + 1}`),
  color:     z.string().max(40),
  nroMotor:  z.string().max(30),
  nroChasis: z.string().max(30),
  clienteId: z.string().min(1, 'Seleccioná un titular'),
})

export type VehiculoFormData = z.infer<typeof vehiculoSchema>

type Errors = Partial<Record<keyof VehiculoFormData, string>>

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const EMPTY: VehiculoFormData = {
  patente: '', tipo: 'auto', marca: '', modelo: '',
  anio: ANIO_ACTUAL, color: '', nroMotor: '', nroChasis: '', clienteId: '',
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  initial?:       Partial<VehiculoFormData>
  clienteIdFijo?: string
  onSubmit:       (data: VehiculoFormData) => Promise<void>
  onCancel:       () => void
  submitLabel?:   string
  esEdicion?:     boolean
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function VehiculoForm({
  initial, clienteIdFijo, onSubmit, onCancel,
  submitLabel = 'Guardar', esEdicion = false,
}: Props) {
  const { clientes } = useClientes()
  const [form, setForm]       = useState<VehiculoFormData>({
    ...EMPTY, ...(initial ?? {}),
    clienteId: clienteIdFijo ?? initial?.clienteId ?? '',
  })
  const [errors, setErrors]   = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  const set = (field: keyof VehiculoFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = field === 'anio' ? Number(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [field]: val }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

  const setClienteId = (id: string) => {
    setForm(prev => ({ ...prev, clienteId: id }))
    if (errors.clienteId) setErrors(prev => ({ ...prev, clienteId: undefined }))
  }

  const validateField = (field: keyof VehiculoFormData) => {
    const result = vehiculoSchema.shape[field].safeParse(form[field])
    if (!result.success) {
      setErrors(prev => ({ ...prev, [field]: result.error.issues[0]?.message }))
    }
  }

  const validate = (): boolean => {
    const result = vehiculoSchema.safeParse(form)
    if (result.success) { setErrors({}); return true }
    const flat = result.error.flatten().fieldErrors
    const errs: Errors = {}
    for (const [k, v] of Object.entries(flat)) {
      if (v?.[0]) errs[k as keyof VehiculoFormData] = v[0]
    }
    setErrors(errs)
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await onSubmit({ ...form, patente: formatPatente(form.patente) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Patente y Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Patente *" value={form.patente} placeholder="AB 123 CD"
          disabled={esEdicion}
          className={`uppercase ${esEdicion ? 'bg-gray-50' : ''}`}
          onChange={set('patente')}
          onBlur={() => !esEdicion && validateField('patente')}
          error={errors.patente}
        />
        <Select label="Tipo *" value={form.tipo} onChange={set('tipo')}>
          {(Object.entries(TIPO_VEHICULO_LABELS) as [TipoVehiculo, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>

      {/* Marca, Modelo y Año */}
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Marca *" value={form.marca} placeholder="Toyota"
          onChange={set('marca')} onBlur={() => validateField('marca')}
          error={errors.marca}
        />
        <Input
          label="Modelo *" value={form.modelo} placeholder="Corolla"
          onChange={set('modelo')} onBlur={() => validateField('modelo')}
          error={errors.modelo}
        />
        <Input
          label="Año *" type="number" value={form.anio}
          min={1900} max={ANIO_ACTUAL + 1}
          onChange={set('anio')} onBlur={() => validateField('anio')}
          error={errors.anio}
        />
      </div>

      {/* Color */}
      <Input
        label="Color" value={form.color} placeholder="Blanco"
        onChange={set('color')}
      />

      {/* Nro Motor y Chasis */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nro. de Motor" value={form.nroMotor} placeholder="AB123456"
          className="uppercase" onChange={set('nroMotor')}
        />
        <Input
          label="Nro. de Chasis" value={form.nroChasis} placeholder="9BWZZZ377VT004251"
          className="uppercase" onChange={set('nroChasis')}
        />
      </div>

      {/* Titular — ClienteCombobox en lugar de Select plano */}
      {!clienteIdFijo && (
        <ClienteCombobox
          label="Titular"
          required
          value={form.clienteId}
          onChange={setClienteId}
          clientes={clientes}
          error={errors.clienteId}
          disabled={esEdicion}
        />
      )}
      {clienteIdFijo && <input type="hidden" value={clienteIdFijo} />}

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1">{submitLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}