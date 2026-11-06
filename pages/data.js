// Datos base del sistema. En producción, rutas y paradas vendrían del SIT/GTFS
// y los buses de la base de datos de la operadora.

export const HUBS = {
  H1: { name: 'La Carolina', routes: ['R1', 'R2', 'R4', 'R6', 'R7', 'R8', 'R10'] },
  H2: { name: 'Centro (La Marín)', routes: ['R1', 'R3', 'R8', 'R9'] },
  H3: { name: 'El Recreo', routes: ['R1', 'R5', 'R9'] },
  H4: { name: 'Terminal Quitumbe', routes: ['R1', 'R5', 'R9'] },
  H5: { name: 'La Ofelia', routes: ['R3', 'R7'] },
  H6: { name: 'Cumbayá', routes: ['R4', 'R6', 'R8', 'R10'] },
};

export const ROUTES = [
  {
    id: 'R1',
    code: 'T1',
    name: 'Troncal Amazonas',
    color: '#38bdf8',
    headwayMin: 5,
    shape: [
      [-0.1550, -78.4880], [-0.1605, -78.4895], [-0.1660, -78.4905], [-0.1720, -78.4885],
      [-0.1775, -78.4865], [-0.1830, -78.4835], [-0.1895, -78.4870], [-0.1950, -78.4905],
      [-0.2010, -78.4940], [-0.2080, -78.4975], [-0.2140, -78.5010], [-0.2190, -78.5045],
      [-0.2225, -78.5080], [-0.2280, -78.5120], [-0.2330, -78.5140], [-0.2380, -78.5155],
      [-0.2480, -78.5200], [-0.2600, -78.5260], [-0.2720, -78.5330], [-0.2830, -78.5430],
      [-0.2900, -78.5520],
    ],
    stops: [
      { name: 'El Labrador', lat: -0.1550, lng: -78.4880 },
      { name: 'La Florida', lat: -0.1660, lng: -78.4905 },
      { name: 'Naciones Unidas', lat: -0.1720, lng: -78.4885 },
      { name: 'La Carolina', lat: -0.1830, lng: -78.4835, hub: 'H1' },
      { name: 'La Floresta', lat: -0.1950, lng: -78.4905 },
      { name: 'El Ejido', lat: -0.2010, lng: -78.4940 },
      { name: 'La Alameda', lat: -0.2190, lng: -78.5045 },
      { name: 'La Marín', lat: -0.2225, lng: -78.5080, hub: 'H2' },
      { name: 'El Recreo', lat: -0.2380, lng: -78.5155, hub: 'H3' },
      { name: 'El Beaterio', lat: -0.2600, lng: -78.5260 },
      { name: 'Guamaní', lat: -0.2720, lng: -78.5330 },
      { name: 'Terminal Quitumbe', lat: -0.2900, lng: -78.5520, hub: 'H4' },
    ],
  },
  {
    id: 'R2',
    code: 'T2',
    name: 'Centro – Iñaquito',
    color: '#a78bfa',
    headwayMin: 7,
    shape: [
      [-0.2200, -78.5125], [-0.2165, -78.5095], [-0.2100, -78.5045], [-0.2040, -78.4995],
      [-0.1980, -78.4945], [-0.1920, -78.4905], [-0.1860, -78.4870], [-0.1800, -78.4855],
      [-0.1740, -78.4845], [-0.1680, -78.4835],
    ],
    stops: [
      { name: 'Plaza Grande', lat: -0.2200, lng: -78.5125 },
      { name: 'San Blas', lat: -0.2165, lng: -78.5095 },
      { name: 'El Ejido', lat: -0.2100, lng: -78.5045 },
      { name: 'La Floresta', lat: -0.1980, lng: -78.4945 },
      { name: 'La Carolina', lat: -0.1860, lng: -78.4870, hub: 'H1' },
      { name: 'Iñaquito', lat: -0.1740, lng: -78.4845 },
      { name: 'Naciones Unidas', lat: -0.1680, lng: -78.4835 },
    ],
  },
  {
    id: 'R3',
    code: 'T3',
    name: 'Carcelén – Centro',
    color: '#34d399',
    headwayMin: 6,
    shape: [
      [-0.0905, -78.4805], [-0.0990, -78.4830], [-0.1080, -78.4880], [-0.1170, -78.4930],
      [-0.1250, -78.4960], [-0.1330, -78.4950], [-0.1410, -78.4930], [-0.1490, -78.4915],
      [-0.1570, -78.4935], [-0.1660, -78.4965], [-0.1750, -78.4995], [-0.1840, -78.5025],
      [-0.1930, -78.5055], [-0.2020, -78.5085], [-0.2110, -78.5115], [-0.2200, -78.5135],
    ],
    stops: [
      { name: 'Terminal Carcelén', lat: -0.0905, lng: -78.4805 },
      { name: 'Carcelén Industrial', lat: -0.1080, lng: -78.4880 },
      { name: 'La Ofelia', lat: -0.1170, lng: -78.4930, hub: 'H5' },
      { name: 'Cotocollao', lat: -0.1250, lng: -78.4960 },
      { name: 'La Florida Norte', lat: -0.1410, lng: -78.4930 },
      { name: 'Av. 10 de Agosto', lat: -0.1570, lng: -78.4935 },
      { name: 'La Alameda', lat: -0.2110, lng: -78.5115 },
      { name: 'La Marín', lat: -0.2200, lng: -78.5135, hub: 'H2' },
    ],
  },
  {
    id: 'R4',
    code: 'T4',
    name: 'Cumbayá – La Carolina',
    color: '#fbbf24',
    headwayMin: 9,
    shape: [
      [-0.1960, -78.4350], [-0.1920, -78.4450], [-0.1885, -78.4550], [-0.1855, -78.4650],
      [-0.1835, -78.4740], [-0.1830, -78.4820],
    ],
    stops: [
      { name: 'Cumbayá', lat: -0.1960, lng: -78.4350, hub: 'H6' },
      { name: 'Av. Interoceánica', lat: -0.1905, lng: -78.4480 },
      { name: 'Túnel', lat: -0.1855, lng: -78.4650 },
      { name: 'La Carolina', lat: -0.1830, lng: -78.4820, hub: 'H1' },
    ],
  },
  {
    id: 'R5',
    code: 'T5',
    name: 'Quitumbe – El Recreo',
    color: '#f472b6',
    headwayMin: 5,
    shape: [
      [-0.2900, -78.5520], [-0.2820, -78.5440], [-0.2740, -78.5370], [-0.2660, -78.5295],
      [-0.2580, -78.5240], [-0.2490, -78.5195], [-0.2420, -78.5170], [-0.2380, -78.5155],
    ],
    stops: [
      { name: 'Terminal Quitumbe', lat: -0.2900, lng: -78.5520, hub: 'H4' },
      { name: 'Guamaní', lat: -0.2820, lng: -78.5440 },
      { name: 'El Beaterio', lat: -0.2660, lng: -78.5295 },
      { name: 'Villa Flora', lat: -0.2490, lng: -78.5195 },
      { name: 'El Recreo', lat: -0.2380, lng: -78.5155, hub: 'H3' },
    ],
  },
  {
    id: 'R6',
    code: 'A1',
    name: 'Aeropuerto – La Carolina',
    color: '#fb923c',
    headwayMin: 18,
    shape: [
      [-0.1290, -78.3570], [-0.1400, -78.3760], [-0.1520, -78.3950], [-0.1640, -78.4130],
      [-0.1760, -78.4250], [-0.1880, -78.4320], [-0.1910, -78.4450], [-0.1885, -78.4570],
      [-0.1855, -78.4680], [-0.1835, -78.4770], [-0.1830, -78.4835],
    ],
    stops: [
      { name: 'Aeropuerto Mariscal Sucre', lat: -0.1290, lng: -78.3570 },
      { name: 'Tababela', lat: -0.1520, lng: -78.3950 },
      { name: 'Cumbayá', lat: -0.1880, lng: -78.4320, hub: 'H6' },
      { name: 'Túnel', lat: -0.1885, lng: -78.4570 },
      { name: 'La Carolina', lat: -0.1830, lng: -78.4835, hub: 'H1' },
    ],
  },
  {
    id: 'R7',
    code: 'N1',
    name: 'La Ofelia – La Carolina',
    color: '#22d3ee',
    headwayMin: 8,
    shape: [
      [-0.1170, -78.4930], [-0.1250, -78.4960], [-0.1340, -78.4970], [-0.1440, -78.4975],
      [-0.1540, -78.4980], [-0.1640, -78.4970], [-0.1720, -78.4920], [-0.1780, -78.4880],
      [-0.1830, -78.4835],
    ],
    stops: [
      { name: 'La Ofelia', lat: -0.1170, lng: -78.4930, hub: 'H5' },
      { name: 'Cotocollao', lat: -0.1250, lng: -78.4960 },
      { name: 'Av. América', lat: -0.1440, lng: -78.4975 },
      { name: 'La Gasca', lat: -0.1640, lng: -78.4970 },
      { name: 'La Carolina', lat: -0.1830, lng: -78.4835, hub: 'H1' },
    ],
  },
  {
    id: 'R8',
    code: 'C1',
    name: 'La Marín – Cumbayá',
    color: '#c084fc',
    headwayMin: 7,
    shape: [
      [-0.2225, -78.5080], [-0.2150, -78.5030], [-0.2080, -78.4980], [-0.2010, -78.4930],
      [-0.1930, -78.4880], [-0.1860, -78.4840], [-0.1835, -78.4740], [-0.1855, -78.4650],
      [-0.1885, -78.4550], [-0.1920, -78.4450], [-0.1960, -78.4350],
    ],
    stops: [
      { name: 'La Marín', lat: -0.2225, lng: -78.5080, hub: 'H2' },
      { name: 'El Ejido', lat: -0.2080, lng: -78.4980 },
      { name: 'La Floresta', lat: -0.1950, lng: -78.4900 },
      { name: 'La Carolina', lat: -0.1835, lng: -78.4820, hub: 'H1' },
      { name: 'Túnel', lat: -0.1855, lng: -78.4650 },
      { name: 'Cumbayá', lat: -0.1960, lng: -78.4350, hub: 'H6' },
    ],
  },
  {
    id: 'R9',
    code: 'S1',
    name: 'Quitumbe – Centro',
    color: '#f87171',
    headwayMin: 6,
    shape: [
      [-0.2900, -78.5520], [-0.2800, -78.5420], [-0.2680, -78.5310], [-0.2560, -78.5245],
      [-0.2460, -78.5195], [-0.2380, -78.5155], [-0.2300, -78.5135], [-0.2240, -78.5110],
      [-0.2200, -78.5125],
    ],
    stops: [
      { name: 'Terminal Quitumbe', lat: -0.2900, lng: -78.5520, hub: 'H4' },
      { name: 'Guamaní', lat: -0.2800, lng: -78.5420 },
      { name: 'El Beaterio', lat: -0.2680, lng: -78.5310 },
      { name: 'Villa Flora', lat: -0.2460, lng: -78.5195 },
      { name: 'El Recreo', lat: -0.2380, lng: -78.5155, hub: 'H3' },
      { name: 'La Marín', lat: -0.2240, lng: -78.5110, hub: 'H2' },
      { name: 'Plaza Grande', lat: -0.2200, lng: -78.5125 },
    ],
  },
  {
    id: 'R10',
    code: 'E1',
    name: 'Tumbaco – La Carolina',
    color: '#4ade80',
    headwayMin: 14,
    shape: [
      [-0.2070, -78.4000], [-0.2010, -78.4130], [-0.1960, -78.4250], [-0.1930, -78.4340],
      [-0.1900, -78.4450], [-0.1870, -78.4570], [-0.1845, -78.4680], [-0.1830, -78.4835],
    ],
    stops: [
      { name: 'Tumbaco', lat: -0.2070, lng: -78.4000 },
      { name: 'Cumbayá', lat: -0.1930, lng: -78.4340, hub: 'H6' },
      { name: 'Túnel', lat: -0.1870, lng: -78.4570 },
      { name: 'La Carolina', lat: -0.1830, lng: -78.4835, hub: 'H1' },
    ],
  },
];

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

