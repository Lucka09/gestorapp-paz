// src/features/clientes/ClienteForm.tsx
import { useState } from 'react'
import { z }        from 'zod'
import { Input, Textarea, Button } from '@/components/ui'
import SelectorEncargado, { nombreVisible } from '@/components/shared/SelectorEncargado'
import type { Cliente, OrigenCanal } from '@/types'
import {
  ORIGEN_CANAL_LABELS, ORIGEN_COMERCIAL, ORIGEN_CON_COMISION, ORIGEN_CANALES,
  origenRequiereNombre,
} from '@/types'

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
// El objeto base se guarda aparte porque `.refine()` devuelve un ZodEffects,
// que no expone `.shape` y rompería validateField().

const clienteSchemaBase = z.object({
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
  origen:        z.string().max(80),

  // Obligatorio: toda alta debe declarar de dónde vino el cliente.
  origenCanal: z.enum(ORIGEN_CANALES, {
    message: 'Indicá de dónde vino este cliente',
  }),
  origenNombre:  z.string().max(120).optional(),
  encargadoId:   z.string().optional(),
  encargadoNombre: z.string().optional(),
})

// Si el canal implica un tercero, el nombre pasa a ser obligatorio.
const clienteSchema = clienteSchemaBase.refine(
  d => !origenRequiereNombre(d.origenCanal) || !!d.origenNombre?.trim(),
  { path: ['origenNombre'], message: 'Indicá a quién pertenece este cliente' },
)

export type ClienteFormData = z.infer<typeof clienteSchemaBase>

type Errors = Partial<Record<keyof ClienteFormData, string>>

// ─── CANALES ─────────────────────────────────────────────────────────────────

const CANALES_DIRECTOS: OrigenCanal[] = [
  'instagram', 'facebook', 'google', 'cartel_local', 'whatsapp',
]

const CANALES_REFERIDO: OrigenCanal[] = [
  'referido_persona', 'concesionaria', 'agencia', 'reventa', 'encargado_multas',
]

const LABEL_CORTO: Partial<Record<OrigenCanal, string>> = {
  lead_propio:      'Lead propio',
  referido_persona: 'Referido',
  concesionaria:    'Concesionaria',
  agencia:          'Agencia',
  reventa:          'Reventa',
  encargado_multas: 'Enc. Multas',
  instagram:        'Instagram',
  facebook:         'Facebook',
  google:           'Google',
  cartel_local:     'Cartel / Local',
  whatsapp:         'WhatsApp',
  otro:             'Otro',
}

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────

const EMPTY: ClienteFormData = {
  nombre: '', apellido: '', dni: '', cuit: '',
  telefono: '', email: '', direccion: '',
  localidad: '', userId: null, observaciones: '',
  origen: '',
  // Sin valor: obliga a decidir explícitamente antes de guardar.
  origenCanal: undefined as unknown as OrigenCanal,
  origenNombre: undefined,
  encargadoId: undefined,
  encargadoNombre: undefined,
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  initial?:     Partial<Cliente>
  onSubmit:     (data: ClienteFormData) => Promise<void>
  onCancel:     () => void
  submitLabel?: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Construye el campo legacy `origen` para compatibilidad con código existente */
function buildOrigenLegacy(canal: OrigenCanal | undefined, nombre: string): string {
  if (!canal) return ''
  const label = LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]
  if (nombre.trim()) return `${label}: ${nombre.trim()}`
  return label
}

