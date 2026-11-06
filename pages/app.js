// Centro de Control de Flota — Quito (demo con datos simulados)

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const NS = 'http://www.w3.org/2000/svg';

const state = {
  user: null,
  config: null,
  routes: [],
  buses: [],
  alerts: [],
  kpis: {},
  reports: null,
  stops: null,
  stopsRoute: 'all',
  stopsQuery: '',
  history: null,
  historyDays: 30,
  selectedBusId: null,
  routeFilter: 'all',
  statusFilter: 'all',
  query: '',
  tab: 'ops',
  connected: false,
};

const ROLE_LABEL = {
  operador: 'Operador de tráfico',
  supervisor: 'Supervisor de flota',
  gerencia: 'Gerencia',
  admin: 'Administrador',
};

const KEYS_STORAGE = 'flota_map_keys';

function loadStoredKeys() {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}');
  } catch {
    return {};
  }
}

function applyStoredKeys() {
  if (!canAdmin()) return;
  const keys = loadStoredKeys();
  if (!state.config) state.config = { traffic: {} };
  if (!state.config.traffic) state.config.traffic = { provider: 'simulated' };
  if (keys.tomtom) {
    state.config.traffic.tomtomKey = keys.tomtom;
    state.config.traffic.provider = 'tomtom';
  }
  if (keys.google) state.config.googleMapsKey = keys.google;
}

function openSettings() {
  if (!canAdmin()) {
    toast('Solo el administrador puede configurar claves', true);
    return;
  }
  const keys = loadStoredKeys();
  $('#key-tomtom').value = keys.tomtom || state.config?.traffic?.tomtomKey || '';
  $('#key-google').value = keys.google || state.config?.googleMapsKey || '';
  $('#settings-status').textContent = '';
  $('#settings-modal').hidden = false;
  $('#key-tomtom').focus();
}

function closeSettings() {
  $('#settings-modal').hidden = true;
}

function saveSettings() {
  if (!canAdmin()) {
    toast('Solo el administrador puede guardar claves', true);
    return;
  }
  const tomtom = $('#key-tomtom').value.trim();
  const google = $('#key-google').value.trim();
  localStorage.setItem(KEYS_STORAGE, JSON.stringify({ tomtom, google }));

  if (!state.config.traffic) state.config.traffic = { provider: 'simulated' };
  state.config.traffic.tomtomKey = tomtom || null;
  state.config.traffic.provider = tomtom ? 'tomtom' : 'simulated';
  state.config.googleMapsKey = google || null;

  $('#settings-status').textContent = 'Claves guardadas en este navegador.';
  toast('Configuración guardada');

  if (trafficActive) {
    disableTraffic();
    toggleTraffic();
  }
}

function clearSettings() {
  if (!canAdmin()) {
    toast('Solo el administrador puede borrar claves', true);
    return;
  }
  localStorage.removeItem(KEYS_STORAGE);
  $('#key-tomtom').value = '';
  $('#key-google').value = '';
  if (!state.config.traffic) state.config.traffic = { provider: 'simulated' };
  state.config.traffic.tomtomKey = null;
  state.config.traffic.provider = 'simulated';
  state.config.googleMapsKey = null;
  $('#settings-status').textContent = 'Claves borradas. Tráfico en modo simulado.';
  if (trafficActive) {
    disableTraffic();
    toggleTraffic();
  }
}

const canOperate = () => state.user && state.user.role !== 'gerencia';
const canPanic = () => state.user && state.user.role === 'supervisor';
const canAdmin = () => state.user?.role === 'admin';


const nf = new Intl.NumberFormat('es-EC');
const timeFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const shortTimeFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  weekday: 'long', day: 'numeric', month: 'long',
});

let es = null;

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  if (res.status === 401) {
    lock();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* sin cuerpo */
    }
    throw new Error(msg);
  }
  return res.json();
}

function toast(message, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', Boolean(isError));
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 3400);
}

function lock() {
  if (es) {
    es.close();
    es = null;
  }
  document.body.classList.add('is-locked');
  const login = $('#login-screen');
  if (login) login.hidden = false;
  setLive(false);
}

function showLogin(message) {
  lock();
  if (message) $('#login-error').textContent = message;
  setTimeout(() => $('#login-user')?.focus(), 60);
}

