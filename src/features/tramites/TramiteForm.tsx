import { useState, useEffect } from 'react'
import { z }                   from 'zod'
import { Input, Select, Textarea, Button } from '@/components/ui'
import { useClientes }           from '@/hooks/useClientes'
import { useVehiculosPorCliente } from '@/hooks/useVehiculos'
import ClienteCombobox           from '@/components/shared/ClienteCombobox'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import type { TramiteInput }     from '@/lib/firestore/tramites'

// ─── SCHEMA — gestoriaId excluido: se inyecta desde el padre, no del usuario ──

const tramiteSchema = z.object({
  tipo:                  z.string().min(1),
  clienteId:             z.string().min(1, 'Seleccioná un cliente'),
  vehiculoId:            z.string().min(1, 'Seleccioná un vehículo'),
  patente:               z.string().max(10),
  descripcion:           z.string().max(300),
  observacionesInternas: z.string().max(300),
  honorarios:            z.number().min(0, 'Debe ser ≥ 0').max(9_999_999),
  asignadoA:             z.string().nullable(),
  asignadoNombre:        z.string().optional().nullable(),
  fechaRequerida:        z.string().optional().nullable(),
})

type FormData  = z.infer<typeof tramiteSchema>
type FormErrors = Partial<Record<keyof FormData, string>>

const EMPTY: FormData = {
  tipo:                  'transferencia',
  clienteId:             '',
  vehiculoId:            '',
  patente:               '',
  descripcion:           '',
  observacionesInternas: '',
  honorarios:            0,
  asignadoA:             null,
  asignadoNombre:        null,
  fechaRequerida:        null,
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  gestoriaId:      string           // requerido — viene del contexto del padre
  initial?:        Partial<FormData>
  clienteIdFijo?:  string
  vehiculoIdFijo?: string
  onSubmit:        (data: TramiteInput) => Promise<void>
  onCancel:        () => void
  submitLabel?:    string
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function TramiteForm({
  gestoriaId, initial, clienteIdFijo, vehiculoIdFijo,
  onSubmit, onCancel, submitLabel = 'Crear trámite',
}: Props) {
  const { clientes }    = useClientes()
  const [form, setForm] = useState<FormData>({
    ...EMPTY, ...(initial ?? {}),
    clienteId:  clienteIdFijo  ?? initial?.clienteId  ?? '',
    vehiculoId: vehiculoIdFijo ?? initial?.vehiculoId ?? '',
  })
  const [errors, setErrors]   = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)

  const { vehiculos } = useVehiculosPorCliente(form.clienteId || undefined)

  // Limpiar vehículo al cambiar cliente
  useEffect(() => {
    if (!clienteIdFijo && !vehiculoIdFijo) {
      setForm(prev => ({ ...prev, vehiculoId: '', patente: '' }))
    }
  }, [form.clienteId, clienteIdFijo, vehiculoIdFijo])

  // Autocompletar patente al seleccionar vehículo
  useEffect(() => {
    if (form.vehiculoId) {
      const v = vehiculos.find(v => v.id === form.vehiculoId)
      if (v) setForm(prev => ({ ...prev, patente: v.patente }))
    }
  }, [form.vehiculoId, vehiculos])

  const esMulta = form.tipo === 'descargo_multa'

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = field === 'honorarios' ? Number(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [field]: val }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

  const setClienteId = (id: string) => {
    setForm(prev => ({ ...prev, clienteId: id }))
    if (errors.clienteId) setErrors(prev => ({ ...prev, clienteId: undefined }))
  }

  const validate = (): boolean => {
    const result = tramiteSchema.safeParse(form)
    if (result.success) { setErrors({}); return true }
    const flat = result.error.flatten().fieldErrors
    const errs: FormErrors = {}
    for (const [k, v] of Object.entries(flat)) {
      if (v?.[0]) errs[k as keyof FormErrors] = v[0]
    }
    setErrors(errs)
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gestoriaId) {
      console.error('[TramiteForm] gestoriaId vacío — no se puede crear el trámite')
      return
    }
    if (!validate()) return
    setLoading(true)
    try {
      // Inyectar gestoriaId aquí — no viene del form input
      await onSubmit({ ...form, gestoriaId, tipo: form.tipo as import("@/types").TipoTramite })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Tipo */}
      <Select label="Tipo de trámite *" value={form.tipo} onChange={set('tipo')}>
        {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>

      {/* Cliente */}
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

      {/* Patente (readonly) */}
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
        label={esMulta ? 'Observaciones / Detalle (opcional)' : 'Descripción / Detalle'}
        value={form.descripcion}
        onChange={set('descripcion')}
        placeholder={esMulta
          ? 'Notas del caso de multa (opcional)'
          : 'Detalle específico del trámite...'}
        rows={esMulta ? 2 : 3}
      />
      {esMulta && (
        <p className="text-xs text-blue-600 -mt-3 flex items-center gap-1">
          <span>ℹ️</span>
          Los honorarios y cobros se gestionan dentro del workflow de multa paso a paso.
        </p>
      )}

      {/* Honorarios */}
      {!esMulta && (
        <Input
          label="Honorarios ($)"
          type="number"
          value={form.honorarios}
          onChange={set('honorarios')}
          error={errors.honorarios}
          min={0}
          placeholder="0"
        />
      )}

      {/* ── Fecha requerida ──────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Fecha requerida
          <span className="text-gray-400 font-normal ml-1 normal-case">
            · opcional · alerta automática 24/48 h antes
          </span>
        </label>
        <input
          type="date"
          value={form.fechaRequerida ?? ''}
          onChange={e => setForm(prev => ({ ...prev, fechaRequerida: e.target.value || null }))}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                     focus:border-[#D4621A] focus:shadow-[0_0_0_3px_rgba(212,98,26,0.1)]"
        />
      </div>

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