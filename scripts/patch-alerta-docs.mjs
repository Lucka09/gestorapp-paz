// scripts/patch-alerta-docs.mjs
// ─── Aplica SOLO los agregados de "Alerta de documentación + vista por
// secretario" sobre tus versiones actuales de:
//   • src/lib/firestore/MultaWorwflow.ts
//   • src/hooks/useMultaWorkflow.ts
//   • src/components/GestorMultaWorkflow.tsx
// No reescribe archivos: hace reemplazos exactos sobre anclas. Si UNA sola ancla
// no aparece exactamente 1 vez, aborta sin escribir nada.
// Idempotente: si detecta que el parche ya está aplicado, saltea el archivo.
// Uso:  node scripts/patch-alerta-docs.mjs          (dry-run)
//       node scripts/patch-alerta-docs.mjs --apply  (escribe)
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')

const PATCHES = [
  // ════════════════════════════════════════════════════════════════════════
  {
    file:   'src/lib/firestore/MultaWorwflow.ts',
    marker: 'export async function enviarAlertaDocumentacion',
    ops: [
      { find: `  onSnapshot, query, where,\n  type CollectionReference,\n} from 'firebase/firestore'`,
        repl: `  onSnapshot, query, where, writeBatch,\n  type CollectionReference,\n} from 'firebase/firestore'` },
      { find: `import { tramitesCol } from '@/lib/firestore/collections'`,
        repl: `import { tramitesCol, notificacionesCol } from '@/lib/firestore/collections'` },
      { find: `  EstadoMultaWorkflow, RegistroPago, EstadoMulta, DocumentoAdicional,\n} from '@/types/multa_types'`,
        repl: `  EstadoMultaWorkflow, RegistroPago, EstadoMulta, DocumentoAdicional,\n  AlertaDocumentacion,\n} from '@/types/multa_types'` },
      { find: `// ─── ESTADO OPERATIVO MANUAL ──`,
        repl: `// ─── IDS DE TRÁMITES DE MULTA PROPIOS (vista del secretario comercial) ────────
// Trámites de multa asignados a / creados por el usuario. Sin límite (a diferencia
// de subscribeTramites, que corta en 300). Equality-only → sin índice compuesto.
// Cada listener tiene handler de error: un permission-denied no deja loading infinito.
export function subscribeIdsTramitesMultaPropios(
  gestoriaId: string,
  uid:        string,
  cb:         (ids: Set<string>) => void,
): () => void {
  let asignados: string[] | null = null
  let creados:   string[] | null = null

  const emitir = () => {
    if (asignados === null || creados === null) return
    cb(new Set([...asignados, ...creados]))
  }
  const soloMultas = (docs: { id: string; data: () => { tipo?: string } }[]) =>
    docs.filter(d => d.data().tipo === 'descargo_multa').map(d => d.id)

  const unsubA = onSnapshot(
    query(tramitesCol, where('gestoriaId', '==', gestoriaId), where('asignadoA', '==', uid)),
    snap => { asignados = soloMultas(snap.docs as any); emitir() },
    err  => { console.warn('[multasPropias:asignados]', err.code ?? err.message); asignados = []; emitir() },
  )
  const unsubC = onSnapshot(
    query(tramitesCol, where('gestoriaId', '==', gestoriaId), where('creadoPor', '==', uid)),
    snap => { creados = soloMultas(snap.docs as any); emitir() },
    err  => { console.warn('[multasPropias:creados]', err.code ?? err.message); creados = []; emitir() },
  )
  return () => { unsubA(); unsubC() }
}

// ─── ESTADO OPERATIVO MANUAL ──` },
      { append: `

// ─── ALERTA DE DOCUMENTACIÓN AL SECRETARIO (estado Docs. Requerida) ──────────
// Control / asistente de multas avisa al secretario a cargo que falta o está mal
// un documento. Escritura ATÓMICA (batch):
//   1. notificaciones/{id} → campanita in-app + push (trigger enviarPushNotificacion)
//   2. multaWorkflow/{id}  → alertaDocs (última) + historialAlertasDocs (append)
export async function enviarAlertaDocumentacion(params: {
  tramiteId:          string
  gestoriaId:         string
  destinatarioId:     string
  destinatarioNombre: string
  motivo:             string
  autorId:            string
  autorNombre:        string
  patente?:           string
  cliente?:           string
}): Promise<void> {
  const alerta: AlertaDocumentacion = {
    motivo:             params.motivo,
    destinatarioId:     params.destinatarioId,
    destinatarioNombre: params.destinatarioNombre,
    autorId:            params.autorId,
    autorNombre:        params.autorNombre,
    creadoEn:           Timestamp.now(),
  }

  const ref   = [params.patente, params.cliente].filter(Boolean).join(' · ') || 'Revisión de multa'
  const batch = writeBatch(db)

  const notifRef = doc(notificacionesCol)
  batch.set(notifRef, {
    id:             notifRef.id,
    gestoriaId:     params.gestoriaId,
    destinatarioId: params.destinatarioId,
    tipo:           'documentacion',
    titulo:         \`📄 Falta documentación — \${ref}\`,
    mensaje:        \`\${params.autorNombre}: \${params.motivo}\`,
    tramiteId:      params.tramiteId,
    turnoId:        null,
    leida:          false,
    creadoEn:       serverTimestamp(),
  } as any)

  batch.update(workflowDoc(params.tramiteId), {
    alertaDocs:           alerta,
    historialAlertasDocs: arrayUnion(alerta),
    actualizadoEn:        serverTimestamp(),
  } as any)

  await batch.commit()
}
` },
    ],
  },
  // ════════════════════════════════════════════════════════════════════════
  {
    file:   'src/hooks/useMultaWorkflow.ts',
    marker: 'export function useMultaWorkflowsVisibles',
    ops: [
      { find: `import { useState, useEffect, useCallback } from 'react'`,
        repl: `import { useState, useEffect, useCallback, useMemo } from 'react'` },
      { find: `  subscribeMultaWorkflows,\n`,
        repl: `  subscribeMultaWorkflows,\n  subscribeIdsTramitesMultaPropios,\n` },
      { find: `  DocumentoAdicional,\n} from '@/types/multa_types'`,
        repl: `  DocumentoAdicional,\n} from '@/types/multa_types'\nimport { esMultaDeUsuario } from '@/types/multa_types'\nimport { puedeHacer } from '@/utils/permisos'\nimport type { Rol } from '@/types'` },
      { find: `  return { multas: rows, loading }\n}\n`,
        repl: `  return { multas: rows, loading }
}

// ─── HOOK DE LISTA FILTRADA POR ROL ───────────────────────────────────────────
// Igual que useMultaWorkflows, pero si el rol NO tiene \`verTodasLasMultas\`
// (Secretario Comercial) devuelve solo las multas propias: cargadas, asignadas
// o cuyo workflow inició. Filtro de UI (panel limpio), no de seguridad.
export function useMultaWorkflowsVisibles() {
  const { multas, loading } = useMultaWorkflows()
  const { user }   = useAuthStore()
  const gestoriaId = useGestoriaId()
  const uid        = user?.uid ?? ''
  const soloPropias = !!user && !puedeHacer((user.rol ?? 'cliente') as Rol, 'verTodasLasMultas')

  const [propiosIds, setPropiosIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!soloPropias || !gestoriaId || !uid) { setPropiosIds(null); return }
    return subscribeIdsTramitesMultaPropios(gestoriaId, uid, setPropiosIds)
  }, [soloPropias, gestoriaId, uid])

  const visibles = useMemo(() => {
    if (!soloPropias) return multas
    return multas.filter(w => propiosIds?.has(w.id) || esMultaDeUsuario(w, null, uid))
  }, [multas, soloPropias, propiosIds, uid])

  return {
    multas:  visibles,
    loading: loading || (soloPropias && propiosIds === null),
    soloPropias,
  }
}
` },
    ],
  },
  // ════════════════════════════════════════════════════════════════════════
  // Tu versión YA tiene useTramite importado y `const { tramite } = useTramite(...)`
  // → no se duplican; se reutiliza \`tramite\`.
  {
    file:   'src/components/GestorMultaWorkflow.tsx',
    marker: 'ModalAlertaDocumentacion',
    ops: [
      { find: `  PlusCircle, CreditCard, Pencil, History, ShieldCheck,\n} from 'lucide-react'`,
        repl: `  PlusCircle, CreditCard, Pencil, History, ShieldCheck, BellRing,\n} from 'lucide-react'` },
      { find: `import { iniciarDescargaCuponesEnExtension } from '@/lib/puenteExtension'`,
        repl: `import { iniciarDescargaCuponesEnExtension } from '@/lib/puenteExtension'\nimport ModalAlertaDocumentacion from '@/components/multas/ModalAlertaDocumentacion'` },
      { find: `  const puedeOperarMulta  = esAdmin || esAsistenteMultas\n`,
        repl: `  const puedeOperarMulta  = esAdmin || esAsistenteMultas\n  // Control + asistente de multas pueden avisar al secretario por documentación\n  const puedeAlertarDocs  = esAdmin || esAsistenteMultas\n` },
      { find: `  } = useMultaWorkflow(tramiteId)\n`,
        repl: `  } = useMultaWorkflow(tramiteId)

  const [alertaDocsOpen, setAlertaDocsOpen] = useState(false)

  // Cambio de estado manual: si control/asistente lo pasa a "Docs. Requerida",
  // se abre directo el aviso al secretario (cancelable).
  const handleCambiarEstado = async (estado: EstadoMulta | null) => {
    await cambiarEstadoManual(estado)
    if (estado === 'docs_requerida' && puedeAlertarDocs) setAlertaDocsOpen(true)
  }
` },
      { find: `          onChange={e => cambiarEstadoManual((e.target.value || null) as EstadoMulta | null)}`,
        repl: `          onChange={e => handleCambiarEstado((e.target.value || null) as EstadoMulta | null)}` },
      { find: `        {workflow.estadoMultaManual && workflow.estadoMultaManualNombre && (
          <p className="text-[11px] text-gray-400 mt-1.5">Fijado por {workflow.estadoMultaManualNombre}.</p>
        )}
      </div>
`,
        repl: `        {workflow.estadoMultaManual && workflow.estadoMultaManualNombre && (
          <p className="text-[11px] text-gray-400 mt-1.5">Fijado por {workflow.estadoMultaManualNombre}.</p>
        )}

        {/* Docs. Requerida → aviso al secretario comercial a cargo */}
        {estadoOperativo === 'docs_requerida' && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
            {workflow.alertaDocs ? (
              <p className="text-[11px] text-red-700">
                <strong>🔔 Avisado a {workflow.alertaDocs.destinatarioNombre}</strong>
                {' '}por {workflow.alertaDocs.autorNombre}
                {workflow.alertaDocs.creadoEn?.toDate && (
                  <> · {workflow.alertaDocs.creadoEn.toDate().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>
                )}
                <span className="block text-red-600 mt-0.5 whitespace-pre-line">{workflow.alertaDocs.motivo}</span>
              </p>
            ) : (
              <p className="text-[11px] text-red-700">Falta o hay error en la documentación. Todavía no se avisó al secretario.</p>
            )}
            {puedeAlertarDocs && (
              <button onClick={() => setAlertaDocsOpen(true)}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors">
                <BellRing size={14} /> {workflow.alertaDocs ? 'Volver a avisar al secretario' : 'Avisar al secretario a cargo'}
              </button>
            )}
          </div>
        )}
      </div>

      <ModalAlertaDocumentacion
        w={alertaDocsOpen ? workflow : null}
        tramite={tramite}
        onClose={() => setAlertaDocsOpen(false)}
      />
` },
    ],
  },
]