function placeholderNombre(canal: OrigenCanal | undefined): string {
  switch (canal) {
    case 'referido_persona':  return 'Nombre y apellido de quien refirió'
    case 'concesionaria':     return 'Nombre de la concesionaria'
    case 'agencia':           return 'Nombre de la agencia'
    case 'reventa':           return 'Nombre de la reventa / automotora'
    case 'encargado_multas':  return 'Nombre del encargado'
    default:                  return 'Nombre o detalle adicional'
  }
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function ClienteForm({
  initial, onSubmit, onCancel, submitLabel = 'Guardar',
}: Props) {
  const initialCanal  = initial?.origenCanal as OrigenCanal | undefined
  const initialNombre = initial?.origenNombre ?? ''

  const [form, setForm] = useState<ClienteFormData>({
    ...EMPTY,
    ...(initial ?? {}),
    userId:       initial?.userId ?? null,
    origenCanal:  initialCanal as OrigenCanal,
    origenNombre: initialNombre,
    encargadoId: initial?.encargadoId,
    encargadoNombre: initial?.encargadoNombre,
    origen:       initial?.origen ?? buildOrigenLegacy(initialCanal, initialNombre),
  })
  const [errors, setErrors]   = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  // Arranca marcado solo si el cliente YA estaba guardado como propio.
  // En un alta nueva arranca desmarcado: obliga a decidir.
  const [esLeadPropio, setEsLeadPropio] = useState(initialCanal === 'lead_propio')

  const set = (field: keyof ClienteFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

  const validateField = (field: keyof ClienteFormData) => {
    const result = clienteSchemaBase.shape[field]?.safeParse(form[field])
    if (result && !result.success) {
      setErrors(prev => ({ ...prev, [field]: result.error.issues[0]?.message }))
    }
  }

  const validate = (): boolean => {
    const result = clienteSchema.safeParse(form)
    if (result.success) { setErrors({}); return true }
    const flat = result.error.flatten().fieldErrors
    const errs: Errors = {}
    for (const [k, v] of Object.entries(flat)) {
      if (v?.[0]) errs[k as keyof ClienteFormData] = v[0]
    }
    setErrors(errs)
    return false
  }

  // ── Handlers de origen ────────────────────────────────────────────────────

  const toggleLeadPropio = (checked: boolean) => {
    setEsLeadPropio(checked)
    if (checked) {
      setForm(prev => ({
        ...prev,
        origenCanal:  'lead_propio',
        origenNombre: '',
        origen:       ORIGEN_CANAL_LABELS.lead_propio,
      }))
      setErrors(prev => ({ ...prev, origenCanal: undefined, origenNombre: undefined }))
    } else {
      setForm(prev => ({
        ...prev,
        origenCanal:  undefined as unknown as OrigenCanal,
        origenNombre: '',
        origen:       '',
      }))
    }
  }

  const selectCanal = (canal: OrigenCanal) => {
    const nuevo  = form.origenCanal === canal ? undefined : canal
    const nombre = nuevo ? (form.origenNombre ?? '') : ''
    setForm(prev => ({
      ...prev,
      origenCanal:  nuevo as OrigenCanal,
      origenNombre: nombre,
      encargadoId: nuevo ? undefined : prev.encargadoId,
      encargadoNombre: nuevo ? undefined : prev.encargadoNombre,
      origen:       buildOrigenLegacy(nuevo, nombre),
    }))
    setErrors(prev => ({ ...prev, origenCanal: undefined, origenNombre: undefined }))
  }

  const setNombreReferente = (nombre: string) => {
    setForm(prev => ({
      ...prev,
      origenNombre: nombre,
      origen:       buildOrigenLegacy(prev.origenCanal as OrigenCanal, nombre),
    }))
    if (errors.origenNombre) setErrors(prev => ({ ...prev, origenNombre: undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try { await onSubmit(form) }
    finally { setLoading(false) }
  }

  const canalActivo = form.origenCanal as OrigenCanal | undefined
  const esComercial = !!canalActivo && ORIGEN_CON_COMISION.includes(canalActivo)
  const esOtro      = canalActivo === 'otro'
  const hayErrorOrigen = !!errors.origenCanal || !!errors.origenNombre

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

      {/* ─── ORIGEN DEL CLIENTE ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 transition-colors ${
        hayErrorOrigen
          ? 'border-red-200 bg-red-50/40'
          : 'border-gray-200 bg-gray-50/50'
      }`}>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Origen del cliente *
        </label>

        {/* Check: lead propio */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={esLeadPropio}
            onChange={e => toggleLeadPropio(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#D4621A]
                       focus:ring-[#D4621A] cursor-pointer"
          />
          <span>
            <span className="text-sm font-medium text-gray-800">
              Es un lead propio
            </span>
            <span className="block text-xs text-gray-400 mt-0.5">
              El cliente llegó por la gestoría. No hay un tercero al que rendirle.
            </span>
          </span>
        </label>

        {/* Si NO es propio: canal + nombre obligatorio */}
        {!esLeadPropio && (
          <div className="mt-4 pt-4 border-t border-gray-200 animate-fadein">

            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
              ¿A quién pertenece?
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CANALES_REFERIDO.map(canal => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => selectCanal(canal)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    canalActivo === canal
                      ? 'bg-[#D4621A] border-[#D4621A] text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
                  }`}
                >
                  {LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]}
                </button>
              ))}
            </div>

            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
              O vino por un canal digital
            </p>
            <div className="flex flex-wrap gap-2">
              {CANALES_DIRECTOS.map(canal => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => selectCanal(canal)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    canalActivo === canal
                      ? 'bg-[#D4621A] border-[#D4621A] text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
                  }`}
                >
                  {LABEL_CORTO[canal] ?? ORIGEN_CANAL_LABELS[canal]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => selectCanal('otro')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  canalActivo === 'otro'
                    ? 'bg-[#D4621A] border-[#D4621A] text-white'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]'
                }`}
              >
                Otro
              </button>
            </div>

            {errors.origenCanal && (
              <p className="text-xs text-red-600 mt-2">{errors.origenCanal}</p>
            )}

            {/* Encargado comercial — obligatorio */}
            {esComercial && (
              <div className="mt-4 animate-fadein">
                <SelectorEncargado
                  value={form.encargadoId}
                  onChange={(id, encargado) => setForm(prev => ({
                    ...prev,
                    encargadoId: id || undefined,
                    encargadoNombre: encargado
                      ? nombreVisible(encargado)
                      : prev.encargadoNombre,
                    origenNombre: encargado
                      ? nombreVisible(encargado)
                      : prev.origenNombre,
                    origen: buildOrigenLegacy(prev.origenCanal as OrigenCanal, encargado
                      ? nombreVisible(encargado)
                      : prev.origenNombre ?? ''),
                  }))}
                  tipos={['encargado_multas', 'concesionaria', 'agencia', 'reventa', 'referido_persona']}
                  label={ORIGEN_COMERCIAL.includes(canalActivo!)
                    ? `Nombre de la ${LABEL_CORTO[canalActivo!] ?? 'entidad'}`
                    : 'Nombre del referente'}
                  required
                  error={errors.encargadoId ?? errors.origenNombre}
                />
                {ORIGEN_COMERCIAL.includes(canalActivo!) && (
                  <p className="text-xs text-[#D4621A] mt-1.5 flex items-start gap-1.5">
                    <span>💰</span>
                    <span>
                      Al cerrar trámites de este cliente vas a poder registrar la
                      comisión entregada, que se descuenta del ingreso de la gestoría.
                    </span>
                  </p>
                )}
              </div>
            )}

            {esOtro && (
              <div className="mt-4 animate-fadein">
                <Input
                  label="¿Por dónde llegó?"
                  value={form.origenNombre ?? ''}
                  placeholder={placeholderNombre(canalActivo)}
                  onChange={e => setNombreReferente(e.target.value)}
                  error={errors.origenNombre}
                />
              </div>
            )}
          </div>
        )}

        {/* Badge resumen */}
        {canalActivo && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-400">Origen registrado:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                             text-xs font-semibold bg-orange-50 text-[#D4621A] border border-orange-100">
              {buildOrigenLegacy(canalActivo, form.origenNombre ?? '') || ORIGEN_CANAL_LABELS[canalActivo]}
            </span>
          </div>
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