function updateUserChip() {
  const u = state.user;
  if (!u) return;
  $('#user-name').textContent = u.name;
  $('#user-role').textContent = ROLE_LABEL[u.role] || u.role;
  const gear = $('#open-settings');
  if (gear) gear.hidden = !canAdmin();
  $('#user-initials').textContent = u.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

async function startApp(user) {
  state.user = user;
  document.body.classList.remove('is-locked');
  $('#login-screen').hidden = true;
  $('#login-error').textContent = '';
  updateUserChip();

  try {
    const [network, config] = await Promise.all([
      api('/api/network'),
      api('/api/config').catch(() => ({ traffic: { provider: 'simulated', tomtomKey: null } })),
    ]);
    state.config = config;
    applyStoredKeys();
    applyNetwork(network);
    const snapshot = await api('/api/state');
    applyState(snapshot);
  } catch (err) {
    if (err.message !== 'Sesión expirada') toast('No se pudo cargar el estado', true);
    return;
  }
  connect();
  if (user.role === 'gerencia' && state.tab === 'ops') switchTab('reports');
}


const STATUS_CLASS = {
  'en ruta': 'st-enruta',
  'en parada': 'st-parada',
  'alerta': 'st-alerta',
  'sin señal': 'st-sin',
};

/* ══════════════════════════ reloj ══════════════════════════ */

function tickClock() {
  const now = new Date();
  $('#clock').textContent = timeFmt.format(now);
  const d = dateFmt.format(now);
  $('#clock-date').textContent = d.charAt(0).toUpperCase() + d.slice(1);
}

/* ══════════════════════════ KPIs ══════════════════════════ */

function renderKPIs() {
  const k = state.kpis || {};
  const items = [
    { label: 'Buses activos', value: `${k.activeBuses ?? 0}`, small: `/ ${k.totalBuses ?? 0}`, cls: '' },
    { label: 'Pasajeros a bordo', value: nf.format(k.passengers ?? 0), small: 'pax', cls: 'accent' },
    { label: 'Alertas abiertas', value: `${k.openAlerts ?? 0}`, small: (k.criticalAlerts ?? 0) + ' críticas', cls: (k.openAlerts ?? 0) > 0 ? 'danger' : 'ok' },
    { label: 'Cumplimiento', value: `${(k.compliance ?? 0).toFixed(1)}`, small: '%', cls: 'ok' },
    { label: 'Headway prom.', value: `${(k.headway ?? 0).toFixed(1)}`, small: 'min', cls: '' },
  ];
  $('#kpis').innerHTML = items.map((i) => `
    <div class="kpi">
      <div class="kpi-label">${i.label}</div>
      <div class="kpi-value ${i.cls}">${i.value}<small>${i.small}</small></div>
    </div>`).join('');
}

/* ══════════════════════════ rutas ══════════════════════════ */

let routeSig = '';

function renderRoutes() {
  const counts = new Map();
  for (const b of state.buses) counts.set(b.routeId, (counts.get(b.routeId) || 0) + 1);
  const sig = state.routeFilter + '|' + state.routes
    .map((r) => `${r.id}:${counts.get(r.id) || 0}`)
    .join(',');
  if (sig === routeSig) return;
  routeSig = sig;

  const total = state.buses.length;
  const rows = [`
    <button class="route-item all ${state.routeFilter === 'all' ? 'active' : ''}" data-route="all">
      <span>
        <span class="route-name">Todas las rutas</span>
        <span class="route-meta">${state.routes.length} rutas · ${total} buses</span>
      </span>
      <span class="route-buses">${total}</span>
    </button>`];

  for (const r of state.routes) {
    const count = counts.get(r.id) || 0;
    rows.push(`
      <button class="route-item ${state.routeFilter === r.id ? 'active' : ''}" data-route="${r.id}">
        <span class="route-bar" style="background:${r.color}"></span>
        <span>
          <span class="route-name">${r.code} · ${r.name}</span>
          <span class="route-meta">${r.stops.length} paradas${r.network ? ` · ${r.network}` : ''}</span>
        </span>
        <span class="route-buses">${count}</span>
      </button>`);
  }
  $('#route-list').innerHTML = rows.join('');
  $('#routes-count').textContent = `${state.routes.length} rutas`;
}

/* ══════════════════════════ flota ══════════════════════════ */

const fleetEls = new Map();
let fleetSig = '';

function filteredBuses() {
  const q = state.query.trim().toLowerCase();
  return state.buses.filter((b) => {
    if (state.routeFilter !== 'all' && b.routeId !== state.routeFilter) return false;
    if (state.statusFilter === 'alert' && !b.alertId) return false;
    if (!q) return true;
    return (
      b.id.toLowerCase().includes(q) ||
      b.plate.toLowerCase().includes(q) ||
      b.driver.toLowerCase().includes(q)
    );
  });
}

function buildFleet(list) {
  $('#bus-list').innerHTML = list.length
    ? list.map((b) => `
      <div class="bus-item" data-id="${b.id}">
        <span class="status-dot"></span>
        <span class="bus-main">
          <span class="bus-id">${b.id}</span>
          <span class="bus-line2" data-plate>${b.plate} · ${b.routeCode}</span>
        </span>
        <span class="bus-right">
          <span class="bus-speed" data-speed>${b.speed} km/h</span>
          <span class="bus-occ" data-occ><i></i></span>
        </span>
      </div>`).join('')
    : '<div class="empty">Sin buses para este filtro</div>';

  fleetEls.clear();
  for (const el of $$('#bus-list .bus-item')) {
    fleetEls.set(el.dataset.id, {
      el,
      dot: $('.status-dot', el),
      speed: $('[data-speed]', el),
      occ: $('[data-occ]', el),
      bar: $('[data-occ] i', el),
    });
  }
}

function updateFleet(list) {
  for (const b of list) {
    const refs = fleetEls.get(b.id);
    if (!refs) continue;
    const sel = b.id === state.selectedBusId;
    refs.el.classList.toggle('selected', sel);
    refs.el.classList.toggle('alerting', Boolean(b.alertId && b.alertSeverity === 'alta'));
    refs.dot.className = 'status-dot' + (
      b.status === 'alerta' ? ' alerta' :
      b.status === 'en parada' ? ' parada' :
      b.status === 'sin señal' ? ' sin' : ''
    );
    refs.speed.textContent = `${b.speed} km/h`;
    const pct = Math.min(100, Math.round((b.occupancy / b.capacity) * 100));
    refs.bar.style.width = pct + '%';
    refs.occ.className = 'bus-occ' + (pct > 95 ? ' high' : pct > 70 ? ' mid' : '');
    refs.bar.style.background = pct > 95 ? 'var(--danger)' : pct > 70 ? 'var(--warn)' : 'var(--ok)';
  }
}

function renderFleet() {
  const list = filteredBuses();
  const sig = list.map((b) => b.id).join(',') + '|' + state.statusFilter + '|' + state.query;
  if (sig !== fleetSig) {
    fleetSig = sig;
    buildFleet(list);
  }
  updateFleet(list);
  $('#fleet-count').textContent = `${list.length} de ${state.buses.length}`;
}

/* ══════════════════════════ mapa (Leaflet + OSM) ══════════════════════════ */

const mapEl = $('#map');
const mapCanvas = $('#map-canvas');

let map = null;
let routeLayer = null;
let stopLayer = null;
let hubLayer = null;
let busLayer = null;
let highlightLayer = null;
let selectedRing = null;
let mapFitted = false;
const markers = new Map();
const routeLines = new Map();

const colorOf = (routeId) => state.routeById?.get(routeId)?.color || '#38bdf8';
const DEFAULT_MAP_HINT = 'Rueda para zoom · arrastra para mover · clic en un bus';

let trafficActive = false;
let trafficMode = null;
let trafficLayer = null;
let trafficTiles = null;
let trafficTick = 0;
const trafficLines = new Map();

function computeBounds() {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const r of state.routes) {
    for (const [lat, lng] of r.shape) {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    }
  }
  if (!Number.isFinite(minLat)) {
    minLat = -0.32; maxLat = -0.05; minLng = -78.60; maxLng = -78.30;
  }
  state.bounds = { minLat, maxLat, minLng, maxLng };
}

function fitNetwork() {
  if (!map) return;
  const b = state.network?.meta?.bounds || state.bounds;
  if (!b) return;
  map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { padding: [18, 18] });
  mapFitted = true;
}

function hubPosition(hubId) {
  for (const r of state.routes) {
    const s = r.stops.find((x) => x.hub === hubId);
    if (s) return [s.lat, s.lng];
  }
  return null;
}

