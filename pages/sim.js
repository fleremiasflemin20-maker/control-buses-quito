// Simulador de flota: mueve los buses por las rutas, genera pasajeros,
// transbordos en nodos, telemetría, alertas y agregados para reportes.
// La persistencia es opcional (se inyecta un objeto `persist`).

import { BUSES, HUBS, ROUTES } from './data.js';

const R_EARTH = 6371000;
const SPEED_FACTOR = 25; // 1 segundo real = 25 segundos simulados
export const TICK_MS = 1000;

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function buildMeta(route) {
  const path = route.shape.map(([lat, lng]) => ({ lat, lng }));
  const cum = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversine(path[i - 1], path[i]);
    cum.push(total);
  }
  const stops = route.stops
    .map((s) => ({ ...s, dist: projectOnPath(path, cum, s).dist }))
    .sort((a, b) => a.dist - b.dist)
    .map((s, index) => ({ ...s, index }));
  return { path, cum, length: total, stops };
}

function projectOnPath(path, cum, p) {
  let best = { dist: 0, offset: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const k = Math.cos(rad((a.lat + b.lat) / 2)) * 111320;
    const bx = (b.lng - a.lng) * k;
    const by = (b.lat - a.lat) * 111320;
    const px = (p.lng - a.lng) * k;
    const py = (p.lat - a.lat) * 111320;
    const len2 = bx * bx + by * by;
    let t = len2 ? (px * bx + py * by) / len2 : 0;
    t = clamp(t, 0, 1);
    const dx = px - bx * t;
    const dy = py - by * t;
    const offset = Math.hypot(dx, dy);
    if (offset < best.offset) best = { offset, dist: cum[i - 1] + Math.sqrt(len2) * t };
  }
  return best;
}

function pointAt(meta, d) {
  const { path, cum, length } = meta;
  const dist = clamp(d, 0, length);
  let seg = 1;
  while (seg < cum.length - 1 && cum[seg] < dist) seg++;
  const a = path[seg - 1];
  const b = path[seg];
  const segLen = cum[seg] - cum[seg - 1] || 1;
  const t = (dist - cum[seg - 1]) / segLen;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    heading: bearing(a, b),
  };
}

function quitoHour() {
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

function demandFactor(hour) {
  if ((hour >= 6.5 && hour <= 9) || (hour >= 16.5 && hour <= 19.5)) return 1.7;
  if (hour >= 11.5 && hour <= 14) return 1.15;
  if (hour >= 22 || hour < 5.5) return 0.35;
  return 0.9;
}

const EVENT_TYPES = [
  {
    type: 'exceso_velocidad', severity: 'media', label: 'Exceso de velocidad', weight: 22,
    message: (b) => `${Math.round(b.speed)} km/h en zona limitada a 50 km/h`,
  },
  {
    type: 'frenada_brusca', severity: 'baja', label: 'Frenada brusca', weight: 20,
    message: () => 'Desaceleración superior a 4 m/s² detectada por el acelerómetro',
  },
  {
    type: 'puerta_abierta', severity: 'alta', label: 'Puerta abierta en marcha', weight: 6,
    message: () => 'Puerta 2 abierta con el bus a más de 15 km/h',
  },
  {
    type: 'somnolencia', severity: 'alta', label: 'Somnolencia del conductor', weight: 5,
    message: () => 'Ojos cerrados por más de 2.5 s (CAM 02)',
  },
  {
    type: 'agresion', severity: 'alta', label: 'Incidente en el salón', weight: 4,
    message: () => 'Posible agresión entre pasajeros detectada en el salón',
  },
  {
    type: 'sobrecupo', severity: 'media', label: 'Sobrecupo', weight: 10,
    message: (b) => `${b.occupancy} pasajeros a bordo (capacidad ${b.capacity})`,
  },
  {
    type: 'falla_motor', severity: 'media', label: 'Falla de motor', weight: 5,
    message: () => 'Código DTC P0217 · temperatura de motor elevada',
  },
  {
    type: 'evasion', severity: 'baja', label: 'Posible evasión', weight: 14,
    message: () => 'Pasajero subió por puerta trasera sin validar',
  },
];

function pickEvent() {
  const total = EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of EVENT_TYPES) if ((r -= e.weight) <= 0) return e;
  return EVENT_TYPES[0];
}

