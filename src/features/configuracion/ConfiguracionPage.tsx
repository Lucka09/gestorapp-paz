import { useState, useEffect } from 'react'
import {
  Building2, Phone, Clock, DollarSign,
  MessageSquare, Save, CheckCircle, Bell,
  Globe, CreditCard, ToggleLeft, ToggleRight,
  AlertCircle, Settings, Trophy, Star, Target, Info,
} from 'lucide-react'
import { useConfiguracion }    from '@/hooks/useConfiguracion'
import { useAuth }             from '@/hooks/useAuth'
import { guardarConfiguracion } from '@/lib/firestore/configuracion'
import { PageHeader, Button, Input, Textarea, Spinner } from '@/components/ui'
import { PanelConfigPush } from '@/components/shared/PushNotifications'
import { TIPO_TRAMITE_LABELS, type TipoTramite, type Configuracion } from '@/types'
import toast from 'react-hot-toast'

// ─── TABS ─────────────────────────────────────────────────────────────────────

type Tab = 'gestor' | 'horarios' | 'tarifas' | 'banco' | 'mensajes' | 'push' | 'premios'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'gestor',   label: 'La Gestoría',  icon: Building2     },
  { id: 'horarios', label: 'Horarios',     icon: Clock         },
  { id: 'tarifas',  label: 'Tarifas',      icon: DollarSign    },
  { id: 'banco',    label: 'Datos bancarios', icon: CreditCard  },
  { id: 'mensajes', label: 'Mensajes',     icon: MessageSquare },
  { id: 'push',     label: 'Notificaciones', icon: Bell          },
  { id: 'premios',  label: 'Premios',        icon: Trophy        },
]

const DIAS_CONFIG = [
  { key: 'lunes',     label: 'Lunes'     },
  { key: 'martes',    label: 'Martes'    },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves',    label: 'Jueves'    },
  { key: 'viernes',   label: 'Viernes'   },
  { key: 'sabado',    label: 'Sábado'    },
  { key: 'domingo',   label: 'Domingo'   },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: 14, color: 'var(--color-text-1)', margin: 0,
      }}>
        {children}
      </h3>
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-gp-orange-pale border
                    border-orange-100 rounded-xl p-3.5 mb-5">
      <AlertCircle size={15} style={{ color: 'var(--gp-orange)', flexShrink: 0, marginTop: 1 }} />
      <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
    </div>
  )
}

