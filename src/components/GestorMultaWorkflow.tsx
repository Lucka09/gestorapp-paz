// src/components/GestorMultaWorkflow.tsx
// ─── UI — WORKFLOW DE MULTAS / INFRACCIONES ───────────────────────────────────
// Componente paso a paso para gestionar un trámite de multa/infracción (LIT).
// Se monta dentro de TramiteDetallePage cuando tipo === 'descargo_multa'.

import { useState, useRef } from 'react'
import { useMultaWorkflow } from '@/hooks/useMultaWorkflow'
import { useAuthStore }     from '@/store/authStore'
import { retrocederPasoMulta } from '@/lib/firestore/MultaWorwflow'
import { PASOS_MULTA } from '@/types/multa.types'
import type { MetodoPago } from '@/types/multa.types'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const METODOS_PAGO: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo',     label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'mercadopago',  label: 'Mercado Pago' },
  { value: 'cheque',       label: 'Cheque' },
  { value: 'otro',         label: 'Otro' },
]

const CANALES_ENTREGA = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'email',      label: 'Email' },
  { value: 'otro',       label: 'Otro' },
]

function formatMonto(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function Badge({ texto, color }: { texto: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {texto}
    </span>
  )
}

// ─── SUBCOMPONENTE: STEPPER LATERAL ───────────────────────────────────────────

function StepperLateral({ pasoActual }: { pasoActual: number }) {
  return (
    <div className="flex flex-col gap-1">
      {PASOS_MULTA.map((paso) => {
        const completado = pasoActual > paso.id
        const activo     = pasoActual === paso.id
        const pendiente  = pasoActual < paso.id

        return (
          <div key={paso.id} className="flex items-start gap-3">
            {/* Línea conectora */}
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-300"
                style={{
                  backgroundColor: completado
                    ? '#10b981'
                    : activo
                    ? paso.color
                    : '#1e293b',
                  color: completado || activo ? '#fff' : '#64748b',
                  border: activo ? `2px solid ${paso.color}` : '2px solid transparent',
                  boxShadow: activo ? `0 0 0 3px ${paso.color}30` : undefined,
                }}
              >
                {completado ? '✓' : paso.id}
              </div>
              {paso.id < PASOS_MULTA.length && (
                <div
                  className="w-0.5 h-8 mt-1 transition-colors duration-300"
                  style={{ backgroundColor: completado ? '#10b981' : '#1e293b' }}
                />
              )}
            </div>

            {/* Texto */}
            <div className="pb-8">
              <p
                className="text-sm font-semibold leading-tight"
                style={{ color: activo ? paso.color : completado ? '#10b981' : '#64748b' }}
              >
                {paso.icono} {paso.titulo}
              </p>
              {(activo || completado) && (
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                  {paso.subtitulo}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SUBCOMPONENTE: FOTO UPLOADER ─────────────────────────────────────────────

function FotoUploader({
  clave,
  label,
  foto,
  onAgregar,
  onRemover,
}: {
  clave:    string
  label:    string
  foto?:    { estado: string; previewUrl?: string; error?: string }
  onAgregar: (clave: string, archivo: File) => void
  onRemover: (clave: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      {!foto ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-500 hover:border-orange-500 hover:text-orange-400 transition-colors"
        >
          <span className="text-xl">📎</span>
          <span className="text-xs">Subir foto</span>
        </button>
      ) : (
        <div className="relative w-full h-24 rounded-lg overflow-hidden border border-slate-700 group">
          {foto.previewUrl && (
            <img
              src={foto.previewUrl}
              alt={label}
              className="w-full h-full object-cover"
            />
          )}
          {/* Estado overlay */}
          {foto.estado === 'subiendo' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white text-xs animate-pulse">Subiendo…</span>
            </div>
          )}
          {foto.estado === 'ok' && (
            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          )}
          {foto.estado === 'error' && (
            <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center p-2">
              <span className="text-red-200 text-xs text-center">{foto.error}</span>
            </div>
          )}
          {/* Botón eliminar */}
          <button
            type="button"
            onClick={() => onRemover(clave)}
            className="absolute bottom-1 right-1 w-5 h-5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span className="text-white text-xs">×</span>
          </button>
        </div>
      )}
      {foto?.estado === 'error' && (
        <p className="text-xs text-red-400">{foto.error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onAgregar(clave, f)
        }}
      />
    </div>
  )
}

// ─── PASO 1: INGRESO LIT ──────────────────────────────────────────────────────

function Paso1({
  datosLocales,
  actualizarDato,
  puedeAvanzar,
  guardando,
  onConfirmar,
}: {
  datosLocales:   Record<string, unknown>
  actualizarDato: (k: string, v: unknown) => void
  puedeAvanzar:   () => boolean
  guardando:      boolean
  onConfirmar:    () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-300 font-medium">
          Número de LIT (Infracción en Litigio) <span className="text-orange-400">*</span>
        </label>
        <input
          type="text"
          placeholder="Ej: LIT-2024-00123"
          value={(datosLocales.numeroLIT as string) ?? ''}
          onChange={e => actualizarDato('numeroLIT', e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-sm"
        />
        <p className="text-xs text-slate-500">
          Ingresá el número de expediente o código de infracción en litigio.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-300 font-medium">
          Observación inicial (opcional)
        </label>
        <textarea
          rows={2}
          placeholder="Ej: LIT recibido por email, pendiente de acuse de recibo..."
          value={(datosLocales.observacionInicial as string) ?? ''}
          onChange={e => actualizarDato('observacionInicial', e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
        />
      </div>

      <BtnConfirmar
        label="Confirmar ingreso del LIT"
        disabled={!puedeAvanzar()}
        guardando={guardando}
        onClick={onConfirmar}
      />
    </div>
  )
}

// ─── PASO 2: PRESUPUESTO Y COBRO ─────────────────────────────────────────────

function Paso2({
  datosLocales,
  actualizarDato,
  historialPagosLocal,
  agregarPago,
  puedeAvanzar,
  guardando,
  onConfirmar,
}: {
  datosLocales:        Record<string, unknown>
  actualizarDato:      (k: string, v: unknown) => void
  historialPagosLocal: import('@/types/multa.types').RegistroPago[]
  agregarPago:         (monto: number, metodo: MetodoPago, nota?: string) => Promise<void>
  puedeAvanzar:        () => boolean
  guardando:           boolean
  onConfirmar:         () => void
}) {
  const [montoPago, setMontoPago]   = useState('')
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [notaPago, setNotaPago]     = useState('')
  const [agregandoPago, setAgregandoPago] = useState(false)

  const handleAgregarPago = async () => {
    const monto = parseFloat(montoPago.replace(',', '.'))
    if (!monto || monto <= 0) return
    setAgregandoPago(true)
    await agregarPago(monto, metodoPago, notaPago || undefined)
    setMontoPago('')
    setNotaPago('')
    setAgregandoPago(false)
  }

  const montoTotal = historialPagosLocal.reduce((acc, p) => acc + p.monto, 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Checklist presupuesto */}
      <div className="flex flex-col gap-3">
        <ToggleCheck
          label="Presupuesto enviado al cliente"
          checked={!!(datosLocales.presupuestoEnviado)}
          onChange={v => actualizarDato('presupuestoEnviado', v)}
        />
        <ToggleCheck
          label="Pago confirmado por el cliente"
          checked={!!(datosLocales.pagoConfirmado)}
          onChange={v => actualizarDato('pagoConfirmado', v)}
        />
      </div>

      {/* Formulario de pago */}
      <div className="border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-slate-300">Registrar pago</p>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Monto (ARS)</label>
            <input
              type="number"
              min="0"
              placeholder="0.00"
              value={montoPago}
              onChange={e => setMontoPago(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Método</label>
            <select
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value as MetodoPago)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
            >
              {METODOS_PAGO.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <input
          type="text"
          placeholder="Nota (opcional, ej: anticipo)"
          value={notaPago}
          onChange={e => setNotaPago(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
        />

        <button
          type="button"
          onClick={handleAgregarPago}
          disabled={!montoPago || parseFloat(montoPago) <= 0 || agregandoPago}
          className="w-full py-2 rounded-lg text-sm font-medium transition-all bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40"
        >
          {agregandoPago ? 'Registrando…' : '+ Agregar pago'}
        </button>
      </div>

      {/* Historial */}
      {historialPagosLocal.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
            Historial de pagos
          </p>
          {historialPagosLocal.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-sm text-white font-medium">{formatMonto(p.monto)}</p>
                <p className="text-xs text-slate-500">
                  {METODOS_PAGO.find(m => m.value === p.metodoPago)?.label}
                  {p.nota ? ` · ${p.nota}` : ''}
                </p>
              </div>
              <Badge texto="✓" color="#10b981" />
            </div>
          ))}
          <div className="flex justify-between items-center pt-1 border-t border-slate-700">
            <span className="text-xs text-slate-400">Total cobrado</span>
            <span className="text-sm font-bold text-orange-400">{formatMonto(montoTotal)}</span>
          </div>
        </div>
      )}

      <BtnConfirmar
        label="Confirmar cobro"
        disabled={!puedeAvanzar()}
        guardando={guardando}
        onClick={onConfirmar}
      />
    </div>
  )
}

// ─── PASO 3: DOCUMENTACIÓN DEL TITULAR ───────────────────────────────────────

function Paso3({
  datosLocales,
  actualizarDato,
  fotosLocales,
  agregarFotoLocal,
  removerFoto,
  necesitaObservacion,
  puedeAvanzar,
  guardando,
  onConfirmar,
}: {
  datosLocales:        Record<string, unknown>
  actualizarDato:      (k: string, v: unknown) => void
  fotosLocales:        import('@/hooks/useMultaWorkflow').FotoLocal[]
  agregarFotoLocal:    (clave: string, archivo: File) => void
  removerFoto:         (clave: string) => void
  necesitaObservacion: boolean
  puedeAvanzar:        () => boolean
  guardando:           boolean
  onConfirmar:         () => void
}) {
  const fotoFor = (clave: string) => fotosLocales.find(f => f.clave === clave)

  return (
    <div className="flex flex-col gap-5">
      {/* Datos de contacto */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-slate-300">Datos de contacto</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            Nombre y apellido completo <span className="text-orange-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: Juan Pablo Rodríguez"
            value={(datosLocales.nombreCompleto as string) ?? ''}
            onChange={e => actualizarDato('nombreCompleto', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            Celular <span className="text-orange-400">*</span>
          </label>
          <input
            type="tel"
            placeholder="Ej: 11 2345-6789"
            value={(datosLocales.celular as string) ?? ''}
            onChange={e => actualizarDato('celular', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
          />
        </div>
      </div>

      {/* Documentos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Documentos</p>
          <span className="text-xs text-slate-500 italic">Opcionales</span>
        </div>

        {/* DNI */}
        <div className="border border-slate-700 rounded-xl p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">DNI</p>
          <div className="grid grid-cols-2 gap-3">
            <FotoUploader
              clave="dniFrente"
              label="Frente"
              foto={fotoFor('dniFrente')}
              onAgregar={agregarFotoLocal}
              onRemover={removerFoto}
            />
            <FotoUploader
              clave="dniDorso"
              label="Dorso"
              foto={fotoFor('dniDorso')}
              onAgregar={agregarFotoLocal}
              onRemover={removerFoto}
            />
          </div>
        </div>

        {/* Cédula */}
        <div className="border border-slate-700 rounded-xl p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cédula</p>
          <div className="grid grid-cols-2 gap-3">
            <FotoUploader
              clave="cedulaFrente"
              label="Frente"
              foto={fotoFor('cedulaFrente')}
              onAgregar={agregarFotoLocal}
              onRemover={removerFoto}
            />
            <FotoUploader
              clave="cedulaDorso"
              label="Dorso"
              foto={fotoFor('cedulaDorso')}
              onAgregar={agregarFotoLocal}
              onRemover={removerFoto}
            />
          </div>
        </div>
      </div>

      {/* Observación — OBLIGATORIA si falta algún doc */}
      {necesitaObservacion && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 text-sm">⚠️</span>
            <label className="text-sm font-semibold text-amber-400">
              Observación obligatoria <span className="text-orange-400">*</span>
            </label>
          </div>
          <p className="text-xs text-slate-500 mb-1">
            Falta cargar DNI y/o cédula. Es obligatorio dejar una observación explicando el motivo.
          </p>
          <textarea
            rows={3}
            placeholder="Ej: El cliente no tiene la cédula verde en su poder, ya fue solicitada al RNPA. DNI correcto. / El DNI presentado no coincide con el titular de la infracción…"
            value={(datosLocales.observacion as string) ?? ''}
            onChange={e => actualizarDato('observacion', e.target.value)}
            className="w-full bg-amber-950/30 border border-amber-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm resize-none"
          />
        </div>
      )}

      {/* Observación opcional si tiene todos los docs */}
      {!necesitaObservacion && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">Observación (opcional)</label>
          <textarea
            rows={2}
            placeholder="Ej: DNI y cédula en orden, sin observaciones..."
            value={(datosLocales.observacion as string) ?? ''}
            onChange={e => actualizarDato('observacion', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
          />
        </div>
      )}

      <BtnConfirmar
        label="Confirmar documentación"
        disabled={!puedeAvanzar()}
        guardando={guardando}
        onClick={onConfirmar}
      />
    </div>
  )
}

// ─── PASO 4: DESCARGO Y SUATS ─────────────────────────────────────────────────

function Paso4({
  datosLocales,
  actualizarDato,
  fotosLocales,
  agregarFotoLocal,
  removerFoto,
  puedeAvanzar,
  guardando,
  onConfirmar,
}: {
  datosLocales:     Record<string, unknown>
  actualizarDato:   (k: string, v: unknown) => void
  fotosLocales:     import('@/hooks/useMultaWorkflow').FotoLocal[]
  agregarFotoLocal: (clave: string, archivo: File) => void
  removerFoto:      (clave: string) => void
  puedeAvanzar:     () => boolean
  guardando:        boolean
  onConfirmar:      () => void
}) {
  const inputSuatsRef = useRef<HTMLInputElement>(null)
  const fotosSuats    = fotosLocales.filter(f => f.clave.startsWith('suats'))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <ToggleCheck
          label="Cartas documento / descargo preparados"
          checked={!!(datosLocales.descargoPreparado)}
          onChange={v => actualizarDato('descargoPreparado', v)}
        />
        <ToggleCheck
          label="Informe SUATS obtenido"
          checked={!!(datosLocales.suatsObtenido)}
          onChange={v => actualizarDato('suatsObtenido', v)}
        />
      </div>

      {/* Fotos SUATS */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Capturas del SUATS</p>
          <span className="text-xs text-slate-500 italic">Opcional</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fotosSuats.map((f, i) => (
            <FotoUploader
              key={f.clave}
              clave={f.clave}
              label={`SUATS ${i + 1}`}
              foto={f}
              onAgregar={agregarFotoLocal}
              onRemover={removerFoto}
            />
          ))}
          {/* Botón agregar nueva */}
          <button
            type="button"
            onClick={() => inputSuatsRef.current?.click()}
            className="h-24 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-500 hover:border-orange-500 hover:text-orange-400 transition-colors"
          >
            <span className="text-xl">📎</span>
            <span className="text-xs">Agregar SUATS</span>
          </button>
        </div>
        <input
          ref={inputSuatsRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) agregarFotoLocal(`suats_${Date.now()}`, f)
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 font-medium">Nota del descargo (opcional)</label>
        <textarea
          rows={2}
          placeholder="Ej: Descargo presentado ante DNRPA. SUATS indica multa en revisión..."
          value={(datosLocales.notaDescargo as string) ?? ''}
          onChange={e => actualizarDato('notaDescargo', e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
        />
      </div>

      <BtnConfirmar
        label="Confirmar SUATS obtenido"
        disabled={!puedeAvanzar()}
        guardando={guardando}
        onClick={onConfirmar}
      />
    </div>
  )
}

// ─── PASO 5: ENTREGA Y CIERRE ─────────────────────────────────────────────────

function Paso5({
  datosLocales,
  actualizarDato,
  puedeAvanzar,
  guardando,
  onConfirmar,
}: {
  datosLocales:   Record<string, unknown>
  actualizarDato: (k: string, v: unknown) => void
  puedeAvanzar:   () => boolean
  guardando:      boolean
  onConfirmar:    () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <ToggleCheck
        label="SUATS entregado al cliente"
        checked={!!(datosLocales.suatsEntregado)}
        onChange={v => actualizarDato('suatsEntregado', v)}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            Fecha de entrega <span className="text-orange-400">*</span>
          </label>
          <input
            type="date"
            value={(datosLocales.fechaEntrega as string) ?? ''}
            onChange={e => actualizarDato('fechaEntrega', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            Canal de entrega <span className="text-orange-400">*</span>
          </label>
          <select
            value={(datosLocales.canalEntrega as string) ?? ''}
            onChange={e => actualizarDato('canalEntrega', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
          >
            <option value="">Seleccioná…</option>
            {CANALES_ENTREGA.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 font-medium">Observación final (opcional)</label>
        <textarea
          rows={2}
          placeholder="Ej: Cliente retiró en oficina. Trámite cerrado sin observaciones."
          value={(datosLocales.observacionFinal as string) ?? ''}
          onChange={e => actualizarDato('observacionFinal', e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
        />
      </div>

      <BtnConfirmar
        label="✅ Finalizar y archivar trámite"
        disabled={!puedeAvanzar()}
        guardando={guardando}
        onClick={onConfirmar}
        color="#10b981"
      />
    </div>
  )
}

// ─── PASO 6: FINALIZADO ───────────────────────────────────────────────────────

function PasoFinalizado({ workflow }: { workflow: import('@/types/multa.types').MultaWorkflow }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-3xl">
        🗂️
      </div>
      <div>
        <h3 className="text-lg font-bold text-green-400">Trámite finalizado y archivado</h3>
        <p className="text-sm text-slate-400 mt-1">
          El SUATS fue entregado al cliente. El trámite quedó registrado en el historial.
        </p>
      </div>
      {workflow.paso3 && (
        <div className="w-full bg-slate-800/60 rounded-xl p-4 text-left">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Titular</p>
          <p className="text-sm text-white font-medium">{workflow.paso3.nombreCompleto}</p>
          <p className="text-sm text-slate-400">{workflow.paso3.celular}</p>
        </div>
      )}
      {workflow.paso2 && (
        <div className="w-full bg-slate-800/60 rounded-xl p-4 text-left">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Cobro total</p>
          <p className="text-xl font-bold text-orange-400">
            {formatMonto(workflow.paso2.montoTotal)}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── BOTÓN CONFIRMAR (reutilizable) ───────────────────────────────────────────

function BtnConfirmar({
  label,
  disabled,
  guardando,
  onClick,
  color = '#D4621A',
}: {
  label:     string
  disabled:  boolean
  guardando: boolean
  onClick:   () => void
  color?:    string
}) {
  return (
    <button
      type="button"
      disabled={disabled || guardando}
      onClick={onClick}
      className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: disabled || guardando ? undefined : color,
        background:      disabled || guardando ? '#1e293b' : color,
        color:           '#fff',
      }}
    >
      {guardando ? (
        <span className="flex items-center justify-center gap-2">
          <span className="animate-spin">⏳</span> Guardando…
        </span>
      ) : label}
    </button>
  )
}

// ─── TOGGLE CHECK ─────────────────────────────────────────────────────────────

function ToggleCheck({
  label,
  checked,
  onChange,
}: {
  label:    string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full text-left p-3 rounded-xl transition-colors"
      style={{
        backgroundColor: checked ? '#10b98115' : '#1e293b',
        border:          checked ? '1px solid #10b981' : '1px solid #334155',
      }}
    >
      <div
        className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors"
        style={{ backgroundColor: checked ? '#10b981' : '#334155' }}
      >
        {checked && <span className="text-white text-xs">✓</span>}
      </div>
      <span className={`text-sm ${checked ? 'text-green-400' : 'text-slate-300'}`}>
        {label}
      </span>
    </button>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface GestorMultaWorkflowProps {
  tramiteId: string
  numeroLITExterno?: string  // si ya viene del trámite cargado
}

export function GestorMultaWorkflow({ tramiteId, numeroLITExterno }: GestorMultaWorkflowProps) {
  const {
    workflow, pasoActual, cargando, guardando, error,
    datosLocales, fotosLocales, historialPagosLocal,
    actualizarDato, agregarFotoLocal, removerFoto,
    agregarPago, confirmarPaso,
    puedeAvanzar, necesitaObservacion,
  } = useMultaWorkflow(tramiteId)

  const { user } = useAuthStore()
  const [modalRetroceder, setModalRetroceder] = useState(false)
  const [motivoRetroceder, setMotivoRetroceder] = useState('')
  const [pasoObjetivo, setPasoObjetivo] = useState<1|2|3|4|5>(1)
  const [retrocediendo, setRetrocediendo] = useState(false)

  const puedeRetroceder = user?.rol === 'propietario' || user?.rol === 'admin'

  const handleRetroceder = async () => {
    if (!workflow || !user || !motivoRetroceder.trim()) return
    setRetrocediendo(true)
    try {
      const nombre = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email
      await retrocederPasoMulta(tramiteId, user.uid, nombre, pasoObjetivo, motivoRetroceder.trim(), workflow)
      setModalRetroceder(false)
      setMotivoRetroceder('')
    } finally {
      setRetrocediendo(false)
    }
  }

  // Si hay un número de LIT del trámite y no hay dato local, pre-rellenarlo
  const datosConLIT = { ...datosLocales }
  if (numeroLITExterno && !datosConLIT.numeroLIT) {
    datosConLIT.numeroLIT = numeroLITExterno
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <span className="animate-spin mr-2">⏳</span> Cargando workflow…
      </div>
    )
  }

  const pasoConfig = PASOS_MULTA.find(p => p.id === pasoActual)

  return (
    <div className="flex gap-6 w-full">
      {/* Stepper lateral */}
      <div className="hidden md:block w-52 shrink-0 pt-2">
        <StepperLateral pasoActual={pasoActual} />
      </div>

      {/* Panel principal */}
      <div className="flex-1 min-w-0">
        {/* Header del paso */}
        {pasoActual < 6 && pasoConfig && (
          <div
            className="rounded-xl p-4 mb-5"
            style={{ backgroundColor: `${pasoConfig.color}15`, border: `1px solid ${pasoConfig.color}40` }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{pasoConfig.icono}</span>
              <div>
                <p className="font-bold text-white text-sm">{pasoConfig.titulo}</p>
                <p className="text-xs mt-0.5" style={{ color: pasoConfig.color }}>
                  Paso {pasoActual} de 5 — {pasoConfig.subtitulo}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">{pasoConfig.descripcion}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Stepper mobile */}
        <div className="md:hidden mb-4">
          <div className="flex gap-1">
            {PASOS_MULTA.slice(0, 5).map(p => (
              <div
                key={p.id}
                className="flex-1 h-1 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor:
                    pasoActual > p.id ? '#10b981'
                    : pasoActual === p.id ? p.color
                    : '#1e293b',
                }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Paso {Math.min(pasoActual, 5)} de 5</p>
        </div>

        {/* Contenido por paso */}
        {pasoActual === 1 && (
          <Paso1
            datosLocales={datosConLIT}
            actualizarDato={actualizarDato}
            puedeAvanzar={puedeAvanzar}
            guardando={guardando}
            onConfirmar={confirmarPaso}
          />
        )}
        {pasoActual === 2 && (
          <Paso2
            datosLocales={datosLocales}
            actualizarDato={actualizarDato}
            historialPagosLocal={historialPagosLocal}
            agregarPago={agregarPago}
            puedeAvanzar={puedeAvanzar}
            guardando={guardando}
            onConfirmar={confirmarPaso}
          />
        )}
        {pasoActual === 3 && (
          <Paso3
            datosLocales={datosLocales}
            actualizarDato={actualizarDato}
            fotosLocales={fotosLocales}
            agregarFotoLocal={agregarFotoLocal}
            removerFoto={removerFoto}
            necesitaObservacion={necesitaObservacion}
            puedeAvanzar={puedeAvanzar}
            guardando={guardando}
            onConfirmar={confirmarPaso}
          />
        )}
        {pasoActual === 4 && (
          <Paso4
            datosLocales={datosLocales}
            actualizarDato={actualizarDato}
            fotosLocales={fotosLocales}
            agregarFotoLocal={agregarFotoLocal}
            removerFoto={removerFoto}
            puedeAvanzar={puedeAvanzar}
            guardando={guardando}
            onConfirmar={confirmarPaso}
          />
        )}
        {pasoActual === 5 && (
          <Paso5
            datosLocales={datosLocales}
            actualizarDato={actualizarDato}
            puedeAvanzar={puedeAvanzar}
            guardando={guardando}
            onConfirmar={confirmarPaso}
          />
        )}
        {pasoActual === 6 && workflow && (
          <PasoFinalizado workflow={workflow} />
        )}

        {/* Botón retroceder paso — solo propietario/admin, solo en pasos 2-6 */}
        {puedeRetroceder && pasoActual >= 2 && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <button
              onClick={() => {
                setPasoObjetivo(Math.max(1, pasoActual - 1) as 1|2|3|4|5)
                setModalRetroceder(true)
              }}
              className="text-xs text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              ↩ Corregir paso anterior
            </button>
          </div>
        )}

        {/* Modal retroceder */}
        {modalRetroceder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-[#0f1623] border border-white/10 rounded-xl p-5 w-full max-w-sm">
              <p className="text-sm font-semibold text-white mb-1">Corregir paso anterior</p>
              <p className="text-xs text-slate-400 mb-4">
                Esta acción retrocede el workflow al paso indicado y queda registrada en la auditoría.
              </p>
              <div className="mb-3">
                <label className="text-xs text-slate-400 block mb-1">Retroceder al paso</label>
                <select
                  value={pasoObjetivo}
                  onChange={e => setPasoObjetivo(Number(e.target.value) as 1|2|3|4|5)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {PASOS_MULTA.filter(p => p.id < pasoActual).map(p => (
                    <option key={p.id} value={p.id}>Paso {p.id} — {p.titulo}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="text-xs text-slate-400 block mb-1">Motivo *</label>
                <textarea
                  value={motivoRetroceder}
                  onChange={e => setMotivoRetroceder(e.target.value)}
                  placeholder="Ej: Cliente presentó documentación incompleta..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRetroceder}
                  disabled={!motivoRetroceder.trim() || retrocediendo}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {retrocediendo ? 'Guardando…' : 'Confirmar'}
                </button>
                <button
                  onClick={() => { setModalRetroceder(false); setMotivoRetroceder('') }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 text-sm py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}