# Solicitud de GTFS al SIT / EPMTP de Quito

Plantilla para pedir el feed oficial de transporte público. Se puede enviar por correo o por
oficio a la EPMTP, al SIT o a la AMT.

## Datos de contacto sugeridos

- **EPMTP** — Empresa Pública Metropolitana de Transporte de Pasajeros de Quito
  (`pasajeros.quito.gob.ec`)
- **SIT** — Sistema Integrado de Transporte (`sit.quito.gob.ec`)
- **AMT** — Agencia Metropolitana de Tránsito (para validación de rutas y paradas)

## Asunto

Solicitud de feed GTFS del Sistema Integrado de Transporte de Quito para integración en sistema
de control de flota.

## Cuerpo del correo

Estimados señores:

Mi nombre es **[nombre]**, en representación de **[organización]**. Estamos desarrollando un
sistema de control y monitoreo de flota para buses urbanos de Quito que busca mejorar la
seguridad, la puntualidad y la información al usuario.

Solicitamos de la manera más comedida el acceso al **feed GTFS (General Transit Feed
Specification)** del Sistema Integrado de Transporte, o a la versión más completa disponible de
rutas, paradas y horarios. El uso previsto es exclusivamente operativo y de investigación:

- Visualización de la red y de los recorridos en un mapa.
- Cálculo de intervalos, cumplimiento de ruta y tiempos de viaje.
- Análisis de demanda y planificación de frecuencias.
- Publicación de información al usuario (si la entidad lo autoriza).

Requerimientos técnicos mínimos:

| Archivo | Contenido esperado |
|---|---|
| `agency.txt` | Operadores y zona horaria (`America/Guayaquil`) |
| `routes.txt` | Código, nombre, color y tipo de cada ruta |
| `stops.txt` | Paradas con latitud/longitud y nombre |
| `shapes.txt` | Geometría de cada recorrido |
| `trips.txt` + `stop_times.txt` | Horarios por viaje y parada |
| `calendar.txt` / `calendar_dates.txt` | Días de operación |
| `frequencies.txt` (opcional) | Frecuencias por franja horaria |

Agradecemos indicar:

1. La licencia de uso y las condiciones de atribución.
2. La periodicidad de actualización del feed.
3. Si existe un endpoint o URL estable para descarga automatizada.
4. El contacto técnico para consultas sobre el esquema.

Quedamos atentos y disponibles para firmar un acuerdo de uso, aceptar condiciones de
confidencialidad o presentar el proyecto en una reunión técnica.

Atentamente,

**[nombre]**
**[cargo]**
**[organización]**
**[teléfono] · [correo]**

## Nota interna

Si la entidad entrega el ZIP, el importador debe mapear:

- `routes.route_id` → `id`
- `routes.route_short_name` → `code`
- `routes.route_long_name` → `name`
- `routes.route_color` → `color`
- `shapes.shape_id` + `shape_pt_sequence` → geometría
- `stops.stop_lat` / `stop_lon` → paradas
- `trips.service_id` + `stop_times` → horarios y frecuencias

Con eso se reemplaza `server/network.js` y el resto del sistema (simulador, mapa, reportes)
funciona sin cambios.