function buildMap() {
  if (map) {
    map.remove();
    map = null;
  }
  markers.clear();
  routeLines.clear();
  trafficLines.clear();
  trafficActive = false;
  trafficMode = null;
  trafficLayer = null;
  trafficTiles = null;
  $('#traffic-toggle')?.classList.remove('active');
  $('.map-hint').textContent = DEFAULT_MAP_HINT;
  mapFitted = false;

  map = L.map(mapEl, {
    zoomControl: false,
    preferCanvas: true,
    minZoom: 10,
    maxZoom: 18,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  routeLayer = L.layerGroup().addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  hubLayer = L.layerGroup().addTo(map);
  busLayer = L.layerGroup().addTo(map);
  highlightLayer = L.layerGroup().addTo(map);

  for (const r of state.routes) {
    const line = L.polyline(r.shape, {
      color: r.color,
      weight: 2,
      opacity: 0.5,
      interactive: false,
      lineCap: 'round',
    }).addTo(routeLayer);
    routeLines.set(r.id, line);
  }

  for (const h of state.hubs || []) {
    const pos = hubPosition(h.id);
    if (!pos) continue;
    const icon = L.divIcon({
      className: '',
      html: `<div class="hub-marker"><i></i><span>${h.name}</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    L.marker(pos, { icon, interactive: false, keyboard: false }).addTo(hubLayer);
  }

  for (const b of state.buses) {
    const m = L.circleMarker([b.lat, b.lng], {
      radius: 5,
      weight: 1.2,
      color: '#05090f',
      fillColor: colorOf(b.routeId),
      fillOpacity: 1,
      opacity: 1,
    }).addTo(busLayer);
    m.on('click', () => selectBus(b.id));
    m.on('mouseover', () => {
      const bus = state.buses.find((x) => x.id === b.id);
      if (!bus) return;
      const route = state.routeById?.get(bus.routeId);
      const pct = Math.round((bus.occupancy / (bus.capacity || 70)) * 100);
      m.setTooltipContent(
        `<b>${bus.id}</b> · ${route?.code || ''}<br><span>${bus.speed} km/h · ${pct}% ocupación · ${bus.driver || ''}</span>`,
      );
      m.openTooltip();
    });
    m.bindTooltip('', { direction: 'top', offset: [0, -4], opacity: 0.96 });
    markers.set(b.id, m);
  }

  selectedRing = L.circleMarker([0, 0], {
    radius: 10,
    color: '#ffd489',
    weight: 1.8,
    fill: false,
    interactive: false,
  });

  fitNetwork();
  updateRouteStyles();
  updateMap();

  map.on('zoomend', () => {
    if (state.routeFilter !== 'all') updateStopLayer();
  });
}

function updateStopLayer() {
  if (!stopLayer) return;
  stopLayer.clearLayers();
  if (state.routeFilter === 'all') return;
  const route = state.routeById?.get(state.routeFilter);
  if (!route) return;
  route.stops.forEach((s) => {
    L.circleMarker([s.lat, s.lng], {
      radius: 3,
      weight: 1,
      color: '#08111c',
      fillColor: s.hub ? '#ffb020' : '#7dd3fc',
      fillOpacity: 1,
      interactive: false,
    }).addTo(stopLayer);
  });
}

function updateRouteStyles() {
  for (const [id, line] of routeLines) {
    const active = state.routeFilter === 'all' || id === state.routeFilter;
    const filtered = state.routeFilter !== 'all';
    line.setStyle({
      weight: active ? (filtered ? 4 : 2) : 1.4,
      opacity: active ? (filtered ? 0.95 : 0.5) : 0.1,
    });
    if (active && filtered) line.bringToFront();
  }
  updateStopLayer();
}

function updateMap() {
  const filterActive = state.routeFilter !== 'all';
  for (const b of state.buses) {
    const m = markers.get(b.id);
    if (!m) continue;
    m.setLatLng([b.lat, b.lng]);
    const alertColor = b.alertSeverity === 'alta'
      ? '#ef4444'
      : b.alertSeverity === 'media'
        ? '#f59e0b'
        : null;
    const dim = filterActive && b.routeId !== state.routeFilter;
    m.setStyle({
      fillColor: alertColor || colorOf(b.routeId),
      opacity: dim ? 0.25 : 1,
      fillOpacity: dim ? 0.3 : 1,
    });
  }

  const selected = state.buses.find((b) => b.id === state.selectedBusId);
  if (selected && selectedRing) {
    selectedRing.setLatLng([selected.lat, selected.lng]);
    if (!highlightLayer.hasLayer(selectedRing)) selectedRing.addTo(highlightLayer);
  } else if (selectedRing && highlightLayer.hasLayer(selectedRing)) {
    highlightLayer.removeLayer(selectedRing);
  }
}

function selectBus(id) {
  if (!id) return;
  state.selectedBusId = id;
  const bus = state.buses.find((b) => b.id === id);
  if (bus && state.routeFilter !== 'all' && state.routeFilter !== bus.routeId) {
    state.routeFilter = 'all';
    updateRouteStyles();
  }
  renderFleet();
  updateMap();
  renderDetail(true);
  const item = fleetEls.get(id);
  if (item) item.el.scrollIntoView({ block: 'nearest' });
}

function setMapHint(text) {
  const el = $('.map-hint');
  if (el) el.textContent = text;
}

function updateTraffic() {
  if (!trafficActive || trafficMode !== 'simulated') return;
  const sums = new Map();
  const counts = new Map();
  for (const b of state.buses) {
    sums.set(b.routeId, (sums.get(b.routeId) || 0) + b.speed);
    counts.set(b.routeId, (counts.get(b.routeId) || 0) + 1);
  }
  for (const [id, line] of trafficLines) {
    const avg = counts.get(id) ? sums.get(id) / counts.get(id) : 0;
    const color = avg >= 24 ? '#22c55e' : avg >= 17 ? '#f59e0b' : '#ef4444';
    line.setStyle({ color });
  }
}

function toggleTraffic() {
  if (!map) return;
  if (trafficActive) {
    disableTraffic();
    return;
  }

  const key = state.config?.traffic?.tomtomKey;
  trafficActive = true;
  $('#traffic-toggle')?.classList.add('active');

  if (key) {
    trafficMode = 'tomtom';
    trafficTiles = L.tileLayer(
      `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
      { opacity: 0.65, attribution: 'TomTom Traffic', maxZoom: 19 },
    ).addTo(map);
    setMapHint('Tráfico real · TomTom');
    return;
  }

  trafficMode = 'simulated';
  trafficLayer = L.layerGroup().addTo(map);
  trafficLines.clear();
  for (const r of state.routes) {
    const line = L.polyline(r.shape, {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.5,
      interactive: false,
    }).addTo(trafficLayer);
    trafficLines.set(r.id, line);
  }
  updateTraffic();
  setMapHint('Congestión estimada con la velocidad de la flota · configura TOMTOM_KEY para tráfico real');
  toast('Tráfico simulado · pega tu clave TomTom en ⚙');
}

function disableTraffic() {
  trafficActive = false;
  $('#traffic-toggle')?.classList.remove('active');
  if (trafficTiles && map) {
    map.removeLayer(trafficTiles);
    trafficTiles = null;
  }
  if (trafficLayer && map) {
    map.removeLayer(trafficLayer);
    trafficLayer = null;
  }
  trafficLines.clear();
  trafficMode = null;
  setMapHint(DEFAULT_MAP_HINT);
}

function bindMapControls() {
  $('#zoom-in').addEventListener('click', () => map?.zoomIn());
  $('#zoom-out').addEventListener('click', () => map?.zoomOut());
  $('#traffic-toggle').addEventListener('click', toggleTraffic);
  $('#zoom-reset').addEventListener('click', () => {
    if (!map) return;
    map.invalidateSize();
    fitNetwork();
  });
}

/* ══════════════════════════ leyenda del mapa ══════════════════════════ */

function renderLegend() {
  $('#map-legend').innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:#38bdf8"></span>Red de buses OSM</span>
    <span class="legend-item"><span class="legend-dot" style="background:#0b1220;border:1px solid #ffb020;transform:rotate(45deg)"></span>Nodo</span>
    <span class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Alerta</span>
    <span class="legend-item" style="cursor:default">${state.routes.length} rutas · ${state.buses.length} buses</span>`;
}


/* ══════════════════════════ alertas ══════════════════════════ */

let alertSig = '';

function renderAlerts() {
  const list = state.alerts.slice(0, 26);
  const sig = list.map((a) => `${a.id}:${a.status}`).join('|');
  const open = state.alerts.filter((a) => a.status === 'nueva').length;
  $('#alerts-open').textContent = `${open} abierta${open === 1 ? '' : 's'}`;

  if (sig === alertSig) return;
  alertSig = sig;

  if (!list.length) {
    $('#alert-list').innerHTML = '<div class="empty" style="width:100%">Sin alertas. La flota opera normal.</div>';
    return;
  }

  $('#alert-list').innerHTML = list.map((a) => {
    const t = shortTimeFmt.format(new Date(a.ts));
    return `
      <article class="alert-card ${a.severity} ${a.status === 'atendida' ? 'atendida' : ''}" data-id="${a.id}">
        <div class="alert-top">
          <span class="sev">${a.severity}</span>
          <span class="alert-time">${t}</span>
          <span class="alert-bus">${a.busId}</span>
        </div>
        <h3 class="alert-title">${a.label}</h3>
        <p class="alert-desc">${a.message}</p>
        <div class="alert-actions">
          <button class="mini-btn" data-act="see" data-bus="${a.busId}">Ver bus</button>
          ${canOperate() ? `
          <button class="mini-btn primary" data-act="ack" data-id="${a.id}" ${a.status !== 'nueva' ? 'disabled' : ''}>
            ${a.status === 'nueva' ? 'Atender' : 'Atendida'}
          </button>` : ''}
        </div>
      </article>`;
  }).join('');
}

async function ackAlert(id) {
  try {
    await api(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST' });
    const alert = state.alerts.find((a) => a.id === id);
    if (alert) alert.status = 'atendida';
    alertSig = '';
    renderAlerts();
    renderDetail(true);
    toast('Alerta marcada como atendida');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ══════════════════════════ detalle y cámaras ══════════════════════════ */

const detail = $('#detail');
let detailSig = null;
let detailAlertId = null;
let camRAF = null;

function camTile(kind, label, index) {
  return `
    <div class="cam-tile" data-kind="${kind}" data-index="${index}">
      <canvas></canvas>
      <div class="cam-ov">
        <div class="cam-top"><span>CAM 0${index + 1} · ${label}</span><span class="cam-rec">REC</span></div>
        <div class="cam-bottom"><span class="cam-info" data-cam-info>—</span><span class="cam-time" data-cam-time>--:--:--</span></div>
      </div>
    </div>`;
}

function renderDetail(force = false) {
  const bus = state.buses.find((b) => b.id === state.selectedBusId);
  if (!bus) {
    stopCams();
    detailSig = null;
    detailAlertId = null;
    detail.innerHTML = `
      <div class="detail-empty">
        <svg viewBox="0 0 24 24" width="34" height="34"><rect x="4" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 10h16M8 20l2-4M16 20l-2-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <div>Selecciona un bus en el mapa o en la lista<br>para ver sus cámaras y telemetría.</div>
      </div>`;
    return;
  }

  if (!force && detailSig === bus.id) {
    updateDetail(bus);
    return;
  }

  detailSig = bus.id;
  detailAlertId = bus.alertId;
  const statusCls = STATUS_CLASS[bus.status] || 'st-enruta';
  const alertButtons = bus.alertId && canOperate()
    ? `<button class="mini-btn danger" id="btn-ack">Atender alerta</button>`
    : '';
  const panicButton = canPanic()
    ? `<button class="mini-btn" id="btn-panic">Simular pánico</button>`
    : '';

  detail.innerHTML = `
    <div class="detail-body">
      <div class="detail-head">
        <div>
          <span class="detail-id">${bus.id}</span><span class="detail-plate">${bus.plate}</span>
          <div class="detail-sub" style="margin-top:6px">
            <b>${bus.routeCode}</b> · ${bus.routeName} · ${bus.driver}
          </div>
        </div>
        <div class="detail-status"><span class="status-pill ${statusCls}" data-status>${bus.status}</span></div>
      </div>

      <div class="cams">
        ${camTile('door', 'Puerta delantera', 0)}
        ${camTile('driver', 'Conductor', 1)}
        ${camTile('salon', 'Salón', 2)}
        ${camTile('front', 'Frontal', 3)}
      </div>

      <div class="telemetry">
        <div class="stat"><div class="stat-label">Velocidad</div><div class="stat-value" data-speed>${bus.speed}<small>km/h</small></div></div>
        <div class="stat"><div class="stat-label">Ocupación</div><div class="stat-value" data-occ>${bus.occupancy}<small>pax</small></div></div>
        <div class="stat"><div class="stat-label">Combustible</div><div class="stat-value" data-fuel>${bus.fuel}<small>%</small></div></div>
        <div class="stat"><div class="stat-label">Motor</div><div class="stat-value" data-temp>${bus.engineTemp}<small>°C</small></div></div>
      </div>

      <div class="occ-block">
        <div class="occ-top"><span>Ocupación del bus</span><span><b data-occ-pct>0%</b> de ${bus.capacity}</span></div>
        <div class="occ-bar"><i data-occ-bar></i></div>
      </div>

      <div class="next-stops">
        <h3>Próxima parada</h3>
        <div class="stop-row"><i></i><span data-next-stop>—</span><span class="eta" data-eta>—</span></div>
        <div class="stop-row" style="opacity:.55"><i></i><span>Dirección: <b data-direction>${bus.direction}</b></span><span class="eta">${bus.model}</span></div>
      </div>

      <div class="next-stops">
        <h3>Eventos recientes del bus</h3>
        <div class="bus-events" data-bus-events></div>
      </div>

      <div class="specs">
        <div class="spec"><span>Modelo</span><b>${bus.model} ${bus.year}</b></div>
        <div class="spec"><span>Odómetro</span><b>${nf.format(bus.odometer)} km</b></div>
        <div class="spec"><span>Cámaras</span><b>${bus.cameras} canales · IA</b></div>
        <div class="spec"><span>Enlace</span><b>${bus.commsLost ? 'sin señal' : 'GPS + 4G activo'}</b></div>
      </div>

      <div class="detail-actions">
        <button class="mini-btn" id="btn-locate">Centrar en mapa</button>
        ${panicButton}
        ${alertButtons}
      </div>
    </div>`;

  updateDetail(bus);
  startCams();

  $('#btn-locate').addEventListener('click', () => {
    const b = state.buses.find((x) => x.id === state.selectedBusId);
    if (!b || !map) return;
    map.setView([b.lat, b.lng], Math.max(map.getZoom(), 15), { animate: true });
  });

  const panicBtn = $('#btn-panic');
  if (panicBtn) {
    panicBtn.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await api(`/api/buses/${encodeURIComponent(bus.id)}/panic`, { method: 'POST' });
        toast('Pánico simulado: alerta enviada a la central');
      } catch (err) {
        toast(err.message, true);
      } finally {
        setTimeout(() => { btn.disabled = false; }, 4000);
      }
    });
  }

  const ackBtn = $('#btn-ack');
  if (ackBtn) ackBtn.addEventListener('click', () => ackAlert(bus.alertId));
}

function updateDetail(bus) {
  if (detailAlertId !== bus.alertId) {
    renderDetail(true);
    return;
  }
  const statusEl = detail.querySelector('[data-status]');
  if (!statusEl) return;
  statusEl.className = `status-pill ${STATUS_CLASS[bus.status] || 'st-enruta'}`;
  statusEl.textContent = bus.status;

  detail.querySelector('[data-speed]').innerHTML = `${bus.speed}<small>km/h</small>`;
  detail.querySelector('[data-occ]').innerHTML = `${bus.occupancy}<small>pax</small>`;
  detail.querySelector('[data-fuel]').innerHTML = `${bus.fuel}<small>%</small>`;
  detail.querySelector('[data-temp]').innerHTML = `${bus.engineTemp}<small>°C</small>`;

  const pct = Math.min(100, Math.round((bus.occupancy / bus.capacity) * 100));
  detail.querySelector('[data-occ-pct]').textContent = `${pct}%`;
  const bar = detail.querySelector('[data-occ-bar]');
  bar.style.width = pct + '%';
  bar.classList.toggle('high', pct > 90);

  const tempEl = detail.querySelector('[data-temp]');
  tempEl.classList.toggle('warn', bus.engineTemp > 95);
  tempEl.classList.toggle('bad', bus.engineTemp > 100);
  detail.querySelector('[data-fuel]').classList.toggle('bad', bus.fuel < 15);

  detail.querySelector('[data-next-stop]').textContent = bus.nextStop;
  detail.querySelector('[data-eta]').textContent = bus.etaMin != null ? `${bus.etaMin} min · ${bus.nextStopDistance} m` : '—';
  detail.querySelector('[data-direction]').textContent = bus.direction;

  const evEl = detail.querySelector('[data-bus-events]');
  if (evEl) {
    const evts = state.alerts.filter((a) => a.busId === bus.id).slice(0, 4);
    evEl.innerHTML = evts.length
      ? evts.map((a) => `
        <div class="evt">
          <span class="evt-time">${shortTimeFmt.format(new Date(a.ts))}</span>
          <span class="evt-dot ${a.severity}"></span>
          <span class="evt-label">${a.label}</span>
        </div>`).join('')
      : '<div class="evt-empty">Sin eventos registrados en este turno.</div>';
  }

  const tile = detail.querySelector('.cam-tile');
  if (tile) tile.classList.toggle('no-signal', bus.commsLost);
}

function stopCams() {
  if (camRAF) cancelAnimationFrame(camRAF);
  camRAF = null;
}

function startCams() {
  stopCams();
  const tiles = $$('.cam-tile', detail);
  if (!tiles.length) return;
  let lastSecond = -1;

  const loop = () => {
    const bus = state.buses.find((b) => b.id === state.selectedBusId);
    if (!bus) return;
    const now = new Date();
    const sec = now.getSeconds();
    const t = performance.now() / 1000;

    for (const tile of tiles) {
      const canvas = tile.querySelector('canvas');
      drawScene(canvas, tile.dataset.kind, t, bus);
      tile.classList.toggle('no-signal', bus.commsLost);
      if (sec !== lastSecond) {
        const info = tile.querySelector('[data-cam-info]');
        const time = tile.querySelector('[data-cam-time]');
        if (info) info.textContent = camInfo(tile.dataset.kind, bus);
        if (time) time.textContent = timeFmt.format(now);
      }
    }
    lastSecond = sec;
    camRAF = requestAnimationFrame(loop);
  };
  camRAF = requestAnimationFrame(loop);
}

function camInfo(kind, bus) {
  if (bus.commsLost) return 'SIN ENLACE';
  if (kind === 'door') return `OCUPACIÓN ${bus.occupancy}/${bus.capacity}`;
  if (kind === 'driver') return bus.alertSeverity === 'alta' ? 'ALERTA DE CONDUCTOR' : 'MONITOREO ACTIVO';
  if (kind === 'salon') return `${bus.occupancy} PASAJEROS`;
  return `${bus.speed} KM/H · GPS OK`;
}

/* ══════════════════════════ dibujo de cámaras ══════════════════════════ */

function drawScene(canvas, kind, t, bus) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (bus.commsLost) {
    drawNoSignal(ctx, w, h, t);
    return;
  }

  if (kind === 'door') drawDoor(ctx, w, h, t, bus);
  else if (kind === 'driver') drawDriver(ctx, w, h, t, bus);
  else if (kind === 'salon') drawSalon(ctx, w, h, t, bus);
  else drawFront(ctx, w, h, t, bus);

  // scanlines + viñeta
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawNoSignal(ctx, w, h, t) {
  ctx.fillStyle = '#05080d';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.09})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 2 + 1, 1);
  }
  const y = (t * 40) % h;
  ctx.fillStyle = 'rgba(120,160,200,0.08)';
  ctx.fillRect(0, y, w, 2);
}

function person(ctx, x, baseY, s, alpha, shirt, skin = '#c79a6f', bob = 0) {
  ctx.globalAlpha = alpha;
  // piernas
  ctx.fillStyle = '#1b2636';
  ctx.fillRect(x - 5 * s, baseY - 10 * s + bob, 3.6 * s, 10 * s);
  ctx.fillRect(x + 1.4 * s, baseY - 10 * s + bob, 3.6 * s, 10 * s);
  // torso
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(x - 8 * s, baseY - 27 * s + bob, 16 * s, 19 * s, 5 * s);
  ctx.fill();
  // cabeza
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, baseY - 33 * s + bob, 6.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawDoor(ctx, w, h, t, bus) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0c1726');
  g.addColorStop(1, '#060c14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // techo
  ctx.fillStyle = '#0f1d2d';
  ctx.fillRect(0, 0, w, h * 0.16);

  // piso en perspectiva
  ctx.fillStyle = '#101f30';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.16, h * 0.6);
  ctx.lineTo(w * 0.84, h * 0.6);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(120,160,200,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = h * 0.6 + (h * 0.4) * (i / 6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // puerta
  const dx = w * 0.56;
  const dy = h * 0.12;
  const dw = w * 0.36;
  const dh = h * 0.7;
  ctx.fillStyle = '#08131f';
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, 4);
  ctx.fill();

  // luz exterior
  const lg = ctx.createLinearGradient(dx, dy, dx, dy + dh);
  lg.addColorStop(0, 'rgba(125,211,252,0.22)');
  lg.addColorStop(1, 'rgba(125,211,252,0.05)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.roundRect(dx + 3, dy + 3, dw - 6, dh - 6, 3);
  ctx.fill();

  // marco
  ctx.strokeStyle = '#24405c';
  ctx.lineWidth = 2;
  ctx.strokeRect(dx, dy, dw, dh);

  // pasamanos
  ctx.strokeStyle = '#2b4761';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.44, h * 0.2);
  ctx.lineTo(w * 0.44, h * 0.78);
  ctx.stroke();

  // pasajeros
  const n = Math.min(4, Math.max(1, Math.round(bus.occupancy / 26)));
  for (let i = 0; i < n; i++) {
    const phase = ((t * 0.14 + i * 0.33) % 1);
    const x = -18 + phase * (w * 0.52 + 36);
    const base = h * 0.82 - i * 3;
    const s = 0.9 + i * 0.06;
    const bob = Math.sin(t * 4 + i) * 1.4;
    person(ctx, x, base, s, 0.9, ['#3b5a78', '#5b4a3a', '#3f4a5c', '#4a3a4f'][i % 4], '#c79a6f', bob);
  }

  // marco superior
  ctx.fillStyle = 'rgba(10,20,32,0.85)';
  ctx.fillRect(0, 0, w, 6);
}

function drawDriver(ctx, w, h, t, bus) {
  // parabrisas
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#071120');
  g.addColorStop(0.55, '#0d2237');
  g.addColorStop(0.75, '#123049');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // ciudad al fondo
  ctx.fillStyle = 'rgba(8,16,26,0.9)';
  for (let i = 0; i < 9; i++) {
    const bw = w * 0.09;
    const bh = h * (0.07 + ((i * 37) % 11) / 100);
    ctx.fillRect(i * bw * 1.1 - w * 0.02, h * 0.5 - bh, bw, bh);
  }

  // luces
  for (let i = 0; i < 16; i++) {
    const x = ((i * 61 + t * (6 + (i % 3) * 4)) % (w + 40)) - 20;
    const y = h * (0.34 + ((i * 13) % 22) / 100);
    const warm = i % 3 === 0;
    ctx.fillStyle = warm ? 'rgba(255,190,90,0.65)' : 'rgba(160,220,255,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 2.2 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // tablero
  ctx.fillStyle = '#08111c';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.7);
  ctx.quadraticCurveTo(w * 0.5, h * 0.58, w, h * 0.72);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // volante
  ctx.strokeStyle = '#1d3145';
  ctx.lineWidth = Math.max(4, w * 0.018);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.93, w * 0.19, h * 0.13, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  // conductor
  const sleep = bus.alertSeverity === 'alta' && bus.alertId;
  const nod = sleep ? Math.sin(t * 1.1) * 2.2 : Math.sin(t * 0.7) * 0.7;
  const cx = w * 0.5;
  const base = h * 0.92;

  ctx.fillStyle = '#24384d';
  ctx.beginPath();
  ctx.roundRect(cx - w * 0.13, base - h * 0.3, w * 0.26, h * 0.3, 8);
  ctx.fill();

  ctx.fillStyle = '#c79a6f';
  ctx.beginPath();
  ctx.arc(cx, base - h * 0.38 + nod, Math.min(w, h) * 0.085, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2b3d52';
  ctx.beginPath();
  ctx.arc(cx, base - h * 0.42 + nod, Math.min(w, h) * 0.088, Math.PI, Math.PI * 2);
  ctx.fill();

  // ojos
  ctx.strokeStyle = '#1b2431';
  ctx.lineWidth = 1.6;
  if (sleep) {
    ctx.beginPath();
    ctx.moveTo(cx - 8, base - h * 0.38 + nod);
    ctx.lineTo(cx - 3, base - h * 0.38 + nod);
    ctx.moveTo(cx + 3, base - h * 0.38 + nod);
    ctx.lineTo(cx + 8, base - h * 0.38 + nod);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1b2431';
    ctx.beginPath();
    ctx.arc(cx - 5.5, base - h * 0.385 + nod, 1.4, 0, Math.PI * 2);
    ctx.arc(cx + 5.5, base - h * 0.385 + nod, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // alerta roja
  if (sleep) {
    ctx.fillStyle = `rgba(239,68,68,${0.12 + Math.sin(t * 5) * 0.06})`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(239,68,68,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  // espejo retrovisor
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(w * 0.06, h * 0.04, w * 0.14, h * 0.1);
  ctx.strokeStyle = '#29445f';
  ctx.strokeRect(w * 0.06, h * 0.04, w * 0.14, h * 0.1);
}

function drawSalon(ctx, w, h, t, bus) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a1524');
  g.addColorStop(1, '#060d16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // techo con luces
  for (let i = 0; i < 4; i++) {
    const y = h * (0.08 + i * 0.06);
    ctx.fillStyle = `rgba(190,225,255,${0.16 - i * 0.02})`;
    ctx.beginPath();
    ctx.roundRect(w * 0.3, y, w * 0.4, 2.5, 2);
    ctx.fill();
  }

  // pasillo
  ctx.fillStyle = '#0e1c2c';
  ctx.beginPath();
  ctx.moveTo(w * 0.46, h * 0.2);
  ctx.lineTo(w * 0.54, h * 0.2);
  ctx.lineTo(w * 0.82, h);
  ctx.lineTo(w * 0.18, h);
  ctx.closePath();
  ctx.fill();

  // franjas del piso
  ctx.strokeStyle = 'rgba(130,170,210,0.06)';
  for (let i = 1; i < 6; i++) {
    const p = i / 6;
    const y = h * 0.2 + Math.pow(p, 1.7) * h * 0.8;
    const halfW = w * (0.04 + p * 0.32);
    ctx.beginPath();
    ctx.moveTo(w / 2 - halfW, y);
    ctx.lineTo(w / 2 + halfW, y);
    ctx.stroke();
  }

  // asientos y pasajeros
  const occFrac = Math.min(1, bus.occupancy / bus.capacity);
  for (let row = 0; row < 5; row++) {
    const p = row / 5;
    const y = h * 0.3 + p * p * h * 0.62;
    const scale = 0.42 + p * 1.15;
    const seatW = 16 * scale;
    const seatH = 22 * scale;
    const offset = w * (0.1 + p * 0.2);

    for (const side of [-1, 1]) {
      const x = w / 2 + side * offset;
      // asiento
      ctx.fillStyle = '#132437';
      ctx.beginPath();
      ctx.roundRect(x - seatW / 2, y, seatW, seatH, 3 * scale);
      ctx.fill();
      // respaldo
      ctx.fillStyle = '#172c42';
      ctx.beginPath();
      ctx.roundRect(x - seatW / 2, y - seatH * 0.55, seatW, seatH * 0.5, 3 * scale);
      ctx.fill();

      // pasajero
      const occupied = ((row * 7 + (side + 2) * 13) % 10) / 10 < occFrac;
      if (occupied) {
        const sway = Math.sin(t * 1.6 + row + side) * scale * 1.2;
        ctx.fillStyle = '#c79a6f';
        ctx.beginPath();
        ctx.arc(x + sway, y - seatH * 0.72, 4.6 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ['#33506e', '#4a3f52', '#3d5145', '#5a4a3a'][(row + side + 3) % 4];
        ctx.beginPath();
        ctx.roundRect(x - 5 * scale + sway, y - seatH * 0.6, 10 * scale, seatH * 0.5, 3 * scale);
        ctx.fill();
      }
    }
  }

  // barra de sujeción
  ctx.strokeStyle = '#2c4a66';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h * 0.16);
  ctx.lineTo(w * 0.36, h * 0.8);
  ctx.moveTo(w * 0.64, h * 0.16);
  ctx.lineTo(w * 0.64, h * 0.8);
  ctx.stroke();
}

function drawFront(ctx, w, h, t, bus) {
  // cielo
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#050b14');
  sky.addColorStop(1, '#102437');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.6);

  // edificios
  ctx.fillStyle = '#0a1623';
  for (let i = 0; i < 12; i++) {
    const bw = w / 11;
    const bh = h * (0.05 + ((i * 29) % 15) / 100);
    ctx.fillRect(i * bw - 4, h * 0.58 - bh, bw + 2, bh);
    ctx.fillStyle = 'rgba(255,200,120,0.18)';
    ctx.fillRect(i * bw + bw * 0.3, h * 0.58 - bh * 0.7, 2, 2);
    ctx.fillStyle = '#0a1623';
  }

  // calle
  ctx.fillStyle = '#111c28';
  ctx.beginPath();
  ctx.moveTo(w * 0.47, h * 0.58);
  ctx.lineTo(w * 0.53, h * 0.58);
  ctx.lineTo(w * 1.25, h);
  ctx.lineTo(-w * 0.25, h);
  ctx.closePath();
  ctx.fill();

  // líneas laterales
  ctx.strokeStyle = 'rgba(220,235,250,0.25)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + side * w * 0.03, h * 0.58);
    ctx.lineTo(w / 2 + side * w * 0.75, h);
    ctx.stroke();
  }

  // dashes centrales en movimiento
  const speed = Math.max(0, bus.speed) / 30;
  for (let k = 0; k < 7; k++) {
    const p = ((k / 7) + t * (0.25 + speed * 0.35)) % 1;
    const y = h * 0.58 + p * p * h * 0.45;
    const len = 3 + p * 14;
    const wid = 1 + p * 3;
    ctx.fillStyle = `rgba(240,245,255,${0.25 + p * 0.5})`;
    ctx.fillRect(w / 2 - wid / 2, y, wid, len);
  }

  // luces de frente
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.16 + i * 0.5) % 1);
    const y = h * 0.6 + p * h * 0.35;
    const x = w * 0.68 - p * w * 0.18;
    const r = 3 + p * 12;
    const lg = ctx.createRadialGradient(x, y, 0, x, y, r);
    lg.addColorStop(0, 'rgba(255,245,220,0.85)');
    lg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // tablero
  ctx.fillStyle = '#070f19';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.86);
  ctx.quadraticCurveTo(w * 0.5, h * 0.8, w, h * 0.88);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(56,189,248,0.35)';
  ctx.fillRect(w * 0.42, h * 0.9, w * 0.16, 1.5);
}

/* ══════════════════════════ reportes ══════════════════════════ */

async function loadReports() {
  try {
    state.reports = await api('/api/reports');
    renderReports();
  } catch (err) {
    if (err.message !== 'Sesión expirada') toast(err.message, true);
  }
}

function renderReports() {
  const r = state.reports;
  if (!r) return;

  $('#report-cards').innerHTML = `
    <div class="report-card accent">
      <div class="label">Pasajeros transportados</div>
      <div class="value">${nf.format(r.summary.boardings)}</div>
      <div class="hint">día típico · todas las rutas</div>
    </div>
    <div class="report-card ok">
      <div class="label">Cumplimiento de ruta</div>
      <div class="value">${r.summary.compliance}%</div>
      <div class="hint">horario y paradas</div>
    </div>
    <div class="report-card ${r.summary.openAlerts ? 'danger' : ''}">
      <div class="label">Alertas abiertas</div>
      <div class="value">${r.summary.openAlerts}</div>
      <div class="hint">requieren atención</div>
    </div>
    <div class="report-card">
      <div class="label">Ocupación media</div>
      <div class="value">${r.summary.occupancyAvg}%</div>
      <div class="hint">capacidad utilizada</div>
    </div>`;

  renderDemandChart(r.demandByHour);
  renderIncidentBars(r.incidentsByType);
  renderRouteTable(r.routeStats);
}

function renderDemandChart(data) {
  const el = $('#demand-chart');
  const W = el.clientWidth || 640;
  const H = 210;
  const pad = { l: 38, r: 8, t: 12, b: 22 };
  const val = (d) => d.boardings ?? d.passengers ?? 0;
  const max = Math.max(1, ...data.map(val));
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  let svgStr = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffc44d"/>
        <stop offset="100%" stop-color="#a35c00"/>
      </linearGradient>
    </defs>`;

  for (let i = 0; i <= 3; i++) {
    const gy = pad.t + (i / 3) * (H - pad.t - pad.b);
    const label = Math.round(max * (1 - i / 3));
    svgStr += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}"/>`;
    svgStr += `<text class="axis-label" x="${pad.l - 6}" y="${gy + 3}" text-anchor="end">${nf.format(label)}</text>`;
  }

  data.forEach((d, i) => {
    const x = pad.l + i * bw + bw * 0.18;
    const barW = bw * 0.64;
    const barH = H - pad.b - y(val(d));
    svgStr += `<rect class="bar" fill="url(#barGrad)" x="${x}" y="${y(val(d))}" width="${barW}" height="${Math.max(0, barH)}" rx="2"><title>${d.hour}:00 · ${nf.format(val(d))}</title></rect>`;
    if (d.hour % 3 === 0) {
      svgStr += `<text class="axis-label" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${String(d.hour).padStart(2, '0')}h</text>`;
    }
  });
  svgStr += '</svg>';
  el.innerHTML = svgStr;
}

function renderIncidentBars(items) {
  const max = Math.max(...items.map((i) => i.count));
  $('#incident-chart').innerHTML = items.map((i) => `
    <div class="hbar">
      <span class="name" title="${i.label}">${i.label}</span>
      <span class="track"><span class="fill" style="width:${(i.count / max) * 100}%;background:${
        i.severity === 'alta' ? 'linear-gradient(90deg,#7f1d1d,#ef4444)' :
        i.severity === 'media' ? 'linear-gradient(90deg,#78350f,#f59e0b)' :
        'linear-gradient(90deg,#1e3a8a,#3b82f6)'
      }"></span></span>
      <span class="num">${i.count}</span>
    </div>`).join('');
}

function renderRouteTable(rows) {
  $('#route-table tbody').innerHTML = rows.map((r) => `
    <tr>
      <td><span class="route-cell"><span class="route-dot" style="background:${r.color}"></span>${r.code} · ${r.name}</span></td>
      <td>${r.buses}</td>
      <td>${nf.format(r.boardings)}</td>
      <td>${r.occupancy}%</td>
      <td>${r.incidents}</td>
      <td>
        <span class="comp">
          <span class="track"><span class="fill" style="width:${r.compliance}%;background:${r.compliance > 95 ? '#22c55e' : r.compliance > 88 ? '#f59e0b' : '#ef4444'}"></span></span>
          <span>${r.compliance}%</span>
        </span>
      </td>
    </tr>`).join('');
}

/* ══════════════════════════ paradas ══════════════════════════ */

async function loadStops() {
  try {
    state.stops = await api('/api/stops');
    renderStops();
  } catch (err) {
    if (err.message !== 'Sesión expirada') toast(err.message, true);
  }
}

function renderStops() {
  const d = state.stops;
  if (!d) return;
  const named = d.stops.filter((s) => s.name && !/^Parada( \d+)?$/i.test(s.name));
  const top = named[0] || d.stops[0];

  $('#stop-cards').innerHTML = `
    <div class="report-card">
      <div class="label">Paradas monitoreadas</div>
      <div class="value">${d.totals.stops}</div>
      <div class="hint">últimas 24 horas</div>
    </div>
    <div class="report-card accent">
      <div class="label">Pasajeros que suben</div>
      <div class="value">${nf.format(d.totals.boardings)}</div>
      <div class="hint">aforo registrado</div>
    </div>
    <div class="report-card ok">
      <div class="label">Transbordos</div>
      <div class="value">${nf.format(d.totals.transfers)}</div>
      <div class="hint">en nodos de transferencia</div>
    </div>
    <div class="report-card">
      <div class="label">Mayor demanda</div>
      <div class="value" style="font-size:18px">${top ? top.name : '—'}</div>
      <div class="hint">${top ? `${top.routeCode} · ${nf.format(top.total)} pasajeros` : ''}</div>
    </div>`;

  const sel = $('#stops-route');
  if (sel.dataset.ready !== '1') {
    sel.innerHTML = '<option value="all">Todas las rutas</option>' +
      state.routes.map((r) => `<option value="${r.id}">${r.code} · ${r.name}</option>`).join('');
    sel.dataset.ready = '1';
    sel.value = state.stopsRoute;
  }

  const q = state.stopsQuery.toLowerCase().trim();
  const rows = d.stops
    .filter((s) => (state.stopsRoute === 'all' || s.routeId === state.stopsRoute) &&
      (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  $('#stops-table tbody').innerHTML = rows.length
    ? rows.slice(0, 150).map((s) => `
      <tr>
        <td>${s.name}${s.hubName ? `<span class="hub-tag" title="Nodo de transbordo · ${s.hubName}">${s.hubName === s.name ? 'NODO' : s.hubName}</span>` : ''}</td>
        <td><span class="route-cell"><span class="route-dot" style="background:${s.color}"></span>${s.routeCode}</span></td>
        <td class="num-mono">${nf.format(s.boardings)}</td>
        <td class="num-mono">${nf.format(s.alightings)}</td>
        <td class="num-mono">${nf.format(s.transfers)}</td>
        <td>
          <span class="demand-bar"><i style="width:${(s.total / maxTotal) * 100}%"></i></span>
          <span class="num-mono">${nf.format(s.total)}</span>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6"><div class="empty">Sin paradas para este filtro</div></td></tr>';

  const chartRows = rows.filter((s) => !/^Parada( \d+)?$/i.test(s.name)).slice(0, 8);
  renderHBars($('#top-stops'), (chartRows.length ? chartRows : rows.slice(0, 8)).map((s) => ({
    label: s.name,
    value: s.total,
    meta: `${s.routeCode} · ${nf.format(s.boardings)} suben`,
  })), '#38bdf8');
}

function renderHBars(el, items, color = '#38bdf8') {
  if (!el) return;
  const max = Math.max(1, ...items.map((i) => i.value));
  el.innerHTML = items.length
    ? items.map((i) => `
      <div class="hbar">
        <span class="name" title="${i.meta || i.label}">${i.label}</span>
        <span class="track"><span class="fill" style="width:${(i.value / max) * 100}%;background:linear-gradient(90deg,#1e3a5b,${color})"></span></span>
        <span class="num">${nf.format(i.value)}</span>
      </div>`).join('')
    : '<div class="empty">Sin datos</div>';
}

/* ══════════════════════════ histórico ══════════════════════════ */

async function loadHistory(days = state.historyDays) {
  state.historyDays = days;
  try {
    state.history = await api(`/api/history?days=${days}`);
    renderHistory();
  } catch (err) {
    if (err.message !== 'Sesión expirada') toast(err.message, true);
  }
}

function renderHistory() {
  const h = state.history;
  if (!h) return;
  const daily = h.daily || [];
  const total = daily.reduce((a, d) => a + d.boardings, 0);
  $('#history-total').textContent = `${nf.format(total)} pasajeros · ${daily.length} días`;

  areaChart($('#history-daily'), daily.map((d) => ({
    label: d.day.slice(5).replace('-', '/'),
    value: d.boardings,
  })), { color: '#ffb020' });

  barChart($('#history-alerts'), daily.map((d) => ({
    label: d.day.slice(8),
    value: d.alerts,
  })), { color: '#ef4444' });

  areaChart($('#history-hourly'), (h.hourly || []).map((x) => ({
    label: String(x.hour).padStart(2, '0'),
    value: x.occupancy,
  })), { color: '#38bdf8', max: 100, unit: '%' });

  areaChart($('#history-transfers'), daily.map((d) => ({
    label: d.day.slice(5).replace('-', '/'),
    value: d.transfers,
  })), { color: '#a78bfa' });

  $$('#history-range button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.days) === state.historyDays);
  });
}

/* ══════════════════════════ gráficas SVG ══════════════════════════ */

function chartBox(el, H = 210) {
  const W = Math.max(280, el.clientWidth || 640);
  return { W, H, pad: { l: 44, r: 10, t: 14, b: 24 } };
}

function areaChart(el, points, opts = {}) {
  if (!el) return;
  const { color = '#38bdf8', max = null, unit = '' } = opts;
  const { W, H, pad } = chartBox(el);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const nums = points.map((p) => p.value).filter((v) => v != null);
  if (!nums.length) {
    el.innerHTML = '<div class="empty">Sin datos todavía</div>';
    return;
  }
  const top = max ?? Math.max(...nums) * 1.12;
  const x = (i) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.t + (1 - v / top) * innerH;
  const gid = 'g' + Math.random().toString(36).slice(2, 8);

  let svg = `<svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>`;

  for (let i = 0; i <= 3; i++) {
    const gy = pad.t + (i / 3) * innerH;
    svg += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}"/>`;
    svg += `<text class="axis-label" x="${pad.l - 6}" y="${gy + 3}" text-anchor="end">${nf.format(Math.round(top * (1 - i / 3)))}${unit}</text>`;
  }

  const segments = [];
  let cur = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push({ i, v: p.value });
    }
  });
  if (cur.length) segments.push(cur);

  for (const seg of segments) {
    const line = seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
    const last = seg[seg.length - 1];
    const first = seg[0];
    svg += `<path class="area-path" fill="url(#${gid})" d="${line} L${x(last.i).toFixed(1)} ${pad.t + innerH} L${x(first.i).toFixed(1)} ${pad.t + innerH} Z"/>`;
    svg += `<path class="line-path" stroke="${color}" d="${line}"/>`;
    for (const p of seg) {
      svg += `<circle class="dot" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.1" fill="${color}" stroke="#0b1220"><title>${points[p.i].label}: ${nf.format(Math.round(p.v))}${unit}</title></circle>`;
    }
  }

  const step = Math.max(1, Math.ceil(points.length / 8));
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      svg += `<text class="axis-label" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${p.label}</text>`;
    }
  });

  svg += '</svg>';
  el.innerHTML = svg;
}

