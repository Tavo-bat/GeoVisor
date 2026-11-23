/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.css';
import {
  CLOUD_BOUNDS,
  GRID_POINTS,
  MUNICIPALITIES,
  Municipality,
  SIATA_RADAR_COORDS,
  SIMULATED_CITIES
} from './data/municipalities.ts';
import {
  generateCloudRadarTexture,
  getDbzCategory,
  getHourIndex,
  mmhToDbz
} from './utils/radar.ts';

declare const L: any;

// --- Variables de Estado ---
let map: any = null;
const baseLayers: Record<string, any> = {};
let activeBaseLayer: any = null;

let cloudOverlay: any = null;         // Capa de nubes orgánicas suavizadas (efecto radar SIATA)
let radarRingsGroup: any = null;      // Anillos concéntricos de alcance radar (SIATA)
let markersAburraGroup: any = null;   // Marcadores Valle de Aburrá
let markersOrienteGroup: any = null;  // Marcadores Oriente
let userLocationMarker: any = null;

let cloudOpacity = 0.8;
let currentFilter = 'all';
let searchQuery = '';
let isSimulated = false;
let isFetching = false;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const PRIORITY_CITIES = new Set(['medellin', 'bello', 'envigado', 'caldas', 'rionegro', 'laceja', 'guarne', 'barbosa']);
const DENSE_CITIES = new Set(['itagui', 'laestrella', 'sabaneta', 'marinilla', 'copacabana']);

function getLabelClasses(cityId: string): string {
  const classes = ['marker-label-tag'];
  if (PRIORITY_CITIES.has(cityId)) classes.push('priority-label');
  if (DENSE_CITIES.has(cityId)) classes.push('dense-label');
  return classes.join(' ');
}

function syncMapZoomClass() {
  if (!map) return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  const z = map.getZoom();
  mapEl.classList.toggle('map-zoom-low', z <= 10);
  mapEl.classList.toggle('map-zoom-mid', z === 11);
}

// --- Inicialización del Mapa ---
function initMap() {
  const isMobile = window.innerWidth <= 768;
  map = L.map('map', {
    center: isMobile ? [6.20, -75.48] : [6.18, -75.45],
    zoom: 11,
    zoomControl: false,
    attributionControl: false
  });

  map.on('zoomend', syncMapZoomClass);
  syncMapZoomClass();

  L.control.zoom({ position: 'topleft' }).addTo(map);

  L.control.attribution({
    position: 'bottomright',
    prefix: 'Leaflet · Datos meteorológicos: Open-Meteo'
  }).addTo(map);

  // Mapas Base
  baseLayers['esri-dark'] = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      maxNativeZoom: 16,
      maxZoom: 18,
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
    }
  );

  baseLayers['osm'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  });

  baseLayers['esri-sat'] = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution: 'Tiles &copy; Esri'
    }
  );

  activeBaseLayer = baseLayers['esri-dark'];
  activeBaseLayer.addTo(map);

  // Grupos de capas
  markersAburraGroup = L.layerGroup().addTo(map);
  markersOrienteGroup = L.layerGroup().addTo(map);

  createRadarRings();
  createMunicipalityMarkers();
  setupEventListeners();

  // Cargar datos meteorológicos iniciales
  fetchMeteorologicalData();
}

// --- Anillos Concéntricos de Alcance Radar (SIATA Santa Elena) ---
function createRadarRings() {
  radarRingsGroup = L.layerGroup();
  const rangesKm = [10, 25, 45, 65];

  rangesKm.forEach(km => {
    const circle = L.circle(SIATA_RADAR_COORDS, {
      radius: km * 1000,
      color: '#64748b',
      weight: 1,
      dashArray: '5, 8',
      fill: false,
      opacity: 0.35,
      interactive: false
    });
    circle.addTo(radarRingsGroup);
  });

  // Marcador sutil del sitio del Radar Santa Elena
  const radarSiteMarker = L.circleMarker(SIATA_RADAR_COORDS, {
    radius: 4,
    fillColor: '#38bdf8',
    color: '#0f172a',
    weight: 1.5,
    fillOpacity: 0.85
  }).bindTooltip('Antena Radar SIATA (Santa Elena · 10/25/45/65 km)', {
    direction: 'top',
    offset: [0, -4]
  });
  radarSiteMarker.addTo(radarRingsGroup);

  radarRingsGroup.addTo(map);
}

