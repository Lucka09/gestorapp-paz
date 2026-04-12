import { useState, useEffect } from 'react'
import { Input, Select, Textarea, Button } from '@/components/ui'
import { useClientes } from '@/hooks/useClientes'
import { useVehiculosPorCliente } from '@/hooks/useVehiculos'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import type { TramiteInput } from '@/lib/firestore/tramites'

const EMPTY: TramiteInput = {
  tipo:                  'transferencia',
  clienteId:             '',
  vehiculoId:            '',
  patente:               '',
  descripcion:           '',
  observacionesInternas: '',
  honorarios:            0,
  asignadoA:             null,
}

interface Props {
  initial?:      Partial<TramiteInput>
  clienteIdFijo?: string
  vehiculoIdFijo?: string
  onSubmit:      (data: TramiteInput) => Promise<void>
  onCancel:      () => void
  submitLabel?:  string
}

export default function TramiteForm({
  initial, clienteIdFijo, vehiculoIdFijo,
  onSubmit, onCancel, submitLabel = 'Crear trámite'
}: Props) {
  const { clientes } = useClientes()
  const [form, setForm]     = useState<TramiteInput>({
    ...EMPTY,
    ...(initial ?? {}),
    clienteId:  clienteIdFijo  ?? initial?.clienteId  ?? '',
    vehiculoId: vehiculoIdFijo ?? initial?.vehiculoId ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof TramiteInput, string>>>({})
  const [loading, setLoading] = useState(false)

  const { vehiculos } = useVehiculosPorCliente(form.clienteId || undefined)

  // Cuando cambia el cliente, limpiar vehículo seleccionado
  useEffect(() => {
    if (!clienteIdFijo && !vehiculoIdFijo) {
      setForm(prev => ({ ...prev, vehiculoId: '', patente: '' }))
    }
  }, [form.clienteId])

  // Cuando se selecciona vehículo, completar patente automáticamente
  useEffect(() => {
    if (form.vehiculoId) {
      const v = vehiculos.find(v => v.id === form.vehiculoId)
      if (v) setForm(prev => ({ ...prev, patente: v.patente }))
    }
  }, [form.vehiculoId, vehiculos])

  const set = (field: keyof TramiteInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = field === 'honorarios' ? Number(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [field]: val }))
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

  const validate = () => {
    const errs: Partial<Record<keyof TramiteInput, string>> = {}
    if (!form.clienteId)  errs.clienteId  = 'Seleccioná un cliente'
    if (!form.vehiculoId) errs.vehiculoId = 'Seleccioná un vehículo'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try { await onSubmit(form) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Tipo de trámite */}
      <Select label="Tipo de trámite *" value={form.tipo} onChange={set('tipo')}>
        {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </Select>

      {/* Cliente */}
      {!clienteIdFijo && (
        <Select
          label="Cliente *"
          value={form.clienteId}
          onChange={set('clienteId')}
          error={errors.clienteId}
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

      {/* Vehículo */}
      {!vehiculoIdFijo && (
        <Select
          label="Vehículo *"
          value={form.vehiculoId}
          onChange={set('vehiculoId')}
          error={errors.vehiculoId}
          disabled={!form.clienteId}
        >
          <option value="">
            {form.clienteId
              ? vehiculos.length === 0
                ? '— Este cliente no tiene vehículos —'
                : '— Seleccioná un vehículo —'
              : '— Primero seleccioná un cliente —'
            }
          </option>
          {vehiculos.map(v => (
            <option key={v.id} value={v.id}>
              {v.patente} · {v.marca} {v.modelo} ({v.anio})
            </option>
          ))}
        </Select>
      )}

      {/* Patente (readonly, se completa sola) */}
      <Input
        label="Patente"
        value={form.patente}
        onChange={set('patente')}
        placeholder="Se completa al seleccionar vehículo"
        className="uppercase bg-gray-50"
        readOnly={!!form.vehiculoId}
      />

      {/* Descripción */}
      <Textarea
        label="Descripción / Detalle"
        value={form.descripcion}
        onChange={set('descripcion')}
        placeholder="Detalle específico del trámite..."
        rows={3}
      />

      {/* Honorarios */}
      <Input
        label="Honorarios ($)"
        type="number"
        value={form.honorarios}
        onChange={set('honorarios')}
        min={0}
        placeholder="0"
      />

      {/* Observaciones internas */}
      <Textarea
        label="Observaciones internas"
        value={form.observacionesInternas}
        onChange={set('observacionesInternas')}
        placeholder="Notas solo visibles para el equipo..."
        rows={2}
      />

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1">{submitLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