function barChart(el, points, opts = {}) {
  if (!el) return;
  const { color = '#ffb020' } = opts;
  const { W, H, pad } = chartBox(el);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const nums = points.map((p) => p.value).filter((v) => v != null);
  if (!nums.length) {
    el.innerHTML = '<div class="empty">Sin datos todavía</div>';
    return;
  }
  const top = Math.max(...nums) * 1.12;
  const bw = innerW / points.length;
  const y = (v) => pad.t + (1 - v / top) * innerH;

  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 3; i++) {
    const gy = pad.t + (i / 3) * innerH;
    svg += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}"/>`;
    svg += `<text class="axis-label" x="${pad.l - 6}" y="${gy + 3}" text-anchor="end">${nf.format(Math.round(top * (1 - i / 3)))}</text>`;
  }
  points.forEach((p, i) => {
    if (p.value == null) return;
    const bh = Math.max(0, pad.t + innerH - y(p.value));
    svg += `<rect class="bar" x="${pad.l + i * bw + bw * 0.2}" y="${y(p.value)}" width="${Math.max(1, bw * 0.6)}" height="${bh}" rx="2" fill="${color}" opacity="0.85"><title>${p.label}: ${nf.format(p.value)}</title></rect>`;
  });
  const step = Math.max(1, Math.ceil(points.length / 8));
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      svg += `<text class="axis-label" x="${pad.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${p.label}</text>`;
    }
  });
  svg += '</svg>';
  el.innerHTML = svg;
}

