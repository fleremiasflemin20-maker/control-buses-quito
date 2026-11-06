// Persistencia con PostgreSQL embebido (PGlite).
// Para usar un servidor PostgreSQL real: definir DATABASE_URL y adaptar
// openDatabase() a `pg` (la API de consultas es la misma: query(sql, params)).

import { PGlite } from '@electric-sql/pglite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_DIR = path.join(DATA_DIR, 'pgdata');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operador', 'supervisor', 'gerencia', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  headway_min INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS buses (
  id TEXT PRIMARY KEY,
  plate TEXT NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(id),
  capacity INTEGER NOT NULL,
  model TEXT,
  year INTEGER,
  driver TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  bus_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nueva',
  ts TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed INTEGER,
  occupancy INTEGER,
  ack_by TEXT,
  ack_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_ts_idx ON alerts (ts DESC);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status);

CREATE TABLE IF NOT EXISTS stop_events (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  bus_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  stop_key TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  boardings INTEGER NOT NULL DEFAULT 0,
  alightings INTEGER NOT NULL DEFAULT 0,
  transfers INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS stop_events_ts_idx ON stop_events (ts DESC);

CREATE TABLE IF NOT EXISTS daily_stats (
  day DATE PRIMARY KEY,
  boardings INTEGER NOT NULL DEFAULT 0,
  alerts INTEGER NOT NULL DEFAULT 0,
  transfers INTEGER NOT NULL DEFAULT 0,
  compliance NUMERIC(5, 2) NOT NULL DEFAULT 0
);
`;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && timingSafeEqual(test, ref);
}

function dayKey(date = new Date()) {
  // Día local de Ecuador (UTC-5)
  const d = new Date(date.getTime() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function openDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new PGlite(DB_DIR);
  await db.exec(SCHEMA);
  // Migración: bases creadas antes del rol admin.
  await db.exec(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('operador', 'supervisor', 'gerencia', 'admin'));
  `);

  const repo = {
    db,

    async query(sql, params = []) {
      return db.query(sql, params);
    },

    async seedUsers() {
      const res = await db.query('SELECT count(*)::int AS n FROM users');
      if (res.rows[0].n > 0) return;
      const seed = [
        ['operador', 'operador123', 'Carlos Mera', 'operador'],
        ['supervisor', 'supervisor123', 'Andrea Salcedo', 'supervisor'],
        ['gerencia', 'gerencia123', 'Patricio Almeida', 'gerencia'],
      ];
      for (const [username, password, name, role] of seed) {
        await db.query(
          'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)',
          [username, hashPassword(password), name, role],
        );
      }
      console.log('  Usuarios creados: operador/operador123 · supervisor/supervisor123 · gerencia/gerencia123');
    },

    async ensureAdmin() {
      const res = await db.query("SELECT 1 FROM users WHERE username = 'admin'");
      if (res.rows.length) return;
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      await db.query(
        'INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)',
        ['admin', hashPassword(password), 'Administrador de la plataforma', 'admin'],
      );
      if (!process.env.ADMIN_PASSWORD) {
        console.log('  Usuario admin creado: admin/admin123 (cámbialo en producción)');
      }
    },

    async seedCatalog(routes, buses) {
      for (const r of routes) {
        await db.query(
          `INSERT INTO routes (id, code, name, color, headway_min) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET code = excluded.code, name = excluded.name,
             color = excluded.color, headway_min = excluded.headway_min`,
          [r.id, r.code, r.name, r.color, r.headwayMin],
        );
      }
      for (const b of buses) {
        await db.query(
          `INSERT INTO buses (id, plate, route_id, capacity, model, year, driver)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET plate = excluded.plate, route_id = excluded.route_id,
             capacity = excluded.capacity, model = excluded.model,
             year = excluded.year, driver = excluded.driver`,
          [b.id, b.plate, b.routeId, b.capacity, b.model, b.year, b.driver],
        );
      }
    },

    async seedDailyHistory(days = 45) {
      const res = await db.query('SELECT count(*)::int AS n FROM daily_stats');
      if (res.rows[0].n > 0) return;
      for (let i = days; i >= 1; i--) {
        const date = new Date(Date.now() - i * 86400000);
        const key = dayKey(date);
        const dow = date.getUTCDay();
        const weekend = dow === 0 || dow === 6 ? 0.72 : 1;
        const seasonal = 1 + 0.08 * Math.sin(i / 4.2) + 0.04 * Math.sin(i / 1.7);
        const boardings = Math.round(10200 * weekend * seasonal);
        const alerts = Math.round((28 + 14 * Math.abs(Math.sin(i / 2.3))) * weekend);
        const transfers = Math.round(boardings * (0.17 + 0.02 * Math.sin(i / 3)));
        const compliance = Math.round((96.4 + 2.2 * Math.sin(i / 3.1)) * 100) / 100;
        await db.query(
          'INSERT INTO daily_stats (day, boardings, alerts, transfers, compliance) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (day) DO NOTHING',
          [key, boardings, alerts, transfers, compliance],
        );
      }
    },

    async seedStopEvents(routes) {
      const res = await db.query('SELECT count(*)::int AS n FROM stop_events');
      if (res.rows[0].n > 0) return;
      const events = [];
      for (const r of routes) {
        for (const s of r.stops) {
          const k = 3 + Math.floor(Math.random() * 4);
          for (let i = 0; i < k; i++) {
            events.push({
              ts: new Date(Date.now() - Math.random() * 20 * 3600 * 1000).toISOString(),
              busId: 'SEED',
              routeId: r.id,
              stopKey: s.name,
              stopName: s.name,
              boardings: Math.round(3 + Math.random() * 30),
              alightings: Math.round(1 + Math.random() * 24),
              transfers: s.hub ? Math.round(Math.random() * 12) : 0,
            });
          }
        }
      }
      for (let i = 0; i < events.length; i += 40) {
        await this.insertStopEvents(events.slice(i, i + 40));
      }
      console.log(`  Aforo histórico sembrado: ${events.length} registros de paradas`);
    },

    async getOrCreateToday() {
      const key = dayKey();
      await db.query('INSERT INTO daily_stats (day) VALUES ($1) ON CONFLICT (day) DO NOTHING', [key]);
      const res = await db.query('SELECT * FROM daily_stats WHERE day = $1', [key]);
      return res.rows[0];
    },

    async upsertToday(data) {
      const key = dayKey();
      await db.query(
        `INSERT INTO daily_stats (day, boardings, alerts, transfers, compliance)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (day) DO UPDATE SET boardings = excluded.boardings, alerts = excluded.alerts,
           transfers = excluded.transfers, compliance = excluded.compliance`,
        [key, data.boardings, data.alerts, data.transfers, data.compliance],
      );
    },

    async getDaily(days = 30) {
      const from = new Date(Date.now() - (days - 1) * 86400000);
      const res = await db.query(
        'SELECT day, boardings, alerts, transfers, compliance FROM daily_stats WHERE day >= $1 ORDER BY day ASC',
        [dayKey(from)],
      );
      return res.rows.map((r) => ({
        day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
        boardings: Number(r.boardings),
        alerts: Number(r.alerts),
        transfers: Number(r.transfers),
        compliance: Number(r.compliance),
      }));
    },

    async insertAlert(a) {
      await db.query(
        `INSERT INTO alerts (id, bus_id, route_id, type, label, severity, message, status, ts, lat, lng, speed, occupancy)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.busId, a.routeId, a.type, a.label, a.severity, a.message, a.status, a.ts, a.lat, a.lng, a.speed, a.occupancy],
      );
    },

    async ackAlert(id, user) {
      await db.query(
        `UPDATE alerts SET status = 'atendida', ack_by = $2, ack_at = now() WHERE id = $1`,
        [id, user],
      );
    },

    async listAlerts(limit = 40) {
      const res = await db.query(
        `SELECT * FROM alerts ORDER BY ts DESC LIMIT $1`,
        [limit],
      );
      return res.rows.map((r) => ({
        id: r.id,
        busId: r.bus_id,
        plate: null,
        routeId: r.route_id,
        routeCode: null,
        type: r.type,
        label: r.label,
        severity: r.severity,
        message: r.message,
        status: r.status,
        ts: r.ts instanceof Date ? r.ts.toISOString() : new Date(r.ts).toISOString(),
        lat: r.lat,
        lng: r.lng,
        speed: r.speed,
        occupancy: r.occupancy,
        ackBy: r.ack_by,
        ackAt: r.ack_at instanceof Date ? r.ack_at.toISOString() : r.ack_at,
        clip: r.severity === 'alta' ? { duration: 30, channels: 4 } : null,
      }));
    },

    async insertStopEvents(events) {
      if (!events.length) return;
      const values = [];
      const params = [];
      let i = 1;
      for (const e of events) {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(e.ts, e.busId, e.routeId, e.stopKey, e.stopName, e.boardings, e.alightings, e.transfers);
      }
      await db.query(
        `INSERT INTO stop_events (ts, bus_id, route_id, stop_key, stop_name, boardings, alightings, transfers)
         VALUES ${values.join(',')}`,
        params,
      );
    },

    async getStopStats(sinceHours = 24) {
      const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
      const res = await db.query(
        `SELECT route_id, stop_key, stop_name,
                sum(boardings)::int AS boardings,
                sum(alightings)::int AS alightings,
                sum(transfers)::int AS transfers
         FROM stop_events WHERE ts >= $1
         GROUP BY route_id, stop_key, stop_name
         ORDER BY (sum(boardings) + sum(transfers)) DESC`,
        [since],
      );
      return res.rows.map((r) => ({
        routeId: r.route_id,
        stopKey: r.stop_key,
        name: r.stop_name,
        boardings: Number(r.boardings),
        alightings: Number(r.alightings),
        transfers: Number(r.transfers),
      }));
    },

    async findUser(username) {
      const res = await db.query('SELECT * FROM users WHERE username = $1 AND active = TRUE', [username]);
      return res.rows[0] || null;
    },

    async createSession(userId, hours = 8) {
      const id = randomUUID();
      const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [id, userId, expires]);
      return id;
    },

    async getSessionUser(sessionId) {
      if (!sessionId) return null;
      const res = await db.query(
        `SELECT u.id, u.username, u.name, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > now() AND u.active = TRUE`,
        [sessionId],
      );
      return res.rows[0] || null;
    },

    async deleteSession(sessionId) {
      await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    },

    async cleanupSessions() {
      await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    },

    async close() {
      await db.close();
    },
  };

  await repo.seedUsers();
  await repo.ensureAdmin();
  await repo.cleanupSessions();
  return repo;
}
