import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input, Textarea, Button } from '@/components/ui'
import { useGestoriaId } from '@/context/GestoriaContext'
import { buscarClientePorDNI } from '@/lib/firestore/clientes'
import type { Cliente } from '@/types'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
// Factory: recibe gestoriaId para la validación async de DNI
// y dniOriginal para saltear unicidad en modo edición (mismo DNI = sin consulta)

function buildClienteSchema(gestoriaId: string, dniOriginal?: string) {
  return z.object({
    nombre:   z.string().min(1, 'Requerido').max(50, 'Máximo 50 caracteres'),
    apellido: z.string().min(1, 'Requerido').max(50, 'Máximo 50 caracteres'),

    dni: z.string()
      .min(1, 'Requerido')
      .regex(/^\d{7,8}$/, 'DNI inválido — debe tener 7 u 8 dígitos')
      .refine(async (dni) => {
        // En edición: si el valor no cambió, omitir la consulta a Firestore
        if (dniOriginal && dni === dniOriginal) return true
        const existe = await buscarClientePorDNI(dni, gestoriaId)
        return !existe
      }, 'Este DNI ya está registrado en tu gestoría'),

    cuit: z.string().refine(
      v => v === '' || /^(\d{11}|\d{2}-\d{8}-\d)$/.test(v),
      'Formato inválido — ej: 20-12345678-9'
    ),

    telefono: z.string().min(6, 'Requerido').max(30),

    email: z.string().refine(
      v => v === '' || z.string().email().safeParse(v).success,
      'Email inválido'
    ),

    direccion:     z.string().max(100),
    localidad:     z.string().max(60),
    observaciones: z.string().max(500),
    userId:        z.string().nullable(),
  })
}

// ClienteFormData — tipo explícito compatible con lo que usan las páginas.
// No se infiere del schema con async refine para mantener compatibilidad
// (z.infer de un schema con refine asincrónica puede generar tipos complejos).
export type ClienteFormData = {
  nombre:        string
  apellido:      string
  dni:           string
  cuit:          string
  telefono:      string
  email:         string
  direccion:     string
  localidad:     string
  observaciones: string
  userId:        string | null
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
  const gestoriaId = useGestoriaId()

  // useMemo evita reconstruir el schema en cada render.
  // Solo se reconstruye si cambia el tenant o el DNI original del cliente.
  const schema = useMemo(
    () => buildClienteSchema(gestoriaId, initial?.dni),
    [gestoriaId, initial?.dni]
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClienteFormData>({
    resolver: zodResolver(schema),
    // onBlur: la validación asincrónica (1 lectura Firestore) se dispara
    // solo cuando el usuario sale del campo — nunca en cada tecla.
    // reValidateMode: onBlur mantiene ese comportamiento tras el primer error.
    mode:           'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      nombre:        initial?.nombre        ?? '',
      apellido:      initial?.apellido      ?? '',
      dni:           initial?.dni           ?? '',
      cuit:          initial?.cuit          ?? '',
      telefono:      initial?.telefono      ?? '',
      email:         initial?.email         ?? '',
      direccion:     initial?.direccion     ?? '',
      localidad:     initial?.localidad     ?? '',
      observaciones: initial?.observaciones ?? '',
      userId:        initial?.userId        ?? null,
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

      {/* Nombre y Apellido */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nombre *"
          {...register('nombre')}
          error={errors.nombre?.message}
          placeholder="Juan"
          autoComplete="given-name"
        />
        <Input
          label="Apellido *"
          {...register('apellido')}
          error={errors.apellido?.message}
          placeholder="García"
          autoComplete="family-name"
        />
      </div>

      {/* DNI y CUIT */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="DNI *"
          {...register('dni')}
          error={errors.dni?.message}
          placeholder="20123456"
          maxLength={8}
          inputMode="numeric"
        />
        <Input
          label="CUIT / CUIL"
          {...register('cuit')}
          error={errors.cuit?.message}
          placeholder="20-20123456-3"
          inputMode="numeric"
        />
      </div>

      {/* Teléfono y Email */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Teléfono *"
          {...register('telefono')}
          error={errors.telefono?.message}
          placeholder="11 4123-4567"
          inputMode="tel"
          autoComplete="tel"
        />
        <Input
          label="Email"
          type="email"
          {...register('email')}
          error={errors.email?.message}
          placeholder="juan@mail.com"
          autoComplete="email"
        />
      </div>

      {/* Dirección y Localidad */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Dirección"
          {...register('direccion')}
          error={errors.direccion?.message}
          placeholder="Av. San Martín 1234"
          autoComplete="street-address"
        />
        <Input
          label="Localidad"
          {...register('localidad')}
          error={errors.localidad?.message}
          placeholder="San Martín"
          autoComplete="address-level2"
        />
      </div>

      {/* Observaciones */}
      <Textarea
        label="Observaciones"
        {...register('observaciones')}
        error={errors.observaciones?.message}
        placeholder="Notas internas sobre el cliente..."
        rows={3}
      />

      {/* userId — campo técnico, no visible */}
      <input type="hidden" {...register('userId')} />

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