/* ══════════════════════════ pestañas ══════════════════════════ */

const TAB_VIEWS = {
  ops: 'view-ops',
  stops: 'view-stops',
  reports: 'view-reports',
  history: 'view-history',
};

function switchTab(tab) {
  if (!TAB_VIEWS[tab] || tab === state.tab) return;
  state.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  for (const [key, id] of Object.entries(TAB_VIEWS)) {
    $('#' + id).classList.toggle('hidden', key !== tab);
  }
  if (tab === 'ops') {
    renderDetail(true);
    setTimeout(() => {
      if (!map) return;
      map.invalidateSize();
      if (!mapFitted) fitNetwork();
    }, 80);
  } else {
    stopCams();
  }
  if (tab === 'stops') loadStops();
  if (tab === 'reports') loadReports();
  if (tab === 'history') loadHistory(state.historyDays);
}

/* ══════════════════════════ render global ══════════════════════════ */

function renderAll() {
  if (!state.selectedBusId && state.buses.length) {
    const withAlert = state.buses.find((b) => b.alertSeverity === 'alta');
    state.selectedBusId = (withAlert || state.buses[0]).id;
    renderDetail(true);
  }
  renderKPIs();
  renderRoutes();
  renderFleet();
  renderAlerts();
  renderLegend();
  updateMap();
  renderDetail();
}

