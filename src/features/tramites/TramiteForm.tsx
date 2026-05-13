// src/features/tramites/TramiteForm.tsx
import { useState, useEffect } from 'react'
import { z }                   from 'zod'
import { Input, Select, Textarea, Button } from '@/components/ui'
import { useClientes }           from '@/hooks/useClientes'
import { useVehiculosPorCliente } from '@/hooks/useVehiculos'
import ClienteCombobox           from '@/components/shared/ClienteCombobox'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import type { TramiteInput }     from '@/lib/firestore/tramites'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const tramiteSchema = z.object({
  gestoriaId:           z.string().min(1, 'Gestoría no válida'),
  tipo:                  z.string().min(1),
  clienteId:             z.string().min(1, 'Seleccioná un cliente'),
  vehiculoId:            z.string().min(1, 'Seleccioná un vehículo'),
  patente:               z.string().max(10),
  descripcion:           z.string().max(300),
  observacionesInternas: z.string().max(300),
  honorarios:            z.number()
                           .min(0, 'Debe ser ≥ 0')
                           .max(9_999_999, 'Monto demasiado alto'),
  asignadoA:             z.string().nullable(),
})

export type TramiteFormData = z.infer<typeof tramiteSchema>

type Errors = Partial<Record<keyof TramiteFormData, string>>

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const EMPTY: TramiteInput = {
  gestoriaId:           '',
  tipo:                  'transferencia',
  clienteId:             '',
  vehiculoId:            '',
  patente:               '',
  descripcion:           '',
  observacionesInternas: '',
  honorarios:            0,
  asignadoA:             null,
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  initial?:        Partial<TramiteInput>
  clienteIdFijo?:  string
  vehiculoIdFijo?: string
  onSubmit:        (data: TramiteInput) => Promise<void>
  onCancel:        () => void
  submitLabel?:    string
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function TramiteForm({
  initial, clienteIdFijo, vehiculoIdFijo,
  onSubmit, onCancel, submitLabel = 'Crear trámite',
}: Props) {
  const { clientes }    = useClientes()
  const [form, setForm] = useState<TramiteInput>({
    ...EMPTY, ...(initial ?? {}),
    clienteId:  clienteIdFijo  ?? initial?.clienteId  ?? '',
    vehiculoId: vehiculoIdFijo ?? initial?.vehiculoId ?? '',
  })
  const [errors, setErrors]   = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  const { vehiculos } = useVehiculosPorCliente(form.clienteId || undefined)

  // Limpiar vehículo al cambiar cliente
  useEffect(() => {
    if (!clienteIdFijo && !vehiculoIdFijo) {
      setForm(prev => ({ ...prev, vehiculoId: '', patente: '' }))
    }
  }, [form.clienteId])

  // Autocompletar patente al seleccionar vehículo
  useEffect(() => {
    if (form.vehiculoId) {
      const v = vehiculos.find(v => v.id === form.vehiculoId)
      if (v) setForm(prev => ({ ...prev, patente: v.patente }))
    }
  }, [form.vehiculoId, vehiculos])

  // Detectar tipo multa para adaptar la UI
  const esMulta = form.tipo === 'descargo_multa'

  const set = (field: keyof TramiteInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = field === 'honorarios' ? Number(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [field]: val }))
      if (errors[field as keyof Errors]) {
        setErrors(prev => ({ ...prev, [field]: undefined }))
      }
    }

  const setClienteId = (id: string) => {
    setForm(prev => ({ ...prev, clienteId: id }))
    if (errors.clienteId) setErrors(prev => ({ ...prev, clienteId: undefined }))
  }

  const validate = (): boolean => {
    const result = tramiteSchema.safeParse(form)
    if (result.success) { setErrors({}); return true }
    const flat = result.error.flatten().fieldErrors
    const errs: Errors = {}
    for (const [k, v] of Object.entries(flat)) {
      if (v?.[0]) errs[k as keyof Errors] = v[0]
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

      {/* Tipo */}
      <Select label="Tipo de trámite *" value={form.tipo} onChange={set('tipo')}>
        {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>

      {/* Cliente — combobox buscable */}
      {!clienteIdFijo && (
        <ClienteCombobox
          label="Cliente"
          required
          value={form.clienteId}
          onChange={setClienteId}
          clientes={clientes}
          error={errors.clienteId}
        />
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
              : '— Primero seleccioná un cliente —'}
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

      {/* Descripción / N° LIT según tipo */}
      <Textarea
        label={esMulta ? 'N° de LIT *' : 'Descripción / Detalle'}
        value={form.descripcion}
        onChange={set('descripcion')}
        placeholder={esMulta
          ? 'Ej: LIT-2025-00123456 — Número de expediente de la infracción'
          : 'Detalle específico del trámite...'}
        rows={esMulta ? 2 : 3}
      />
      {esMulta && (
        <p className="text-xs text-amber-600 -mt-3 flex items-center gap-1">
          <span>⚠️</span>
          El cobro de honorarios se gestiona en el workflow paso a paso de multa.
        </p>
      )}

      {/* Honorarios — ocultar para descargo_multa (lo gestiona el workflow) */}
      {!esMulta && (
        <Input
          label="Honorarios ($)"
          type="number"
          value={form.honorarios}
          onChange={set('honorarios')}
          onBlur={() => {
            const r = tramiteSchema.shape.honorarios.safeParse(form.honorarios)
            if (!r.success) setErrors(prev => ({ ...prev, honorarios: r.error.issues[0]?.message }))
          }}
          error={errors.honorarios}
          min={0}
          placeholder="0"
        />
      )}

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