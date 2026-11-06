// Extrae la red de buses de Quito desde OpenStreetMap (extracto de Ecuador)
// y genera server/network.js para el simulador y el mapa.
//
// Datos: © OpenStreetMap contributors · ODbL 1.0
// Uso:
//   node tools/fetch-network.mjs --pbf data/osm/ecuador.osm.pbf [--stats]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parse from 'osm-pbf-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const pbfArg = args.includes('--pbf') ? args[args.indexOf('--pbf') + 1] : null;
const PBF = pbfArg || path.join(ROOT, 'data', 'osm', 'ecuador.osm.pbf');
const STATS_ONLY = args.includes('--stats');
const MAX_ROUTES = Number(args.includes('--max') ? args[args.indexOf('--max') + 1] : 250);

const bbox = { minLat: -0.36, maxLat: -0.02, minLng: -78.66, maxLng: -78.28 };

const HUBS = {
  H1: { name: 'La Carolina', lat: -0.1830, lng: -78.4835 },
  H2: { name: 'Centro (La Marín)', lat: -0.2220, lng: -78.5100 },
  H3: { name: 'El Recreo', lat: -0.2380, lng: -78.5155 },
  H4: { name: 'Terminal Quitumbe', lat: -0.2900, lng: -78.5520 },
  H5: { name: 'La Ofelia', lat: -0.1170, lng: -78.4930 },
  H6: { name: 'Cumbayá', lat: -0.1930, lng: -78.4340 },
};

const PALETTE = [
  '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb923c',
  '#22d3ee', '#c084fc', '#f87171', '#4ade80', '#facc15', '#2dd4bf',
  '#60a5fa', '#e879f9', '#fca5a5', '#86efac',
];

const rad = (d) => (d * Math.PI) / 180;
function distM(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function pathLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distM(coords[i - 1], coords[i]);
  return total;
}

