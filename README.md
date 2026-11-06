# Centro de Control de Flota — Quito

Prototipo funcional de un centro de control para buses urbanos con cámara a bordo, GPS y
telemetría. Incluye **autenticación con roles**, **persistencia en PostgreSQL** (embebido),
**aforo por parada**, **transbordos** e **histórico**.

La **red de rutas y paradas es real**: se extrajo de OpenStreetMap (370 rutas y 370 buses,
2.280 paradas). Los vehículos, pasajeros, alertas y telemetría son simulados sobre esa red. La
interfaz y la API son las definitivas; conectar los datos reales consiste en reemplazar la capa
de simulación.

## Demo en línea (GitHub Pages)

**https://fleremiasflemin20-maker.github.io/control-buses-quito/** ·
[repositorio](https://github.com/fleremiasflemin20-maker/control-buses-quito)

Usuario `supervisor` · contraseña `supervisor123` (también `operador` y `gerencia`).

Es una versión **estática**: el frontend real corre con el simulador en el navegador y un mock
de la API. Sirve para probar la interacción, no para persistencia real. El proyecto completo con
PostgreSQL y sesiones corre localmente como se explica abajo.

## Arrancar

Requiere Node.js 20 o superior.

```bash
cd control-buses-quito
npm install        # solo la primera vez (instala PGlite)
npm start
# → http://127.0.0.1:4173
```

En Windows también puedes usar `iniciar.bat`, que levanta el servidor y abre el navegador.

### Cuentas de demostración

| Usuario | Contraseña | Rol | Puede |
|---|---|---|---|
| `operador` | `operador123` | Operador de tráfico | Ver operación, atender alertas |
| `supervisor` | `supervisor123` | Supervisor de flota | Todo lo anterior + simular pánico |
| `gerencia` | `gerencia123` | Gerencia | Solo lectura; entra directo a Reportes |

La sesión dura 8 horas y se guarda en una cookie `HttpOnly`. **Cambia estas contraseñas antes de
cualquier uso real** (ver “Producción” al final).

## Qué incluye

| Módulo | Estado | Descripción |
|---|---|---|
| Login y roles | ✅ | Sesiones en base de datos, permisos por rol y bloqueo de acciones |
| Mapa en vivo | ✅ | Mapa real (Leaflet + OSM/CARTO), 370 rutas de Quito, 370 buses y 6 nodos |
| Flota | ✅ | Buscador, filtros y estado por bus |
| Detalle del bus | ✅ | 4 cámaras simuladas, telemetría, eventos y próxima parada |
| Alertas | ✅ | Pánico, somnolencia, sobrecupo, evasión, fallas; flujo de atención |
| Paradas | ✅ | Aforo por parada, transbordos y ranking de demanda (24 h) |
| Reportes | ✅ | Demanda del día, incidentes y desempeño por ruta |
| Histórico | ✅ | Series diarias persistidas (7/30 días), alertas y ocupación por hora |
| Base de datos | ✅ | PostgreSQL embebido (PGlite), datos en `data/pgdata` |
| Manual de instalación | ✅ | `docs/Manual-Instalacion-a-Bordo.docx` (12 páginas, con diagramas) |
| Video real | ⬜ | Hoy las cámaras son escenas simuladas en canvas |
| App móvil | ⬜ | Pendiente para inspector y jefe de patio |

## Arquitectura

```
server/
  network.js   red real de rutas y paradas generada desde OpenStreetMap
  data.js      compone network.js con zonas y cámaras
  db.js        PostgreSQL embebido (PGlite), esquema, usuarios y consultas
  sim.js       motor: movimiento, pasajeros, transbordos, alertas, agregados
  server.js    HTTP + API REST + SSE + sesiones + archivos estáticos
public/
  index.html   login y vistas (operación, paradas, reportes, histórico)
  styles.css   tema visual
  app.js       mapa Leaflet, cámaras, gráficas y lógica de UI
  vendor/      Leaflet 1.9.4 (servido local, sin CDN)
tools/
  fetch-network.mjs   descarga y extrae las rutas desde OSM
  build-pages.mjs     genera la demo estática de GitHub Pages
docs/
  build_manual.py           generador del manual (Python + python-docx)
  Manual-Instalacion-a-Bordo.docx / .pdf
```

Sin frameworks ni build para la app: el navegador ejecuta los módulos directamente.

### Red real de rutas (OpenStreetMap)

`server/network.js` se genera con:

```bash
npm install
node tools/fetch-network.mjs --max 370
```

El script descarga el extracto de Ecuador de Geofabrik (~126 MB, no se versiona), lee las
relaciones `route=bus` de Quito, arma las geometrías, deduplica por código de ruta, asigna
paradas y nodos de transbordo y escribe `server/network.js`.

**Datos © OpenStreetMap contributors, licencia ODbL 1.0.** El mapa usa teselas de CARTO con
atribución visible. No se usa Google Maps: su API de rutas exige clave y facturación, y el
raspado de su web viola los términos de servicio.

### Simulación

- 1 segundo real = 25 segundos simulados.
- 370 rutas reales y 370 buses; 6 nodos de transbordo (La Carolina, Centro, El Recreo, Quitumbe,
  La Ofelia, Cumbayá).
- En cada parada los pasajeros suben y bajan; en los nodos una parte transborda a otra ruta y
  se acumula en una cola que el siguiente bus de la ruta conectada recoge.
- Picos de demanda 06:30–09:00 y 16:30–19:30; pérdida de señal simulada.
- Alertas con enfriamiento por bus/tipo para no saturar la bandeja.

### Persistencia

- Todo vive en `data/pgdata` (formato PostgreSQL).
- Se guardan usuarios, sesiones, rutas, buses, alertas, aforo por parada y agregados diarios.
- Al reiniciar se recuperan alertas y los contadores del día; los buses vuelven a su posición
  inicial porque la posición es estado en vivo, no histórico.
- Para empezar de cero: `npm run db:reset` (con el servidor detenido).

## API

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/health` | público | Estado del servicio |
| POST | `/api/auth/login` | público | `{username, password}` → sesión |
| POST | `/api/auth/logout` | sesión | Cierra la sesión |
| GET | `/api/auth/me` | sesión | Usuario actual |
| GET | `/api/config` | sesión | Proveedor de tráfico y claves públicas configuradas |
| GET | `/api/network` | sesión | Red completa: rutas, geometrías, paradas y buses |
| GET | `/api/state` | sesión | Snapshot: buses en vivo, alertas, KPIs |
| GET | `/api/reports` | sesión | Agregados del día |
| GET | `/api/stops` | sesión | Aforo por parada (24 h) |
| GET | `/api/history?days=30` | sesión | Series diarias + ocupación horaria |
| GET | `/api/stream` | sesión | SSE: `state`, `tick`, `alert` |
| POST | `/api/alerts/:id/ack` | operador/supervisor | Marca alerta atendida |
| POST | `/api/buses/:id/panic` | supervisor | Simula botón de pánico |

El login tiene límite de 6 intentos por IP cada 5 minutos.

## Capa de tráfico y Google Maps

El mapa tiene un botón de tráfico con dos modos:

- **Sin clave (por defecto):** capa simulada que colorea cada ruta según la velocidad media de sus
  buses (verde ≥ 24 km/h, ámbar 17–24, rojo < 17). Muestra el concepto, no es tráfico real.
- **TomTom (real):** define `TOMTOM_KEY` al arrancar:
  ```bash
  TOMTOM_KEY=tu_clave npm start
  ```
  El servidor entrega la clave al cliente (restríngela por dominio en el portal de TomTom) y el
  mapa carga las teselas de flujo `traffic/map/4/tile/flow/relative0`.

**Google Maps** no está activo porque falta `GOOGLE_MAPS_API_KEY`. Google no permite superponer su
capa de tráfico sobre Leaflet: habría que cambiar el motor del mapa a Google Maps JS API. Con una
clave válida se puede hacer, pero implica reescribir el adaptador del mapa.

## GTFS del SIT

No se encontró un feed GTFS público del SIT/EPMTP en las fuentes revisadas (portal de datos
abiertos, sitio de la EPMTP y Transitland). Por eso la red se construyó desde OpenStreetMap.
Si se consigue el ZIP oficial, se integra con un importador de `routes.txt`, `trips.txt`,
`stops.txt` y `shapes.txt`, y reemplaza `server/network.js` sin tocar el resto del sistema.

## Conectar los datos reales

### 1. PostgreSQL de servidor

PGlite es PostgreSQL compilado a WebAssembly: mismo SQL, cero instalación. Para producción:

1. Instala PostgreSQL 16+ y crea la base `flota`.
2. `npm i pg`.
3. En `server/db.js`, reemplaza `new PGlite(DB_DIR)` por un `Pool` de `pg` usando
   `DATABASE_URL`. El resto de las consultas no cambia (`query(sql, params)`).
4. Ejecuta el mismo esquema contra esa base.

### 2. Telemetría y video

- **MQTT** (EMQX/Mosquitto): `flota/{busId}/telemetry`, `flota/{busId}/events`.
- **JT/T 808 + JT/T 1078** si se usan MDVR chinos; **GTFS-RT** si se integra con el SIT.
- Los clips se suben a S3/MinIO solo cuando hay evento.

### 3. Cámaras reales

El navegador no abre RTSP: usa MediaMTX, Janus o LiveKit para convertir a WebRTC/HLS. En
`public/app.js`, el visor `drawScene` se reemplaza por `<video>` y se conservan los overlays
(conteo, REC, hora).

### 4. Privacidad

Antes de cámaras reales: aviso visible, política de retención, DPIA y revisión con la autoridad
de protección de datos. Sin reconocimiento facial de pasajeros y sin audio en el salón.

## Producción

Este prototipo prioriza demostración, no seguridad de producción. Antes de exponerlo:

- Cambiar las contraseñas sembradas y crear usuarios reales.
- Servir detrás de HTTPS y marcar la cookie como `Secure`.
- Mover la base a PostgreSQL administrado y respaldos automáticos.
- Agregar rate limiting global, registro de auditoría de accesos y política de retención.
- Revisar el contrato con la operadora y la coordinación con la AMT/SIT.

## Despliegue de la demo en GitHub Pages

La carpeta `pages/` es una build estática generada desde el frontend real:

```bash
npm run pages:build                 # regenera pages/
git add pages && git commit -m "..." # si cambió el frontend
git subtree push --prefix pages origin gh-pages
```

GitHub Pages publica la rama `gh-pages`. El mock de API y el simulador en el navegador están en
`tools/pages-src/mock-api.js`; no hay backend ni base de datos en la demo pública.

## Documentos relacionados

- `docs/Manual-Instalacion-a-Bordo.docx` — hardware, montaje, cableado, pruebas y costos del piloto.
- `../sistema-control-buses-quito.md` — blueprint del sistema (arquitectura, alcance, fases).
