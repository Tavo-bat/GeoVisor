/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CLOUD_BOUNDS, GRID_POINTS, MUNICIPALITIES } from '../data/municipalities.ts';

export interface RadarColorStop {
  dbz: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

// Escala continua oficial de Reflectividad Radar SIATA (Antioquia)
export const RADAR_COLOR_STOPS: RadarColorStop[] = [
  { dbz: 0,    r: 100, g: 116, b: 139, a: 0 },    // Seco / Ruido
  { dbz: 8,    r: 100, g: 116, b: 139, a: 0 },    // Umbral de virga
  { dbz: 10,   r: 2,   g: 132, b: 199, a: 0.8 },  // 10 dBZ: Azul (#0284c7)
  { dbz: 13,   r: 6,   g: 160, b: 215, a: 0.84 }, // 13 dBZ: Azul celeste
  { dbz: 15,   r: 6,   g: 182, b: 212, a: 0.87 }, // 15 dBZ: Cyan / Turquesa (#06b6d4)
  { dbz: 16.5, r: 16,  g: 185, b: 129, a: 0.92 }, // 16.5-17 dBZ: Tono verdoso (#10b981)
  { dbz: 20,   r: 34,  g: 197, b: 94,  a: 0.92 }, // 20 dBZ: Verde esmeralda (#22c55e)
  { dbz: 25,   r: 132, g: 204, b: 22,  a: 0.9 },  // 25 dBZ: Lima / Verde amarillento (#84cc16)
  { dbz: 30,   r: 234, g: 179, b: 8,   a: 0.92 }, // 30 dBZ: Amarillo (#eab308)
  { dbz: 36,   r: 249, g: 115, b: 22,  a: 0.92 }, // 36 dBZ: Ámbar (#f97316)
  { dbz: 42,   r: 234, g: 88,  b: 12,  a: 0.94 }, // 42 dBZ: Naranja (#ea580c)
  { dbz: 48,   r: 220, g: 38,  b: 38,  a: 0.95 }, // 48 dBZ: Rojo (#dc2626)
  { dbz: 54,   r: 185, g: 28,  b: 28,  a: 0.96 }, // 54 dBZ: Rojo oscuro (#b91c1c)
  { dbz: 60,   r: 147, g: 51,  b: 234, a: 0.96 }, // 60 dBZ: Morado / Tormenta (#9333ea)
  { dbz: 68,   r: 217, g: 70,  b: 239, a: 0.98 }, // 68 dBZ: Magenta (#d946ef)
  { dbz: 80,   r: 244, g: 114, b: 182, a: 1.0 }   // 80 dBZ: Rosa / Granizo (#f472b6)
];

// Relación Z-R para estimar Reflectividad de Radar (dBZ) a partir de precipitación (mm/h)
// Convectiva / Marshall-Palmer adaptada a ecos Doppler SIATA (Antioquia)
export function mmhToDbz(mmh: number): number {
  if (!mmh || mmh < 0.15) return 0; // Umbral de detección radar (filtra ruido/virga < 0.15 mm/h)
  const z = 200 * Math.pow(mmh, 1.6);
  let dbz = 10 * Math.log10(z);
  // Factor convectivo para tormentas tropicales andinas intensas
  if (mmh >= 15) {
    dbz += Math.min(15, (mmh - 15) * 0.6);
  }
  return Math.min(80, Math.round(dbz));
}

export function getInterpolatedRadarRgb(dbz: number): { r: number; g: number; b: number } {
  if (dbz <= RADAR_COLOR_STOPS[0].dbz) {
    return { r: RADAR_COLOR_STOPS[0].r, g: RADAR_COLOR_STOPS[0].g, b: RADAR_COLOR_STOPS[0].b };
  }
  const last = RADAR_COLOR_STOPS[RADAR_COLOR_STOPS.length - 1];
  if (dbz >= last.dbz) {
    return { r: last.r, g: last.g, b: last.b };
  }
  for (let i = 0; i < RADAR_COLOR_STOPS.length - 1; i++) {
    const s0 = RADAR_COLOR_STOPS[i];
    const s1 = RADAR_COLOR_STOPS[i + 1];
    if (dbz >= s0.dbz && dbz <= s1.dbz) {
      const t = (dbz - s0.dbz) / (s1.dbz - s0.dbz);
      return {
        r: Math.round(s0.r + t * (s1.r - s0.r)),
        g: Math.round(s0.g + t * (s1.g - s0.g)),
        b: Math.round(s0.b + t * (s1.b - s0.b))
      };
    }
  }
  return { r: last.r, g: last.g, b: last.b };
}

export function getDbzHexColor(dbz: number): string {
  const rgb = getInterpolatedRadarRgb(dbz);
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function getDbzRgba(dbz: number, alpha = 0.9): string {
  const rgb = getInterpolatedRadarRgb(dbz);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function getDbzCategory(dbz: number): { label: string; color: string; tier: string } {
  const color = getDbzHexColor(dbz);
  if (dbz >= 52) return { label: 'Granizo probable', color, tier: 'hail' };
  if (dbz >= 38) return { label: 'Intensidades altas', color, tier: 'heavy' };
  if (dbz >= 26) return { label: 'Intensidades moderadas', color, tier: 'moderate' };
  if (dbz >= 16) return { label: 'Intensidades ligeras', color, tier: 'light' };
  if (dbz >= 10) return { label: 'Intensidades bajas', color, tier: 'low' };
  return { label: 'Seco / Sin nubes activas', color: '#64748b', tier: 'dry' };
}

// Función para generar el gradiente radial auténtico según la categoría dBZ del radar
export function createRadarRadialGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  dbz: number
): CanvasGradient {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, getDbzRgba(dbz, 0.94));

  if (dbz >= 52) {
    grad.addColorStop(0.18, getDbzRgba(dbz * 0.9, 0.9));
    grad.addColorStop(0.38, getDbzRgba(44, 0.85));
    grad.addColorStop(0.58, getDbzRgba(30, 0.75));
    grad.addColorStop(0.75, getDbzRgba(18, 0.6));
    grad.addColorStop(0.9, getDbzRgba(11, 0.35));
    grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
  } else if (dbz >= 38) {
    grad.addColorStop(0.25, getDbzRgba(dbz * 0.88, 0.88));
    grad.addColorStop(0.52, getDbzRgba(26, 0.75));
    grad.addColorStop(0.74, getDbzRgba(17, 0.6));
    grad.addColorStop(0.9, getDbzRgba(11, 0.3));
    grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
  } else if (dbz >= 26) {
    grad.addColorStop(0.3, getDbzRgba(dbz * 0.85, 0.85));
    grad.addColorStop(0.6, getDbzRgba(17, 0.65));
    grad.addColorStop(0.85, getDbzRgba(11, 0.35));
    grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
  } else if (dbz >= 16) {
    grad.addColorStop(0.38, getDbzRgba(dbz, 0.88));
    grad.addColorStop(0.68, getDbzRgba(13, 0.55));
    grad.addColorStop(0.9, getDbzRgba(10, 0.25));
    grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
  } else {
    grad.addColorStop(0.45, getDbzRgba(dbz, 0.82));
    grad.addColorStop(0.78, getDbzRgba(10, 0.4));
    grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
  }
  return grad;
}

// Generación del Efecto "Nubes de Lluvia" (Radar Interpolado Suave SIATA)
export function generateCloudRadarTexture(): string {
  const canvas = document.createElement('canvas');
  const w = 800;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const minLat = CLOUD_BOUNDS[0][0];
  const maxLat = CLOUD_BOUNDS[1][0];
  const minLng = CLOUD_BOUNDS[0][1];
  const maxLng = CLOUD_BOUNDS[1][1];

  function latLngToCanvas(lat: number, lng: number) {
    const x = ((lng - minLng) / (maxLng - minLng)) * w;
    const y = ((maxLat - lat) / (maxLat - minLat)) * h;
    return { x, y };
  }

  const activePoints: { lat: number; lng: number; rain: number }[] = [];
  MUNICIPALITIES.forEach(m => {
    if (m.rain >= 0.15) {
      activePoints.push({ lat: m.lat, lng: m.lng, rain: m.rain });
    }
  });
  GRID_POINTS.forEach(p => {
    if (p.rain >= 0.25) {
      activePoints.push({ lat: p.lat, lng: p.lng, rain: p.rain });
    }
  });

  if (activePoints.length === 0) {
    return canvas.toDataURL('image/png');
  }

  ctx.clearRect(0, 0, w, h);
  ctx.filter = 'blur(6px)';

  activePoints.forEach((pt, pIdx) => {
    const center = latLngToCanvas(pt.lat, pt.lng);
    const mm = pt.rain;
    const dbz = mmhToDbz(mm);
    if (dbz < 10) return;

    let baseRadius = 38;
    if (dbz >= 16) baseRadius = 44;
    if (dbz >= 20) baseRadius = 50;
    if (dbz >= 30) baseRadius = 62;
    if (dbz >= 40) baseRadius = 75;
    if (dbz >= 50) baseRadius = 90;

    const sat2 = {
      x: center.x - Math.cos(pIdx * 2.3) * (baseRadius * 0.3),
      y: center.y - Math.sin(pIdx * 2.3) * (baseRadius * 0.35),
      r: baseRadius * 0.6,
      dbz: Math.max(10, dbz - 6)
    };
    const sat1 = {
      x: center.x + Math.sin(pIdx * 1.7) * (baseRadius * 0.35),
      y: center.y + Math.cos(pIdx * 1.7) * (baseRadius * 0.3),
      r: baseRadius * 0.72,
      dbz: Math.max(10, dbz - 3)
    };
    const core = { x: center.x, y: center.y, r: baseRadius, dbz };

    [sat2, sat1, core].forEach(b => {
      ctx.fillStyle = createRadarRadialGradient(ctx, b.x, b.y, b.r, b.dbz);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  return canvas.toDataURL('image/png');
}

// Helper: Encuentra el índice exacto de la hora actual en el array hourly.time de Open-Meteo
export function getHourIndex(hourlyTimes: string[] | null, currentIsoTime?: string): number {
  if (!hourlyTimes || !Array.isArray(hourlyTimes) || hourlyTimes.length === 0) return 0;
  if (!currentIsoTime) return 0;
  const targetHourIso = currentIsoTime.slice(0, 13) + ':00';
  const exactIdx = hourlyTimes.indexOf(targetHourIso);
  if (exactIdx !== -1) return exactIdx;

  const targetTimeMs = new Date(currentIsoTime).getTime();
  let bestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < hourlyTimes.length; i++) {
    const diff = Math.abs(new Date(hourlyTimes[i]).getTime() - targetTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}