function Toggle({
  value, onChange, label,
}: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 group"
      aria-pressed={value}
    >
      {value
        ? <ToggleRight size={22} style={{ color: 'var(--gp-orange)' }} />
        : <ToggleLeft  size={22} className="text-gray-300" />
      }
      <span className={`text-sm ${value ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  )
}

// ─── TAB: GESTORÍA ────────────────────────────────────────────────────────────

function TabGestoria({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: string | boolean | number | Record<string, any>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Datos de la gestoría</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Nombre legal"       value={form.nombre          ?? ''} onChange={e => set('nombre',          e.target.value)} />
          <Input label="Nombre comercial"   value={form.nombreComercial ?? ''} onChange={e => set('nombreComercial', e.target.value)} />
          <Input label="Responsable"        value={form.responsable     ?? ''} onChange={e => set('responsable',     e.target.value)} />
        </div>
      </div>

      <div>
        <SectionTitle>Contacto</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Email principal"    type="email" value={form.email           ?? ''} onChange={e => set('email',           e.target.value)} />
          <Input label="Email secundario"   type="email" value={form.emailSecundario ?? ''} onChange={e => set('emailSecundario', e.target.value)} />
          <Input label="Teléfono / WhatsApp 1" type="tel" value={form.telefono1 ?? ''} onChange={e => set('telefono1', e.target.value)} hint="Sin + ni espacios (ej: 5491136141431)" />
          <Input label="Teléfono / WhatsApp 2" type="tel" value={form.telefono2 ?? ''} onChange={e => set('telefono2', e.target.value)} />
        </div>
      </div>

      <div>
        <SectionTitle>Ubicación</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Dirección"  value={form.direccion ?? ''} onChange={e => set('direccion', e.target.value)} placeholder="Av. San Martín 1234" />
          <Input label="Localidad"  value={form.localidad ?? ''} onChange={e => set('localidad', e.target.value)} placeholder="San Martín" />
          <Input label="Provincia"  value={form.provincia ?? ''} onChange={e => set('provincia', e.target.value)} placeholder="Buenos Aires" />
        </div>
      </div>

      <div>
        <SectionTitle>Presencia digital</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Sitio web"     value={form.redesSociales?.web       ?? ''} onChange={e => set('redesSociales', { ...form.redesSociales, web:       e.target.value })} placeholder="gestoriapaz.com" />
          <Input label="Instagram"     value={form.redesSociales?.instagram  ?? ''} onChange={e => set('redesSociales', { ...form.redesSociales, instagram: e.target.value })} placeholder="@gestoriapaz" />
          <Input label="Facebook"      value={form.redesSociales?.facebook   ?? ''} onChange={e => set('redesSociales', { ...form.redesSociales, facebook:  e.target.value })} placeholder="facebook.com/gestoriapaz" />
        </div>
      </div>
    </div>
  )
}

// ─── TAB: HORARIOS ────────────────────────────────────────────────────────────

function TabHorarios({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: string | boolean | number | Record<string, any>) => void }) {
  const horarios = form.horarioAtencion ?? {}

  const setHorario = (dia: string, campo: string, valor: any) => {
    set('horarioAtencion', {
      ...horarios,
      [dia]: { ...horarios[dia], [campo]: valor },
    })
  }

  return (
    <div className="space-y-6">
      <InfoBox>
        Los horarios definen los días y franjas en que los clientes pueden reservar turnos
        desde el portal. Desactivá los días no laborables.
      </InfoBox>

      <div>
        <SectionTitle>Horarios de atención</SectionTitle>
        <div className="space-y-2">
          {DIAS_CONFIG.map(({ key, label }) => {
            const h = horarios[key] ?? { activo: false, inicio: '09:00', fin: '17:00' }
            return (
              <div
                key={key}
                className={`flex items-center gap-4 p-3.5 rounded-xl border transition-colors
                            ${h.activo
                              ? 'bg-white border-gray-200'
                              : 'bg-gray-50 border-gray-100 opacity-60'
                            }`}
              >
                <Toggle
                  value={h.activo}
                  onChange={v => setHorario(key, 'activo', v)}
                  label={label}
                />
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Apertura</label>
                    <input
                      type="time"
                      value={h.inicio}
                      disabled={!h.activo}
                      onChange={e => setHorario(key, 'inicio', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                                 outline-none focus:border-[var(--gp-orange)] disabled:opacity-40"
                    />
                  </div>
                  <span className="text-gray-300">→</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Cierre</label>
                    <input
                      type="time"
                      value={h.fin}
                      disabled={!h.activo}
                      onChange={e => setHorario(key, 'fin', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                                 outline-none focus:border-[var(--gp-orange)] disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <SectionTitle>Configuración de turnos</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Input
              label="Duración por turno (minutos)"
              type="number"
              min={15}
              max={120}
              step={15}
              value={String(form.duracionTurnoMin ?? 30)}
              onChange={e => set('duracionTurnoMin', Number(e.target.value))}
              hint="15, 30, 45 o 60 minutos"
            />
          </div>
          <div>
            <Input
              label="Máximo de turnos por día"
              type="number"
              min={1}
              max={50}
              value={String(form.turnosMaxDia ?? 16)}
              onChange={e => set('turnosMaxDia', Number(e.target.value))}
              hint="Capacidad diaria total"
            />
          </div>
          <div>
            <Input
              label="Días de anticipación"
              type="number"
              min={1}
              max={90}
              value={String(form.diasAnticipacion ?? 30)}
              onChange={e => set('diasAnticipacion', Number(e.target.value))}
              hint="Cuántos días a futuro puede reservar un cliente"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TAB: TARIFAS ────────────────────────────────────────────────────────────

function TabTarifas({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: string | boolean | number | Record<string, any>) => void }) {
  const tarifas = form.tarifas ?? []

  const setTarifa = (tipo: string, campo: string, valor: any) => {
    const updated = tarifas.map(t =>
      t.tipo === tipo ? { ...t, [campo]: valor } : t
    )
    set('tarifas', updated)
  }

  const tiposActivos   = tarifas.filter(t => t.activo)
  const tiposInactivos = tarifas.filter(t => !t.activo)

  return (
    <div className="space-y-5">
      <InfoBox>
        Las tarifas se usan al generar presupuestos — el monto se pre-completa
        automáticamente según el tipo de trámite. Desactivá los tipos que no ofrecés.
      </InfoBox>

      {/* Activos */}
      <div>
        <SectionTitle>Trámites activos ({tiposActivos.length})</SectionTitle>
        <div className="space-y-2">
          {tarifas.map(tarifa => (
            <div
              key={tarifa.tipo}
              className={`rounded-xl border transition-colors
                          ${tarifa.activo
                            ? 'bg-white border-gray-200'
                            : 'bg-gray-50 border-gray-100'
                          }`}
            >
              {/* Cabecera de la fila */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Toggle
                  value={tarifa.activo}
                  onChange={v => setTarifa(tarifa.tipo, 'activo', v)}
                  label={TIPO_TRAMITE_LABELS[tarifa.tipo]}
                />
                {tarifa.activo && (
                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 whitespace-nowrap">
                        Honorarios base $
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={tarifa.honorarios || ''}
                        onChange={e => setTarifa(tarifa.tipo, 'honorarios', Number(e.target.value))}
                        placeholder="0"
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                                   outline-none focus:border-[var(--gp-orange)] w-28 text-right"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Descripción si está activo */}
              {tarifa.activo && (
                <div className="px-4 pb-3 border-t border-gray-50">
                  <input
                    type="text"
                    value={tarifa.incluye}
                    onChange={e => setTarifa(tarifa.tipo, 'incluye', e.target.value)}
                    placeholder="¿Qué incluye? (ej: gestión completa + documentación)"
                    className="w-full text-xs text-gray-500 placeholder-gray-300
                               border-0 outline-none bg-transparent pt-2.5"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TAB: DATOS BANCARIOS ─────────────────────────────────────────────────────

function TabBanco({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: string | boolean | number | Record<string, any>) => void }) {
  const banco = form.datosBancarios ?? {
    titular: '', banco: '', cbu: '', alias: '', cuit: '',
  }

  const setBanco = (campo: string, valor: string) => {
    set('datosBancarios', { ...banco, [campo]: valor })
  }

  return (
    <div className="space-y-6">
      <InfoBox>
        Estos datos aparecen en los presupuestos y reportes PDF para facilitar
        el pago por transferencia.
      </InfoBox>

      <div>
        <SectionTitle>Datos para transferencia bancaria</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Titular de la cuenta"
            value={banco.titular}
            onChange={e => setBanco('titular', e.target.value)}
            placeholder="Ezequiel Paz"
          />
          <Input
            label="Banco"
            value={banco.banco}
            onChange={e => setBanco('banco', e.target.value)}
            placeholder="Banco Galicia, Mercado Pago, etc."
          />
          <Input
            label="CBU"
            value={banco.cbu}
            onChange={e => setBanco('cbu', e.target.value)}
            placeholder="0000000000000000000000"
            hint="22 dígitos"
          />
          <Input
            label="Alias"
            value={banco.alias}
            onChange={e => setBanco('alias', e.target.value)}
            placeholder="GESTORIA.PAZ"
          />
          <Input
            label="CUIT"
            value={banco.cuit}
            onChange={e => setBanco('cuit', e.target.value)}
            placeholder="20-12345678-9"
          />
        </div>
      </div>

      {/* Preview de cómo aparece en PDF */}
      {(banco.cbu || banco.alias) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Preview — cómo aparece en el PDF
          </p>
          <div
            className="rounded-lg p-4 text-sm space-y-1"
            style={{ background: '#F3F4F6', fontFamily: 'var(--font-body)' }}
          >
            <p className="font-bold text-gray-700 uppercase tracking-wide text-xs mb-2">
              Datos para transferencia
            </p>
            {banco.titular && <p className="text-gray-700">Titular: {banco.titular}</p>}
            {banco.cuit    && <p className="text-gray-600">CUIT: {banco.cuit}</p>}
            {banco.cbu     && <p className="text-gray-700">CBU: {banco.cbu}</p>}
            {banco.alias   && <p className="text-gray-700">Alias: {banco.alias}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Concepto: PRES + número de presupuesto
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB: MENSAJES ────────────────────────────────────────────────────────────

function TabMensajes({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: string | boolean | number | Record<string, any>) => void }) {
  return (
    <div className="space-y-5">
      <InfoBox>
        Las variables entre llaves se reemplazan automáticamente: {'{nombre}'} → nombre del
        cliente, {'{fecha}'} → fecha del turno, {'{hora}'} → hora, {'{tipo}'} → tipo de trámite.
      </InfoBox>

      <div className="space-y-4">
        <div>
          <SectionTitle>Bienvenida al portal</SectionTitle>
          <Textarea
            label="Mensaje que ve el cliente al entrar por primera vez"
            value={form.mensajeBienvenida ?? ''}
            onChange={e => set('mensajeBienvenida', e.target.value)}
            rows={3}
            hint="Aparece en el onboarding del portal cliente"
          />
        </div>

        <div>
          <SectionTitle>Confirmación de turno</SectionTitle>
          <Textarea
            label="Se envía cuando el admin confirma un turno"
            value={form.mensajeTurnoConfirm ?? ''}
            onChange={e => set('mensajeTurnoConfirm', e.target.value)}
            rows={3}
            hint="Variables: {nombre}, {fecha}, {hora}, {tipo}"
          />
        </div>

        <div>
          <SectionTitle>Trámite listo para retirar</SectionTitle>
          <Textarea
            label="Se envía cuando el trámite pasa a estado 'Listo para retirar'"
            value={form.mensajeListoRetirar ?? ''}
            onChange={e => set('mensajeListoRetirar', e.target.value)}
            rows={3}
            hint="Variables: {nombre}, {tipo}, {patente}"
          />
        </div>
      </div>
    </div>
  )
}

// ─── TAB: PREMIOS & OBJETIVOS ────────────────────────────────────────────────

interface HitoMultaConfigLocal {
  id:           number
  montoUmbral:  number
  premioMonto:  number
  descripcion:  string
}

interface PremiosConfigLocal {
  montoPremioA:       number
  tramitesPorPremioA: number
  hitosMultas:        HitoMultaConfigLocal[]
}

const PREMIOS_DEFAULT: PremiosConfigLocal = {
  montoPremioA:       50_000,
  tramitesPorPremioA: 3,
  hitosMultas: [
    { id: 1, montoUmbral: 10_000_000, premioMonto: 0, descripcion: 'Primer hito — $10M en multas' },
    { id: 2, montoUmbral: 15_000_000, premioMonto: 0, descripcion: 'Segundo hito — $15M en multas' },
    { id: 3, montoUmbral: 17_000_000, premioMonto: 0, descripcion: 'Tercer hito — $17M en multas' },
    { id: 4, montoUmbral: 20_000_000, premioMonto: 0, descripcion: 'Hito máximo — $20M en multas' },
  ],
}

const HITO_ICON: Record<number, string> = { 1: '🥉', 2: '🥈', 3: '🥇', 4: '💎' }
const HITO_LABEL: Record<number, string> = { 1: 'Bronce', 2: 'Plata', 3: 'Oro', 4: 'Platino' }

function formatPesosPreview(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

function TabPremios({
  form, set,
}: { form: Partial<Configuracion>; set: (k: string, v: any) => void }) {
  const rawCfg = (form as any).premiosConfig
  const cfg: PremiosConfigLocal = rawCfg
    ? { ...PREMIOS_DEFAULT, ...rawCfg, hitosMultas: rawCfg.hitosMultas ?? PREMIOS_DEFAULT.hitosMultas }
    : { ...PREMIOS_DEFAULT }

  const updateCfg = (partial: Partial<PremiosConfigLocal>) => {
    set('premiosConfig', { ...cfg, ...partial })
  }

  const updateHito = (id: number, campo: keyof HitoMultaConfigLocal, valor: number | string) => {
    const nuevos = cfg.hitosMultas.map(h =>
      h.id === id ? { ...h, [campo]: valor } : h
    )
    updateCfg({ hitosMultas: nuevos })
  }

  return (
    <div className="space-y-7">

      {/* Aviso */}
      <div className="flex items-start gap-2.5 bg-gp-orange-pale border border-orange-100 rounded-xl p-3.5">
        <Info size={15} style={{ color: 'var(--gp-orange)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs text-gray-600 leading-relaxed">
          Estos parámetros determinan cómo se calculan y muestran los premios al{' '}
          <strong>Asesor Comercial</strong>. Los cambios se reflejan en tiempo real en
          la página "Mis Premios" del asesor.
        </p>
      </div>

      {/* ─── BLOQUE A: Premio por trámites ─────────────────────────────────── */}
      <div>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Star size={14} style={{ color: 'var(--gp-orange)' }} />
            Premio A — Por trámites (Baja + Transferencia)
          </span>
        </SectionTitle>

        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Monto del premio ($ ARS)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={cfg.montoPremioA || ''}
                onChange={e => updateCfg({ montoPremioA: Number(e.target.value) })}
                placeholder="50000"
                className="w-full border-[1.5px] border-gray-200 rounded-xl px-4 py-2.5
                           text-gray-800 text-base font-bold outline-none
                           focus:border-[var(--gp-orange)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Monto en pesos que recibe el asesor por cada grupo completado.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Trámites necesarios por premio
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={cfg.tramitesPorPremioA || ''}
                onChange={e => updateCfg({ tramitesPorPremioA: Number(e.target.value) })}
                placeholder="3"
                className="w-full border-[1.5px] border-gray-200 rounded-xl px-4 py-2.5
                           text-gray-800 text-base font-bold outline-none
                           focus:border-[var(--gp-orange)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Cuántos trámites completos y pagados activan un premio.
              </p>
            </div>
          </div>

          {/* Preview */}
          {cfg.montoPremioA > 0 && (
            <div className="flex items-center gap-3 bg-white border border-orange-200 rounded-xl p-3.5">
              <Trophy size={18} style={{ color: 'var(--gp-orange)', flexShrink: 0 }} />
              <p className="text-sm text-gray-700">
                Cada <strong>{cfg.tramitesPorPremioA} trámites</strong> completados y pagados,
                el asesor cobra{' '}
                <strong style={{ color: 'var(--gp-orange)' }}>
                  {formatPesosPreview(cfg.montoPremioA)}
                </strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── BLOQUE B: Hitos de facturación (multas) ───────────────────────── */}
      <div>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Target size={14} style={{ color: 'var(--gp-orange)' }} />
            Premio B — Hitos de facturación en multas
          </span>
        </SectionTitle>

        <div className="space-y-3">
          {[...cfg.hitosMultas].sort((a, b) => a.montoUmbral - b.montoUmbral).map(hito => (
            <div
              key={hito.id}
              className="border border-gray-100 rounded-xl bg-white overflow-hidden"
            >
              {/* Encabezado del hito */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span style={{ fontSize: 22 }}>{HITO_ICON[hito.id]}</span>
                <div>
                  <div className="font-bold text-sm text-gray-800">
                    {HITO_LABEL[hito.id]}
                  </div>
                  <div className="text-xs text-gray-400">
                    Umbral: <strong>{formatPesosPreview(hito.montoUmbral)}</strong> en facturación de multas
                  </div>
                </div>
                {hito.premioMonto > 0 && (
                  <div className="ml-auto text-right">
                    <div className="text-xs text-gray-400 mb-0.5">Premio configurado</div>
                    <div className="text-base font-bold" style={{ color: 'var(--gp-orange)' }}>
                      {formatPesosPreview(hito.premioMonto)}
                    </div>
                  </div>
                )}
                {hito.premioMonto === 0 && (
                  <div className="ml-auto">
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-semibold">
                      Sin definir
                    </span>
                  </div>
                )}
              </div>

              {/* Campos editables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Monto del premio al alcanzar este hito ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={hito.premioMonto || ''}
                    onChange={e => updateHito(hito.id, 'premioMonto', Number(e.target.value))}
                    placeholder="Ej: 100000"
                    className="w-full border-[1.5px] border-gray-200 rounded-xl px-3 py-2.5
                               text-gray-800 font-bold outline-none text-sm
                               focus:border-[var(--gp-orange)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Dejá en 0 si todavía no lo definiste.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Descripción del hito (visible para el asesor)
                  </label>
                  <input
                    type="text"
                    value={hito.descripcion}
                    onChange={e => updateHito(hito.id, 'descripcion', e.target.value)}
                    placeholder={`Hito ${HITO_LABEL[hito.id]} — $${(hito.montoUmbral / 1_000_000).toFixed(0)}M en multas`}
                    className="w-full border-[1.5px] border-gray-200 rounded-xl px-3 py-2.5
                               text-gray-600 outline-none text-sm
                               focus:border-[var(--gp-orange)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Resumen de premios B configurados */}
        {cfg.hitosMultas.some(h => h.premioMonto > 0) && (
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Resumen de premios por hito configurados
            </div>
            <div className="space-y-2">
              {[...cfg.hitosMultas]
                .sort((a, b) => a.montoUmbral - b.montoUmbral)
                .filter(h => h.premioMonto > 0)
                .map(h => (
                  <div key={h.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>{HITO_ICON[h.id]}</span>
                      <span>{HITO_LABEL[h.id]} — al alcanzar {formatPesosPreview(h.montoUmbral)}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--gp-orange)' }}>
                      {formatPesosPreview(h.premioMonto)}
                    </span>
                  </div>
                ))
              }
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-2">
                <span className="text-xs font-semibold text-gray-500">Total potencial Tipo B</span>
                <span className="text-base font-bold text-gray-800">
                  {formatPesosPreview(cfg.hitosMultas.reduce((s, h) => s + h.premioMonto, 0))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { user }              = useAuth()
  const { config, loading }   = useConfiguracion()
  const [tabActiva, setTab]   = useState<Tab>('gestor')
  const [form,      setForm]  = useState<Partial<Configuracion>>({})
  const [saving,    setSaving] = useState(false)
  const [guardado,  setGuardado] = useState(false)

  // Sincronizar form cuando carga la config
  useEffect(() => {
    if (!loading) setForm(config)
  }, [loading, config])

  const set = (key: string, value: any) => {
    setForm(f => ({ ...f, [key]: value }))
    setGuardado(false)
  }

  const handleGuardar = async () => {
    if (!user) return
    setSaving(true)
    try {
      await guardarConfiguracion(form, user.uid)
      setGuardado(true)
      toast.success('Configuración guardada')
      setTimeout(() => setGuardado(false), 3000)
    } catch {
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Cargando configuración..." />

  return (
    <div className="space-y-5 animate-fadein max-w-4xl">

      <PageHeader
        title="Configuración"
        subtitle="Datos de la gestoría, horarios, tarifas y mensajes automáticos"
        action={
          <Button onClick={handleGuardar} loading={saving}>
            {guardado
              ? <><CheckCircle size={15} /> Guardado</>
              : <><Save size={15} /> Guardar cambios</>
            }
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                        transition-all flex-1 justify-center
                        ${tabActiva === tab.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                        }`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Contenido del tab */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        {tabActiva === 'gestor'   && <TabGestoria  form={form} set={set} />}
        {tabActiva === 'horarios' && <TabHorarios  form={form} set={set} />}
        {tabActiva === 'tarifas'  && <TabTarifas   form={form} set={set} />}
        {tabActiva === 'banco'    && <TabBanco      form={form} set={set} />}
        {tabActiva === 'mensajes' && <TabMensajes   form={form} set={set} />}
        {tabActiva === 'push'     && <PanelConfigPush />}
        {tabActiva === 'premios'  && <TabPremios  form={form} set={set} />}
      </div>

      {/* Botón guardar al pie */}
      {tabActiva !== 'push' && (
      <div className="flex justify-end">
        <Button onClick={handleGuardar} loading={saving} size="lg">
          {guardado
            ? <><CheckCircle size={16} /> Cambios guardados</>
            : <><Save size={16} /> Guardar configuración</>
          }
        </Button>
      </div>
      )}
    </div>
  )
}