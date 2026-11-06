// Datos base: la red de rutas se genera desde OpenStreetMap con
// tools/fetch-network.mjs (© OpenStreetMap contributors · ODbL 1.0).
// Este archivo solo compone la red con los catálogos estáticos de la app.

export { ROUTES, BUSES, HUBS, NETWORK_META } from './network.js';

export const ZONES = [
  { name: 'La Carolina', lat: -0.1845, lng: -78.4835 },
  { name: 'Centro Histórico', lat: -0.2195, lng: -78.5145 },
  { name: 'El Recreo', lat: -0.2390, lng: -78.5175 },
  { name: 'Quitumbe', lat: -0.2885, lng: -78.5495 },
  { name: 'Carcelén', lat: -0.0925, lng: -78.4815 },
  { name: 'Cumbayá', lat: -0.1965, lng: -78.4360 },
  { name: 'Tumbaco', lat: -0.2085, lng: -78.4010 },
  { name: 'Aeropuerto', lat: -0.1295, lng: -78.3590 },
  { name: 'Iñaquito', lat: -0.1735, lng: -78.4845 },
  { name: 'La Ofelia', lat: -0.1175, lng: -78.4940 },
];

export const CAMERAS = [
  { id: 'CAM1', label: 'Puerta delantera', kind: 'door' },
  { id: 'CAM2', label: 'Conductor', kind: 'driver' },
  { id: 'CAM3', label: 'Salón', kind: 'salon' },
  { id: 'CAM4', label: 'Frontal', kind: 'front' },
];
