// Genera la demo estática para GitHub Pages a partir del frontend real.
// Uso: node tools/build-pages.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'pages');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(PAGES, { recursive: true, force: true });
fs.mkdirSync(path.join(PAGES, 'manual'), { recursive: true });

copy(path.join(ROOT, 'public', 'styles.css'), path.join(PAGES, 'styles.css'));
copy(path.join(ROOT, 'public', 'app.js'), path.join(PAGES, 'app.js'));
copy(path.join(ROOT, 'server', 'sim.js'), path.join(PAGES, 'sim.js'));
copy(path.join(ROOT, 'server', 'data.js'), path.join(PAGES, 'data.js'));
copy(path.join(ROOT, 'server', 'network.js'), path.join(PAGES, 'network.js'));
copy(path.join(ROOT, 'tools', 'pages-src', 'mock-api.js'), path.join(PAGES, 'mock-api.js'));

for (const file of ['leaflet.js', 'leaflet.css']) {
  copy(path.join(ROOT, 'public', 'vendor', file), path.join(PAGES, 'vendor', file));
}

const manual = path.join(ROOT, 'docs', 'Manual-Instalacion-a-Bordo.pdf');
if (fs.existsSync(manual)) {
  copy(manual, path.join(PAGES, 'manual', 'Manual-Instalacion-a-Bordo.pdf'));
}

fs.writeFileSync(
  path.join(PAGES, 'main.js'),
  "// Demo estática: mock de API + aplicación real\nimport './mock-api.js';\nimport './app.js';\n",
);

let html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
html = html.replace(
  '<script type="module" src="app.js"></script>',
  '<script type="module" src="main.js"></script>',
);
html = html.replace(
  '<title>Centro de Control de Flota · Quito</title>',
  '<title>Centro de Control de Flota · Quito — Demo</title>',
);
html = html.replace(
  '</head>',
  '  <meta name="description" content="Demo estática del centro de control de flota de Quito: mapa, cámaras simuladas, alertas, paradas e histórico." />\n</head>',
);

const banner = `
  <div style="position:fixed;top:12px;right:12px;z-index:110;max-width:280px;padding:8px 11px;border-radius:9px;border:1px solid #2a4057;background:rgba(8,14,24,0.92);color:#c8d7e8;font:11px/1.5 system-ui,Segoe UI,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,0.45);backdrop-filter:blur(6px)">
    <b style="color:#ffc966">Demo estática</b> · sin backend<br>
    <span style="color:#8095ab">datos simulados en tu navegador</span><br>
    <a href="manual/Manual-Instalacion-a-Bordo.pdf" target="_blank" rel="noopener" style="color:#ffc966;text-decoration:none">Manual de instalación (PDF) →</a>
  </div>`;
html = html.replace('</body>', `${banner}\n</body>`);

fs.writeFileSync(path.join(PAGES, 'index.html'), html);
fs.writeFileSync(path.join(PAGES, '.nojekyll'), '');

console.log('Demo generada en', PAGES);
for (const f of fs.readdirSync(PAGES)) console.log('  -', f);
