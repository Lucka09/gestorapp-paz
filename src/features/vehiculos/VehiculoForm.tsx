import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input, Select, Button } from '@/components/ui'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useClientes } from '@/hooks/useClientes'
import { buscarVehiculoPorPatente } from '@/lib/firestore/vehiculos'
import { TIPO_VEHICULO_LABELS, type TipoVehiculo } from '@/types'
import { formatPatente } from '@/utils'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const ANIO_ACTUAL = new Date().getFullYear()

const TIPOS_VEHICULO = ['auto', 'moto', 'camion', 'utilitario', 'otro'] as const

// Formatos de patente argentina:
//   Vieja: ABC123  (3 letras + 3 números)
//   Nueva: AB123CD (2 letras + 3 números + 2 letras — Mercosur)
const PATENTE_REGEX = /^[A-Za-z]{3}\d{3}$|^[A-Za-z]{2}\d{3}[A-Za-z]{2}$/

function buildVehiculoSchema(gestoriaId: string, esEdicion: boolean) {
  // En edición la patente está deshabilitada — solo validamos formato.
  // En creación verificamos además que no exista en la gestoría.
  const patenteField = esEdicion
    ? z.string().min(1, 'Requerido')
    : z.string()
        .min(1, 'Requerido')
        .regex(PATENTE_REGEX, 'Patente inválida — ej: AB123CD o ABC123')
        .refine(async (p) => {
          const existe = await buscarVehiculoPorPatente(formatPatente(p), gestoriaId)
          return !existe
        }, 'Ya existe un vehículo con esta patente en tu gestoría')

  return z.object({
    patente:   patenteField,
    tipo:      z.enum(TIPOS_VEHICULO),
    marca:     z.string().min(1, 'Requerido').max(50),
    modelo:    z.string().min(1, 'Requerido').max(50),
    anio:      z.coerce
                 .number({ invalid_type_error: 'Debe ser un número' })
                 .int('Debe ser entero')
                 .min(1900, 'Año inválido — mínimo 1900')
                 .max(ANIO_ACTUAL + 1, `Año inválido — máximo ${ANIO_ACTUAL + 1}`),
    color:     z.string().max(30),
    nroMotor:  z.string().max(50),
    nroChasis: z.string().max(50),
    clienteId: z.string().min(1, 'Seleccioná un titular'),
  })
}

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
  const gestoriaId   = useGestoriaId()
  const { clientes } = useClientes()

  const schema = useMemo(
    () => buildVehiculoSchema(gestoriaId, esEdicion),
    [gestoriaId, esEdicion]
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VehiculoFormData>({
    resolver:       zodResolver(schema),
    mode:           'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      patente:   initial?.patente   ?? '',
      tipo:      initial?.tipo      ?? 'auto',
      marca:     initial?.marca     ?? '',
      modelo:    initial?.modelo    ?? '',
      anio:      initial?.anio      ?? ANIO_ACTUAL,
      color:     initial?.color     ?? '',
      nroMotor:  initial?.nroMotor  ?? '',
      nroChasis: initial?.nroChasis ?? '',
      clienteId: clienteIdFijo ?? initial?.clienteId ?? '',
    },
  })

  const submit = handleSubmit(async (data) => {
    // Normalizar patente al formato canónico antes de enviar
    await onSubmit({ ...data, patente: formatPatente(data.patente) })
  })

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>

      {/* Patente y Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Patente *"
          {...register('patente')}
          error={errors.patente?.message}
          placeholder="AB123CD"
          disabled={esEdicion}
          className={esEdicion ? 'bg-gray-50 uppercase' : 'uppercase'}
        />
        <Select label="Tipo *" {...register('tipo')} error={errors.tipo?.message}>
          {(Object.entries(TIPO_VEHICULO_LABELS) as [TipoVehiculo, string][]).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </Select>
      </div>

      {/* Marca, Modelo y Año */}
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Marca *"
          {...register('marca')}
          error={errors.marca?.message}
          placeholder="Toyota"
        />
        <Input
          label="Modelo *"
          {...register('modelo')}
          error={errors.modelo?.message}
          placeholder="Corolla"
        />
        <Input
          label="Año *"
          type="number"
          {...register('anio')}
          error={errors.anio?.message}
          min={1900}
          max={ANIO_ACTUAL + 1}
          inputMode="numeric"
        />
      </div>

      {/* Color */}
      <Input
        label="Color"
        {...register('color')}
        error={errors.color?.message}
        placeholder="Blanco"
      />

      {/* Nro Motor y Chasis */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nro. de Motor"
          {...register('nroMotor')}
          error={errors.nroMotor?.message}
          placeholder="AB123456"
          className="uppercase"
        />
        <Input
          label="Nro. de Chasis"
          {...register('nroChasis')}
          error={errors.nroChasis?.message}
          placeholder="9BWZZZ377VT004251"
          className="uppercase"
        />
      </div>

      {/* Titular */}
      {clienteIdFijo ? (
        <input type="hidden" {...register('clienteId')} />
      ) : (
        <Select
          label="Titular *"
          {...register('clienteId')}
          error={errors.clienteId?.message}
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

      {/* Acciones */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={isSubmitting} className="flex-1">
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}