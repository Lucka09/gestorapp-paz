// scripts/patch-devoluciones-fase3.mjs
// ─── FASE 3 — DEVOLUCIONES EN TODOS LOS PUNTOS DE COBRO ─────────────────────
// La devolución ya existía (devoluciones.ts + ModalDevolucion), pero solo se
// podía lanzar desde el detalle del trámite, sin comprobante y con fecha de hoy.
//
//   devoluciones.ts      → acepta la FECHA real (va como fechaCobro del recibo
//                          negativo: criterio de caja, igual que los cobros)
//   ModalDevolucion      → selector de fecha + AdjuntarComprobante (se sube al
//                          recibo de devolución con adjuntarARecibo) + acepta
//                          reciboOriginalId para revertir un cobro puntual
//   comprobantes.ts      → el control de "faltan comprobantes" incluye las
//                          devoluciones (antes las filtraba por monto > 0)
//   ComprobantesTab      → etiqueta "devolución" y monto en rojo/negativo
//   BandejaRecibos       → badge rojo + botón "Devolver" en cada recibo de cobro
//   CobranzasPage        → botón de devolución en las filas ya cobradas
//   GestorMultaWorkflow  → botón de devolución en el panel de pagos de la multa
//   TramiteDetallePage   → lista de devoluciones del trámite con su comprobante
//
// Uso:  node scripts/patch-devoluciones-fase3.mjs [--apply]
// Aborta sin escribir NADA si una ancla no aparece como se espera. Idempotente.
import fs from 'node:fs'
const APPLY = process.argv.includes('--apply')
const P = []

// ── devoluciones.ts ─────────────────────────────────────────────────────────
P.push({
  files: ['src/lib/firestore/devoluciones.ts'],
  marker: 'fechaCobro',
  ops: [
    { find: '  serverTimestamp, runTransaction,',
      repl: '  serverTimestamp, runTransaction, Timestamp,' },
    { find: '  reciboOriginalId?: string\n}',
      repl: `  reciboOriginalId?: string
  /** Fecha real de la devolución (ISO aaaa-mm-dd). Define en qué mes impacta. */
  fecha?: string
}` },
    { find: "    reciboOriginalId:  input.reciboOriginalId ?? '',",
      repl: `    reciboOriginalId:  input.reciboOriginalId ?? '',
    // Criterio de caja: la plata salió el día que dice el usuario, no el día
    // que se cargó. Si no viene, crearRecibo usa hoy.
    fechaCobro: input.fecha
      ? Timestamp.fromDate(new Date(input.fecha + 'T12:00:00'))
      : undefined,` },
  ],
})