// --- Generador de contenido HTML dinámico para los popups de municipios ---
function getCityPopupHtml(city: Municipality): string {
  const isAburra = city.region === 'aburra';
  const rainVal = typeof city.rain === 'number' ? city.rain.toFixed(1) : '0.0';
  const dbz = mmhToDbz(city.rain || 0);
  const cat = getDbzCategory(dbz);
  const probVal = city.prob !== undefined && city.prob !== null && !isNaN(city.prob) ? city.prob : '--';
  const tempVal = city.temp !== undefined && city.temp !== null && city.temp !== '--' ? city.temp : '--';
  const humVal = city.humidity !== undefined && city.humidity !== null && city.humidity !== '--' ? `${city.humidity}%` : '--';
  const reportStr = city.reportTime ? `${city.reportTime} COT` : 'Tiempo real';

  const forecastHtml =
    city.forecast && city.forecast.length > 0
      ? `
        <div class="popup-forecast">
          <div class="popup-forecast-title">Próximas 3 horas</div>
          <div class="popup-forecast-grid">
            ${city.forecast
              .map(slot => {
                const slotDbz = mmhToDbz(slot.rain);
                const slotColor = slot.rain >= 0.15 ? getDbzCategory(slotDbz).color : '#94a3b8';
                return `
                  <div class="popup-forecast-slot">
                    <span class="popup-forecast-hour">${slot.hour}</span>
                    <span class="popup-forecast-rain" style="color:${slotColor};">${slot.rain.toFixed(1)} mm</span>
                    <span class="popup-forecast-prob">${slot.prob}%</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `
      : '';

  return `
    <div class="gis-popup">
      <div class="gis-popup-header">
        <div class="gis-popup-title">${city.name}</div>
        <div class="gis-popup-coords">${isAburra ? 'Valle de Aburrá' : 'Oriente Antioqueño'} · ${city.alt} msnm</div>
      </div>
      <div class="gis-popup-row"><span>Precipitación:</span><strong>${rainVal} mm/h</strong></div>
      <div class="gis-popup-row"><span>Reflectividad radar:</span><strong style="color:${cat.color};">${dbz} dBZ (${cat.label})</strong></div>
      <div class="gis-popup-row"><span>Probabilidad (esta hora):</span><strong>${probVal}%</strong></div>
      <div class="gis-popup-row"><span>Temperatura / Humedad:</span><strong>${tempVal} °C · ${humVal}</strong></div>
      ${forecastHtml}
      <div class="gis-popup-row" style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed var(--border-subtle); font-size: 10px; color: var(--text-dim); display: flex; justify-content: space-between;">
        <span>Sincronización:</span>
        <span style="color: var(--accent-emerald); font-weight: 600;"><span class="live-pulse-dot" style="width:6px; height:6px; margin-right:3px;"></span>${reportStr}</span>
      </div>
    </div>
  `;
}

// --- Marcadores de los 18 Municipios ---
function createMunicipalityMarkers() {
  markersAburraGroup.clearLayers();
  markersOrienteGroup.clearLayers();

  MUNICIPALITIES.forEach(city => {
    const isAburra = city.region === 'aburra';
    const color = isAburra ? '#0284c7' : '#0d9488';
    const labelClass = getLabelClasses(city.id);

    const iconHtml = `
      <div style="position: relative; cursor: pointer;">
        <div style="width: 12px; height: 12px; background: ${color}; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 10px ${color};"></div>
        <div class="${labelClass}">${city.name}</div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'custom-city-marker',
      html: iconHtml,
      iconSize: [16, 16],
      iconAnchor: [6, 6]
    });

    const marker = L.marker([city.lat, city.lng], { icon: customIcon });
    marker.bindPopup(() => getCityPopupHtml(city), { maxWidth: 270 });

    if (isAburra) {
      marker.addTo(markersAburraGroup);
    } else {
      marker.addTo(markersOrienteGroup);
    }

    city.marker = marker;
  });
}

// --- Actualiza los colores de los marcadores según lluvia y reflectividad ---
function updateMarkerIcons() {
  MUNICIPALITIES.forEach(city => {
    if (!city.marker) return;
    const isAburra = city.region === 'aburra';
    const isRaining = city.rain >= 0.15;
    const dbz = mmhToDbz(city.rain || 0);
    const cat = getDbzCategory(dbz);

    const baseColor = isRaining ? cat.color : isAburra ? '#0284c7' : '#0d9488';
    const glow = isRaining ? `0 0 14px ${cat.color}, 0 0 4px #ffffff` : `0 0 8px ${baseColor}`;
    const labelClass = getLabelClasses(city.id);

    const iconHtml = `
      <div style="position: relative; cursor: pointer;">
        <div style="width: 12px; height: 12px; background: ${baseColor}; border: 2px solid #ffffff; border-radius: 50%; box-shadow: ${glow}; transition: all 0.3s ease;"></div>
        <div class="${labelClass}">${city.name}</div>
      </div>
    `;

    city.marker.setIcon(
      L.divIcon({
        className: 'custom-city-marker',
        html: iconHtml,
        iconSize: [16, 16],
        iconAnchor: [6, 6]
      })
    );
  });
}

