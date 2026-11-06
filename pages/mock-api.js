// Adaptador para la demo estática de GitHub Pages.
// Intercepta /api/* y el stream SSE para que el mismo frontend funcione
// sin backend, con el simulador corriendo en el navegador.

import { Simulator } from './sim.js';
import { HUBS, ROUTES } from './data.js';

const SESSION_KEY = 'flota_demo_user';
const sim = new Simulator({ seedDemo: true });

const USERS = {
  operador: { password: 'operador123', name: 'Carlos Mera', role: 'operador' },
  supervisor: { password: 'supervisor123', name: 'Andrea Salcedo', role: 'supervisor' },
  gerencia: { password: 'gerencia123', name: 'Patricio Almeida', role: 'gerencia' },
};

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function dailySeries(days) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6 ? 0.72 : 1;
    const seasonal = 1 + 0.08 * Math.sin(i / 4.2) + 0.04 * Math.sin(i / 1.7);
    const boardings = Math.round(10200 * weekend * seasonal);
    const alerts = Math.round((28 + 14 * Math.abs(Math.sin(i / 2.3))) * weekend);
    const transfers = Math.round(boardings * (0.17 + 0.02 * Math.sin(i / 3)));
    const compliance = Math.round((96.4 + 2.2 * Math.sin(i / 3.1)) * 100) / 100;
    out.push({ day: key, boardings, alerts, transfers, compliance });
  }
  return out;
}

let stopCache = null;
function stopStats() {
  if (stopCache) return stopCache;
  const rows = [];
  for (const r of ROUTES) {
    for (const s of r.stops) {
      const h = hash(r.id + s.name);
      const boardings = 40 + (h % 240);
      const alightings = 30 + ((h >> 3) % 190);
      const transfers = s.hub ? 12 + ((h >> 5) % 55) : 0;
      rows.push({
        routeId: r.id,
        routeCode: r.code,
        routeName: r.name,
        color: r.color,
        name: s.name,
        hubId: s.hub || null,
        hubName: s.hub ? HUBS[s.hub]?.name || null : null,
        boardings,
        alightings,
        transfers,
        total: boardings + transfers,
      });
    }
  }
  rows.sort((a, b) => b.total - a.total);
  stopCache = {
    ts: new Date().toISOString(),
    stops: rows,
    totals: {
      stops: rows.length,
      boardings: rows.reduce((a, s) => a + s.boardings, 0),
      alightings: rows.reduce((a, s) => a + s.alightings, 0),
      transfers: rows.reduce((a, s) => a + s.transfers, 0),
      total: rows.reduce((a, s) => a + s.total, 0),
    },
  };
  return stopCache;
}

async function handleApi(url, init) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (init.method || 'GET').toUpperCase();

  if (path === '/api/health') {
    return json({ ok: true, service: 'control-buses-quito', db: 'demo-browser', buses: 54 });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    let body = {};
    try {
      body = JSON.parse(init.body || '{}');
    } catch {
      return json({ error: 'Solicitud inválida' }, 400);
    }
    const username = String(body.username || '').trim().toLowerCase();
    const entry = USERS[username];
    if (!entry || entry.password !== String(body.password || '')) {
      return json({ error: 'Usuario o contraseña incorrectos' }, 401);
    }
    const user = { id: 1, username, name: entry.name, role: entry.role };
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return json({ user });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    localStorage.removeItem(SESSION_KEY);
    return json({ ok: true });
  }

  const user = currentUser();

  if (path === '/api/auth/me') {
    return user ? json({ user }) : json({ error: 'No autenticado' }, 401);
  }
  if (!user) return json({ error: 'No autenticado' }, 401);

  if (path === '/api/state') return json(sim.getState());
  if (path === '/api/reports') return json(sim.getReports());
  if (path === '/api/stops') return json(stopStats());

  if (path === '/api/history') {
    const days = Math.max(7, Math.min(60, Number(url.searchParams.get('days')) || 30));
    return json({
      ts: new Date().toISOString(),
      days,
      daily: dailySeries(days),
      hourly: sim.getHourly(),
      today: sim.todayStats,
      hubs: Object.entries(HUBS).map(([id, h]) => ({ id, name: h.name, routes: h.routes })),
    });
  }

  const ack = path.match(/^\/api\/alerts\/([^/]+)\/ack$/);
  if (ack && method === 'POST') {
    if (user.role === 'gerencia') return json({ error: 'Tu rol no puede atender alertas' }, 403);
    const alert = sim.ackAlert(decodeURIComponent(ack[1]), user.name);
    return alert ? json(alert) : json({ error: 'alerta no encontrada' }, 404);
  }

  const panic = path.match(/^\/api\/buses\/([^/]+)\/panic$/);
  if (panic && method === 'POST') {
    if (user.role !== 'supervisor') return json({ error: 'Solo un supervisor puede simular un pánico' }, 403);
    const alert = sim.panic(decodeURIComponent(panic[1]));
    return alert ? json(alert) : json({ error: 'bus no encontrado' }, 404);
  }

  return json({ error: 'endpoint no existe' }, 404);
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const raw = typeof input === 'string' ? input : input.url;
  const url = new URL(raw, location.href);
  if (url.pathname.startsWith('/api/')) return handleApi(url, init);
  return nativeFetch(input, init);
};

class DemoEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    this._unsub = sim.onTick((type, payload) => {
      if (type === 'tick') this.emit('tick', payload);
      else if (type === 'alert') this.emit('alert', payload);
    });
    setTimeout(() => {
      this.readyState = 1;
      this.emit('state', sim.getState());
      if (typeof this.onopen === 'function') this.onopen({});
    }, 30);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }

  emit(type, data) {
    for (const fn of this.listeners[type] || []) {
      try {
        fn({ type, data: JSON.stringify(data) });
      } catch (err) {
        console.error(err);
      }
    }
  }

  close() {
    this.readyState = 2;
    if (this._unsub) this._unsub();
  }
}

window.EventSource = DemoEventSource;