// ── ModalDevolucion.tsx ─────────────────────────────────────────────────────
P.push({
  files: ['src/components/shared/ModalDevolucion.tsx'],
  marker: 'AdjuntarComprobante',
  ops: [
    { find: "import { useAuth } from '@/hooks/useAuth'",
      repl: `import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import AdjuntarComprobante from '@/components/shared/AdjuntarComprobante'
import { adjuntarARecibo } from '@/lib/firestore/comprobantes'` },
    { find: '  onHecho?:   () => void\n}',
      repl: `  onHecho?:   () => void
  /** Recibo de cobro que se está revirtiendo, si se abre desde uno. */
  reciboOriginalId?: string
}` },
    { find: '  open, tramiteId, tramiteLabel, onClose, onHecho,\n}: Props) {',
      repl: '  open, tramiteId, tramiteLabel, onClose, onHecho, reciboOriginalId,\n}: Props) {' },
    { find: "  const [formaPago, setFormaPago] = useState('efectivo')",
      repl: `  const [formaPago, setFormaPago] = useState('efectivo')
  const [fecha,     setFecha]     = useState(() => new Date().toISOString().slice(0, 10))
  const [archivo,   setArchivo]   = useState<File | null>(null)` },
    { find: "    setFormaPago('efectivo'); setError(null); setChequeo(null)",
      repl: `    setFormaPago('efectivo'); setError(null); setChequeo(null)
    setFecha(new Date().toISOString().slice(0, 10)); setArchivo(null)` },
    { find: '  const puede      = montoNum > 0 && !excede && detalleOk && !saving',
      repl: '  const puede      = montoNum > 0 && !excede && detalleOk && !!fecha && !saving' },
    { range: ['      await registrarDevolucion(', '      reset()'],
      repl: `      const reciboId = await registrarDevolucion(
        {
          tramiteId, gestoriaId,
          monto: montoNum, motivo,
          detalle: detalle.trim(),
          formaPago, fecha,
          ...(reciboOriginalId ? { reciboOriginalId } : {}),
        },
        {
          uid:    user.uid,
          nombre: \`\${user.nombre} \${user.apellido}\`.trim(),
          rol:    user.rol,
        },
      )

      // Comprobante del reintegro. Si falla, la devolución YA quedó registrada:
      // no se revierte, se avisa para adjuntarlo desde Cobranzas → Comprobantes.
      if (archivo && reciboId) {
        try {
          await adjuntarARecibo(archivo, {
            id: reciboId, gestoriaId,
            monto: -Math.abs(montoNum),
            formaPago, tramiteId,
            patente: tramiteLabel,
          }, { uid: user.uid, nombre: \`\${user.nombre} \${user.apellido}\`.trim() })
        } catch (e) {
          console.error('[ModalDevolucion] comprobante:', e)
          toast('La devolución se registró, pero el comprobante no se pudo subir. Adjuntalo desde Cobranzas → Comprobantes.', { icon: '📎' })
        }
      }

      toast.success(\`Devolución de \${fmt(montoNum)} registrada\`)
      reset()` },
    { find: '        {/* Aviso de impacto */}',
      repl: `        {/* Fecha real — define en qué mes impacta la salida de plata */}
        <Input
          label="Fecha de la devolución *"
          type="date"
          value={fecha}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setFecha(e.target.value)}
        />

        {/* Comprobante del reintegro (queda en Cobranzas → Comprobantes) */}
        <AdjuntarComprobante
          metodo={formaPago === 'efectivo' ? 'transferencia' : formaPago}
          archivo={archivo}
          onChange={setArchivo}
        />

        {/* Aviso de impacto */}` },
  ],
})

// ── comprobantes.ts ─────────────────────────────────────────────────────────
P.push({
  files: ['src/lib/firestore/comprobantes.ts'],
  marker: 'Math.abs(Number(r.monto',
  ops: [
    { find: '      Number(r.monto ?? 0) > 0 &&',
      repl: '      Math.abs(Number(r.monto ?? 0)) > 0 &&   // incluye devoluciones (monto negativo)' },
  ],
})

// ── ComprobantesTab.tsx ─────────────────────────────────────────────────────
P.push({
  files: ['src/features/cobranzas/ComprobantesTab.tsx'],
  marker: "=== 'devolucion'",
  ops: [
    { find: '  const montoFaltante = faltan.reduce((a, r) => a + Number(r.monto ?? 0), 0)',
      repl: '  const montoFaltante = faltan.reduce((a, r) => a + Math.abs(Number(r.monto ?? 0)), 0)' },
    { find: '                    <td className="px-4 py-2.5 font-medium">{r.numeroRecibo}</td>',
      repl: `                    <td className="px-4 py-2.5 font-medium">
                      {r.numeroRecibo}
                      {(r.tipo === 'devolucion' || Number(r.monto ?? 0) < 0) && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                          devolución
                        </span>
                      )}
                    </td>` },
    { find: '                    <td className="px-2 py-2.5 text-right tabular-nums">{fmt(Number(r.monto ?? 0))}</td>',
      repl: `                    <td className={\`px-2 py-2.5 text-right tabular-nums \${Number(r.monto ?? 0) < 0 ? 'text-red-600' : ''}\`}>
                      {Number(r.monto ?? 0) < 0
                        ? \`−\${fmt(Math.abs(Number(r.monto ?? 0)))}\`
                        : fmt(Number(r.monto ?? 0))}
                    </td>` },
    { find: '                    <td className="px-2 py-2.5 text-right tabular-nums">{fmt(c.monto)}</td>',
      repl: `                    <td className={\`px-2 py-2.5 text-right tabular-nums \${c.monto < 0 ? 'text-red-600' : ''}\`}>
                      {c.monto < 0 ? \`−\${fmt(Math.abs(c.monto))}\` : fmt(c.monto)}
                    </td>` },
  ],
})

