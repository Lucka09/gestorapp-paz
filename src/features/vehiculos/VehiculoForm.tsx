import { useState, useEffect } from 'react'
import { Input, Select, Button } from '@/components/ui'
import { useClientes } from '@/hooks/useClientes'
import type { TipoVehiculo } from '@/types'
import { TIPO_VEHICULO_LABELS } from '@/types'
import { formatPatente } from '@/utils'

export type VehiculoFormData = {
  patente:   string
  tipo:      TipoVehiculo
  marca:     string
  modelo:    string
  anio:      number
  color:     string
  nroMotor:  string
  nroChasis: string
  clienteId: string
}

const ANIO_ACTUAL = new Date().getFullYear()

const EMPTY: VehiculoFormData = {
  patente: '', tipo: 'auto', marca: '', modelo: '',
  anio: ANIO_ACTUAL, color: '', nroMotor: '',
  nroChasis: '', clienteId: '',
}

interface Props {
  initial?: Partial<VehiculoFormData>
  clienteIdFijo?: string   // si viene desde la ficha de un cliente
  onSubmit: (data: VehiculoFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  esEdicion?: boolean
}

export default function VehiculoForm({
  initial, clienteIdFijo, onSubmit, onCancel, submitLabel = 'Guardar', esEdicion = false
}: Props) {
  const { clientes } = useClientes()
  const [form, setForm]     = useState<VehiculoFormData>({
    ...EMPTY,
    ...(initial ?? {}),
    clienteId: clienteIdFijo ?? initial?.clienteId ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof VehiculoFormData, string>>>({})
  const [loading, setLoading] = useState(false)

  const set = (field: keyof VehiculoFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = field === 'anio' ? Number(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [field]: val }))
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

  const validate = () => {
    const errs: Partial<Record<keyof VehiculoFormData, string>> = {}
    if (!form.patente.trim())   errs.patente   = 'Requerido'
    if (!form.marca.trim())     errs.marca     = 'Requerido'
    if (!form.modelo.trim())    errs.modelo    = 'Requerido'
    if (!form.clienteId)        errs.clienteId = 'Seleccioná un titular'
    if (form.anio < 1900 || form.anio > ANIO_ACTUAL + 1)
      errs.anio = `Año inválido`
    setErrors(errs)
    return Object.keys(errs).length === 0
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
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Patente y Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Patente *"
          value={form.patente}
          onChange={set('patente')}
          error={errors.patente}
          placeholder="AB123CD"
          disabled={esEdicion}
          className={esEdicion ? 'bg-gray-50 uppercase' : 'uppercase'}
        />
        <Select
          label="Tipo *"
          value={form.tipo}
          onChange={set('tipo')}
        >
          {(Object.entries(TIPO_VEHICULO_LABELS) as [TipoVehiculo, string][]).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </Select>
      </div>

      {/* Marca, Modelo y Año */}
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Marca *"
          value={form.marca}
          onChange={set('marca')}
          error={errors.marca}
          placeholder="Toyota"
        />
        <Input
          label="Modelo *"
          value={form.modelo}
          onChange={set('modelo')}
          error={errors.modelo}
          placeholder="Corolla"
        />
        <Input
          label="Año *"
          type="number"
          value={form.anio}
          onChange={set('anio')}
          error={errors.anio}
          min={1900}
          max={ANIO_ACTUAL + 1}
        />
      </div>

      {/* Color */}
      <Input
        label="Color"
        value={form.color}
        onChange={set('color')}
        placeholder="Blanco"
      />

      {/* Nro Motor y Chasis */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nro. de Motor"
          value={form.nroMotor}
          onChange={set('nroMotor')}
          placeholder="AB123456"
          className="uppercase"
        />
        <Input
          label="Nro. de Chasis"
          value={form.nroChasis}
          onChange={set('nroChasis')}
          placeholder="9BWZZZ377VT004251"
          className="uppercase"
        />
      </div>

      {/* Titular */}
      {!clienteIdFijo && (
        <Select
          label="Titular *"
          value={form.clienteId}
          onChange={set('clienteId')}
          error={errors.clienteId}
          disabled={esEdicion}
        >
          <option value="">— Seleccioná un cliente —</option>
          {clientes
            .sort((a, b) => a.apellido.localeCompare(b.apellido))
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.apellido}, {c.nombre} — DNI {c.dni}
              </option>
            ))
          }
        </Select>
      )}

      {clienteIdFijo && (
        <input type="hidden" value={clienteIdFijo} />
      )}

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
