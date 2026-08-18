// scripts/diagnosticar-desalineacion.mjs
import XLSX from 'xlsx';

const [,, ruta = './Cinemometros-2025.xlsx'] = process.argv;
const wb = XLSX.readFile(ruta);
const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });

const sospechosos = ['TS-control_X_042', 'w', '17/10/204'];
let encontradas = 0;

for (let i = 0; i < filas.length; i++) {
  const fila = filas[i];
  const textoCompleto = fila.join(' | ');
  if (sospechosos.some((s) => textoCompleto.includes(s))) {
    console.log(`\n=== Fila ${i} ===`);
    fila.forEach((c, idx) => {
      if (c && c !== '') console.log(`  [${idx}] ${c}`);
    });
    encontradas++;
    if (encontradas >= 10) {
      console.log('\n... (mostrando solo las primeras 10)');
      break;
    }
  }
}

if (encontradas === 0) {
  console.log('No se encontraron filas con los sospechosos.');
}