// Servidor HTTP: API REST + SSE + autenticación por sesión + archivos estáticos.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSES, HUBS, ROUTES } from './data.js';
import { openDatabase, verifyPassword } from './db.js';
import { Simulator } from './sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_HOURS = 8;
const OPERATE_ROLES = new Set(['operador', 'supervisor']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let repo;
let sim;

const routeById = new Map(ROUTES.map((r) => [r.id, r]));
const busById = new Map(BUSES.map((b) => [b.id, b]));

function sendJSON(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function sessionCookie(id, maxAgeSec) {
  return `sid=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function clearCookie() {
  return 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

async function currentUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return null;
  return repo.getSessionUser(sid);
}

// Límite simple de intentos de login por IP
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) return false;
  return rec.count >= 6;
}
function registerFailure(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
  else rec.count += 1;
}

function enrichAlert(a) {
  const bus = busById.get(a.busId);
  const route = routeById.get(a.routeId);
  return {
    ...a,
    plate: a.plate || bus?.plate || null,
    routeCode: a.routeCode || route?.code || null,
    clip: a.clip ?? (a.severity === 'alta' ? { duration: 30, channels: 4 } : null),
  };
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    sendJSON(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch {
    sendJSON(res, 404, { error: 'not found' });
  }
}

function sseHandler(req, res, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const write = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* desconectado */
    }
  };
  write('state', sim.getState());

  const unsubscribe = sim.onTick((type, payload) => {
    if (type === 'tick') write('tick', payload);
    else if (type === 'alert') write('alert', payload);
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 20000);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    void user;
  });
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  // ── públicos ───────────────────────────────────────────────
  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      ok: true,
      service: 'control-buses-quito',
      db: 'pglite',
      uptimeSec: Math.round(process.uptime()),
      buses: sim.buses.length,
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'local';
    if (tooManyAttempts(ip)) {
      return sendJSON(res, 429, { error: 'Demasiados intentos. Espera 5 minutos.' });
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJSON(res, 400, { error: 'Solicitud inválida' });
    }
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = username ? await repo.findUser(username) : null;
    if (!user || !verifyPassword(password, user.password_hash)) {
      registerFailure(ip);
      return sendJSON(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }
    loginAttempts.delete(ip);
    const sid = await repo.createSession(user.id, SESSION_HOURS);
    return sendJSON(res, 200, {
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    }, { 'Set-Cookie': sessionCookie(sid, SESSION_HOURS * 3600) });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) await repo.deleteSession(sid);
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }

  // ── a partir de aquí se requiere sesión ────────────────────
  const user = await currentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'No autenticado' });

  if (pathname === '/api/auth/me') {
    return sendJSON(res, 200, { user });
  }

  if (pathname === '/api/network' && method === 'GET') {
    return sendJSON(res, 200, sim.getNetwork());
  }

  if (pathname === '/api/state' && method === 'GET') {
    return sendJSON(res, 200, sim.getState());
  }

  if (pathname === '/api/reports' && method === 'GET') {
    return sendJSON(res, 200, sim.getReports());
  }

  if (pathname === '/api/stops' && method === 'GET') {
    const rows = await repo.getStopStats(24);
    const stops = rows.map((s) => {
      const route = routeById.get(s.routeId);
      const stopDef = route?.stops.find((st) => st.name === s.name);
      return {
        ...s,
        routeCode: route?.code || s.routeId,
        routeName: route?.name || '',
        color: route?.color || '#64748b',
        hubId: stopDef?.hub || null,
        hubName: stopDef?.hub ? HUBS[stopDef.hub]?.name || null : null,
        total: s.boardings + s.transfers,
      };
    });
    return sendJSON(res, 200, {
      ts: new Date().toISOString(),
      stops,
      totals: {
        stops: stops.length,
        boardings: stops.reduce((a, s) => a + s.boardings, 0),
        transfers: stops.reduce((a, s) => a + s.transfers, 0),
        alightings: stops.reduce((a, s) => a + s.alightings, 0),
        total: stops.reduce((a, s) => a + s.total, 0),
      },
    });
  }

  if (pathname === '/api/history' && method === 'GET') {
    const days = Math.max(7, Math.min(60, Number(url.searchParams.get('days')) || 30));
    const daily = await repo.getDaily(days);
    return sendJSON(res, 200, {
      ts: new Date().toISOString(),
      days,
      daily,
      hourly: sim.getHourly(),
      today: sim.todayStats,
      hubs: Object.entries(HUBS).map(([id, h]) => ({ id, name: h.name, routes: h.routes })),
    });
  }

  if (pathname === '/api/stream' && method === 'GET') {
    return sseHandler(req, res, user);
  }

  const ack = pathname.match(/^\/api\/alerts\/([^/]+)\/ack$/);
  if (ack && method === 'POST') {
    if (!OPERATE_ROLES.has(user.role)) {
      return sendJSON(res, 403, { error: 'Tu rol no puede atender alertas' });
    }
    const alert = sim.ackAlert(decodeURIComponent(ack[1]), user.name);
    if (!alert) return sendJSON(res, 404, { error: 'alerta no encontrada' });
    return sendJSON(res, 200, alert);
  }

  const panic = pathname.match(/^\/api\/buses\/([^/]+)\/panic$/);
  if (panic && method === 'POST') {
    if (user.role !== 'supervisor') {
      return sendJSON(res, 403, { error: 'Solo un supervisor puede simular un pánico' });
    }
    await readBody(req).catch(() => '');
    const alert = sim.panic(decodeURIComponent(panic[1]));
    if (!alert) return sendJSON(res, 404, { error: 'bus no encontrado' });
    return sendJSON(res, 201, alert);
  }

  return sendJSON(res, 404, { error: 'endpoint no existe' });
}

async function main() {
  repo = await openDatabase();
  await repo.seedCatalog(ROUTES, BUSES);
  await repo.seedDailyHistory(45);
  await repo.seedStopEvents(ROUTES);
  const today = await repo.getOrCreateToday();
  const dbAlerts = (await repo.listAlerts(40)).map(enrichAlert);

  sim = new Simulator({
    persist: {
      alert: (a) => repo.insertAlert(a),
      ack: (id, user) => repo.ackAlert(id, user),
      stopEvents: (batch) => repo.insertStopEvents(batch),
      daily: (d) => repo.upsertToday(d),
    },
    alerts: dbAlerts,
    today,
    seedDemo: dbAlerts.length === 0,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return await serveStatic(req, res, pathname);
    } catch (err) {
      console.error('[server] error', err);
      if (!res.headersSent) sendJSON(res, 500, { error: 'error interno' });
      else res.end();
    }
  });

  server.listen(PORT, HOST, () => {
    console.log('\n  Centro de Control de Flota — Quito');
    console.log(`  http://${HOST}:${PORT}`);
    console.log(`  ${sim.buses.length} buses · ${sim.routes.length} rutas · PostgreSQL embebido (PGlite)`);
    console.log('  Roles: operador · supervisor · gerencia');
    console.log('  (Ctrl+C para detener)\n');
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log('\n  Cerrando…');
    clearInterval(sim.timer);
    sim.flushStopEvents();
    if (sim.persist) {
      await sim.persist.daily({
        boardings: sim.todayStats.boardings,
        alerts: sim.todayStats.alerts,
        transfers: sim.todayStats.transfers,
        compliance: sim.getKPIs(sim.buses).compliance,
      }).catch(() => {});
    }
    setTimeout(async () => {
      try {
        await repo.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    }, 600);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