function applyNetwork(net) {
  state.network = net;
  state.routes = (net.routes || []).map((r) => ({ ...r, buses: 0, headway: r.headwayMin }));
  state.routeById = new Map(state.routes.map((r) => [r.id, r]));
  state.hubs = net.hubs || [];
  state.busMeta = new Map((net.buses || []).map((b) => [b.id, b]));
  computeBounds();
  renderLegend();
  buildMap();
}

function applyState(data) {
  if (!data || !Array.isArray(data.buses) || !state.network) return;

  const dynamic = new Map((data.routes || []).map((r) => [r.id, r]));
  for (const route of state.routes) {
    const d = dynamic.get(route.id);
    if (d) {
      route.buses = d.buses;
      route.headway = d.headway;
    }
  }

  state.buses = data.buses.map((b) => {
    const meta = state.busMeta.get(b.id) || {};
    const route = state.routeById.get(b.routeId);
    return {
      ...b,
      plate: meta.plate || '—',
      driver: meta.driver || '—',
      capacity: meta.capacity || 70,
      model: meta.model || 'Bus urbano',
      year: meta.year || 2018,
      cameras: meta.cameras || 4,
      routeCode: route?.code || b.routeId,
      routeName: route?.name || '',
      routeColor: route?.color || '#38bdf8',
      status: b.commsLost ? 'sin señal' : b.alertId ? 'alerta' : b.dwelling ? 'en parada' : 'en ruta',
    };
  });

  state.alerts = data.alerts;
  state.kpis = data.kpis;
  trafficTick = (trafficTick + 1) % 3;
  if (trafficActive && trafficMode === 'simulated' && trafficTick === 0) updateTraffic();
  setLive(true);
  renderAll();
}

