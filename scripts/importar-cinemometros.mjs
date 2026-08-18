// F1 — Importa el listado INTI de cinemómetros (XLSX) a Firestore `cinemometros`.
// Uso:  node scripts/importar-cinemometros.mjs [ruta.xlsx] [--write]
// Dry-run por defecto: con --write recién escribe. Lógica espejo de src/lib/cinemometros.ts.
import { createRequire } from 'module';
import XLSX from 'xlsx';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const [,, ruta = './Cinemometros-2025.xlsx', ...flags] = process.argv;
const escribir = flags.includes('--write');

const normalizar = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const clavesDe = (celda) => [...new Set((celda || '').split(/\s*\/\s*/).map(normalizar).filter((k) => k.length >= 4))];

function parseFecha(raw) {
  const original = (raw || '').trim();
  const base = { iso: null, primitiva: false, ambigua: false, original };
  if (!original) return base;
  if (/primitiva/i.test(original)) return { ...base, primitiva: true };
  const m = original.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return base;
  const a = +m[1], b = +m[2];
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (a < 1 || b < 1 || a > 31 || b > 31 || (a > 12 && b > 12)) return base;
  let d = a, mo = b, ambigua = false;
  if (a <= 12 && b > 12) { d = b; mo = a; }        // era MM/DD
  else if (a <= 12 && b <= 12) ambigua = true;     // asume DD/MM
  return { iso: `${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, ambigua, primitiva: false, original };
}

const wb = XLSX.readFile(ruta);
const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });

const mapa = new Map();
let leidas = 0, salteadas = 0;
const noParseables = new Set();

for (const r of filas) {
  const marca = String(r[0] || '').trim();
  if (!marca || marca === '-' || marca.startsWith('Tenga presente')) { salteadas++; continue; }
  const claves = clavesDe(String(r[2]));
  if (!claves.length) { salteadas++; continue; }
  leidas++;
  const verif = parseFecha(String(r[5]));
  if (!verif.iso && !verif.primitiva) noParseables.add(verif.original || '(vacía)');
  const lugar = String(r[4] || '').trim();
  for (const key of claves) {
    const acc = mapa.get(key) ?? {
      id: key, marca, modelo: String(r[1] || '').trim(), serieOriginal: String(r[2] || '').trim(),
      serieVariants: [], codAprobacion: String(r[3] || '').trim(), tipo: String(r[6] || '').trim(),
      lugar: lugar === 'No aplica' ? '' : lugar, verificaciones: [],
      fuente: 'INTI-2025-xlsx', actualizadoEl: new Date().toISOString(),
    };
    acc.serieVariants = [...new Set([...acc.serieVariants, ...claves])];
    if (!acc.verificaciones.some((v) => v.original === verif.original)) acc.verificaciones.push(verif);
    mapa.set(key, acc);
  }
}

for (const acc of mapa.values()) {
  acc.verificaciones.sort((x, y) => (x.iso && y.iso ? (x.iso < y.iso ? -1 : 1) : x.iso ? -1 : 1));
}

const ambiguas = [...mapa.values()].flatMap((c) => c.verificaciones).filter((v) => v.ambigua).length;
console.log(`Filas leídas: ${leidas} | salteadas: ${salteadas}`);
console.log(`Equipos (docs): ${mapa.size}`);
console.log(`Fechas ambiguas (DD/MM vs MM/DD): ${ambiguas}`);
console.log(`No parseables: ${[...noParseables].join(', ') || 'ninguna'}`);

if (!escribir) {
  console.log('\nDry-run: nada escrito en Firestore. Repetir con --write para importar.');
  process.exit(0);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require('../serviceAccount.json')) });
}
const db = admin.firestore();
const docs = [...mapa.values()];
for (let i = 0; i < docs.length; i += 400) {
  const batch = db.batch();
  for (const c of docs.slice(i, i + 400)) batch.set(db.collection('cinemometros').doc(c.id), c);
  await batch.commit();
  console.log(`Batch ${i / 400 + 1} OK`);
}
console.log(`Importados ${docs.length} docs en \`cinemometros\`.`);