// ─── MOTOR ────────────────────────────────────────────────────────────────────
const contar = (s, sub) => s.split(sub).length - 1
const resultados = []
let errores = 0

for (const p of PATCHES) {
  if (!fs.existsSync(p.file)) { console.error(`✗ No existe ${p.file}`); errores++; continue }
  const raw  = fs.readFileSync(p.file, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')

  if (s.includes(p.marker)) { console.log(`• ${p.file}: ya parcheado — se saltea`); continue }

  let ok = true
  for (const [i, op] of p.ops.entries()) {
    if (op.append) { s = s.replace(/\s*$/, '\n') + op.append.replace(/^\n+/, '\n'); continue }
    const n = contar(s, op.find)
    if (n !== 1) {
      console.error(`✗ ${p.file} — ancla #${i + 1} aparece ${n} veces (se esperaba 1):\n   ${op.find.split('\n')[0].trim()}`)
      ok = false; errores++; break
    }
    s = s.replace(op.find, () => op.repl)
  }
  if (!ok) continue
  resultados.push({ file: p.file, out: crlf ? s.replace(/\n/g, '\r\n') : s })
  console.log(`✓ ${p.file}: ${p.ops.length} cambios listos`)
}

if (errores) { console.error(`\n${errores} error(es). No se escribió NINGÚN archivo.`); process.exit(1) }
if (!APPLY)  { console.log('\nDry-run OK. Corré con --apply para escribir.'); process.exit(0) }
for (const r of resultados) fs.writeFileSync(r.file, r.out, 'utf8')
console.log(`\n✔ ${resultados.length} archivo(s) escritos.`)
