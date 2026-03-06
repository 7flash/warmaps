/**
 * map.ts — MapLibre 2D Tactical Map Setup
 * 
 * Initializes the map, sources, layers, and interactive popups.
 */

import maplibregl from 'maplibre-gl';
import { map, setMap } from './state';
import { proxyImg } from './utils';
import { initPanelToggles, initWallet } from './panels';
import { initAIChat } from './ai';
import { updateMapSources } from './data';
import { startContinuousRepaint } from './perf';

// ─── Country Flag Data ──────────────────────────────────────

const COUNTRY_FLAGS: Array<{ iso: string; flag: string; lat: number; lon: number; name: string }> = [
    // Middle East & Central Asia
    { iso: 'IRN', flag: '🇮🇷', lat: 32.4, lon: 53.7, name: 'Iran' },
    { iso: 'IRQ', flag: '🇮🇶', lat: 33.2, lon: 43.7, name: 'Iraq' },
    { iso: 'SYR', flag: '🇸🇾', lat: 35.0, lon: 38.0, name: 'Syria' },
    { iso: 'ISR', flag: '🇮🇱', lat: 31.0, lon: 34.8, name: 'Israel' },
    { iso: 'PSE', flag: '🇵🇸', lat: 31.9, lon: 35.2, name: 'Palestine' },
    { iso: 'LBN', flag: '🇱🇧', lat: 33.9, lon: 35.9, name: 'Lebanon' },
    { iso: 'JOR', flag: '🇯🇴', lat: 31.2, lon: 36.5, name: 'Jordan' },
    { iso: 'SAU', flag: '🇸🇦', lat: 24.7, lon: 45.1, name: 'Saudi Arabia' },
    { iso: 'YEM', flag: '🇾🇪', lat: 15.5, lon: 48.5, name: 'Yemen' },
    { iso: 'ARE', flag: '🇦🇪', lat: 23.4, lon: 53.8, name: 'UAE' },
    { iso: 'AFG', flag: '🇦🇫', lat: 33.9, lon: 67.7, name: 'Afghanistan' },
    { iso: 'PAK', flag: '🇵🇰', lat: 30.4, lon: 69.3, name: 'Pakistan' },
    { iso: 'TUR', flag: '🇹🇷', lat: 39.0, lon: 35.2, name: 'Turkey' },
    // Europe
    { iso: 'UKR', flag: '🇺🇦', lat: 49.0, lon: 32.0, name: 'Ukraine' },
    { iso: 'RUS', flag: '🇷🇺', lat: 61.5, lon: 105.3, name: 'Russia' },
    { iso: 'BLR', flag: '🇧🇾', lat: 53.7, lon: 28.0, name: 'Belarus' },
    { iso: 'POL', flag: '🇵🇱', lat: 51.9, lon: 19.1, name: 'Poland' },
    { iso: 'DEU', flag: '🇩🇪', lat: 51.2, lon: 10.4, name: 'Germany' },
    { iso: 'FRA', flag: '🇫🇷', lat: 46.2, lon: 2.2, name: 'France' },
    { iso: 'GBR', flag: '🇬🇧', lat: 55.4, lon: -3.4, name: 'UK' },
    { iso: 'ITA', flag: '🇮🇹', lat: 41.9, lon: 12.6, name: 'Italy' },
    { iso: 'ESP', flag: '🇪🇸', lat: 40.5, lon: -3.7, name: 'Spain' },
    { iso: 'ROU', flag: '🇷🇴', lat: 45.9, lon: 24.9, name: 'Romania' },
    { iso: 'GRC', flag: '🇬🇷', lat: 39.1, lon: 21.8, name: 'Greece' },
    { iso: 'SWE', flag: '🇸🇪', lat: 60.1, lon: 18.6, name: 'Sweden' },
    { iso: 'NOR', flag: '🇳🇴', lat: 60.5, lon: 8.5, name: 'Norway' },
    { iso: 'FIN', flag: '🇫🇮', lat: 61.9, lon: 25.7, name: 'Finland' },
    // Africa
    { iso: 'EGY', flag: '🇪🇬', lat: 26.8, lon: 30.8, name: 'Egypt' },
    { iso: 'LBY', flag: '🇱🇾', lat: 26.3, lon: 17.2, name: 'Libya' },
    { iso: 'SDN', flag: '🇸🇩', lat: 12.9, lon: 30.2, name: 'Sudan' },
    { iso: 'ETH', flag: '🇪🇹', lat: 9.1, lon: 40.5, name: 'Ethiopia' },
    { iso: 'SOM', flag: '🇸🇴', lat: 5.2, lon: 46.2, name: 'Somalia' },
    { iso: 'KEN', flag: '🇰🇪', lat: -0.02, lon: 37.9, name: 'Kenya' },
    { iso: 'NGA', flag: '🇳🇬', lat: 9.1, lon: 8.7, name: 'Nigeria' },
    { iso: 'ZAF', flag: '🇿🇦', lat: -30.6, lon: 22.9, name: 'South Africa' },
    { iso: 'COD', flag: '🇨🇩', lat: -4.0, lon: 21.8, name: 'DR Congo' },
    // Americas
    { iso: 'USA', flag: '🇺🇸', lat: 37.1, lon: -95.7, name: 'USA' },
    { iso: 'CAN', flag: '🇨🇦', lat: 56.1, lon: -106.3, name: 'Canada' },
    { iso: 'MEX', flag: '🇲🇽', lat: 23.6, lon: -102.6, name: 'Mexico' },
    { iso: 'BRA', flag: '🇧🇷', lat: -14.2, lon: -51.9, name: 'Brazil' },
    { iso: 'ARG', flag: '🇦🇷', lat: -38.4, lon: -63.6, name: 'Argentina' },
    { iso: 'COL', flag: '🇨🇴', lat: 4.6, lon: -74.3, name: 'Colombia' },
    // Asia
    { iso: 'CHN', flag: '🇨🇳', lat: 35.9, lon: 104.2, name: 'China' },
    { iso: 'JPN', flag: '🇯🇵', lat: 36.2, lon: 138.3, name: 'Japan' },
    { iso: 'KOR', flag: '🇰🇷', lat: 35.9, lon: 127.8, name: 'South Korea' },
    { iso: 'PRK', flag: '🇰🇵', lat: 40.3, lon: 127.5, name: 'North Korea' },
    { iso: 'IND', flag: '🇮🇳', lat: 20.6, lon: 78.9, name: 'India' },
    { iso: 'TWN', flag: '🇹🇼', lat: 23.7, lon: 121.0, name: 'Taiwan' },
    { iso: 'KAZ', flag: '🇰🇿', lat: 48.0, lon: 68.0, name: 'Kazakhstan' },
    { iso: 'AUS', flag: '🇦🇺', lat: -25.3, lon: 133.8, name: 'Australia' },
    { iso: 'IDN', flag: '🇮🇩', lat: -0.8, lon: 113.9, name: 'Indonesia' },
    { iso: 'THA', flag: '🇹🇭', lat: 15.9, lon: 100.9, name: 'Thailand' },
    { iso: 'VNM', flag: '🇻🇳', lat: 14.1, lon: 108.3, name: 'Vietnam' },
    { iso: 'PHL', flag: '🇵🇭', lat: 12.9, lon: 121.8, name: 'Philippines' },
    { iso: 'MYS', flag: '🇲🇾', lat: 4.2, lon: 101.9, name: 'Malaysia' },
    { iso: 'OMN', flag: '🇴🇲', lat: 21.5, lon: 55.9, name: 'Oman' },
    { iso: 'QAT', flag: '🇶🇦', lat: 25.4, lon: 51.2, name: 'Qatar' },
    { iso: 'KWT', flag: '🇰🇼', lat: 29.3, lon: 47.5, name: 'Kuwait' },
    { iso: 'BHR', flag: '🇧🇭', lat: 26.0, lon: 50.5, name: 'Bahrain' },
    { iso: 'GEO', flag: '🇬🇪', lat: 42.3, lon: 43.4, name: 'Georgia' },
    { iso: 'ARM', flag: '🇦🇲', lat: 40.1, lon: 45.0, name: 'Armenia' },
    { iso: 'AZE', flag: '🇦🇿', lat: 40.1, lon: 47.6, name: 'Azerbaijan' },
];