/* ══════════════════════════ conexión ══════════════════════════ */

function setLive(on) {
  state.connected = on;
  const pill = $('#live-pill');
  pill.classList.toggle('offline', !on);
  $('#live-text').textContent = on ? 'En vivo' : 'Reconectando…';
}

function connect() {
  if (es) es.close();
  es = new EventSource('/api/stream');
  es.addEventListener('state', (e) => applyState(JSON.parse(e.data)));
  es.addEventListener('tick', (e) => applyState(JSON.parse(e.data)));
  es.addEventListener('alert', () => { /* el siguiente tick lo incluye */ });
  es.onopen = () => setLive(true);
  es.onerror = async () => {
    setLive(false);
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) lock();
    } catch {
      /* sin red */
    }
  };
}

/* ══════════════════════════ eventos de UI ══════════════════════════ */

function bindUI() {
  document.addEventListener('click', (e) => {
    const routeBtn = e.target.closest('[data-route]');
    if (routeBtn && !e.target.closest('.bus')) {
      const id = routeBtn.dataset.route;
      state.routeFilter = state.routeFilter === id ? 'all' : id;
      renderRoutes();
      renderFleet();
      renderLegend();
      updateRouteStyles();
    }

    const busItem = e.target.closest('.bus-item');
    if (busItem) selectBus(busItem.dataset.id);

    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'see') selectBus(act.dataset.bus);
      if (act.dataset.act === 'ack') ackAlert(act.dataset.id);
    }

    const chip = e.target.closest('#fleet-chips .chip');
    if (chip) {
      state.statusFilter = chip.dataset.filter;
      $$('#fleet-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderFleet();
    }
  });

  $('#fleet-search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderFleet();
  });

  $('#alert-list').addEventListener('wheel', (e) => {
    if (!e.deltaY) return;
    e.preventDefault();
    e.currentTarget.scrollLeft += e.deltaY;
  }, { passive: false });

  $('#open-settings')?.addEventListener('click', openSettings);
  $('#settings-close')?.addEventListener('click', closeSettings);
  $('#settings-save')?.addEventListener('click', saveSettings);
  $('#settings-clear')?.addEventListener('click', clearSettings);
  $('#settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  $('#stops-route')?.addEventListener('change', (e) => {
    state.stopsRoute = e.target.value;
    if (state.stops) renderStops();
  });

  $('#stops-search')?.addEventListener('input', (e) => {
    state.stopsQuery = e.target.value;
    if (state.stops) renderStops();
  });

  $$('#history-range button').forEach((btn) => {
    btn.addEventListener('click', () => loadHistory(Number(btn.dataset.days)));
  });

  window.addEventListener('resize', () => {
    if (state.tab === 'reports' && state.reports) renderDemandChart(state.reports.demandByHour);
    if (state.tab === 'stops' && state.stops) renderStops();
    if (state.tab === 'history' && state.history) renderHistory();
  });
}

