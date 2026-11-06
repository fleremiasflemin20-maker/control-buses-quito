// Borra la base embebida (PGlite) para reiniciar la demo desde cero.
// Uso: npm run db:reset   (con el servidor detenido)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '..', 'data', 'pgdata');

if (!fs.existsSync(dir)) {
  console.log('No hay base de datos para borrar.');
  process.exit(0);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('Base eliminada:', dir);
console.log('Se recreará con usuarios, rutas y datos de ejemplo al iniciar el servidor.');