// ── BandejaRecibos.tsx ──────────────────────────────────────────────────────
P.push({
  files: ['src/features/cobranzas/BandejaRecibos.tsx'],
  marker: 'ModalDevolucion',
  ops: [
    { find: "import { Search, FileCheck, ArrowRight } from 'lucide-react'",
      repl: "import { Search, FileCheck, ArrowRight, RotateCcw } from 'lucide-react'" },
    { find: "import { useRecibos } from '@/hooks/useRecibos'",
      repl: `import { useRecibos } from '@/hooks/useRecibos'
import { usePermisos } from '@/hooks/usePermisos'
import ModalDevolucion from '@/components/shared/ModalDevolucion'` },
    { find: "  const [search, setSearch] = useState('')",
      repl: `  const [search, setSearch] = useState('')
  const { puede } = usePermisos()
  const [devolver, setDevolver] = useState<any | null>(null)` },
    { range: ['                <div className="col-span-2 text-right">', '                <div className="col-span-2 text-gray-600 capitalize truncate">'],
      repl: `                <div className="col-span-2 text-right">
                  {(() => {
                    const esDev = r.tipo === 'devolucion' || Number(r.monto ?? 0) < 0
                    return (
                      <>
                        <div className={\`font-semibold \${esDev ? 'text-red-600' : 'text-gray-900'}\`}>
                          {esDev
                            ? \`−\${formatPesos(Math.abs(Number(r.monto ?? 0)))}\`
                            : formatPesos(r.monto)}
                        </div>
                        <span className={\`text-[10px] rounded-full px-1.5 py-0.5 \${
                          esDev              ? 'bg-red-50 text-red-600'
                          : r.tipo === 'total' ? 'bg-green-50 text-green-700'
                          :                      'bg-amber-50 text-amber-700'
                        }\`}>
                          {esDev ? 'devolución' : r.tipo === 'total' ? 'total' : 'parcial'}
                        </span>
                      </>
                    )
                  })()}
                </div>
` },
    { range: ['                <div className="col-span-2 flex items-center justify-between gap-1 min-w-0">', '              </Link>'],
      repl: `                <div className="col-span-2 flex items-center justify-between gap-1 min-w-0">
                  <span className="text-gray-500 text-xs truncate">{r.emitidoPorNombre || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {puede('registrarDevoluciones')
                      && !!r.tramiteId
                      && r.tipo !== 'devolucion'
                      && Number(r.monto ?? 0) > 0 && (
                      <button
                        title="Registrar devolución de este cobro"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setDevolver(r) }}
                        className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <ArrowRight size={13} className="text-gray-300" />
                  </div>
                </div>
` },
    { find: '      </Card>\n    </>\n  )\n}',
      repl: `      </Card>

      <ModalDevolucion
        open={!!devolver}
        tramiteId={devolver?.tramiteId ?? ''}
        tramiteLabel={\`\${devolver?.numeroTramite ?? ''} · \${devolver?.patente ?? ''}\`}
        reciboOriginalId={devolver?.id}
        onClose={() => setDevolver(null)}
      />
    </>
  )
}` },
  ],
})

