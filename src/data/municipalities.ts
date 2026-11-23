/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HourlyForecastSlot {
  hour: string;
  rain: number;
  prob: number;
}

export interface Municipality {
  id: string;
  name: string;
  region: 'aburra' | 'oriente';
  lat: number;
  lng: number;
  alt: number;
  rain: number;
  prob: number;
  temp: number | string;
  humidity?: number | string;
  dbz?: number;
  reportTime?: string;
  forecast?: HourlyForecastSlot[];
  marker?: any;
}

export interface GridPoint {
  lat: number;
  lng: number;
  rain: number;
  prob: number;
  weatherCode: number;
}

// Coordenadas oficiales de la antena del Radar Meteorológico del SIATA (Cerro Santa Elena)
export const SIATA_RADAR_COORDS: [number, number] = [6.2080, -75.4980];

// Límites de la región de nubes de lluvia (Antioquia Central: Valle de Aburrá & Oriente)
export const CLOUD_BOUNDS: [[number, number], [number, number]] = [
  [5.85, -75.85],
  [6.55, -75.15]
];

// Definición Completa de Municipios (18 Municipios Reales)
export const MUNICIPALITIES: Municipality[] = [
  // Valle de Aburrá (10 municipios)
  { id: 'medellin', name: 'Medellín', region: 'aburra', lat: 6.2442, lng: -75.5812, alt: 1495, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'bello', name: 'Bello', region: 'aburra', lat: 6.3373, lng: -75.5579, alt: 1450, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'itagui', name: 'Itagüí', region: 'aburra', lat: 6.1846, lng: -75.5991, alt: 1550, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'envigado', name: 'Envigado', region: 'aburra', lat: 6.1759, lng: -75.5917, alt: 1575, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'sabaneta', name: 'Sabaneta', region: 'aburra', lat: 6.1515, lng: -75.6163, alt: 1550, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'caldas', name: 'Caldas', region: 'aburra', lat: 6.0911, lng: -75.6357, alt: 1750, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'laestrella', name: 'La Estrella', region: 'aburra', lat: 6.1578, lng: -75.6433, alt: 1775, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'copacabana', name: 'Copacabana', region: 'aburra', lat: 6.3467, lng: -75.5089, alt: 1450, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'girardota', name: 'Girardota', region: 'aburra', lat: 6.3756, lng: -75.4457, alt: 1425, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'barbosa', name: 'Barbosa', region: 'aburra', lat: 6.4383, lng: -75.3314, alt: 1300, rain: 0, prob: 0, temp: 0, humidity: '--' },

  // Oriente Antioqueño (8 municipios)
  { id: 'rionegro', name: 'Rionegro', region: 'oriente', lat: 6.1552, lng: -75.3739, alt: 2125, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'laceja', name: 'La Ceja', region: 'oriente', lat: 6.0311, lng: -75.4310, alt: 2200, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'marinilla', name: 'Marinilla', region: 'oriente', lat: 6.1738, lng: -75.3377, alt: 2120, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'guarne', name: 'Guarne', region: 'oriente', lat: 6.2803, lng: -75.4428, alt: 2150, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'elcarmen', name: 'El Carmen de Viboral', region: 'oriente', lat: 6.0833, lng: -75.3333, alt: 2150, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'elretiro', name: 'El Retiro', region: 'oriente', lat: 6.0583, lng: -75.5033, alt: 2175, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'elsantuario', name: 'El Santuario', region: 'oriente', lat: 6.1389, lng: -75.2639, alt: 2150, rain: 0, prob: 0, temp: 0, humidity: '--' },
  { id: 'sanvicente', name: 'San Vicente Ferrer', region: 'oriente', lat: 6.2833, lng: -75.3333, alt: 2150, rain: 0, prob: 0, temp: 0, humidity: '--' }
];

// Coordenadas de la Malla de Muestreo (36 puntos para la nube)
export const GRID_POINTS: GridPoint[] = [];
for (let lat = 5.95; lat <= 6.4501; lat += 0.1) {
  for (let lng = -75.75; lng <= -75.2499; lng += 0.1) {
    GRID_POINTS.push({
      lat: Math.round(lat * 100) / 100,
      lng: Math.round(lng * 100) / 100,
      rain: 0,
      prob: 0,
      weatherCode: 0
    });
  }
}

// Datos de simulación realista de frente convectivo
export const SIMULATED_CITIES: Record<string, { rain: number; temp: number; prob: number; humidity: number }> = {
  'itagui': { rain: 26.5, temp: 18, prob: 95, humidity: 96 },     // Granizo / Tormenta severa (>55 dBZ)
  'medellin': { rain: 18.4, temp: 19, prob: 90, humidity: 92 },   // Tormenta fuerte (48 dBZ)
  'envigado': { rain: 15.2, temp: 18, prob: 85, humidity: 90 },   // Tormenta (46 dBZ)
  'sabaneta': { rain: 12.0, temp: 19, prob: 80, humidity: 88 },   // Lluvia fuerte (44 dBZ)
  'bello': { rain: 9.8, temp: 21, prob: 75, humidity: 85 },       // Lluvia fuerte (42 dBZ)
  'laestrella': { rain: 14.5, temp: 17, prob: 80, humidity: 91 }, // Tormenta (45 dBZ)
  'caldas': { rain: 7.2, temp: 17, prob: 65, humidity: 86 },      // Lluvia moderada (39 dBZ)
  'copacabana': { rain: 4.8, temp: 22, prob: 55, humidity: 82 },  // Lluvia moderada (35 dBZ)
  'girardota': { rain: 2.2, temp: 23, prob: 45, humidity: 78 },   // Lluvia débil (28 dBZ)
  'barbosa': { rain: 0.6, temp: 24, prob: 30, humidity: 75 },     // Llovizna (19 dBZ)
  'marinilla': { rain: 16.8, temp: 15, prob: 85, humidity: 94 },  // Tormenta en Oriente (47 dBZ)
  'rionegro': { rain: 13.5, temp: 16, prob: 80, humidity: 90 },   // Lluvia fuerte (44 dBZ)
  'guarne': { rain: 8.9, temp: 16, prob: 70, humidity: 87 },      // Lluvia fuerte (41 dBZ)
  'elsantuario': { rain: 11.2, temp: 15, prob: 75, humidity: 89 },// Lluvia fuerte (43 dBZ)
  'elcarmen': { rain: 7.5, temp: 15, prob: 65, humidity: 86 },    // Lluvia moderada (39 dBZ)
  'elretiro': { rain: 6.2, temp: 16, prob: 60, humidity: 85 },    // Lluvia moderada (37 dBZ)
  'laceja': { rain: 5.0, temp: 16, prob: 55, humidity: 84 },      // Lluvia moderada (35 dBZ)
  'sanvicente': { rain: 3.2, temp: 16, prob: 50, humidity: 82 }   // Lluvia débil (31 dBZ)
};
