import { useState, useMemo } from 'react'
import Modal from '@/components/shared/Modal'
import { Button, Textarea } from '@/components/ui'
import type { EntidadAudit } from '@/types'

const MIN_MOTIVO = 10

export interface CampoCambiado {
  campo:   string   // clave técnica
  label:   string   // etiqueta legible
  antes:   unknown
  despues: unknown
}

interface Props {
  open:          boolean
  entidad:       EntidadAudit
  entidadLabel:  string
  cambios:       CampoCambiado[]
  /** Motivos sugeridos, clicables. Opcional. */
  sugerencias?:  string[]
  onCancel:      () => void
  onConfirm:     (motivo: string) => Promise<void>
}

const ENTIDAD_TITULO: Partial<Record<EntidadAudit, string>> = {
  cliente:  'Editar cliente',
  vehiculo: 'Editar vehículo',
  tramite:  'Editar trámite',
}

const SUGERENCIAS_DEFAULT = [
  'Corrección de dato mal cargado',
  'El cliente informó el cambio',
  'Actualización por documentación nueva',
]

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

export default function ModalMotivoEdicion({
  open, entidad, entidadLabel, cambios,
  sugerencias = SUGERENCIAS_DEFAULT,
  onCancel, onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const valido = motivo.trim().length >= MIN_MOTIVO
  const sinCambios = cambios.length === 0

  const titulo = useMemo(
    () => ENTIDAD_TITULO[entidad] ?? 'Confirmar edición',
    [entidad],
  )

  const handleConfirm = async () => {
    if (!valido) {
      setError(`Escribí un motivo de al menos ${MIN_MOTIVO} caracteres.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(motivo.trim())
      setMotivo('')
    } catch (e) {
      setError((e as Error).message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setMotivo('')
    setError(null)
    onCancel()
  }

  return (
    <Modal open={open} onClose={handleCancel} title={titulo}>
      <div className="space-y-4">

        <p className="text-sm text-gray-500">
          Estás por modificar <strong className="text-gray-800">{entidadLabel}</strong>.
          El cambio queda registrado con tu usuario, la fecha y el motivo.
        </p>

        {/* Diff */}
        {sinCambios ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-400">No hay cambios para guardar.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100
                          max-h-56 overflow-y-auto">
            {cambios.map(c => (
              <div key={c.campo} className="px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase
                              tracking-wider mb-1">
                  {c.label}
                </p>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-gray-400 line-through">{fmt(c.antes)}</span>
                  <span className="text-gray-300">→</span>
                  <span className="text-gray-900 font-medium">{fmt(c.despues)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Motivo */}
        <div>
          <Textarea
            label="Motivo del cambio *"
            value={motivo}
            rows={3}
            placeholder="Ej: el cliente informó que cambió de domicilio"
            onChange={e => { setMotivo(e.target.value); setError(null) }}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              Mínimo {MIN_MOTIVO} caracteres.
            </p>
            <p className={`text-xs tabular-nums ${
              valido ? 'text-emerald-600' : 'text-gray-300'
            }`}>
              {motivo.trim().length}/{MIN_MOTIVO}
            </p>
          </div>

          {/* Sugerencias */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sugerencias.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setMotivo(s); setError(null) }}
                className="px-2.5 py-1 rounded-full text-[11px] border border-gray-200
                           text-gray-500 hover:border-[#D4621A] hover:text-[#D4621A]
                           transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100
                        rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!valido || saving || sinCambios}
            loading={saving}
          >
            Guardar cambio
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── HELPER: calcular el diff ────────────────────────────────────────────────

/**
 * Compara dos objetos campo por campo según un mapa de etiquetas.
 * Devuelve solo lo que efectivamente cambió.
 */
export function diffCampos<T extends Record<string, any>>(
  antes:   Partial<T> | null | undefined,
  despues: Partial<T>,
  labels:  Partial<Record<keyof T, string>>,
): CampoCambiado[] {
  const out: CampoCambiado[] = []
  for (const [campo, label] of Object.entries(labels)) {
    const a = antes?.[campo]
    const d = despues[campo]
    const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    if (norm(a) !== norm(d)) {
      out.push({ campo, label: label as string, antes: a, despues: d })
    }
  }
  return out
}

// ─── MAPAS DE ETIQUETAS ──────────────────────────────────────────────────────

export const CAMPOS_CLIENTE = {
  nombre:       'Nombre',
  apellido:     'Apellido',
  dni:          'DNI',
  cuit:         'CUIT',
  telefono:     'Teléfono',
  email:        'Email',
  direccion:    'Dirección',
  localidad:    'Localidad',
  origenCanal:  'Origen',
  origenNombre: 'Pertenece a',
  observaciones:'Observaciones',
} as const

export const CAMPOS_VEHICULO = {
  patente:   'Patente',
  tipo:      'Tipo',
  marca:     'Marca',
  modelo:    'Modelo',
  anio:      'Año',
  color:     'Color',
  nroMotor:  'Nº de motor',
  nroChasis: 'Nº de chasis',
  clienteId: 'Titular',
} as const