function updateCloudOverlay() {
  const dataUrl = generateCloudRadarTexture();

  if (!cloudOverlay) {
    cloudOverlay = L.imageOverlay(dataUrl, CLOUD_BOUNDS, {
      opacity: cloudOpacity,
      interactive: false,
      zIndex: 350
    });

    const cloudsCheckbox = document.getElementById('layer-toggle-clouds') as HTMLInputElement | null;
    if (cloudsCheckbox && cloudsCheckbox.checked) {
      cloudOverlay.addTo(map);
    }
  } else {
    cloudOverlay.setUrl(dataUrl);
    cloudOverlay.setOpacity(cloudOpacity);
  }
}

// --- Consulta a Open-Meteo (Malla + 18 Municipios en 1 Sola Petición) ---
async function fetchMeteorologicalData() {
  if (isSimulated) {
    applySimulatedStormFront();
    return;
  }

  if (isFetching) return;
  isFetching = true;

  const clock = document.getElementById('last-updated-clock');
  const refreshIcon = document.getElementById('icon-refresh-btn');
  const refreshLabel = document.getElementById('label-refresh-btn');
  const planetReloadBtn = document.getElementById('btn-reload-page');

  if (refreshIcon) refreshIcon.classList.add('spin-icon');
  if (planetReloadBtn) planetReloadBtn.classList.add('spin-icon');
  if (refreshLabel) refreshLabel.textContent = 'Cargando...';
  if (clock) {
    clock.innerHTML = `<span style="color: var(--accent-sky);">Sincronizando...</span>`;
  }

  const allLats: number[] = [];
  const allLngs: number[] = [];

  GRID_POINTS.forEach(pt => {
    allLats.push(pt.lat);
    allLngs.push(pt.lng);
  });

  MUNICIPALITIES.forEach(m => {
    allLats.push(m.lat);
    allLngs.push(m.lng);
  });

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${allLats.join(',')}&longitude=${allLngs.join(',')}&current=precipitation,rain,showers,weather_code,temperature_2m,relative_humidity_2m&hourly=precipitation_probability,precipitation&timezone=America%2FBogota&_ts=${Date.now()}`;

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const dataList = await resp.json();
    const results = Array.isArray(dataList) ? dataList : [dataList];

    if (results.length < GRID_POINTS.length + MUNICIPALITIES.length) {
      throw new Error('Respuesta incompleta de coordenadas');
    }

    const sampleRecord = results.find((r: any) => r && r.current && r.current.time) || results[0];
    let reportHourStr = '';
    if (sampleRecord && sampleRecord.current && sampleRecord.current.time) {
      reportHourStr = sampleRecord.current.time.split('T')[1];
    }

    // 1. Asignar datos de la malla (36 puntos para interpolar las nubes de precipitación)
    GRID_POINTS.forEach((pt, idx) => {
      const itemData = results[idx];
      if (!itemData || !itemData.current) return;

      const curr = itemData.current;
      const rain =
        (typeof curr.precipitation === 'number' ? curr.precipitation : curr.rain || curr.showers || 0) || 0;

      const hourIdx = getHourIndex(itemData.hourly ? itemData.hourly.time : null, curr.time);
      const prob =
        itemData.hourly &&
        itemData.hourly.precipitation_probability &&
        typeof itemData.hourly.precipitation_probability[hourIdx] === 'number'
          ? itemData.hourly.precipitation_probability[hourIdx]
          : 0;

      const wCode = curr.weather_code || 0;

      pt.rain = rain;
      pt.prob = prob;
      pt.weatherCode = wCode;
    });

    // 2. Asignar datos a los 18 municipios
    let rainingCount = 0;
    const gridOffset = GRID_POINTS.length;

    MUNICIPALITIES.forEach((city, idx) => {
      const cityData = results[gridOffset + idx];
      if (!cityData || !cityData.current) return;

      const curr = cityData.current;
      const rain =
        (typeof curr.precipitation === 'number' ? curr.precipitation : curr.rain || curr.showers || 0) || 0;

      const hourIdx = getHourIndex(cityData.hourly ? cityData.hourly.time : null, curr.time);
      const prob =
        cityData.hourly &&
        cityData.hourly.precipitation_probability &&
        typeof cityData.hourly.precipitation_probability[hourIdx] === 'number'
          ? cityData.hourly.precipitation_probability[hourIdx]
          : 0;

      const temp = typeof curr.temperature_2m === 'number' ? curr.temperature_2m : '--';
      const humidity = typeof curr.relative_humidity_2m === 'number' ? curr.relative_humidity_2m : '--';
      const dbz = mmhToDbz(rain);

      city.rain = rain;
      city.prob = prob;
      city.temp = temp;
      city.humidity = humidity;
      city.dbz = dbz;
      city.reportTime = curr.time ? curr.time.split('T')[1] : reportHourStr;

      // Extraer pronóstico para las próximas 3 horas desde la misma respuesta hourly
      const forecast: { hour: string; rain: number; prob: number }[] = [];
      if (cityData.hourly && Array.isArray(cityData.hourly.time)) {
        for (let offset = 1; offset <= 3; offset++) {
          const fIdx = hourIdx + offset;
          if (fIdx < cityData.hourly.time.length) {
            const isoTime: string = cityData.hourly.time[fIdx];
            const fRain =
              cityData.hourly.precipitation && typeof cityData.hourly.precipitation[fIdx] === 'number'
                ? cityData.hourly.precipitation[fIdx]
                : 0;
            const fProb =
              cityData.hourly.precipitation_probability &&
              typeof cityData.hourly.precipitation_probability[fIdx] === 'number'
                ? cityData.hourly.precipitation_probability[fIdx]
                : 0;
            forecast.push({
              hour: isoTime.split('T')[1] || `+${offset}h`,
              rain: fRain,
              prob: fProb
            });
          }
        }
      }
      city.forecast = forecast;

      if (rain >= 0.15) rainingCount++;

      if (city.marker && city.marker.getPopup() && city.marker.isPopupOpen()) {
        city.marker.setPopupContent(getCityPopupHtml(city));
      }
    });

    updateCloudOverlay();
    updateMarkerIcons();
    updateFilterCounts(rainingCount);

    const now = new Date();
    const clientFormatted = now.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeDisplay = reportHourStr ? `${reportHourStr} COT` : clientFormatted;

    const bannerCount = document.getElementById('summary-rain-count');
    const bannerTime = document.getElementById('summary-update-time');
    const bannerIcon = document.getElementById('summary-rain-icon');

    if (bannerCount) {
      bannerCount.textContent =
        rainingCount > 0
          ? `Lluvia activa en ${rainingCount} de ${MUNICIPALITIES.length} municipios`
          : `Sin lluvias activas en los 18 municipios`;
    }
    if (bannerTime) {
      bannerTime.textContent = `Open-Meteo en vivo · Boletín: ${timeDisplay}`;
    }
    if (bannerIcon) {
      bannerIcon.textContent = rainingCount > 0 ? '🌧️' : '☀️';
    }
    if (clock) {
      clock.innerHTML = `
        <span class="live-pulse-dot"></span>
        <span>En vivo: ${timeDisplay}</span>
      `;
    }

    renderMunicipalitiesList();
  } catch (err) {
    console.error('Error al actualizar meteorología:', err);
    if (clock) {
      clock.innerHTML = `<span style="color:#f87171;">⚠️ Error de conexión</span>`;
    }
    showToast('Error al conectar con el servidor meteorológico de Open-Meteo.');
  } finally {
    isFetching = false;
    if (refreshIcon) refreshIcon.classList.remove('spin-icon');
    if (planetReloadBtn) planetReloadBtn.classList.remove('spin-icon');
    if (refreshLabel) refreshLabel.textContent = 'Refrescar';
  }
}

// --- Simulación Realista de Frente de Tormenta (Efecto Radar SIATA) ---
function applySimulatedStormFront() {
  let rainingCount = 0;
  MUNICIPALITIES.forEach(city => {
    const sim = SIMULATED_CITIES[city.id] || { rain: 0, temp: 20, prob: 20, humidity: 80 };
    city.rain = sim.rain;
    city.temp = sim.temp;
    city.prob = sim.prob;
    city.humidity = sim.humidity;
    city.dbz = mmhToDbz(sim.rain);
    city.reportTime = 'Simulado';
    city.forecast = [
      { hour: '+1h', rain: Math.round(sim.rain * 0.75 * 10) / 10, prob: Math.max(15, sim.prob - 10) },
      { hour: '+2h', rain: Math.round(sim.rain * 0.4 * 10) / 10, prob: Math.max(10, sim.prob - 25) },
      { hour: '+3h', rain: Math.round(sim.rain * 0.15 * 10) / 10, prob: Math.max(5, sim.prob - 40) }
    ];

    if (city.rain >= 0.15) rainingCount++;

    if (city.marker && city.marker.getPopup() && city.marker.isPopupOpen()) {
      city.marker.setPopupContent(getCityPopupHtml(city));
    }
  });

  GRID_POINTS.forEach(pt => {
    const dAburra = Math.hypot(pt.lat - 6.20, pt.lng - -75.58);
    const dOriente = Math.hypot(pt.lat - 6.16, pt.lng - -75.35);

    let rain = 0;
    if (dAburra < 0.22) {
      rain = Math.max(0, 24 * (1 - dAburra / 0.22));
    }
    if (dOriente < 0.18) {
      rain = Math.max(rain, 18 * (1 - dOriente / 0.18));
    }

    pt.rain = Math.round(rain * 10) / 10;
    pt.prob = pt.rain > 0 ? 80 : 15;
  });

  updateCloudOverlay();
  updateMarkerIcons();
  updateFilterCounts(rainingCount);

  const clock = document.getElementById('last-updated-clock');
  const bannerCount = document.getElementById('summary-rain-count');
  const bannerTime = document.getElementById('summary-update-time');
  const bannerIcon = document.getElementById('summary-rain-icon');

  if (bannerCount) bannerCount.textContent = `Tormenta activa en ${rainingCount} de ${MUNICIPALITIES.length} municipios`;
  if (bannerTime) bannerTime.textContent = `Frente de Lluvia Convectivo SIATA (Demostración)`;
  if (bannerIcon) bannerIcon.textContent = '⚡';
  if (clock) clock.textContent = `Simulación SIATA`;

  renderMunicipalitiesList();
}

function updateFilterCounts(rainingCount: number) {
  const rainingTab = document.querySelector('.filter-tab[data-filter="raining"]');
  if (rainingTab) {
    rainingTab.textContent = rainingCount > 0 ? `Lloviendo (${rainingCount})` : 'Lloviendo';
  }
}

function toggleSimulationMode() {
  isSimulated = !isSimulated;
  const simBtn = document.getElementById('btn-toggle-sim');
  const simIcon = document.getElementById('sim-icon');
  const simLabel = document.getElementById('sim-label');

  const mobSimBtn = document.getElementById('mob-toggle-sim');
  const mobSimIcon = document.getElementById('mob-sim-icon');
  const mobSimLabel = document.getElementById('mob-sim-label');

  if (isSimulated) {
    if (simBtn) simBtn.classList.add('active');
    if (simIcon) simIcon.textContent = '☀️';
    if (simLabel) simLabel.textContent = 'Tiempo Real';

    if (mobSimBtn) mobSimBtn.classList.add('active');
    if (mobSimIcon) mobSimIcon.textContent = '☀️';
    if (mobSimLabel) mobSimLabel.textContent = 'Volver a Tiempo Real';

    applySimulatedStormFront();
    showToast('Demostración: Frente de lluvia y nubes de reflectividad SIATA activados.');
  } else {
    if (simBtn) simBtn.classList.remove('active');
    if (simIcon) simIcon.textContent = '⚡';
    if (simLabel) simLabel.textContent = 'Simular Frente';

    if (mobSimBtn) mobSimBtn.classList.remove('active');
    if (mobSimIcon) mobSimIcon.textContent = '⚡';
    if (mobSimLabel) mobSimLabel.textContent = 'Simular Frente de Lluvia';

    fetchMeteorologicalData();
    showToast('Restaurando datos meteorológicos en tiempo real de Open-Meteo.');
  }
}

// --- Renderizado de Municipios en Barra Lateral ---
function renderMunicipalitiesList() {
  const container = document.getElementById('cities-list-container');
  if (!container) return;

  container.innerHTML = '';

  let list = [...MUNICIPALITIES];
  if (currentFilter === 'aburra') {
    list = list.filter(c => c.region === 'aburra');
  } else if (currentFilter === 'oriente') {
    list = list.filter(c => c.region === 'oriente');
  } else if (currentFilter === 'raining') {
    list = list.filter(c => c.rain >= 0.15);
  }

  if (searchQuery.trim() !== '') {
    const q = searchQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    list = list.filter(c =>
      c.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(q)
    );
  }

  list.sort((a, b) => b.rain - a.rain || a.name.localeCompare(b.name));

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:16px; color:var(--text-dim); font-size:12px; background:rgba(15,23,42,0.4); border-radius:6px; border:1px solid var(--border-subtle);">
        Sin municipios que coincidan con la búsqueda o filtro
      </div>
    `;
    return;
  }

  list.forEach(city => {
    const isRaining = city.rain >= 0.15;
    const dbz = mmhToDbz(city.rain);
    const cat = getDbzCategory(dbz);

    let badgeStyle = `background: rgba(148, 163, 184, 0.15); color: var(--text-dim); border: 1px solid var(--border-subtle);`;
    if (dbz >= 52) {
      badgeStyle = `background: rgba(244, 114, 182, 0.25); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.6);`;
    } else if (dbz >= 48) {
      badgeStyle = `background: rgba(147, 51, 234, 0.25); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.6);`;
    } else if (dbz >= 38) {
      badgeStyle = `background: rgba(220, 38, 38, 0.25); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.5);`;
    } else if (dbz >= 26) {
      badgeStyle = `background: rgba(234, 179, 8, 0.22); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.5);`;
    } else if (dbz >= 16) {
      badgeStyle = `background: rgba(16, 185, 129, 0.22); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.6);`;
    } else if (isRaining) {
      badgeStyle = `background: rgba(2, 132, 199, 0.22); color: #38bdf8; border: 1px solid rgba(2, 132, 199, 0.5);`;
    }

    const card = document.createElement('div');
    card.className = 'city-card-item';
    card.id = `city-item-${city.id}`;
    card.innerHTML = `
      <div class="city-main-info">
        <div class="city-title-row">
          <span class="city-title">${city.name}</span>
          <span class="city-region-tag">${city.region === 'aburra' ? 'Valle' : 'Oriente'}</span>
        </div>
        <div class="city-weather-row">
          <span>${city.temp}°C</span>
          <span>· Prob. ${city.prob}%</span>
          ${city.rain > 0.05 ? `<span style="color:${cat.color}; font-weight:600;">· ${dbz} dBZ</span>` : ''}
        </div>
      </div>
      <div class="rain-badge-pill" style="${badgeStyle}">
        ${city.rain.toFixed(1)} mm/h
      </div>
    `;

    card.onclick = () => {
      focusCity(city);
    };

    container.appendChild(card);
  });
}