export const mapInstances: maplibregl.Map[] = [];
export let isMapSyncEnabled = false;
export let is3DTerrainEnabled = false;

export function toggleMapSync() {
    isMapSyncEnabled = !isMapSyncEnabled;
    return isMapSyncEnabled;
}

/**
 * Toggle 3D terrain rendering on all map instances.
 * Uses MapTiler's free terrain-rgb DEM tiles.
 */
export function toggle3DTerrain(): boolean {
    is3DTerrainEnabled = !is3DTerrainEnabled;

    for (const m of mapInstances) {
        // Skip dead maps
        if (!document.body.contains(m.getContainer())) continue;

        if (is3DTerrainEnabled) {
            // Add terrain source if not already present
            if (!m.getSource('terrain-dem')) {
                m.addSource('terrain-dem', {
                    type: 'raster-dem',
                    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15,
                });
            }

            // Enable terrain exaggeration
            m.setTerrain({ source: 'terrain-dem', exaggeration: 1.8 });

            // Cinematic pitch transition
            m.easeTo({ pitch: 60, duration: 1000 });
        } else {
            // Disable terrain
            m.setTerrain(null as any);

            // Flatten back to 2D
            m.easeTo({ pitch: 0, duration: 800 });
        }
    }

    return is3DTerrainEnabled;
}

