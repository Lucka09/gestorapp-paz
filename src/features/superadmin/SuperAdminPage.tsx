import { useState } from 'react'
import {
  Building2, Plus, Users, CheckCircle,
  AlertCircle, Clock, XCircle, Edit2,
  DollarSign, Crown, Zap, Globe,
  Copy, ExternalLink, Settings,
} from 'lucide-react'
import {
  subscribeGestorias, crearGestoria, actualizarGestoria,
  migrarGestoriaId, COLECCIONES_TENANT,
} from '@/lib/firestore/gestionarias'
import { useEffect } from 'react'
import { PageHeader, Button, Input, Select, Card, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import {
  PLAN_CONFIG, type Gestoria, type PlanGestoria,
  type EstadoGestoria,
} from '@/types'
import toast from 'react-hot-toast'

const PLANES_CONFIG = {
  starter: { maxUsuarios: 2,  maxClientes: 50,  label: 'Starter',    precio: 50000  },
  pro:     { maxUsuarios: 10, maxClientes: 500,  label: 'Pro',        precio: 125000 },
  enterprise: { maxUsuarios: 50, maxClientes: 9999, label: 'Enterprise', precio: 250000 },
};
// ─── ESTADO BADGE ─────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: EstadoGestoria }) {
  const cfg = {
    activa:     { cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, label: 'Activa'     },
    trial:      { cls: 'bg-blue-100 text-blue-700',       icon: Clock,       label: 'Trial'      },
    suspendida: { cls: 'bg-amber-100 text-amber-700',     icon: AlertCircle, label: 'Suspendida' },
    cancelada:  { cls: 'bg-red-100 text-red-600',         icon: XCircle,     label: 'Cancelada'  },
  }[estado]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1
                       rounded-full ${cfg.cls}`}>
      <Icon size={11}/> {cfg.label}
    </span>
  )
}

// ─── PLAN BADGE ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: PlanGestoria }) {
  const cfg = {
    starter:      { cls: 'bg-gray-100 text-gray-600',   icon: Zap,   label: 'Starter'      },
    profesional:  { cls: 'bg-blue-100 text-blue-700',   icon: Globe, label: 'Profesional'  },
    enterprise:   { cls: 'bg-purple-100 text-purple-700',icon: Crown, label: 'Enterprise'  },
  }[plan]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1
                       rounded-full ${cfg.cls}`}>
      <Icon size={11}/> {cfg.label}
    </span>
  )
}

// ─── MODAL NUEVA GESTORÍA ────────────────────────────────────────────────────