const DRIVERS = [
  'Luis Chuquimarca', 'María Toapanta', 'Jorge Vinueza', 'Ana Cedeño',
  'Patricio Guaman', 'Rosa Chicaiza', 'Diego Andrade', 'Silvia Bonilla',
  'Marco Paredes', 'Elena Yánez', 'Wilson Tipán', 'Gloria Simbaña',
  'Fausto Reinoso', 'Verónica Salazar', 'Byron Catagña', 'Narcisa Vega',
  'Hugo Condor', 'Karina Morocho', 'Segundo Lema', 'Paola Jarrín',
  'Bolívar Aguirre', 'Mónica Cabrera', 'Santiago Ponce', 'Lucía Herrera',
];

const BUS_COUNT = { R1: 8, R2: 6, R3: 7, R4: 4, R5: 6, R6: 4, R7: 5, R8: 5, R9: 5, R10: 4 };
const PLATE_PREFIX = ['PBA', 'PBB', 'PBC', 'PBD', 'PBE', 'PBF'];

function makeBuses() {
  const buses = [];
  let n = 0;
  for (const route of ROUTES) {
    const count = BUS_COUNT[route.id] || 5;
    for (let i = 0; i < count; i++) {
      n += 1;
      const plate = `${PLATE_PREFIX[n % PLATE_PREFIX.length]}-${String(1000 + n * 37).slice(-4)}`;
      buses.push({
        id: `BUS-${String(n).padStart(3, '0')}`,
        plate,
        routeId: route.id,
        driver: DRIVERS[(n - 1) % DRIVERS.length],
        capacity: route.id === 'R4' || route.id === 'R6' || route.id === 'R10' ? 45 : 80,
        model: n % 3 === 0 ? 'Hino AK1J' : n % 3 === 1 ? 'Chevrolet FRR' : 'JAC HK6800',
        year: 2016 + (n % 8),
        cameras: 4,
      });
    }
  }
  return buses;
}

export const BUSES = makeBuses();

export const CAMERAS = [
  { id: 'CAM1', label: 'Puerta delantera', kind: 'door' },
  { id: 'CAM2', label: 'Conductor', kind: 'driver' },
  { id: 'CAM3', label: 'Salón', kind: 'salon' },
  { id: 'CAM4', label: 'Frontal', kind: 'front' },
];