const DEMAND_CURVE = [
  0.05, 0.04, 0.05, 0.08, 0.18, 0.52, 1.0, 0.92, 0.55, 0.42, 0.4, 0.48,
  0.62, 0.58, 0.5, 0.62, 0.95, 1.0, 0.78, 0.5, 0.32, 0.22, 0.14, 0.08,
];

export class Simulator {
  constructor({ persist = null, alerts = [], today = null, seedDemo = false } = {}) {
    this.persist = persist;
    this.routes = ROUTES;
    this.hubs = HUBS;
    this.hubRoutes = new Map(Object.entries(HUBS).map(([id, h]) => [id, h.routes]));
    this.meta = new Map(ROUTES.map((r) => [r.id, buildMeta(r)]));
    this.routeById = new Map(ROUTES.map((r) => [r.id, r]));
    this.buses = this.createBuses();
    this.alerts = alerts;
    this.alertSeq = 0;
    this.simNow = 0;
    this.pending = new Map();
    this.stopBuffer = [];
    this.tickCount = 0;

    const hour = Math.floor(quitoHour());
    this.hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      boardings: h < hour ? Math.round(DEMAND_CURVE[h] * 3600) : 0,
      occupancy: h < hour ? Math.round(34 + 22 * DEMAND_CURVE[h]) : 0,
      samples: h < hour ? 1 : 0,
    }));

    this.todayStats = {
      boardings: Number(today?.boardings || 0),
      alerts: Number(today?.alerts || 0),
      transfers: Number(today?.transfers || 0),
    };

    this.stats = {
      boardings: 0,
      incidents: Object.fromEntries(EVENT_TYPES.map((e) => [e.type, 0])),
    };
    this.boardingsByRoute = Object.fromEntries(ROUTES.map((r) => [r.id, 0]));
    this.listeners = new Set();

    if (seedDemo && this.alerts.length === 0) this.seedAlerts();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  createBuses() {
    const perRoute = new Map();
    for (const b of BUSES) {
      if (!perRoute.has(b.routeId)) perRoute.set(b.routeId, []);
      perRoute.get(b.routeId).push(b);
    }
    const buses = [];
    for (const [routeId, list] of perRoute) {
      const meta = this.meta.get(routeId);
      list.forEach((b, i) => {
        const frac = (i + 0.5) / list.length;
        buses.push({
          ...b,
          routeCode: this.routeById.get(routeId).code,
          routeName: this.routeById.get(routeId).name,
          routeColor: this.routeById.get(routeId).color,
          dist: meta.length * frac,
          dir: i % 2 === 0 ? 1 : -1,
          cruise: rnd(19, 29),
          speed: rnd(14, 26),
          occupancy: Math.round(rnd(12, 55)),
          fuel: rnd(35, 95),
          engineTemp: rnd(78, 92),
          odometer: Math.round(rnd(120000, 480000)),
          commsLost: false,
          commLostUntil: 0,
          lastSeen: Date.now(),
          dwellUntil: 0,
          lastStop: null,
          phase: rnd(0, 1000),
          cooldowns: new Map(),
        });
      });
    }
    return buses;
  }

  seedAlerts() {
    const pickBus = (routeId) => {
      const list = this.buses.filter((b) => (routeId ? b.routeId === routeId : true));
      return list[Math.floor(Math.random() * list.length)];
    };
    const byType = (type) => EVENT_TYPES.find((e) => e.type === type);

    const sleepy = pickBus('R1');
    this.raiseAlert(sleepy, byType('somnolencia'), byType('somnolencia').message(sleepy));

    const crowded = pickBus('R5');
    crowded.occupancy = crowded.capacity + 4;
    this.raiseAlert(crowded, byType('sobrecupo'), byType('sobrecupo').message(crowded));

    const braking = pickBus('R3');
    this.raiseAlert(braking, byType('frenada_brusca'), byType('frenada_brusca').message(braking));
  }

  nextStop(bus, meta) {
    const stops = meta.stops;
    if (bus.dir > 0) {
      for (const s of stops) {
        if (s.dist > bus.dist + 5 && s.index !== bus.lastStop) {
          return { stop: s, index: s.index, stopDist: s.dist, gap: s.dist - bus.dist };
        }
      }
    } else {
      for (let i = stops.length - 1; i >= 0; i--) {
        const s = stops[i];
        if (s.dist < bus.dist - 5 && s.index !== bus.lastStop) {
          return { stop: s, index: s.index, stopDist: s.dist, gap: bus.dist - s.dist };
        }
      }
    }
    return null;
  }

  stepBus(bus, meta, dtSim) {
    if (bus.dwellUntil > this.simNow) {
      bus.status = 'en parada';
      bus.speed = 0;
      return;
    }

    const upcoming = this.nextStop(bus, meta);
    const target = upcoming
      ? upcoming.gap < 70
        ? Math.min(bus.cruise, 10)
        : bus.cruise * (1 + 0.07 * Math.sin(this.simNow / 8000 + bus.phase))
      : bus.cruise;

    bus.speed += (target - bus.speed) * 0.12;
    bus.speed = clamp(bus.speed, 0, 62);
    const meters = (bus.speed / 3.6) * dtSim;
    const prevDist = bus.dist;
    bus.dist += meters * bus.dir;

    if (bus.dist >= meta.length) {
      bus.dist = meta.length;
      bus.dir = -1;
      bus.lastStop = null;
      bus.dwellUntil = this.simNow + 50;
    } else if (bus.dist <= 0) {
      bus.dist = 0;
      bus.dir = 1;
      bus.lastStop = null;
      bus.dwellUntil = this.simNow + 50;
    }

    if (upcoming && bus.lastStop !== upcoming.index) {
      const crossed = bus.dir > 0
        ? prevDist < upcoming.stopDist && bus.dist >= upcoming.stopDist
        : prevDist > upcoming.stopDist && bus.dist <= upcoming.stopDist;
      if (crossed) {
        bus.dist = upcoming.stopDist;
        bus.lastStop = upcoming.index;
        bus.dwellUntil = this.simNow + rnd(30, 55);
        bus.speed = 0;
        this.exchangePassengers(bus, upcoming.stop);
      }
    }

    bus.fuel = Math.max(6, bus.fuel - meters * 0.00035);
    bus.engineTemp = clamp(bus.engineTemp + rnd(-0.15, 0.18), 76, 104);
    bus.odometer += meters / 1000;
    bus.status = 'en ruta';

    if (bus.occupancy > bus.capacity) this.maybeAlert(bus, 'sobrecupo', 0.02);
  }

  exchangePassengers(bus, stop) {
    const factor = demandFactor(quitoHour());
    const alight = Math.min(bus.occupancy, Math.round(bus.occupancy * rnd(0.1, 0.4)));
    let transferIn = 0;

    // Pasajeros que bajan y continúan su viaje por otra ruta del mismo nodo.
    if (stop?.hub) {
      const targets = (this.hubRoutes.get(stop.hub) || []).filter((r) => r !== bus.routeId);
      const transferOut = Math.round(alight * rnd(0.18, 0.42));
      if (targets.length && transferOut > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const key = `${stop.hub}|${target}`;
        this.pending.set(key, Math.min(140, (this.pending.get(key) || 0) + transferOut));
        this.todayStats.transfers += transferOut;
      }
      const keyIn = `${stop.hub}|${bus.routeId}`;
      const waiting = this.pending.get(keyIn) || 0;
      const room = Math.max(0, bus.capacity + 6 - (bus.occupancy - alight));
      transferIn = Math.min(waiting, room, Math.round(rnd(2, 14)));
      if (transferIn > 0) this.pending.set(keyIn, waiting - transferIn);
    }

    const demand = Math.round(rnd(1, 8) * factor);
    const room = Math.max(0, bus.capacity + 6 - (bus.occupancy - alight + transferIn));
    const board = Math.max(0, Math.min(demand, room));
    bus.occupancy = clamp(bus.occupancy - alight + board + transferIn, 0, bus.capacity + 10);

    this.stats.boardings += board;
    this.todayStats.boardings += board;
    this.boardingsByRoute[bus.routeId] += board;

    const bucket = this.hourly[Math.floor(quitoHour()) % 24];
    bucket.boardings += board + transferIn;
    bucket.occupancy = Math.round(((bucket.occupancy * bucket.samples) + (bus.occupancy / bus.capacity) * 100) / (bucket.samples + 1));
    bucket.samples += 1;

    this.pushStopEvent({
      ts: new Date().toISOString(),
      busId: bus.id,
      routeId: bus.routeId,
      stopKey: `${stop?.name || 'terminal'}`,
      stopName: stop?.name || 'Terminal',
      boardings: board,
      alightings: alight,
      transfers: transferIn,
    });
  }

  pushStopEvent(evt) {
    this.stopBuffer.push(evt);
    if (this.stopBuffer.length >= 30) this.flushStopEvents();
  }

  flushStopEvents() {
    if (!this.persist || !this.stopBuffer.length) return;
    const batch = this.stopBuffer.splice(0, this.stopBuffer.length);
    this.persist.stopEvents(batch).catch(() => {});
  }

  maybeAlert(bus, type, prob) {
    const now = Date.now();
    const key = `${bus.id}:${type}`;
    if ((bus.cooldowns.get(key) || 0) > now) return;
    if (Math.random() > prob) return;
    bus.cooldowns.set(key, now + 90000);
    const def = EVENT_TYPES.find((e) => e.type === type);
    if (def) this.raiseAlert(bus, def, def.message(bus));
  }

  raiseAlert(bus, def, message) {
    const pos = pointAt(this.meta.get(bus.routeId), bus.dist);
    const alert = {
      id: `ALR-${Date.now().toString(36).toUpperCase()}-${String(++this.alertSeq).padStart(2, '0')}`,
      busId: bus.id,
      plate: bus.plate,
      routeId: bus.routeId,
      routeCode: bus.routeCode,
      type: def.type,
      label: def.label,
      severity: def.severity,
      message,
      status: 'nueva',
      ts: new Date().toISOString(),
      lat: pos.lat,
      lng: pos.lng,
      speed: Math.round(bus.speed),
      occupancy: bus.occupancy,
      clip: def.severity === 'alta' ? { duration: 30, channels: 4 } : null,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 120) this.alerts.pop();
    this.stats.incidents[def.type] = (this.stats.incidents[def.type] || 0) + 1;
    this.todayStats.alerts += 1;
    if (this.persist) this.persist.alert(alert).catch(() => {});
    this.emit('alert', alert);
    return alert;
  }

  panic(busId) {
    const bus = this.buses.find((b) => b.id === busId);
    if (!bus) return null;
    return this.raiseAlert(bus, { type: 'boton_panico', severity: 'alta', label: 'Botón de pánico' },
      'El conductor activó el botón de pánico');
  }

  ackAlert(id, user = 'sistema') {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return null;
    alert.status = 'atendida';
    alert.ackBy = user;
    alert.ackAt = new Date().toISOString();
    if (this.persist) this.persist.ack(id, user).catch(() => {});
    this.emit('ack', alert);
    return alert;
  }

  tick() {
    const now = Date.now();
    const dtSim = (TICK_MS / 1000) * SPEED_FACTOR;
    this.simNow += dtSim;
    this.tickCount += 1;

    for (const bus of this.buses) {
      const meta = this.meta.get(bus.routeId);
      if (bus.commsLost) {
        if (now > bus.commLostUntil) {
          bus.commsLost = false;
          bus.lastSeen = now;
        }
        continue;
      }
      if (Math.random() < 0.0006) {
        bus.commsLost = true;
        bus.commLostUntil = now + rnd(12000, 35000);
        continue;
      }
      this.stepBus(bus, meta, dtSim);
      bus.lastSeen = now;

      if (Math.random() < 0.0014) {
        const def = pickEvent();
        if (def.type === 'sobrecupo' && bus.occupancy <= bus.capacity) continue;
        if (def.type === 'puerta_abierta' && bus.speed < 15) continue;
        if (def.type === 'exceso_velocidad' && bus.speed < 52) continue;
        const key = `${bus.id}:${def.type}`;
        if ((bus.cooldowns.get(key) || 0) > now) continue;
        bus.cooldowns.set(key, now + 60000);
        this.raiseAlert(bus, def, def.message(bus));
      }
    }

    if (this.tickCount % 3 === 0) this.flushStopEvents();
    if (this.tickCount % 15 === 0 && this.persist) {
      this.persist.daily({
        boardings: this.todayStats.boardings,
        alerts: this.todayStats.alerts,
        transfers: this.todayStats.transfers,
        compliance: this.getKPIs(this.buses).compliance,
      }).catch(() => {});
    }

    this.emit('tick', this.getState());
  }

  snapshotBus(bus) {
    const meta = this.meta.get(bus.routeId);
    const pos = pointAt(meta, bus.dist);
    const upcoming = this.nextStop(bus, meta);
    const remaining = bus.dir > 0 ? meta.length - bus.dist : bus.dist;
    const etaMin = bus.speed > 2 ? remaining / 1000 / (bus.speed / 60) : null;
    const openAlert = this.alerts.find((a) => a.busId === bus.id && a.status === 'nueva');

    return {
      id: bus.id,
      plate: bus.plate,
      routeId: bus.routeId,
      routeCode: bus.routeCode,
      routeName: bus.routeName,
      routeColor: bus.routeColor,
      driver: bus.driver,
      capacity: bus.capacity,
      occupancy: bus.occupancy,
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading,
      speed: Math.round(bus.speed),
      status: bus.commsLost
        ? 'sin señal'
        : openAlert
          ? 'alerta'
          : bus.dwellUntil > this.simNow
            ? 'en parada'
            : 'en ruta',
      commsLost: bus.commsLost,
      lastSeen: bus.lastSeen,
      fuel: Math.round(bus.fuel),
      engineTemp: Math.round(bus.engineTemp),
      odometer: Math.round(bus.odometer),
      nextStop: upcoming ? upcoming.stop.name : 'Terminal',
      nextStopHub: upcoming?.stop.hub || null,
      nextStopDistance: upcoming ? Math.round(upcoming.gap) : 0,
      etaMin: etaMin ? Math.round(etaMin) : null,
      direction: bus.dir > 0 ? 'ida' : 'vuelta',
      alertId: openAlert ? openAlert.id : null,
      alertSeverity: openAlert ? openAlert.severity : null,
      cameras: bus.cameras,
      model: bus.model,
      year: bus.year,
    };
  }

  getKPIs(buses) {
    const online = buses.filter((b) => !b.commsLost);
    const open = this.alerts.filter((a) => a.status === 'nueva');
    const avgSpeed = online.length ? online.reduce((s, b) => s + b.speed, 0) / online.length : 0;
    const compliance = clamp(
      98.6 - open.filter((a) => a.severity === 'alta').length * 0.5 -
        open.filter((a) => a.severity === 'media').length * 0.18,
      85,
      99.4,
    );
    const headways = this.routes.map((r) => this.routeHeadway(r.id));
    return {
      activeBuses: online.length,
      totalBuses: buses.length,
      passengers: buses.reduce((s, b) => s + b.occupancy, 0),
      openAlerts: open.length,
      criticalAlerts: open.filter((a) => a.severity === 'alta').length,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      compliance: Math.round(compliance * 10) / 10,
      headway: Math.round((headways.reduce((s, h) => s + h, 0) / headways.length) * 10) / 10,
      transfers: this.todayStats.transfers,
      boardings: this.todayStats.boardings,
      simTime: this.simNow,
      speedFactor: SPEED_FACTOR,
    };
  }

  routeHeadway(routeId) {
    const list = this.buses
      .filter((b) => b.routeId === routeId && !b.commsLost)
      .sort((a, b) => a.dist - b.dist);
    if (list.length < 2) return this.routeById.get(routeId).headwayMin;
    const gaps = [];
    for (let i = 1; i < list.length; i++) {
      const km = (list[i].dist - list[i - 1].dist) / 1000;
      const speed = (list[i].speed + list[i - 1].speed) / 2 || 20;
      gaps.push((km / speed) * 60);
    }
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
  }

  getState() {
    const buses = this.buses.map((b) => this.snapshotBus(b));
    return {
      ts: new Date().toISOString(),
      routes: this.routes.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        color: r.color,
        headwayMin: r.headwayMin,
        shape: r.shape,
        stops: r.stops.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, hub: s.hub || null })),
        buses: this.buses.filter((b) => b.routeId === r.id).length,
        headway: Math.round(this.routeHeadway(r.id) * 10) / 10,
      })),
      hubs: Object.entries(this.hubs).map(([id, h]) => ({ id, name: h.name, routes: h.routes })),
      buses,
      alerts: this.alerts.slice(0, 40),
      kpis: this.getKPIs(buses),
    };
  }

  getHourly() {
    const current = Math.floor(quitoHour());
    return this.hourly.map((h) => ({
      hour: h.hour,
      boardings: h.boardings,
      occupancy: h.hour <= current ? (h.samples ? h.occupancy : 0) : null,
    }));
  }

  getReports() {
    const currentHour = Math.floor(quitoHour());
    const routeStats = this.routes.map((r) => {
      const list = this.buses.filter((b) => b.routeId === r.id);
      const occ = list.reduce((s, b) => s + b.occupancy, 0) / list.length;
      const inc = this.alerts.filter((a) => a.routeId === r.id).length;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        color: r.color,
        buses: list.length,
        boardings: Math.round(this.boardingsByRoute[r.id] * 6.2) + 1200,
        occupancy: Math.round(occ),
        incidents: inc,
        compliance: Math.round(clamp(99 - inc * 0.55, 82, 99.5) * 10) / 10,
      };
    });
    return {
      ts: new Date().toISOString(),
      demandByHour: this.getHourly().filter((h) => h.hour <= currentHour),
      routeStats,
      incidentsByType: EVENT_TYPES.map((e) => ({
        type: e.type,
        label: e.label,
        severity: e.severity,
        count: (this.stats.incidents[e.type] || 0) + Math.round({
          exceso_velocidad: 42, frenada_brusca: 61, puerta_abierta: 6,
          somnolencia: 9, agresion: 4, sobrecupo: 18, falla_motor: 7,
          evasion: 33, boton_panico: 2,
        }[e.type] || 0),
      })).sort((a, b) => b.count - a.count),
      summary: {
        boardings: this.todayStats.boardings + 9800,
        openAlerts: this.alerts.filter((a) => a.status === 'nueva').length,
        compliance: Math.round(
          (routeStats.reduce((s, r) => s + r.compliance, 0) / routeStats.length) * 10,
        ) / 10,
        occupancyAvg: Math.round(
          (routeStats.reduce((s, r) => s + r.occupancy, 0) / routeStats.length) * 10,
        ) / 10,
        transfers: this.todayStats.transfers,
      },
    };
  }

  onTick(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.listeners) {
      try {
        fn(type, payload);
      } catch {
        /* listener caído no debe tumbar el simulador */
      }
    }
  }
}