function ModalNuevaGestoria({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const [nombre,       setNombre]       = useState('')
  const [nombreLegal,  setNombreLegal]  = useState('')
  const [cuit,         setCuit]         = useState('')
  const [responsable,  setResponsable]  = useState('')
  const [email,        setEmail]        = useState('')
  const [telefono1,    setTelefono1]    = useState('')
  const [direccion,    setDireccion]    = useState('')
  const [localidad,    setLocalidad]    = useState('')
  const [provincia,    setProvincia]    = useState('Buenos Aires')
  const [plan,         setPlan]         = useState<PlanGestoria>('profesional')
  const [colorP,       setColorP]       = useState('#D4621A')
  const [colorS,       setColorS]       = useState('#1A1A1A')
  const [slogan,       setSlogan]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [gestoriaId,   setGestoriaId]   = useState<string | null>(null)

  const handleCrear = async () => {
    if (!nombre || !email || !responsable) {
      toast.error('Completá nombre, email y responsable')
      return
    }
    setSaving(true)
    try {
      const id = await crearGestoria({
        nombre,
        nombreLegal:  nombreLegal || nombre,
        cuit,
        responsable,
        email,
        telefono1,
        direccion,
        localidad,
        provincia,
        plan,
        branding: {
          colorPrimario:   colorP,
          colorSecundario: colorS,
          nombreComercial: nombre,
          slogan:          slogan || undefined,
        },
      })
      setGestoriaId(id)
      toast.success(`Gestoría "${nombre}" creada`)
    } catch { toast.error('Error al crear la gestoría') }
    finally { setSaving(false) }
  }

  const handleCopiarId = () => {
    if (!gestoriaId) return
    navigator.clipboard.writeText(gestoriaId)
    toast.success('ID copiado')
  }

  if (gestoriaId) return (
    <Modal open={open} onClose={onClose} title="Gestoría creada ✅" size="sm">
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-1">ID de la gestoría</p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-emerald-700 flex-1 break-all">
              {gestoriaId}
            </code>
            <button onClick={handleCopiarId}
              className="text-emerald-600 hover:text-emerald-800">
              <Copy size={14}/>
            </button>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800">Próximos pasos</p>
          <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
            <li>Crear el usuario admin de la gestoría con este gestoriaId en su perfil</li>
            <li>Si hay datos existentes, ejecutar la migración desde el panel de esta gestoría</li>
            <li>Configurar el branding (logo) desde Configuración</li>
            <li>Compartir las credenciales con el cliente</li>
          </ol>
        </div>
        <Button onClick={onClose} className="w-full">Cerrar</Button>
      </div>
    </Modal>
  )

  return (
    <Modal open={open} onClose={onClose} title="Nueva gestoría" size="lg">
      <div className="space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre comercial *" value={nombre}
            onChange={e => setNombre(e.target.value)} placeholder="Gestoría Paz" />
          <Input label="Nombre legal" value={nombreLegal}
            onChange={e => setNombreLegal(e.target.value)} placeholder="Paz Ezequiel J." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Responsable *" value={responsable}
            onChange={e => setResponsable(e.target.value)} placeholder="Ezequiel Paz" />
          <Input label="Email *" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="info@gestoriapaz.com" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="CUIT" value={cuit}
            onChange={e => setCuit(e.target.value)} placeholder="20-12345678-9" />
          <Input label="Teléfono" type="tel" value={telefono1}
            onChange={e => setTelefono1(e.target.value)} placeholder="1136141431" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Dirección" value={direccion}
            onChange={e => setDireccion(e.target.value)} placeholder="Av. San Martín 1234" />
          <Input label="Localidad" value={localidad}
            onChange={e => setLocalidad(e.target.value)} placeholder="San Martín" />
          <Input label="Provincia" value={provincia}
            onChange={e => setProvincia(e.target.value)} placeholder="Buenos Aires" />
        </div>

        {/* Branding */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Branding
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                Color primario
              </label>
              <div className="flex items-center gap-2">
                <input type="color" value={colorP}
                  onChange={e => setColorP(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <code className="text-xs text-gray-500">{colorP}</code>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                Color secundario
              </label>
              <div className="flex items-center gap-2">
                <input type="color" value={colorS}
                  onChange={e => setColorS(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <code className="text-xs text-gray-500">{colorS}</code>
              </div>
            </div>
            <Input label="Slogan" value={slogan}
              onChange={e => setSlogan(e.target.value)}
              placeholder="Tu trámite, fácil y rápido" />
          </div>

          {/* Preview colores */}
          <div className="flex items-center gap-2 mt-2">
            <div className="h-8 flex-1 rounded-lg" style={{ background: colorP }}/>
            <div className="h-8 flex-1 rounded-lg" style={{ background: colorS }}/>
            <div className="h-8 w-32 rounded-lg flex items-center justify-center text-white
                            text-xs font-bold" style={{ background: colorP }}>
              {nombre || 'Gestoría'}
            </div>
          </div>
        </div>

        {/* Plan */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Plan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(PLAN_CONFIG) as [PlanGestoria, typeof PLAN_CONFIG[PlanGestoria]][]).map(([p, cfg]) => (
              <button key={p} type="button" onClick={() => setPlan(p)}
                className={`p-3 rounded-xl border-2 text-left transition-all
                             ${plan === p
                               ? 'border-gp-orange bg-gp-orange-pale'
                               : 'border-gray-100 bg-white hover:border-gray-200'
                             }`}>
                <p className="text-sm font-bold text-gray-900">{cfg.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  ${cfg.precio.toLocaleString('es-AR')}/mes
                </p>
                <p className="text-xs text-gray-400">
                  {cfg.maxUsuarios} usuarios · {cfg.maxClientes === 9999 ? '∞' : cfg.maxClientes} clientes
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleCrear} loading={saving} className="flex-1">
            <Plus size={15}/> Crear gestoría
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── CARD DE GESTORÍA ─────────────────────────────────────────────────────────

function GestoriaCard({
  g, onEditar, onMigrar,
}: { g: Gestoria; onEditar: () => void; onMigrar: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        {/* Color swatch */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                        text-white text-base font-bold"
             style={{ background: g.branding?.colorPrimario ?? '#D4621A' }}>
          {g.nombre[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-gray-900">{g.nombre}</span>
            <EstadoBadge estado={g.estado} />
            <PlanBadge plan={g.plan} />
          </div>

          <p className="text-sm text-gray-500 mb-2">
            {g.responsable} · {g.email}
          </p>

          <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Users size={11}/> {g.maxUsuarios} usuarios
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={11}/>
              ${PLAN_CONFIG[g.plan]?.precio.toLocaleString('es-AR')}/mes
            </span>
            <span className="font-mono text-gray-300">{g.id.slice(0, 8)}...</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 shrink-0">
          <button onClick={onMigrar} title="Migrar datos"
            className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center
                       justify-center hover:bg-blue-100 transition-colors">
            <Settings size={14}/>
          </button>
          <button onClick={onEditar} title="Editar"
            className="w-8 h-8 bg-gray-100 text-gray-400 rounded-lg flex items-center
                       justify-center hover:bg-gray-200 transition-colors">
            <Edit2 size={14}/>
          </button>
        </div>
      </div>
    </Card>
  )
}

// ─── MODAL DE MIGRACIÓN ────────────────────────────────────────────────────────

function ModalMigracion({
  gestoria, open, onClose,
}: { gestoria: Gestoria; open: boolean; onClose: () => void }) {
  const [migrando,   setMigrando]   = useState(false)
  const [resultado,  setResultado]  = useState<Record<string, number> | null>(null)

  const handleMigrar = async () => {
    setMigrando(true)
    try {
      const res = await migrarGestoriaId(gestoria.id, COLECCIONES_TENANT)
      setResultado(res)
      toast.success('Migración completada')
    } catch { toast.error('Error en la migración') }
    finally { setMigrando(false) }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={`Migrar datos — ${gestoria.nombre}`}
      subtitle="Agrega gestoriaId a todos los documentos existentes"
      size="sm">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs text-amber-700 leading-relaxed">
            Esta operación agrega <code className="font-mono bg-amber-100 px-1 rounded">
            gestoriaId = "{gestoria.id}"</code> a todos los documentos que no lo tengan.
            Es segura y se puede repetir sin problemas.
          </p>
        </div>

        {resultado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
            <p className="text-sm font-bold text-emerald-800 mb-2">Migración completada</p>
            {Object.entries(resultado).map(([col, n]) => (
              <div key={col} className="flex justify-between text-xs text-emerald-700">
                <span>{col}</span>
                <span className="font-bold">{n} documentos</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleMigrar} loading={migrando} className="flex-1"
            variant={resultado ? 'secondary' : 'primary'}>
            {resultado ? 'Volver a migrar' : 'Ejecutar migración'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [gestorias,    setGestorias]    = useState<Gestoria[]>([])
  const [loading,      setLoading]      = useState(true)
  const [modalNueva,   setModalNueva]   = useState(false)
  const [gestoriaMig,  setGestoriaMig]  = useState<Gestoria | null>(null)

  useEffect(() => {
    const unsub = subscribeGestorias(gs => {
      setGestorias(gs)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const activas    = gestorias.filter(g => g.estado === 'activa').length
  const trials     = gestorias.filter(g => g.estado === 'trial').length
  const mrr        = gestorias
    .filter(g => g.estado === 'activa')
    .reduce((a, g) => a + (PLAN_CONFIG[g.plan]?.precio ?? 0), 0)

  if (loading) return <Spinner label="Cargando gestorías..." />

  return (
    <div className="space-y-5 animate-fadein">

      {/* Header con badge JAH-NISSI */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:22,margin:0 }}>
              Panel Super-Admin
            </h1>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full
                             bg-purple-100 text-purple-700">
              JAH-NISSI Digital Studio
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Gestión de todas las gestorías en la plataforma
          </p>
        </div>
        <Button onClick={() => setModalNueva(true)}>
          <Plus size={15}/> Nueva gestoría
        </Button>
      </div>

      {/* KPIs del negocio SaaS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total gestorías', value: gestorias.length,  color: '#D4621A', icon: Building2  },
          { label: 'Activas',         value: activas,           color: '#22C55E', icon: CheckCircle },
          { label: 'En trial',        value: trials,            color: '#3B82F6', icon: Clock       },
          { label: 'MRR estimado',    value: `$${(mrr/1000).toFixed(0)}k`, color: '#7C3AED', icon: DollarSign },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                 style={{ background: `${k.color}18` }}>
              <k.icon size={16} style={{ color: k.color }} />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-gray-900"
               style={{ fontFamily: 'var(--font-display)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Lista de gestorías */}
      {gestorias.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <Building2 size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium text-gray-400">
            Sin gestorías todavía
          </p>
          <Button className="mt-4" onClick={() => setModalNueva(true)}>
            <Plus size={14}/> Crear primera gestoría
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {gestorias.map(g => (
            <GestoriaCard
              key={g.id}
              g={g}
              onEditar={() => {}}
              onMigrar={() => setGestoriaMig(g)}
            />
          ))}
        </div>
      )}

      {/* Modales */}
      <ModalNuevaGestoria open={modalNueva} onClose={() => setModalNueva(false)} />
      {gestoriaMig && (
        <ModalMigracion
          gestoria={gestoriaMig}
          open={!!gestoriaMig}
          onClose={() => setGestoriaMig(null)}
        />
      )}
    </div>
  )
}