// ── CobranzasPage.tsx ───────────────────────────────────────────────────────
P.push({
  files: ['src/features/cobranzas/CobranzasPage.tsx'],
  marker: 'ModalDevolucion',
  ops: [
    { find: "import ConfirmDialog from '@/components/shared/ConfirmDialog'",
      repl: `import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ModalDevolucion from '@/components/shared/ModalDevolucion'` },
    { range: ['function FilaCobranza({', '  const antiguedad = badgeAntiguedad(item.diasDesdeEntrega)'],
      repl: `function FilaCobranza({
  item, onMarcarPago, onDesmarcar, onWhatsApp, onDevolver,
}: {
  item:          TramiteConCliente
  onMarcarPago:  (t: Tramite) => void
  onDesmarcar:   (id: string) => void
  onWhatsApp:    (t: TramiteConCliente) => void
  onDevolver?:   (t: TramiteConCliente) => void
}) {
` },
    { range: ['        ) : (\n          <button\n            onClick={() => onDesmarcar(item.id)}', '      </div>\n    </div>\n  )\n}'],
      repl: `        ) : (
          <>
            {onDevolver && (
              <button
                onClick={() => onDevolver(item)}
                aria-label="Registrar devolución"
                title="Registrar devolución — emite recibo negativo"
                className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center
                           justify-center hover:bg-red-100 transition-colors touch-xs"
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              onClick={() => onDesmarcar(item.id)}
              aria-label="Desmarcar pago"
              className="w-8 h-8 bg-gray-100 text-gray-400 rounded-lg flex items-center
                         justify-center hover:bg-gray-200 transition-colors touch-xs"
              title="Desmarcar como cobrado"
            >
              <RotateCcw size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}` },
    { find: '  const { clientes }                 = useClientes()',
      repl: `  const { clientes }                 = useClientes()
  const { puede }                    = usePermisos()` },
    { find: "import { usePaginacion }     from '@/hooks/usePaginacion'",
      repl: `import { usePaginacion }     from '@/hooks/usePaginacion'
import { usePermisos }       from '@/hooks/usePermisos'` },
    { find: '  const [confirmDesm,  setConfirmDesm]  = useState<string | null>(null)',
      repl: `  const [confirmDesm,  setConfirmDesm]  = useState<string | null>(null)
  const [devolucion,   setDevolucion]   = useState<TramiteConCliente | null>(null)` },
    { find: '                onWhatsApp={handleWhatsApp}',
      repl: `                onWhatsApp={handleWhatsApp}
                onDevolver={puede('registrarDevoluciones') ? setDevolucion : undefined}` },
    { find: '      <ConfirmDialog',
      repl: `      <ModalDevolucion
        open={!!devolucion}
        tramiteId={devolucion?.id ?? ''}
        tramiteLabel={\`\${devolucion?.numero ?? ''} · \${devolucion?.patente ?? ''}\`}
        onClose={() => setDevolucion(null)}
      />

      <ConfirmDialog` },
  ],
})

// ── GestorMultaWorkflow.tsx ─────────────────────────────────────────────────
P.push({
  files: ['src/components/GestorMultaWorkflow.tsx'],
  marker: 'ModalDevolucion',
  ops: [
    { find: "import ModalAlertaDocumentacion from '@/components/multas/ModalAlertaDocumentacion'",
      repl: `import ModalAlertaDocumentacion from '@/components/multas/ModalAlertaDocumentacion'
import ModalDevolucion from '@/components/shared/ModalDevolucion'` },
    { find: '  const [alertaDocsOpen, setAlertaDocsOpen] = useState(false)',
      repl: `  const [alertaDocsOpen, setAlertaDocsOpen] = useState(false)
  const [devolucionOpen, setDevolucionOpen] = useState(false)` },
    { find: `                <PlusCircle size={12} /> Registrar pago
              </button>`,
      repl: `                <PlusCircle size={12} /> Registrar pago
              </button>
              {puede('registrarDevoluciones') && (workflow.paso2?.montoTotal ?? 0) > 0 && (
                <button
                  onClick={() => setDevolucionOpen(true)}
                  title="Registrar devolución al cliente"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-colors"
                >
                  <RotateCcw size={12} /> Devolución
                </button>
              )}` },
    { find: `        onClose={() => setAlertaDocsOpen(false)}
      />`,
      repl: `        onClose={() => setAlertaDocsOpen(false)}
      />

      <ModalDevolucion
        open={devolucionOpen}
        tramiteId={tramiteId}
        tramiteLabel={\`\${tramite?.numero ?? ''} · \${workflow.paso1?.patente ?? tramite?.patente ?? ''}\`}
        onClose={() => setDevolucionOpen(false)}
      />` },
  ],
})