let globalSyncing = false;

export function initMap() {
    const mapContainers = document.querySelectorAll('.wm-container[data-widget-type="map"]');
    if (mapContainers.length === 0) return;

    mapContainers.forEach((container, index) => {
        const body = container.querySelector('.wm-container-body');
        if (!body) return;

        // Skip if already initialized
        if (body.querySelector('.maplibregl-canvas-container')) return;

        const mapId = `map-${index}-${Date.now()}`;

        let mapEl = body.querySelector('.wm-map-inner') as HTMLElement | null;
        if (!mapEl) {
            body.innerHTML = '';
            mapEl = document.createElement('div');
            mapEl.id = mapId;
            mapEl.className = 'wm-map-inner';
            mapEl.style.width = '100%';
            mapEl.style.height = '100%';
            body.appendChild(mapEl);
        } else {
            mapEl.id = mapId;
        }

        // Parse map position from URL hash: #map=zoom/lat/lng
        let initCenter: [number, number] = [45, 30];
        let initZoom = 3;
        const hashMatch = location.hash.match(/map=(\d+\.?\d*)\/(-?\d+\.?\d*)\/(-?\d+\.?\d*)/);
        if (hashMatch) {
            initZoom = parseFloat(hashMatch[1]);
            initCenter = [parseFloat(hashMatch[3]), parseFloat(hashMatch[2])];
        }

        const m = new maplibregl.Map({
            container: mapId,
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: initCenter,
            zoom: initZoom,
            pitch: 0,
            attributionControl: false,
        });

        // Use first map for global flyTo singleton backwards compatibility
        if (index === 0 && !map) setMap(m);

        // Add to global instances for syncing and cleanup
        if (!mapInstances.includes(m)) mapInstances.push(m);

        // Map Syncing logic
        m.on('move', () => {
            if (!isMapSyncEnabled || globalSyncing) return;
            globalSyncing = true;

            const c = m.getCenter();
            const z = m.getZoom();
            const b = m.getBearing();
            const p = m.getPitch();

            // Clean up dead maps and sync alive ones
            for (let i = mapInstances.length - 1; i >= 0; i--) {
                const otherMap = mapInstances[i];
                if (otherMap === m) continue;

                const container = otherMap.getContainer();
                if (!document.body.contains(container)) {
                    mapInstances.splice(i, 1);
                    continue;
                }

                otherMap.jumpTo({ center: c, zoom: z, bearing: b, pitch: p });
            }
            globalSyncing = false;
        });

        // Update URL hash on move (debounced)
        let hashTimer: ReturnType<typeof setTimeout> | null = null;
        m.on('moveend', () => {
            if (hashTimer) clearTimeout(hashTimer);
            hashTimer = setTimeout(() => {
                const c = m.getCenter();
                const z = m.getZoom().toFixed(1);
                const newHash = `map=${z}/${c.lat.toFixed(2)}/${c.lng.toFixed(2)}`;
                history.replaceState(null, '', `#${newHash}`);
            }, 500);
        });

        m.addControl(new maplibregl.NavigationControl(), 'top-right');

        m.on('load', () => {
            // Create airplane icon for flights
            const planeSize = 24;
            const planeCanvas = document.createElement('canvas');
            planeCanvas.width = planeSize;
            planeCanvas.height = planeSize;
            const ctx = planeCanvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(12, 2);
            ctx.lineTo(14, 10);
            ctx.lineTo(22, 12);
            ctx.lineTo(22, 14);
            ctx.lineTo(14, 13);
            ctx.lineTo(14, 19);
            ctx.lineTo(17, 21);
            ctx.lineTo(17, 22);
            ctx.lineTo(12, 20);
            ctx.lineTo(7, 22);
            ctx.lineTo(7, 21);
            ctx.lineTo(10, 19);
            ctx.lineTo(10, 13);
            ctx.lineTo(2, 14);
            ctx.lineTo(2, 12);
            ctx.lineTo(10, 10);
            ctx.closePath();
            ctx.fill();

            const imageData = ctx.getImageData(0, 0, planeSize, planeSize);
            m.addImage('airplane-icon', imageData, { sdf: true });

            // --- Sources ---
            m.addSource('fires', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('flights', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('assets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('acled', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('webcams', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('seismic', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('pumpfun-tokens', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

            // Country flag labels
            const flagFeatures = COUNTRY_FLAGS.map(c => ({
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
                properties: { name: c.name, iso: c.iso }
            }));
            m.addSource('country-flags', { type: 'geojson', data: { type: 'FeatureCollection', features: flagFeatures } });

            // --- Layers ---
            m.addLayer({
                id: 'country-flag-labels', type: 'symbol', source: 'country-flags',
                layout: {
                    'text-field': ['get', 'iso'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9, 5, 11, 8, 14],
                    'text-allow-overlap': false, 'text-ignore-placement': false, 'text-letter-spacing': 0.1,
                },
                paint: {
                    'text-color': '#64748b',
                    'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.5,
                    'text-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4, 0.7, 6, 0.9],
                },
                minzoom: 2,
            });

            // Thermal Anomalies (Heatmap)
            m.addLayer({
                id: 'fires-heat', type: 'heatmap', source: 'fires',
                paint: {
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'brightness'], 300, 0.2, 400, 1],
                    'heatmap-intensity': 1.5,
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(255, 107, 53, 0)', 0.2, 'rgba(255, 107, 53, 0.4)', 1, 'rgba(255, 68, 68, 1)'
                    ],
                    'heatmap-radius': 15, 'heatmap-opacity': 0.8
                }
            });

            // Aircraft
            m.addLayer({
                id: 'flights-point', type: 'symbol', source: 'flights',
                layout: {
                    'icon-image': 'airplane-icon',
                    'icon-size': ['match', ['get', 'type'], 'military', 0.85, 'sigint', 1.0, 'government', 0.75, 0.55],
                    'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map',
                    'icon-allow-overlap': true, 'icon-ignore-placement': true,
                },
                paint: {
                    'icon-color': ['match', ['get', 'type'], 'military', '#ef4444', 'sigint', '#a855f7', 'government', '#f59e0b', '#22d3ee'],
                    'icon-opacity': ['match', ['get', 'type'], 'military', 1, 'sigint', 1, 0.7],
                }
            });

            // Conflict Heatmap
            m.addLayer({
                id: 'events-heat', type: 'heatmap', source: 'events',
                paint: {
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'confidence'], 0, 0.3, 0.5, 0.6, 1, 1],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 6, 1.5, 10, 2],
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(255, 100, 50, 0)', 0.15, 'rgba(255, 80, 30, 0.25)',
                        0.4, 'rgba(255, 50, 20, 0.5)', 0.7, 'rgba(240, 30, 10, 0.75)', 1, 'rgba(220, 20, 5, 1)'
                    ],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 5, 25, 10, 40],
                    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 8, 0.4, 12, 0.15],
                }
            });

            // Individual event dots
            m.addLayer({
                id: 'events-point', type: 'circle', source: 'events', minzoom: 4,
                paint: {
                    'circle-color': ['match', ['get', 'type'], 'gdelt', '#ff6b35', 'market-hot', '#ef4444', 'market', '#f59e0b', '#ff6b35'],
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 7],
                    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 0.8],
                    'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255, 107, 53, 0.3)', 'circle-blur': 0.3,
                }
            });

            // Strategic Assets
            m.addLayer({
                id: 'assets-nuclear', type: 'circle', source: 'assets', filter: ['==', ['get', 'type'], 'nuclear'],
                paint: { 'circle-color': '#22d3ee', 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#000', 'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3] }
            });
            m.addLayer({
                id: 'assets-base', type: 'circle', source: 'assets', filter: ['==', ['get', 'type'], 'base'],
                paint: { 'circle-color': '#3b82f6', 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#000', 'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3] }
            });

            // ACLED Kinetic
            m.addLayer({
                id: 'acled-kinetic', type: 'circle', source: 'acled',
                paint: { 'circle-color': '#ef4444', 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#000', 'circle-pitch-alignment': 'map', 'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.7, 0.4] }
            });

            // Webcams
            m.addLayer({
                id: 'webcams-point', type: 'circle', source: 'webcams',
                paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#6366f1', 'circle-pitch-alignment': 'map' }
            });

            // Seismic
            m.addLayer({
                id: 'seismic-kinetic', type: 'circle', source: 'seismic',
                paint: { 'circle-radius': 12, 'circle-color': '#fbbf24', 'circle-opacity': 0.8, 'circle-stroke-width': 4, 'circle-stroke-color': '#b45309', 'circle-pitch-alignment': 'map' }
            });

            // --- Interactive Popups ---
            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'tactical-popup' });

            const setupInteractiveLayer = (layerId: string) => {
                m.on('mouseenter', layerId, (e: any) => {
                    m.getCanvas().style.cursor = 'pointer';
                    const coordinates = e.features[0].geometry.coordinates.slice();
                    const props = e.features[0].properties;

                    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                    }

                    let htmlContent = '';

                    if (props.type === 'nuclear' || props.type === 'base') {
                        const icon = props.type === 'nuclear' ? '☢️' : '🔵';
                        const confColor = props.confidence === 'High' ? '#22c55e' : props.confidence === 'Moderate' ? '#eab308' : '#ef4444';
                        htmlContent = `<div class="intel-card"><div class="intel-card-header">${icon} ${props.name} <button class="wm-link-handle wm-c-link-handle" data-geo-lat="${coordinates[1]}" data-geo-lon="${coordinates[0]}" style="float:right" title="Drag to link">🔗</button></div><div class="intel-card-body"><p>${props.description || 'No detailed intel available.'}</p></div><div class="intel-card-footer"><span>TYPE: ${props.type.toUpperCase()}</span><span>CONF: <span style="color:${confColor}">${props.confidence}</span></span></div></div>`;
                    } else if (props.type === 'gdelt' || props.type === 'market-hot' || props.type === 'market') {
                        htmlContent = `<div class="intel-card"><div class="intel-card-header">📍 EVENT <button class="wm-link-handle wm-c-link-handle" data-geo-lat="${coordinates[1]}" data-geo-lon="${coordinates[0]}" style="float:right" title="Drag to link">🔗</button></div><div class="intel-card-body"><p>${props.title}</p></div><div class="intel-card-footer"><span>DATE: ${props.date ? props.date.slice(0, 10) : 'LIVE'}</span></div></div>`;
                    } else if (props.type === 'acled-kinetic') {
                        htmlContent = `<div class="intel-card"><div class="intel-card-header" style="color: #ef4444;">💥 ${props.sub_type.toUpperCase()} <button class="wm-link-handle wm-c-link-handle" data-geo-lat="${coordinates[1]}" data-geo-lon="${coordinates[0]}" style="float:right;color:#ef4444;border-color:#ef4444" title="Drag to link">🔗</button></div><div class="intel-card-body"><div style="margin-bottom: 8px; font-weight: bold; color: #f8fafc;">${props.actor1} <span style="opacity: 0.5;">VS</span> ${props.actor2}</div><p>${props.notes || ''}</p></div><div class="intel-card-footer"><span>LOC: ${props.location}</span><span>FATALITIES: ${props.fatalities}</span></div></div>`;
                    } else if (props.type === 'cyber') {
                        htmlContent = `<div class="intel-card"><div class="intel-card-header" style="color: #a855f7;">🚨 CYBER ANOMALY</div><div class="intel-card-body"><p style="font-weight:bold; color: #f8fafc;">Severe Regional Internet Blackout Detected</p><p>Type: ${props.anomaly_type.toUpperCase()}</p></div><div class="intel-card-footer"><span>LOC: ${props.region}</span><span style="color:#ef4444">DROP: ${props.drop}%</span></div></div>`;
                    } else if (props.type === 'seismic') {
                        htmlContent = `<div class="intel-card"><div class="intel-card-header" style="color: #fbbf24;">🚨 CRITICAL SEISMIC EVENT</div><div class="intel-card-body"><p style="font-weight:bold; color: #f8fafc;">Suspected Deep-Earth Kinetic Detonation</p><p>${props.title}</p></div><div class="intel-card-footer"><span style="color:#ef4444">DEPTH: ${props.depth} km</span><span>MAG: ${props.mag}</span></div></div>`;
                    }

                    if (htmlContent) {
                        popup.setLngLat(coordinates).setHTML(htmlContent).addTo(m);
                    }
                });

                m.on('mouseleave', layerId, () => {
                    m.getCanvas().style.cursor = '';
                    popup.remove();
                });
            };

            setupInteractiveLayer('assets-nuclear');
            setupInteractiveLayer('assets-base');
            setupInteractiveLayer('events-point');
            setupInteractiveLayer('acled-kinetic');
            setupInteractiveLayer('webcams-point');
            setupInteractiveLayer('seismic-kinetic');

            // Click-to-open webcam viewer
            m.on('click', 'webcams-point', (e: any) => {
                const props = e.features?.[0]?.properties;
                if (props?.playerUrl) window.open(props.playerUrl, '_blank', 'width=800,height=600');
            });

            // Click on GDELT event → show detailed article popup
            m.on('click', 'events-point', (e: any) => {
                if (!e.features || e.features.length === 0) return;
                const props = e.features[0].properties;
                const coords = e.features[0].geometry.coordinates.slice();
                const imgHtml = props.imageUrl ? `<img src="${proxyImg(props.imageUrl)}" style="width:100%;height:120px;object-fit:cover;border-bottom:1px solid rgba(34,197,94,0.1)" onerror="this.style.display='none'" />` : '';
                new maplibregl.Popup({ className: 'tactical-popup', closeButton: true, maxWidth: '320px' })
                    .setLngLat(coords)
                    .setHTML(`
                <div class="intel-card">
                    ${imgHtml}
                    <div style="padding:10px">
                        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px;line-height:1.3">${props.title || 'Event'}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">📍 ${props.date || 'Recent'} · ${props.source || 'GDELT'}</div>
                        ${props.url ? `<a href="${props.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);text-decoration:none">Read Article →</a>` : ''}
                    </div>
                </div>
            `)
                    .addTo(m);
            });

            // Cursor pointers
            m.on('mouseenter', 'events-point', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'events-point', () => { m.getCanvas().style.cursor = ''; });
            m.on('mouseenter', 'fires-cluster', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'fires-cluster', () => { m.getCanvas().style.cursor = ''; });

            // Flight airplane click popup
            m.on('mouseenter', 'flights-point', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'flights-point', () => { m.getCanvas().style.cursor = ''; });
            m.on('click', 'flights-point', (e: any) => {
                if (!e.features || e.features.length === 0) return;
                const f = e.features[0];
                const p = f.properties;
                const coords = f.geometry.coordinates;
                const typeLabel = p.type === 'military' ? '🔴 MILITARY' : p.type === 'sigint' ? '🟣 SIGINT' : p.type === 'government' ? '🟡 GOV' : '🔵 CIVILIAN';
                new maplibregl.Popup({ className: 'tactical-popup', closeButton: true, maxWidth: '260px' })
                    .setLngLat(coords)
                    .setHTML(`
                    <div style="padding:10px;">
                        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;font-family:var(--font-mono);">${p.callsign || 'N/A'}</div>
                        <div style="font-size:10px;color:var(--text-secondary);line-height:1.6;">
                            ${typeLabel}<br/>
                            🏳️ ${p.country || '??'}<br/>
                            📏 ${p.alt ? p.alt.toLocaleString() + ' ft' : 'N/A'}<br/>
                            💨 ${p.velocity || 0} kts · HDG ${Math.round(p.heading || 0)}°
                        </div>
                    </div>
                `)
                    .addTo(m);
            });

            // Initialize panel toggle system
            initPanelToggles();
            initAIChat();
            initWallet();

            updateMapSources();

            // Force MapLibre into continuous 120fps repaint mode
            startContinuousRepaint();

            // ─── Country Profile Click ──────────────────────────
            m.on('click', 'country-flag-labels', (e: any) => {
                if (!e.features || e.features.length === 0) return;
                const iso = e.features[0].properties.iso;
                const country = COUNTRY_FLAGS.find(c => c.iso === iso);
                if (!country) return;
                showCountryProfile(country, m);
            });
            m.on('mouseenter', 'country-flag-labels', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'country-flag-labels', () => { m.getCanvas().style.cursor = ''; });

            applyMapLayers(m, container as HTMLElement);
        });
    });
}

