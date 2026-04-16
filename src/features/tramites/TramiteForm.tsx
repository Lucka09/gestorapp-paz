import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input, Select, Textarea, Button } from '@/components/ui'
import { useClientes } from '@/hooks/useClientes'
import { useVehiculosPorCliente } from '@/hooks/useVehiculos'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'

const TIPOS_TRAMITE = [
  'transferencia', 'alta', 'baja', 'tramite_08',
  'duplicado_titulo', 'duplicado_cedula', 'cambio_radicacion',
  'informe_dominio', 'certificado_dominio', 'inscripcion_inicial',
  'prenda', 'descargo_multa', 'inhibicion', 'levantamiento_inhibicion',
  'vtv', 'otro',
] as const

const tramiteSchema = z.object({
  tipo:       z.enum(TIPOS_TRAMITE).catch('transferencia'),
  clienteId:  z.string().min(1, 'Seleccioná un cliente'),
  vehiculoId: z.string().min(1, 'Seleccioná un vehículo'),
  patente:    z.string(),
  descripcion:           z.string().max(300),
  observacionesInternas: z.string().max(500),
  honorarios: z.number().min(0, 'Debe ser ≥ 0'),
  asignadoA:  z.string().nullable(),
})

export type TramiteFormData = z.infer<typeof tramiteSchema>

interface Props {
  initial?:        Partial<TramiteFormData>
  clienteIdFijo?:  string
  vehiculoIdFijo?: string
  onSubmit:        (data: TramiteFormData) => Promise<void>
  onCancel:        () => void
  submitLabel?:    string
}

export default function TramiteForm({
  initial, clienteIdFijo, vehiculoIdFijo,
  onSubmit, onCancel, submitLabel = 'Crear trámite',
}: Props) {
  const { clientes } = useClientes()

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<TramiteFormData>({
    resolver: zodResolver(tramiteSchema),
    mode: 'onBlur', reValidateMode: 'onBlur',
    defaultValues: {
      tipo:                  initial?.tipo                  ?? 'transferencia',
      clienteId:             clienteIdFijo  ?? initial?.clienteId  ?? '',
      vehiculoId:            vehiculoIdFijo ?? initial?.vehiculoId ?? '',
      patente:               initial?.patente               ?? '',
      descripcion:           initial?.descripcion           ?? '',
      observacionesInternas: initial?.observacionesInternas ?? '',
      honorarios:            initial?.honorarios            ?? 0,
      asignadoA:             initial?.asignadoA             ?? null,
    },
  })

  const clienteId  = watch('clienteId')
  const vehiculoId = watch('vehiculoId')
  const { vehiculos } = useVehiculosPorCliente(clienteId || undefined)

  // Cuando cambia el cliente, limpiar vehículo y patente
  useEffect(() => {
    if (!clienteIdFijo && !vehiculoIdFijo) {
      setValue('vehiculoId', '', { shouldValidate: false })
      setValue('patente',    '', { shouldValidate: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // Cuando se selecciona un vehículo, auto-completar la patente
  useEffect(() => {
    if (!vehiculoId) {
      if (!vehiculoIdFijo) setValue('patente', '', { shouldValidate: false })
      return
    }
    const v = vehiculos.find(v => v.id === vehiculoId)
    if (v) setValue('patente', v.patente, { shouldValidate: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculoId, vehiculos])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

      <Select label="Tipo de trámite *" {...register('tipo')} error={errors.tipo?.message}>
        {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </Select>

      {clienteIdFijo ? (
        <input type="hidden" {...register('clienteId')} />
      ) : (
        <Select label="Cliente *" {...register('clienteId')} error={errors.clienteId?.message}>
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

      {vehiculoIdFijo ? (
        <input type="hidden" {...register('vehiculoId')} />
      ) : (
        <Select
          label="Vehículo *"
          {...register('vehiculoId')}
          error={errors.vehiculoId?.message}
          disabled={!clienteId}
        >
          <option value="">
            {clienteId
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

      <Input
        label="Patente"
        {...register('patente')}
        placeholder="Se completa al seleccionar vehículo"
        className="uppercase bg-gray-50"
        readOnly
        tabIndex={-1}
      />

      <Textarea
        label="Descripción / Detalle"
        {...register('descripcion')}
        error={errors.descripcion?.message}
        placeholder="Detalle específico del trámite..."
        rows={3}
      />

      <Input
        label="Honorarios ($)"
        type="number"
        {...register('honorarios')}
        error={errors.honorarios?.message}
        min={0}
        placeholder="0"
        inputMode="numeric"
      />

      <Textarea
        label="Observaciones internas"
        {...register('observacionesInternas')}
        error={errors.observacionesInternas?.message}
        placeholder="Notas solo visibles para el equipo..."
        rows={2}
      />

      <input type="hidden" {...register('asignadoA')} />

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={isSubmitting} className="flex-1">{submitLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}