/* ══════════════════════════ login ══════════════════════════ */

function bindLogin() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-submit');
    const errEl = $('#login-error');
    btn.disabled = true;
    errEl.textContent = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('#login-user').value.trim(),
          password: $('#login-pass').value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || 'No se pudo iniciar sesión';
        return;
      }
      $('#login-pass').value = '';
      await startApp(data.user);
    } catch {
      errEl.textContent = 'No se pudo conectar con el servidor';
    } finally {
      btn.disabled = false;
    }
  });

  $$('.demo-users button').forEach((b) => {
    b.addEventListener('click', () => {
      const u = b.dataset.fill;
      $('#login-user').value = u;
      $('#login-pass').value = `${u}123`;
      $('#login-pass').focus();
    });
  });

  $('#logout').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* ignore */
    }
    location.reload();
  });
}

/* ══════════════════════════ arranque ══════════════════════════ */

async function boot() {
  tickClock();
  setInterval(tickClock, 1000);
  bindUI();
  bindMapControls();
  bindLogin();

  setInterval(() => {
    if (state.tab === 'stops' && state.user) loadStops();
  }, 20000);
  setInterval(() => {
    if (state.tab === 'history' && state.user) loadHistory(state.historyDays);
  }, 60000);

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const { user } = await res.json();
      await startApp(user);
    } else {
      showLogin();
    }
  } catch {
    showLogin('No se pudo conectar con el servidor');
  }
}

boot();