// ── TramiteDetallePage.tsx ──────────────────────────────────────────────────
P.push({
  files: ['src/features/tramites/TramiteDetallePage.tsx'],
  marker: 'getDevolucionesPorTramite',
  ops: [
    { find: "import { chequearDevolucion } from '@/lib/firestore/devoluciones'",
      repl: "import { chequearDevolucion, getDevolucionesPorTramite } from '@/lib/firestore/devoluciones'" },
    { find: '  const [montoDisponibleDevolucion, setMontoDisponibleDevolucion] = useState(0)',
      repl: `  const [montoDisponibleDevolucion, setMontoDisponibleDevolucion] = useState(0)
  const [devoluciones, setDevoluciones] = useState<any[]>([])` },
    { find: `      const chequeo = await chequearDevolucion(id, 0, '')
      setMontoDisponibleDevolucion(chequeo.disponible)`,
      repl: `      const chequeo = await chequearDevolucion(id, 0, '')
      setMontoDisponibleDevolucion(chequeo.disponible)
      setDevoluciones(await getDevolucionesPorTramite(id).catch(() => []))` },
    { find: '      {/* Cliente y Vehículo */}',
      repl: `      {/* Devoluciones al cliente — recibos negativos del trámite */}
      {devoluciones.length > 0 && (
        <Card className="p-5 border-l-4 border-l-red-400">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw size={14} className="text-red-500" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Devoluciones al cliente ({devoluciones.length})
            </p>
          </div>
          <div className="space-y-2">
            {devoluciones.map(d => (
              <div key={d.id}
                className="flex items-start justify-between gap-3 bg-red-50/50 border border-red-100 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {d.numeroRecibo} · {formatFecha(d.fechaCobro ?? d.creadoEn)}
                  </p>
                  <p className="text-xs text-gray-500 whitespace-pre-line">{d.notas}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Devolvió {d.devueltoPorNombre ?? d.emitidoPorNombre} · {d.formaPago}
                    {d.tieneComprobante ? ' · comprobante adjunto' : ' · sin comprobante'}
                  </p>
                </div>
                <span className="text-sm font-bold text-red-600 shrink-0">
                  −{formatPesos(Math.abs(Number(d.monto ?? 0)))}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cliente y Vehículo */}` },
  ],
})

// ═══ MOTOR ═══════════════════════════════════════════════════════════════════
const contar = (s, sub) => s.split(sub).length - 1
const resultados = []
let errores = 0

for (const p of P) {
  const file = p.files.find(f => fs.existsSync(f))
  if (!file) { console.error(`✗ No existe ninguno de: ${p.files.join(' | ')}`); errores++; continue }
  const raw  = fs.readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')
  if (s.includes(p.marker)) { console.log(`• ${file}: ya parcheado — se saltea`); continue }

  let ok = true
  for (const [i, op] of p.ops.entries()) {
    const tag = `${file} — op #${i + 1}`
    if (op.range) {
      const [ini, fin] = op.range
      const n = contar(s, ini)
      if (n !== 1) { console.error(`✗ ${tag}: inicio de rango aparece ${n} veces: ${ini.split('\n')[0].trim()}`); ok = false; break }
      const a = s.indexOf(ini)
      const b = s.indexOf(fin, a + ini.length)
      if (b < 0) { console.error(`✗ ${tag}: fin de rango no encontrado: ${fin.split('\n')[0].trim()}`); ok = false; break }
      s = s.slice(0, a) + op.repl + s.slice(b)
      continue
    }
    const n = contar(s, op.find)
    const esperado = op.all ?? 1
    if (n !== esperado) {
      console.error(`✗ ${tag}: ancla aparece ${n} veces (se esperaba ${esperado}): ${op.find.split('\n')[0].trim()}`)
      ok = false; break
    }
    s = s.split(op.find).join(op.repl)
  }
  if (!ok) { errores++; continue }
  resultados.push({ file, out: crlf ? s.replace(/\n/g, '\r\n') : s })
  console.log(`✓ ${file}: ${p.ops.length} cambios listos`)
}

if (errores) { console.error(`\n${errores} archivo(s) con error. No se escribió NINGÚN archivo.`); process.exit(1) }
if (!APPLY)  { console.log('\nDry-run OK. Corré con --apply para escribir.'); process.exit(0) }
for (const r of resultados) fs.writeFileSync(r.file, r.out, 'utf8')
console.log(`\n✔ ${resultados.length} archivo(s) escritos.`)