function applyMapLayers(m: any, container: HTMLElement) {
    const cfgLayers = (container.dataset.cfglayers || 'events').split(',');

    const setVisibility = (layerId: string, isVisible: boolean) => {
        if (m.getLayer(layerId)) m.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
    };

    const isAll = cfgLayers.includes('all');

    setVisibility('fires-heat', isAll || cfgLayers.includes('fires'));
    setVisibility('flights-point', isAll || cfgLayers.includes('flights'));
    setVisibility('events-heat', isAll || cfgLayers.includes('events'));
    setVisibility('events-point', isAll || cfgLayers.includes('events'));
    setVisibility('assets-nuclear', isAll || cfgLayers.includes('assets'));
    setVisibility('assets-base', isAll || cfgLayers.includes('assets'));
    setVisibility('acled-kinetic', isAll || cfgLayers.includes('acled'));
    setVisibility('seismic-kinetic', isAll || cfgLayers.includes('seismic'));
}

// ─── Country Profile Modal ──────────────────────────────────

function showCountryProfile(country: typeof COUNTRY_FLAGS[0], mapRef: any) {
    // Import state data
    const { gdeltEvents, acledEvents, firePoints, threatAlerts } = require('./state');

    // Aggregate events near this country (within ~500km of flag position)
    const RADIUS = 500;
    const countryEvents = gdeltEvents.filter((ev: any) => {
        if (!ev.lat || !ev.lon) return false;
        return haversine(country.lat, country.lon, ev.lat, ev.lon) < RADIUS;
    });

    const countryFires = firePoints.filter((f: any) => {
        return haversine(country.lat, country.lon, f.lat, f.lon) < RADIUS;
    });

    // ACLED events by country name
    let acledCount = 0;
    let acledFatalities = 0;
    const acledList: any[] = [];
    if (acledEvents?.features) {
        for (const f of acledEvents.features) {
            const p = f.properties;
            if (p.country?.toLowerCase().includes(country.name.toLowerCase()) ||
                haversine(country.lat, country.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) < RADIUS) {
                acledCount++;
                acledFatalities += p.fatalities || 0;
                acledList.push(p);
            }
        }
    }

    // Risk score: 0-100
    const eventScore = Math.min(30, countryEvents.length * 2);
    const fireScore = Math.min(15, countryFires.length);
    const acledScore = Math.min(35, acledCount * 10);
    const fatalityScore = Math.min(20, acledFatalities * 5);
    const riskScore = Math.min(100, eventScore + fireScore + acledScore + fatalityScore);
    const riskLevel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 15 ? 'MODERATE' : 'LOW';
    const riskColor = riskScore >= 70 ? '#ef4444' : riskScore >= 40 ? '#f59e0b' : riskScore >= 15 ? '#06b6d4' : '#22c55e';

    // Recent events (last 5)
    const recentEvents = countryEvents.slice(0, 5).map((ev: any) =>
        `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;">
            <div style="color:var(--text-primary);margin-bottom:2px">${(ev.title || '').slice(0, 60)}</div>
            <div style="color:var(--text-muted);font-size:9px">${ev.source || 'GDELT'} · ${ev.date || 'Recent'}</div>
        </div>`
    ).join('');

    // ACLED strikes
    const acledHtml = acledList.slice(0, 3).map((a: any) =>
        `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;">
            <div style="color:#ef4444;font-weight:600;font-size:9px;letter-spacing:1px">${a.sub_type || 'STRIKE'}</div>
            <div style="color:var(--text-primary);margin:2px 0">${a.actor1} vs ${a.actor2}</div>
            <div style="color:var(--text-muted);font-size:9px">${a.location || ''} · ${a.fatalities || 0} fatalities</div>
        </div>`
    ).join('');

    // Build modal
    const existingModal = document.getElementById('country-profile-modal');
    if (existingModal) existingModal.remove();
    const existingOverlay = document.getElementById('country-profile-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'country-profile-overlay';
    overlay.className = 'country-profile-overlay';
    overlay.onclick = () => { overlay.remove(); modal.remove(); };

    const modal = document.createElement('div');
    modal.id = 'country-profile-modal';
    modal.className = 'country-profile-modal';
    modal.innerHTML = `
        <div class="cp-header">
            <span class="cp-flag">${country.flag}</span>
            <div>
                <div class="cp-name">${country.name}</div>
                <div class="cp-iso">${country.iso}</div>
            </div>
            <div class="cp-risk" style="background:${riskColor}20;color:${riskColor};border-color:${riskColor}">
                <div class="cp-risk-score">${riskScore}</div>
                <div class="cp-risk-label">${riskLevel}</div>
            </div>
            <button class="cp-close" onclick="this.closest('.country-profile-modal').remove();document.getElementById('country-profile-overlay')?.remove()">×</button>
        </div>
        <div class="cp-stats">
            <div class="cp-stat"><div class="cp-stat-val">${countryEvents.length}</div><div class="cp-stat-lbl">EVENTS</div></div>
            <div class="cp-stat"><div class="cp-stat-val" style="color:#f97316">${countryFires.length}</div><div class="cp-stat-lbl">FIRES</div></div>
            <div class="cp-stat"><div class="cp-stat-val" style="color:#ef4444">${acledCount}</div><div class="cp-stat-lbl">STRIKES</div></div>
            <div class="cp-stat"><div class="cp-stat-val" style="color:#ef4444">${acledFatalities}</div><div class="cp-stat-lbl">FATALITIES</div></div>
        </div>
        ${recentEvents ? `<div class="cp-section"><div class="cp-section-title">📡 RECENT EVENTS</div>${recentEvents}</div>` : ''}
        ${acledHtml ? `<div class="cp-section"><div class="cp-section-title">💥 KINETIC ACTIVITY</div>${acledHtml}</div>` : ''}
        <div class="cp-footer">
            <button class="cp-fly-btn" id="cp-fly-btn">🗺️ FLY TO REGION</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    document.getElementById('cp-fly-btn')?.addEventListener('click', () => {
        mapRef.flyTo({ center: [country.lon, country.lat], zoom: 5, speed: 1.5 });
        overlay.remove();
        modal.remove();
    });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