function focusCity(city: Municipality) {
  // En pantallas móviles, cerrar automáticamente el panel lateral para ver el mapa y el popup
  if (window.innerWidth <= 900) {
    const sidebar = document.getElementById('gis-sidebar');
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      sidebar.classList.add('collapsed');
      if (toggleSidebarBtn) toggleSidebarBtn.classList.remove('active');
      setTimeout(() => map.invalidateSize(), 260);
    }
  }

  map.flyTo([city.lat, city.lng], 13, { duration: 1.2 });
  if (city.marker) {
    city.marker.setPopupContent(getCityPopupHtml(city));
    setTimeout(() => city.marker.openPopup(), 600);
  }

  document.querySelectorAll('.city-card-item').forEach(c => c.classList.remove('active-focus'));
  const activeCard = document.getElementById(`city-item-${city.id}`);
  if (activeCard) activeCard.classList.add('active-focus');
}

// --- Controladores de Interfaz & GPS ---
function setupEventListeners() {
  // Zoom Presets
  const btnZoomAll = document.getElementById('btn-zoom-all');
  if (btnZoomAll) {
    btnZoomAll.onclick = () => map.flyTo([6.18, -75.45], 11, { duration: 1.2 });
  }

  const btnZoomAburra = document.getElementById('btn-zoom-aburra');
  if (btnZoomAburra) {
    btnZoomAburra.onclick = () => map.flyTo([6.25, -75.57], 12, { duration: 1.2 });
  }

  const btnZoomOriente = document.getElementById('btn-zoom-oriente');
  if (btnZoomOriente) {
    btnZoomOriente.onclick = () => map.flyTo([6.14, -75.39], 12, { duration: 1.2 });
  }

  // Alternar Simulación / Tiempo Real
  const simToggleBtn = document.getElementById('btn-toggle-sim');
  if (simToggleBtn) {
    simToggleBtn.onclick = () => toggleSimulationMode();
  }

  // Buscador de municipios en tiempo real
  const searchInput = document.getElementById('city-search-input') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.oninput = e => {
      searchQuery = (e.target as HTMLInputElement).value || '';
      renderMunicipalitiesList();
    };
  }

  // GPS con autorización bajo demanda
  const gpsBtn = document.getElementById('btn-gps');
  const gpsLabel = document.getElementById('label-gps');

  if (gpsBtn && gpsLabel) {
    gpsBtn.onclick = () => {
      if (!navigator.geolocation) {
        showToast('Tu navegador o dispositivo no soporta geolocalización.');
        return;
      }

      gpsLabel.textContent = 'Localizando...';
      gpsBtn.style.opacity = '0.7';

      const geoOptions = {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        pos => {
          gpsLabel.textContent = 'Mi GPS';
          gpsBtn.style.opacity = '1';

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          map.flyTo([lat, lng], 14, { duration: 1.5 });

          if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
          }

          userLocationMarker = L.circleMarker([lat, lng], {
            radius: 9,
            fillColor: '#38bdf8',
            color: '#ffffff',
            weight: 2.5,
            fillOpacity: 0.95
          })
            .bindPopup('📍 Tu ubicación actual')
            .addTo(map)
            .openPopup();

          showToast('Ubicación localizada con éxito.');
        },
        err => {
          gpsLabel.textContent = 'Mi GPS';
          gpsBtn.style.opacity = '1';
          console.warn('Geolocation notice:', err);

          let msg = 'No se pudo obtener la ubicación.';
          if (err.code === 1) {
            msg = 'Permiso denegado. Actívalo en el icono de candado de tu navegador.';
          } else if (err.code === 2) {
            msg = 'Posición no disponible en este dispositivo.';
          } else if (err.code === 3) {
            msg = 'Tiempo de espera agotado al consultar ubicación. Reintenta.';
          }
          showToast(msg);
        },
        geoOptions
      );
    };
  }

  // Refrescar datos meteorológicos
  const doRefresh = () => {
    if (isSimulated) {
      showToast('Modo simulación activo. Pulsa "Tiempo Real" para sincronizar con Open-Meteo.');
      applySimulatedStormFront();
      return;
    }
    showToast('Sincronizando con Open-Meteo...');
    fetchMeteorologicalData();
  };

  const btnRefreshData = document.getElementById('btn-refresh-data');
  if (btnRefreshData) btnRefreshData.onclick = doRefresh;

  const bannerRefresh = document.getElementById('btn-banner-refresh');
  if (bannerRefresh) bannerRefresh.onclick = doRefresh;

  const btnReloadHeader = document.getElementById('btn-reload-page');
  if (btnReloadHeader) {
    btnReloadHeader.onclick = e => {
      e.preventDefault();
      doRefresh();
    };
  }

  // Toggle Sidebar
  const sidebar = document.getElementById('gis-sidebar');
  const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');

  if (toggleSidebarBtn && sidebar) {
    toggleSidebarBtn.onclick = () => {
      sidebar.classList.toggle('collapsed');
      toggleSidebarBtn.classList.toggle('active', !sidebar.classList.contains('collapsed'));
      setTimeout(() => map.invalidateSize(), 300);
    };
  }

  if (btnCloseSidebar && sidebar) {
    btnCloseSidebar.onclick = () => {
      sidebar.classList.add('collapsed');
      if (toggleSidebarBtn) toggleSidebarBtn.classList.remove('active');
      setTimeout(() => map.invalidateSize(), 300);
    };
  }

  // Menú Hamburguesa Móvil
  const btnHamburger = document.getElementById('btn-hamburger');
  const mobileDrawer = document.getElementById('mobile-menu-drawer');
  const iconHam = document.getElementById('icon-hamburger');
  const iconHamClose = document.getElementById('icon-hamburger-close');

  const closeMobileDrawer = () => {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('open');
    if (btnHamburger) btnHamburger.classList.remove('active');
    if (iconHam) iconHam.style.display = 'block';
    if (iconHamClose) iconHamClose.style.display = 'none';
  };

  if (btnHamburger && mobileDrawer) {
    btnHamburger.onclick = e => {
      e.stopPropagation();
      const isOpen = mobileDrawer.classList.toggle('open');
      btnHamburger.classList.toggle('active', isOpen);
      if (iconHam) iconHam.style.display = isOpen ? 'none' : 'block';
      if (iconHamClose) iconHamClose.style.display = isOpen ? 'block' : 'none';
    };

    document.addEventListener('click', e => {
      if (!mobileDrawer.contains(e.target as Node) && !btnHamburger.contains(e.target as Node)) {
        closeMobileDrawer();
      }
    });
  }

  // Botones del Menú Móvil
  const mobZoomAll = document.getElementById('mob-zoom-all');
  if (mobZoomAll) {
    mobZoomAll.onclick = () => {
      btnZoomAll?.click();
      closeMobileDrawer();
    };
  }

  const mobZoomAburra = document.getElementById('mob-zoom-aburra');
  if (mobZoomAburra) {
    mobZoomAburra.onclick = () => {
      btnZoomAburra?.click();
      closeMobileDrawer();
    };
  }

  const mobZoomOriente = document.getElementById('mob-zoom-oriente');
  if (mobZoomOriente) {
    mobZoomOriente.onclick = () => {
      btnZoomOriente?.click();
      closeMobileDrawer();
    };
  }

  const mobToggleSidebar = document.getElementById('mob-toggle-sidebar');
  if (mobToggleSidebar && sidebar) {
    mobToggleSidebar.onclick = () => {
      sidebar.classList.remove('collapsed');
      if (toggleSidebarBtn) toggleSidebarBtn.classList.add('active');
      setTimeout(() => map.invalidateSize(), 300);
      closeMobileDrawer();
    };
  }

  const mobToggleSim = document.getElementById('mob-toggle-sim');
  if (mobToggleSim) {
    mobToggleSim.onclick = () => {
      toggleSimulationMode();
      closeMobileDrawer();
    };
  }

  const mobBtnGps = document.getElementById('mob-btn-gps');
  if (mobBtnGps) {
    mobBtnGps.onclick = () => {
      gpsBtn?.click();
      closeMobileDrawer();
    };
  }

  const mobBtnRefresh = document.getElementById('mob-btn-refresh');
  if (mobBtnRefresh) {
    mobBtnRefresh.onclick = () => {
      fetchMeteorologicalData();
      closeMobileDrawer();
    };
  }

  // Menú Desplegable de Capas (Plegable)
  const layerWrapper = document.getElementById('layer-control-wrapper');
  const btnToggleLayers = document.getElementById('btn-toggle-layers');
  const floatingLayerPanel = document.getElementById('floating-layer-panel');

  const toggleLayerPanel = (show?: boolean) => {
    if (!floatingLayerPanel || !btnToggleLayers) return;
    const willOpen = typeof show === 'boolean' ? show : floatingLayerPanel.classList.contains('collapsed');
    if (willOpen) {
      floatingLayerPanel.classList.remove('collapsed');
      btnToggleLayers.classList.add('active');
    } else {
      floatingLayerPanel.classList.add('collapsed');
      btnToggleLayers.classList.remove('active');
    }
  };

  if (btnToggleLayers && floatingLayerPanel) {
    btnToggleLayers.onclick = e => {
      e.stopPropagation();
      toggleLayerPanel();
    };

    document.addEventListener('click', e => {
      if (layerWrapper && !layerWrapper.contains(e.target as Node)) {
        toggleLayerPanel(false);
      }
    });
  }

  const mobToggleLayers = document.getElementById('mob-toggle-layers');
  if (mobToggleLayers) {
    mobToggleLayers.onclick = () => {
      toggleLayerPanel(true);
      closeMobileDrawer();
    };
  }

  // Filtros de Región
  document.querySelectorAll('.filter-tab').forEach(tab => {
    (tab as HTMLElement).onclick = () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter') || 'all';
      renderMunicipalitiesList();
    };
  });

  // Capas: Precipitaciones
  const toggleClouds = document.getElementById('layer-toggle-clouds') as HTMLInputElement | null;
  if (toggleClouds) {
    toggleClouds.onchange = e => {
      if (!cloudOverlay) return;
      if ((e.target as HTMLInputElement).checked) {
        if (!map.hasLayer(cloudOverlay)) cloudOverlay.addTo(map);
        cloudOverlay.setOpacity(cloudOpacity);
      } else {
        map.removeLayer(cloudOverlay);
      }
    };
  }

  // Capas: Marcadores Valle de Aburrá
  const toggleAburra = document.getElementById('layer-toggle-aburra') as HTMLInputElement | null;
  if (toggleAburra) {
    toggleAburra.onchange = e => {
      if ((e.target as HTMLInputElement).checked) {
        markersAburraGroup.addTo(map);
      } else {
        map.removeLayer(markersAburraGroup);
      }
    };
  }

  // Capas: Marcadores Oriente
  const toggleOriente = document.getElementById('layer-toggle-oriente') as HTMLInputElement | null;
  if (toggleOriente) {
    toggleOriente.onchange = e => {
      if ((e.target as HTMLInputElement).checked) {
        markersOrienteGroup.addTo(map);
      } else {
        map.removeLayer(markersOrienteGroup);
      }
    };
  }

  // Slider de Opacidad
  const opSlider = document.getElementById('radar-opacity-slider') as HTMLInputElement | null;
  const opVal = document.getElementById('opacity-val');
  if (opSlider && opVal) {
    opSlider.oninput = e => {
      const val = (e.target as HTMLInputElement).value;
      cloudOpacity = parseInt(val, 10) / 100;
      opVal.textContent = `${val}%`;

      if (cloudOverlay) {
        cloudOverlay.setOpacity(cloudOpacity);
      }
    };
  }

  // Selector de Mapa Base
  const selectBasemap = document.getElementById('select-basemap') as HTMLSelectElement | null;
  if (selectBasemap) {
    selectBasemap.onchange = e => {
      const choice = (e.target as HTMLSelectElement).value;
      if (activeBaseLayer) map.removeLayer(activeBaseLayer);
      activeBaseLayer = baseLayers[choice] || baseLayers['esri-dark'];
      activeBaseLayer.addTo(map);
    };
  }
}

function showToast(text: string) {
  const toast = document.getElementById('gis-toast');
  const msg = document.getElementById('toast-message');
  if (!toast || !msg) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  msg.textContent = text;
  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = null;
  }, 4000);
}

// --- Arranque ---
window.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('gis-sidebar');
  const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');

  if (sidebar) sidebar.classList.add('collapsed');
  if (toggleSidebarBtn) toggleSidebarBtn.classList.remove('active');

  initMap();

  // Auto-refresco periódico cada 5 minutos
  setInterval(() => {
    fetchMeteorologicalData();
  }, 5 * 60 * 1000);

  // Auto-sincronizar inmediatamente al volver a la pestaña
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchMeteorologicalData();
    }
  });
});
