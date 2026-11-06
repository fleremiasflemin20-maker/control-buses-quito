// Cambia la contraseña del usuario admin.
// Uso (con el servidor detenido):
//   node tools/set-admin-password.mjs "nueva-clave-larga"

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { hashPassword } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '..', 'data', 'pgdata');
const password = process.argv[2];

if (!password || password.length < 8) {
  console.error('Uso: node tools/set-admin-password.mjs "nueva-clave" (mínimo 8 caracteres)');
  process.exit(1);
}

const db = new PGlite(DB_DIR);
const res = await db.query(
  "UPDATE users SET password_hash = $1 WHERE username = 'admin' RETURNING id",
  [hashPassword(password)],
);

if (!res.rows.length) {
  console.error('No existe el usuario admin. Arranca el servidor una vez para crearlo.');
} else {
  console.log('Contraseña del usuario admin actualizada.');
}
await db.close();