function simplify(coords, tolerance = 8) {
  if (coords.length <= 4) return coords;
  let maxD = 0;
  let index = 0;
  const first = coords[0];
  const last = coords[coords.length - 1];
  for (let i = 1; i < coords.length - 1; i++) {
    const d = pointSegmentDistance(coords[i], first, last);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD > tolerance) {
    const left = simplify(coords.slice(0, index + 1), tolerance);
    const right = simplify(coords.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointSegmentDistance(p, a, b) {
  const k = Math.cos(rad((a[0] + b[0]) / 2)) * 111320;
  const ax = 0;
  const ay = 0;
  const bx = (b[1] - a[1]) * k;
  const by = (b[0] - a[0]) * 111320;
  const px = (p[1] - a[1]) * k;
  const py = (p[0] - a[0]) * 111320;
  const len2 = bx * bx + by * by;
  let t = len2 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - bx * t;
  const dy = py - by * t;
  return Math.hypot(dx, dy);
}

function sampleStops(shape, every = 750) {
  const stops = [];
  let acc = 0;
  let next = every;
  for (let i = 1; i < shape.length; i++) {
    const d = distM(shape[i - 1], shape[i]);
    acc += d;
    while (acc >= next) {
      stops.push({ name: `Parada ${stops.length + 1}`, lat: shape[i][0], lng: shape[i][1] });
      next += every;
    }
  }
  return stops;
}

function nearestHub(lat, lng) {
  for (const [id, hub] of Object.entries(HUBS)) {
    if (distM([lat, lng], [hub.lat, hub.lng]) < 180) return id;
  }
  return null;
}

// ── leer PBF ────────────────────────────────────────────────────────────

const nodes = new Map();
const nodeNames = new Map();
const ways = new Map();
const relations = [];

const parser = parse();
fs.createReadStream(PBF).pipe(parser);
parser.on('data', (items) => {
  for (const it of items) {
    if (it.type === 'node') {
      if (it.lat >= bbox.minLat && it.lat <= bbox.maxLat && it.lon >= bbox.minLng && it.lon <= bbox.maxLng) {
        nodes.set(it.id, [it.lat, it.lon]);
        if (it.tags?.name) nodeNames.set(it.id, it.tags.name);
      }
    } else if (it.type === 'way') {
      if (it.refs?.some((r) => nodes.has(r))) ways.set(it.id, it.refs);
    } else if (it.type === 'relation') {
      if (it.tags?.route === 'bus') relations.push({ id: it.id, tags: it.tags, members: it.members || [] });
    }
  }
});

parser.on('end', () => {
  console.log(`OSM: ${nodes.size} nodos, ${ways.size} vías, ${relations.length} relaciones de bus`);

  const candidates = [];
  for (const rel of relations) {
    const wayMembers = rel.members.filter((m) => m.type === 'way' && ways.has(m.id));
    if (!wayMembers.length) continue;

    const segments = [];
    for (const m of wayMembers) {
      const refs = ways.get(m.id);
      if (!refs) continue;
      const coords = refs.map((r) => nodes.get(r)).filter(Boolean);
      if (coords.length < 2) continue;
      segments.push(m.role === 'backward' ? coords.slice().reverse() : coords);
    }
    if (!segments.length) continue;

    const shape = segments[0].slice();
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const end = shape[shape.length - 1];
      const reverse = distM(end, seg[seg.length - 1]) < distM(end, seg[0]);
      const seq = reverse ? seg.slice().reverse() : seg;
      let j = 0;
      while (j < seq.length && distM(shape[shape.length - 1], seq[j]) < 1) j++;
      shape.push(...seq.slice(j));
    }
    if (shape.length < 2) continue;

    const length = pathLength(shape);
    if (length < 1500 || length > 60000) continue;

    const stopNodes = rel.members
      .filter((m) => m.type === 'node' && ['stop', 'platform', 'stop_entry_only', 'stop_exit_only'].includes(m.role))
      .map((m) => ({ id: m.id, coord: nodes.get(m.id), name: nodeNames.get(m.id) }))
      .filter((s) => s.coord);

    const stops = stopNodes.map((s) => ({
      name: s.name || 'Parada',
      lat: s.coord[0],
      lng: s.coord[1],
      hub: nearestHub(s.coord[0], s.coord[1]),
    }));

    const ref = (rel.tags.ref || rel.tags.route_ref || rel.tags.name || 'SIN-REF').trim();
    const name = (rel.tags.name || [rel.tags.from, rel.tags.to].filter(Boolean).join(' → ') || ref).trim();
    candidates.push({
      ref,
      name,
      length,
      shape,
      stops,
      colour: rel.tags.colour,
      network: rel.tags.network || '',
      operator: rel.tags.operator || '',
      score: stops.length * 120 + length / 1000,
    });
  }

  // deduplicar: una geometría por código de ruta; si el código es genérico,
  // separar por nombre para no mezclar servicios distintos.
  const byKey = new Map();
  const keyOf = (c) => {
    const ref = c.ref.toUpperCase().trim();
    const generic = ref.length > 14 || ref === 'SIN-REF' || /^(METROBUS-Q|RUTA DE INTEGRACI|TROLEBUS|METROBUS)$/.test(ref);
    return generic ? `${ref}|${c.name.toUpperCase()}` : ref;
  };
  for (const c of candidates) {
    const key = keyOf(c);
    const prev = byKey.get(key);
    if (!prev || c.score > prev.score) byKey.set(key, c);
  }
  let routes = [...byKey.values()].sort((a, b) => b.score - a.score);

  const totalCandidates = routes.length;
  if (routes.length > MAX_ROUTES) routes = routes.slice(0, MAX_ROUTES);

  console.log(`rutas únicas: ${totalCandidates} · seleccionadas: ${routes.length}`);

  // preparar rutas y buses
  const usedColors = new Map();
  const buses = [];
  let busSeq = 0;
  const drivers = [
    'Luis Chuquimarca', 'María Toapanta', 'Jorge Vinueza', 'Ana Cedeño', 'Patricio Guaman',
    'Rosa Chicaiza', 'Diego Andrade', 'Silvia Bonilla', 'Marco Paredes', 'Elena Yánez',
    'Wilson Tipán', 'Gloria Simbaña', 'Fausto Reinoso', 'Verónica Salazar', 'Byron Catagña',
    'Narcisa Vega', 'Hugo Condor', 'Karina Morocho', 'Segundo Lema', 'Paola Jarrín',
  ];

  const outRoutes = routes.map((r, idx) => {
    const id = `R${idx + 1}`;
    const shape = simplify(r.shape, 9).map(([lat, lng]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
    let stops = r.stops;
    if (stops.length > 25) {
      const step = stops.length / 25;
      stops = Array.from({ length: 25 }, (_, i) => stops[Math.floor(i * step)]);
    } else if (stops.length < 4) {
      stops = sampleStops(shape, Math.max(500, pathLength(shape) / 6));
    }
    const seen = new Set();
    stops = stops.filter((s) => {
      const k = `${s.lat.toFixed(5)}|${s.lng.toFixed(5)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const color = /^#[0-9a-f]{6}$/i.test(r.colour || '')
      ? r.colour
      : PALETTE[usedColors.size % PALETTE.length];
    usedColors.set(id, color);

    const lengthKm = pathLength(shape) / 1000;
    const busCount = 1;
    const cycleMin = (lengthKm / 20) * 60 * 2;
    const headway = Math.max(3, Math.round((cycleMin / busCount) * 10) / 10);

    for (let i = 0; i < busCount; i++) {
      busSeq += 1;
      buses.push({
        id: `BUS-${String(busSeq).padStart(3, '0')}`,
        plate: `P${String.fromCharCode(65 + (busSeq % 6))}${String.fromCharCode(65 + ((busSeq * 3) % 6))}${String.fromCharCode(65 + ((busSeq * 7) % 6))}-${String(1000 + busSeq * 37).slice(-4)}`,
        routeId: id,
        driver: drivers[(busSeq - 1) % drivers.length],
        capacity: /trole|metro|ecov/i.test(r.name) ? 90 : 70,
        model: busSeq % 3 === 0 ? 'Hino AK1J' : busSeq % 3 === 1 ? 'Chevrolet FRR' : 'JAC HK6800',
        year: 2015 + (busSeq % 9),
        cameras: 4,
      });
    }

    return {
      id,
      code: r.ref.slice(0, 16),
      name: r.name.slice(0, 70),
      color,
      headwayMin: Math.round(headway),
      operator: r.operator.slice(0, 60),
      network: r.network.slice(0, 40),
      shape,
      stops,
    };
  });

  // hubs con las rutas que pasan por ellos
  const hubRoutes = {};
  for (const [hubId, hub] of Object.entries(HUBS)) {
    hubRoutes[hubId] = {
      name: hub.name,
      routes: outRoutes.filter((r) => r.stops.some((s) => s.hub === hubId)).map((r) => r.id),
    };
  }

  const bounds = outRoutes.reduce(
    (b, r) => {
      for (const [lat, lng] of r.shape) {
        b.minLat = Math.min(b.minLat, lat);
        b.maxLat = Math.max(b.maxLat, lat);
        b.minLng = Math.min(b.minLng, lng);
        b.maxLng = Math.max(b.maxLng, lng);
      }
      return b;
    },
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
  );

  console.log(`buses: ${buses.length} · paradas totales: ${outRoutes.reduce((a, r) => a + r.stops.length, 0)}`);
  console.log(`longitud total de red: ${(outRoutes.reduce((a, r) => a + pathLength(r.shape), 0) / 1000).toFixed(0)} km`);

  if (STATS_ONLY) {
    console.log('Top rutas:');
    for (const r of outRoutes.slice(0, 12)) {
      console.log(` ${r.code.padEnd(12)} ${r.name.slice(0, 45).padEnd(46)} ${(pathLength(r.shape) / 1000).toFixed(1)} km · ${r.stops.length} paradas`);
    }
    return;
  }

  const js = `// GENERADO AUTOMÁTICAMENTE por tools/fetch-network.mjs
// Fuente: OpenStreetMap (extracto de Ecuador, ${new Date().toISOString().slice(0, 10)})
// © OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright
// No editar a mano: volver a ejecutar el generador.

export const NETWORK_META = ${JSON.stringify({
    source: 'OpenStreetMap',
    license: 'ODbL-1.0',
    generatedAt: new Date().toISOString(),
    routes: outRoutes.length,
    buses: buses.length,
    stops: outRoutes.reduce((a, r) => a + r.stops.length, 0),
    bounds,
  }, null, 2)};

export const HUBS = ${JSON.stringify(hubRoutes, null, 2)};

export const ROUTES = ${JSON.stringify(outRoutes)};

export const BUSES = ${JSON.stringify(buses)};
`;

  const outFile = path.join(ROOT, 'server', 'network.js');
  fs.writeFileSync(outFile, js);
  console.log('escrito', outFile, `${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
});

parser.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
