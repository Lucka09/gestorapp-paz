// src/components/shared/PanelDocumentacion.tsx
// ─── PANEL DE DOCUMENTACIÓN DE TRÁMITE ────────────────────────────────────────
// Muestra todas las fotos/documentos cargados en los workflows de un trámite.
// Visible para todo el staff con acceso a trámites (admin, asesor, gestor).
// Soporta los tres tipos de workflow: inscripción, multa y transferencia.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { onSnapshot, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { usePermisos } from '@/hooks/usePermisos'
import { useGestoriaId } from '@/context/GestoriaContext'
import type { FotoWorkflow } from '@/torre_types'
import type { TipoTramite } from '@/types'
import {
  FileImage, ZoomIn, Download, AlertTriangle,
  ChevronDown, ChevronUp, CheckCircle2, Flag, X,
} from 'lucide-react'

// ─── TIPOS INTERNOS ───────────────────────────────────────────────────────────

interface GrupoDoc {
  seccion: string      // ej: "Paso 2 — Documentación"
  docs:    DocItem[]
}

interface DocItem {
  label:  string
  foto:   FotoWorkflow
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

function formatFechaHoraLocal(ts: any): string {
  const d = ts?.toDate?.() ?? (ts ? new Date(ts) : null)
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── EXTRACTOR DE DOCS POR TIPO ───────────────────────────────────────────────

function extraerDocsInscripcion(wf: any): GrupoDoc[] {
  if (!wf) return []
  const grupos: GrupoDoc[] = []

  // Paso 2 — Documentación del titular
  const p2 = wf.paso2
  if (p2) {
    const docs: DocItem[] = []
    if (p2.fotos?.length) {
      p2.fotos.forEach((f: FotoWorkflow, i: number) =>
        docs.push({ label: `Documento ${i + 1}`, foto: f })
      )
    }
    if (docs.length) grupos.push({ seccion: 'Paso 2 — Documentación del titular', docs })
  }

  // Paso 3 — Precarga en sistema
  const p3 = wf.paso3
  if (p3?.fotos?.length) {
    grupos.push({
      seccion: 'Paso 3 — Precarga en sistema',
      docs: p3.fotos.map((f: FotoWorkflow, i: number) => ({ label: `Captura ${i + 1}`, foto: f })),
    })
  }

  // Paso 4 — Turno obtenido
  const p4 = wf.paso4
  if (p4?.fotos?.length) {
    grupos.push({
      seccion: 'Paso 4 — Turno obtenido',
      docs: p4.fotos.map((f: FotoWorkflow, i: number) => ({ label: `Foto turno ${i + 1}`, foto: f })),
    })
  }

  // Paso 5 — Presentación en registro
  const p5 = wf.paso5
  if (p5?.fotos?.length) {
    grupos.push({
      seccion: 'Paso 5 — Presentación en registro',
      docs: p5.fotos.map((f: FotoWorkflow, i: number) => ({ label: `Recibo ${i + 1}`, foto: f })),
    })
  }

  // Paso 6 — Chapa patente
  const p6 = wf.paso6
  if (p6?.fotoChapa) grupos.push({
    seccion: 'Paso 6 — Chapa patente',
    docs: [{ label: 'Foto chapa', foto: p6.fotoChapa }],
  })
  if (p6?.fotoRetiro) grupos.push({
    seccion: 'Paso 6 — Retiro de chapa',
    docs: [{ label: 'Foto retiro', foto: p6.fotoRetiro }],
  })

  // Paso 7 — Entrega al cliente
  const p7 = wf.paso7
  if (p7?.fotoEntrega) grupos.push({
    seccion: 'Paso 7 — Entrega al cliente',
    docs: [{ label: 'Constancia entrega', foto: p7.fotoEntrega }],
  })

  return grupos
}

function extraerDocsMulta(wf: any): GrupoDoc[] {
  if (!wf) return []
  const grupos: GrupoDoc[] = []

  // Paso 2 — Documentación
  const p2 = wf.paso2
  if (p2) {
    const docs: DocItem[] = []
    const mapaFotos: [string, FotoWorkflow | undefined][] = [
      ['DNI Frente',      p2.fotoDniFrente],
      ['DNI Dorso',       p2.fotoDniDorso],
      ['Cédula Frente',   p2.fotoCedulaFrente],
      ['Cédula Dorso',    p2.fotoCedulaDorso],
      ['Título Frente',   p2.fotoTituloFrente],
      ['Título Dorso',    p2.fotoTituloDorso],
    ]
    mapaFotos.forEach(([label, foto]) => {
      if (foto) docs.push({ label, foto })
    })
    if (docs.length) grupos.push({ seccion: 'Paso 2 — Documentación del infractor', docs })
  }

  // Paso 4 — DNI propietario
  const p4 = wf.paso4
  if (p4) {
    const docs: DocItem[] = []
    if (p4.fotoDniInfractorFrente) docs.push({ label: 'DNI Infractor Frente', foto: p4.fotoDniInfractorFrente })
    if (p4.fotoDniInfractorDorso)  docs.push({ label: 'DNI Infractor Dorso',  foto: p4.fotoDniInfractorDorso })
    if (docs.length) grupos.push({ seccion: 'Paso 4 — Documentación del infractor', docs })
  }

  // Paso 5 — Descargo
  const p5 = wf.paso5
  if (p5?.fotosDescargo?.length) {
    grupos.push({
      seccion: 'Paso 5 — Fotos del descargo',
      docs: p5.fotosDescargo.map((f: FotoWorkflow, i: number) => ({ label: `Descargo ${i + 1}`, foto: f })),
    })
  }

  // Paso 6 — SUATS
  const p6 = wf.paso6
  if (p6?.fotosSuats?.length) {
    grupos.push({
      seccion: 'Paso 6 — Informe SUATS',
      docs: p6.fotosSuats.map((f: FotoWorkflow, i: number) => ({ label: `SUATS ${i + 1}`, foto: f })),
    })
  }

  return grupos
}

function extraerDocsTransferencia(wf: any): GrupoDoc[] {
  if (!wf) return []
  const grupos: GrupoDoc[] = []

  // Paso 2 — Documentación vendedor / comprador
  const p2 = wf.paso2
  if (p2) {
    const docs: DocItem[] = []
    const items: [string, any][] = [
      ['DNI Vendedor Frente', p2.vendedor?.frente],
      ['DNI Vendedor Dorso',  p2.vendedor?.dorso],
      ['DNI Comprador Frente',p2.comprador?.frente],
      ['DNI Comprador Dorso', p2.comprador?.dorso],
      ['Título Frente',       p2.titulo?.frente],
      ['Título Dorso',        p2.titulo?.dorso],
    ]
    items.forEach(([label, foto]) => { if (foto) docs.push({ label, foto }) })
    if (docs.length) grupos.push({ seccion: 'Paso 2 — Documentación', docs })
  }

  // Paso 6 — Comprobante retiro / entrega
  const p6 = wf.paso6
  if (p6?.fotoComprobanteRetiro) grupos.push({
    seccion: 'Paso 6 — Comprobante retiro',
    docs: [{ label: 'Comprobante retiro', foto: p6.fotoComprobanteRetiro }],
  })
  if (p6?.fotoEntrega) grupos.push({
    seccion: 'Paso 6 — Constancia entrega',
    docs: [{ label: 'Constancia entrega', foto: p6.fotoEntrega }],
  })

  return grupos
}

// ─── COMPONENTE FOTO ──────────────────────────────────────────────────────────

function FotoCard({ item }: { item: DocItem }) {
  const [zoom, setZoom] = useState(false)

  return (
    <>
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden group">
        {/* Imagen */}
        <div
          className="relative cursor-zoom-in bg-gray-100"
          style={{ paddingBottom: '66%' }}
          onClick={() => setZoom(true)}
        >
          <img
            src={item.foto.url}
            alt={item.label}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            onError={e => { (e.target as HTMLImageElement).src = '/placeholder-doc.png' }}
          />
          {/* Overlay hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all
                          flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="bg-white/90 rounded-lg px-2 py-1 flex items-center gap-1">
              <ZoomIn size={13} className="text-gray-700" />
              <span className="text-xs font-medium text-gray-700">Ver</span>
            </div>
          </div>
          {/* Badge validación */}
          <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold flex items-center gap-0.5 ${
            item.foto.validadaOk
              ? 'bg-emerald-500 text-white'
              : 'bg-amber-400 text-white'
          }`}>
            {item.foto.validadaOk
              ? <><CheckCircle2 size={9} /> OK</>
              : <><AlertTriangle size={9} /> Revisar</>
            }
          </div>
          {/* Badge flag admin */}
          {item.foto.adminFlag && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[9px]
                            font-bold bg-red-500 text-white flex items-center gap-0.5">
              <Flag size={9} /> Flagueada
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-2.5 py-2">
          <p className="text-xs font-semibold text-gray-700 truncate">{item.label}</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-gray-400">
              {formatFechaHoraLocal(item.foto.subidaEn)} · {formatKb(item.foto.tamanoKb)}
            </span>
            <a
              href={item.foto.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[#D4621A] hover:text-[#b8541a] transition-colors"
              title="Descargar / abrir en nueva pestaña"
            >
              <Download size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <button
            onClick={() => setZoom(false)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20
                       rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X size={18} />
          </button>
          <img
            src={item.foto.url}
            alt={item.label}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white/80 text-sm font-medium">{item.label}</span>
            <a
              href={item.foto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20
                         text-white text-xs font-medium rounded-lg transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <Download size={13} /> Descargar
            </a>
          </div>
        </div>
      )}
    </>
  )
}

// ─── COMPONENTE GRUPO ─────────────────────────────────────────────────────────

function GrupoSeccion({ grupo }: { grupo: GrupoDoc }) {
  const [abierto, setAbierto] = useState(true)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setAbierto(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3
                   bg-gray-50/70 hover:bg-gray-100/70 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <FileImage size={14} className="text-[#D4621A] shrink-0" />
          <span className="text-xs font-bold text-gray-700">{grupo.seccion}</span>
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
            {grupo.docs.length}
          </span>
        </div>
        {abierto ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {abierto && (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {grupo.docs.map((item, i) => (
            <FotoCard key={`${grupo.seccion}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface Props {
  tramiteId:  string
  tipo:       TipoTramite
  defaultOpen?: boolean
}

export function PanelDocumentacion({ tramiteId, tipo, defaultOpen = true }: Props) {
  const { puede } = usePermisos()
  const gestoriaId = useGestoriaId()
  const [grupos, setGrupos] = useState<GrupoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState(defaultOpen)

  // Solo admins pueden ver los documentos
  const puedeVer = puede('verTramites')
  if (!puedeVer) return null

  // Suscribirse al workflow correcto según tipo
  useEffect(() => {
    if (!tramiteId || !gestoriaId) return
    setLoading(true)

    let coleccion: string
    if (tipo === 'inscripcion_inicial')    coleccion = 'inscripcionWorkflows'
    else if (tipo === 'descargo_multa')    coleccion = 'multaWorkflow'
    else if (tipo === 'transferencia')     coleccion = 'transferenciaWorkflow'
    else { setLoading(false); return }

    const ref = doc(db, coleccion, tramiteId)
    const unsub = onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) { setGrupos([]); setLoading(false); return }
        const wf = snap.data()
        let g: GrupoDoc[] = []
        if (tipo === 'inscripcion_inicial') g = extraerDocsInscripcion(wf)
        if (tipo === 'descargo_multa')      g = extraerDocsMulta(wf)
        if (tipo === 'transferencia')       g = extraerDocsTransferencia(wf)
        setGrupos(g)
        setLoading(false)
      },
      err => {
        if (err.code !== 'permission-denied') {
          console.warn('[PanelDocumentacion] listener error:', err.message)
        }
        setLoading(false)
      },
    )
    return () => unsub()
  }, [tramiteId, tipo, gestoriaId])

  const totalFotos = grupos.reduce((s, g) => s + g.docs.length, 0)

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm bg-white">
      {/* Header */}
      <button
        onClick={() => setAbierto(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4
                   hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#D4621A]/10 flex items-center justify-center shrink-0">
            <FileImage size={15} className="text-[#D4621A]" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Documentación cargada</p>
            <p className="text-xs text-gray-400">
              {loading
                ? 'Cargando...'
                : totalFotos === 0
                ? 'Sin documentos aún'
                : `${totalFotos} archivo${totalFotos !== 1 ? 's' : ''} en ${grupos.length} sección${grupos.length !== 1 ? 'es' : ''}`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalFotos > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 bg-[#D4621A]/10 text-[#D4621A] rounded-full">
              {totalFotos}
            </span>
          )}
          {abierto ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Contenido */}
      {abierto && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-3">
              <div className="w-4 h-4 border-2 border-[#D4621A] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Cargando documentos...</span>
            </div>
          ) : grupos.length === 0 ? (
            <div className="text-center py-8">
              <FileImage size={32} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">Sin documentos cargados</p>
              <p className="text-xs text-gray-300 mt-1">
                Los documentos aparecerán aquí a medida que el gestor avance en el workflow.
              </p>
            </div>
          ) : (
            grupos.map((grupo, i) => (
              <GrupoSeccion key={i} grupo={grupo} />
            ))
          )}
        </div>
      )}
    </div>
  )
}