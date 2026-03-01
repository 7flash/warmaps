/**
 * page.client.tsx — Dashboard Client Controller
 * 
 * Handles:
 * - 3D Globe (Globe.gl/Three.js) with conflict visualization  
 * - RSS news feed polling & rendering
 * - GDELT event feed
 * - NASA FIRMS fire overlay
 * - Prediction Markets / Threat Radar
 * - Live TV channel switching
 * - Clock update
 * - Breaking news ticker
 * - WebSocket chat
 * - Telegram OSINT
 */

import maplibregl from 'maplibre-gl';
import { createMeasure, configure } from 'measure-fn';

// Configure measure-fn for browser console visibility
configure({ maxResultLength: 120, timestamps: true });
const { measure, measureSync } = createMeasure('wm');

// ─── Feature Flags ──────────────────────────────────────────
// Toggle via console: window.FF.flights = false (to disable for perf debugging)
// All enabled by default — disable to isolate FPS bottlenecks
const FF = {
    news: true,
    gdelt: true,
    fires: true,
    flights: true,
    markets: true,
    telegram: true,
    assets: true,
    acled: true,
    seismic: true,
    crypto: true,
    webcams: true,
    pumpfun: true,
    spotlight: true,
    ticker: true,
    imageMarkers: true,
};
(window as any).FF = FF;

// ─── State ──────────────────────────────────────────────────

let map: any;
let newsItems: any[] = [];
let gdeltEvents: any[] = [];
let firePoints: any[] = [];
let flightData: any[] = [];
let flightStats: any = {};
let marketData: any[] = [];
let threatAlerts: any[] = [];
let strategicAssets: any = null;
let acledEvents: any = null;
let seismicData: any = null;
let cryptoData: any = null;
let webcamData: any[] = [];
let pumpfunTokens: any[] = [];
let currentFilter = 'all';

// ─── Real-Time Image Marker System ───────────────────────────
// Rank-based fade: each new image causes all previous ones to fade a bit.
// Opacity = 1.0 - (rank * FADE_PER_RANK), where rank=0 is newest.
const eventArrivalTime: Map<string, number> = new Map();  // eventId → client-side arrival timestamp
const eventQueue: any[] = [];  // queue of events waiting to appear on map
let queueDrainTimer: ReturnType<typeof setInterval> | null = null;
const IMAGE_MARKERS: Map<string, any> = new Map();         // ordered by insertion (Map preserves order)
const IMAGE_MARKER_ORDER: string[] = [];                    // ordered list of marker IDs (newest last)
const MAX_VISIBLE_IMAGES = 15;    // max images on map at once
const FADE_PER_RANK = 0.07;      // each rank step reduces opacity by this much
const IMAGE_APPEAR_INTERVAL = 3_000; // new image appears every 3s

// Data freshness tracking
const dataFreshness: Record<string, number> = {};
function markFresh(source: string) { dataFreshness[source] = Date.now(); }
function getFreshnessLabel(source: string): string {
    const ts = dataFreshness[source];
    if (!ts) return '—';
    const age = Math.floor((Date.now() - ts) / 1000);
    if (age < 60) return `${age}s`;
    if (age < 3600) return `${Math.floor(age / 60)}m`;
    return `${Math.floor(age / 3600)}h`;
}

// ─── Performance Metrics ─────────────────────────────────────
let _fps = 0;
let _fpsFrames = 0;
let _fpsLast = performance.now();
let _pingMs = -1;
let _pingInterval: any = null;
const TARGET_FPS = 120;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // ~8.33ms per frame

/**
 * 120 FPS rendering loop.
 * 
 * requestAnimationFrame is capped at monitor refresh rate (60Hz on most displays).
 * To hit 120fps we:
 *   1. Count MapLibre's actual GPU render frames via map.on('render')
 *   2. Force continuous repaint with map.triggerRepaint() every render
 *   3. Use a high-frequency setTimeout loop (8.33ms) for our own animation tick
 *
 * On 120Hz displays this matches natively. On 60Hz displays, MapLibre will
 * still render internally at up to 120fps via triggerRepaint() even though
 * the compositor shows 60fps — the HUD counts actual render calls.
 */
function startFPSCounter() {
    // High-resolution timer loop — NOT limited to rAF's refresh rate
    let lastTick = performance.now();

    const tick = () => {
        _fpsFrames++;
        const now = performance.now();
        if (now - _fpsLast >= 1000) {
            _fps = _fpsFrames;
            _fpsFrames = 0;
            _fpsLast = now;
            updatePerfDisplay();
        }

        // Schedule next tick at 120Hz using setTimeout
        // setTimeout(fn, 0) actually fires at ~4ms (browser minimum)
        // For 120fps we need ~8.33ms intervals
        const elapsed = performance.now() - lastTick;
        const delay = Math.max(0, FRAME_INTERVAL - elapsed);
        lastTick = performance.now();
        setTimeout(tick, delay);
    };

    // Start the loop
    setTimeout(tick, 0);
}

/**
 * Force MapLibre GL into continuous 120fps repaint mode.
 * Called after map loads — hooks into the render event and immediately
 * requests another repaint, creating a continuous GPU render loop.
 */
function startContinuousRepaint() {
    if (!map) return;

    // Every time MapLibre finishes a render, immediately request another
    map.on('render', () => {
        map.triggerRepaint();
    });

    // Zoom-responsive image markers: update --marker-scale on zoom change
    const updateMarkerScale = () => {
        const zoom = map.getZoom();
        // Scale: zoom 2→0.3, zoom 4→0.5, zoom 6→0.8, zoom 8→1.0, zoom 10+→1.2
        const scale = Math.min(1.3, Math.max(0.3, (zoom - 2) * 0.15 + 0.3));
        document.querySelectorAll('.map-image-marker').forEach((el: any) => {
            el.style.setProperty('--marker-scale', String(scale));
        });
    };
    map.on('zoom', updateMarkerScale);
    updateMarkerScale();

    // Kick off the first repaint
    map.triggerRepaint();
}

function startPingMonitor() {
    const measure = async () => {
        try {
            const t0 = performance.now();
            await fetch('/api/ping', { cache: 'no-store' });
            _pingMs = Math.round(performance.now() - t0);
        } catch { _pingMs = -1; }
    };
    measure();
    _pingInterval = setInterval(measure, 5000);
}

function updatePerfDisplay() {
    const el = document.getElementById('perf-hud');
    if (!el) return;
    const fpsColor = _fps >= 100 ? 'var(--accent)' : _fps >= 60 ? 'var(--amber)' : '#ef4444';
    const pingColor = _pingMs < 100 ? 'var(--accent)' : _pingMs < 300 ? 'var(--amber)' : '#ef4444';
    el.innerHTML = `<span style="color:${fpsColor}">${_fps} FPS</span> · <span style="color:${pingColor}">${_pingMs >= 0 ? _pingMs + 'ms' : '—'}</span>`;
}

// ─── Debounce utility ────────────────────────────────────────
const _debounceTimers: Record<string, any> = {};
function debounce(key: string, fn: () => void, ms: number) {
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(fn, ms);
}

// Proxy external images through our server to bypass CORS
function proxyImg(url: string | null | undefined): string {
    if (!url || !url.startsWith('http')) return '';
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

// Image markers removed — all rendering is GPU-native MapLibre layers now
// GDELT events render via the 'events' source (circles + clusters)
// Click popups are handled via native layer click handlers

// ─── MapLibre 2D Tactical Map Setup ─────────────────────────

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || map) return;

    // Use Carto Dark Matter style for tactical operations feel
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [45, 30], // Middle East
        zoom: 3,
        pitch: 0,
        attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
        // Create airplane icon for flights
        const planeSize = 24;
        const planeCanvas = document.createElement('canvas');
        planeCanvas.width = planeSize;
        planeCanvas.height = planeSize;
        const ctx = planeCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        // Simple airplane silhouette pointing UP
        ctx.moveTo(12, 2);   // nose
        ctx.lineTo(14, 10);
        ctx.lineTo(22, 12);  // right wing
        ctx.lineTo(22, 14);
        ctx.lineTo(14, 13);
        ctx.lineTo(14, 19);  // tail right
        ctx.lineTo(17, 21);
        ctx.lineTo(17, 22);
        ctx.lineTo(12, 20);
        ctx.lineTo(7, 22);   // tail left
        ctx.lineTo(7, 21);
        ctx.lineTo(10, 19);
        ctx.lineTo(10, 13);
        ctx.lineTo(2, 14);   // left wing
        ctx.lineTo(2, 12);
        ctx.lineTo(10, 10);
        ctx.closePath();
        ctx.fill();

        const imageData = ctx.getImageData(0, 0, planeSize, planeSize);
        map.addImage('airplane-icon', imageData, { sdf: true });
        // --- Sources ---

        map.addSource('fires', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addSource('flights', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addSource('events', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
        });

        // Fixed Tactical Assets Source
        map.addSource('assets', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // ACLED Kinetic Events Source
        map.addSource('acled', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // Live Webcam Surveillance Source
        map.addSource('webcams', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // Seismic Activity Source (0-2km depth)
        map.addSource('seismic', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // --- Layers ---

        // ─── Country Flag Emoji at Centroids ────────────────────
        // PERF: Instead of loading 10MB+ polygon GeoJSON + rendering fills,
        // use lightweight point markers with flag emoji at each country centroid
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

        // Country label layer — pure text, no canvas rendering needed
        const flagFeatures = COUNTRY_FLAGS.map(c => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
            properties: { name: c.name, iso: c.iso }
        }));

        map.addSource('country-flags', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: flagFeatures }
        });

        map.addLayer({
            id: 'country-flag-labels',
            type: 'symbol',
            source: 'country-flags',
            layout: {
                'text-field': ['get', 'iso'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9, 5, 11, 8, 14],
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'text-letter-spacing': 0.1,
            },
            paint: {
                'text-color': '#64748b',
                'text-halo-color': 'rgba(0,0,0,0.8)',
                'text-halo-width': 1.5,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4, 0.7, 6, 0.9],
            },
            minzoom: 2,
        });

        // Thermal Anomalies (Heatmap)
        map.addLayer({
            id: 'fires-heat',
            type: 'heatmap',
            source: 'fires',
            paint: {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'brightness'], 300, 0.2, 400, 1],
                'heatmap-intensity': 1.5,
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(255, 107, 53, 0)',
                    0.2, 'rgba(255, 107, 53, 0.4)',
                    1, 'rgba(255, 68, 68, 1)'
                ],
                'heatmap-radius': 15,
                'heatmap-opacity': 0.8
            }
        });

        // Aircraft (Symbol layer with rotated airplane icons)
        map.addLayer({
            id: 'flights-point',
            type: 'symbol',
            source: 'flights',
            layout: {
                'icon-image': 'airplane-icon',
                'icon-size': ['match', ['get', 'type'], 'military', 0.85, 'sigint', 1.0, 'government', 0.75, 0.55],
                'icon-rotate': ['get', 'heading'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-color': ['match', ['get', 'type'], 'military', '#ef4444', 'sigint', '#a855f7', 'government', '#f59e0b', '#22d3ee'],
                'icon-opacity': ['match', ['get', 'type'], 'military', 1, 'sigint', 1, 0.7],
            }
        });

        // Conflict Heatmap — replaces useless numbered yellow circles
        // Shows density of conflict events as a warm glow
        map.addLayer({
            id: 'events-heat',
            type: 'heatmap',
            source: 'events',
            paint: {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'confidence'], 0, 0.3, 0.5, 0.6, 1, 1],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 6, 1.5, 10, 2],
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(255, 100, 50, 0)',
                    0.15, 'rgba(255, 80, 30, 0.25)',
                    0.4, 'rgba(255, 50, 20, 0.5)',
                    0.7, 'rgba(240, 30, 10, 0.75)',
                    1, 'rgba(220, 20, 5, 1)'
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 5, 25, 10, 40],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 8, 0.4, 12, 0.15],
            }
        });

        // Individual event dots — small glowing markers visible at mid/high zoom
        map.addLayer({
            id: 'events-point',
            type: 'circle',
            source: 'events',
            minzoom: 4,
            paint: {
                'circle-color': [
                    'match', ['get', 'type'],
                    'gdelt', '#ff6b35',
                    'market-hot', '#ef4444',
                    'market', '#f59e0b',
                    '#ff6b35'
                ],
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 7],
                'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 0.8],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': 'rgba(255, 107, 53, 0.3)',
                'circle-blur': 0.3,
            }
        });

        // Strategic Assets (Nuclear / Bases)
        map.addLayer({
            id: 'assets-nuclear',
            type: 'circle',
            source: 'assets',
            filter: ['==', ['get', 'type'], 'nuclear'],
            paint: {
                'circle-color': '#22d3ee', // Cyan
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3]
            }
        });

        map.addLayer({
            id: 'assets-base',
            type: 'circle',
            source: 'assets',
            filter: ['==', ['get', 'type'], 'base'],
            paint: {
                'circle-color': '#3b82f6', // Blue
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3]
            }
        });

        // ACLED Kinetic Strikes (Red Markers)
        map.addLayer({
            id: 'acled-kinetic',
            type: 'circle',
            source: 'acled',
            paint: {
                'circle-color': '#ef4444', // Red
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-pitch-alignment': 'map',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.7, 0.4]
            }
        });

        // Live Webcam Markers (Camera icons)
        map.addLayer({
            id: 'webcams-point',
            type: 'circle',
            source: 'webcams',
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff',
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#6366f1', // Indigo border
                'circle-pitch-alignment': 'map'
            }
        });

        // Seismic Deep-Earth Detonation Suspects
        map.addLayer({
            id: 'seismic-kinetic',
            type: 'circle',
            source: 'seismic',
            paint: {
                'circle-radius': 12,
                'circle-color': '#fbbf24', // Amber
                'circle-opacity': 0.8,
                'circle-stroke-width': 4,
                'circle-stroke-color': '#b45309', // Dark amber
                'circle-pitch-alignment': 'map'
            }
        });

        // ─── Pump.fun Tokens: rendered as HTML markers (not circles) ─────
        // Source kept for data tracking only, actual rendering via HTML markers
        map.addSource('pumpfun-tokens', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // --- Interactive Intel Popups ---

        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'tactical-popup'
        });

        const setupInteractiveLayer = (layerId: string) => {
            map.on('mouseenter', layerId, (e: any) => {
                map.getCanvas().style.cursor = 'pointer';

                const coordinates = e.features[0].geometry.coordinates.slice();
                const props = e.features[0].properties;

                // Ensure popup appears over the copy being pointed to (if zoomed far out)
                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                let htmlContent = '';

                if (props.type === 'nuclear' || props.type === 'base') {
                    const icon = props.type === 'nuclear' ? '☢️' : '🔵';
                    const confColor = props.confidence === 'High' ? '#22c55e' : props.confidence === 'Moderate' ? '#eab308' : '#ef4444';
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header">${icon} ${props.name}</div>
                            <div class="intel-card-body">
                                <p>${props.description || 'No detailed intel available.'}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>TYPE: ${props.type.toUpperCase()}</span>
                                <span>CONF: <span style="color:${confColor}">${props.confidence}</span></span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'gdelt' || props.type === 'market-hot' || props.type === 'market') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header">📍 EVENT</div>
                            <div class="intel-card-body">
                                <p>${props.title}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>DATE: ${props.date ? props.date.slice(0, 10) : 'LIVE'}</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'acled-kinetic') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #ef4444;">💥 ${props.sub_type.toUpperCase()}</div>
                            <div class="intel-card-body">
                                <div style="margin-bottom: 8px; font-weight: bold; color: #f8fafc;">
                                    ${props.actor1} <span style="opacity: 0.5;">VS</span> ${props.actor2}
                                </div>
                                <p>${props.notes || ''}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>LOC: ${props.location}</span>
                                <span>FATALITIES: ${props.fatalities}</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'cyber') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #a855f7;">🚨 CYBER ANOMALY</div>
                            <div class="intel-card-body">
                                <p style="font-weight:bold; color: #f8fafc;">Severe Regional Internet Blackout Detected</p>
                                <p>Type: ${props.anomaly_type.toUpperCase()}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>LOC: ${props.region}</span>
                                <span style="color:#ef4444">DROP: ${props.drop}%</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'seismic') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #fbbf24;">🚨 CRITICAL SEISMIC EVENT</div>
                            <div class="intel-card-body">
                                <p style="font-weight:bold; color: #f8fafc;">Suspected Deep-Earth Kinetic Detonation</p>
                                <p>${props.title}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span style="color:#ef4444">DEPTH: ${props.depth} km</span>
                                <span>MAG: ${props.mag}</span>
                            </div>
                        </div>
                    `;
                }

                if (htmlContent) {
                    popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
                }
            });

            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
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
        map.on('click', 'webcams-point', (e: any) => {
            const props = e.features?.[0]?.properties;
            if (props?.playerUrl) {
                window.open(props.playerUrl, '_blank', 'width=800,height=600');
            }
        });

        // Click on GDELT event → show detailed article popup
        map.on('click', 'events-point', (e: any) => {
            if (!e.features || e.features.length === 0) return;
            const props = e.features[0].properties;
            const coords = e.features[0].geometry.coordinates.slice();
            const imgHtml = props.imageUrl ? `<img src="${proxyImg(props.imageUrl)}" style="width:100%;height:120px;object-fit:cover;border-bottom:1px solid rgba(34,197,94,0.1)" onerror="this.style.display='none'" />` : '';
            new maplibregl.Popup({
                className: 'tactical-popup',
                closeButton: true,
                maxWidth: '320px',
            })
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
                .addTo(map);
        });

        // Click event dot → zoom in
        map.on('click', 'events-point', (e: any) => {
            if (!e.features || e.features.length === 0) return;
            const coords = e.features[0].geometry.coordinates;
            const props = e.features[0].properties;
            if (props.url) {
                window.open(props.url, '_blank');
            } else {
                map.flyTo({ center: coords, zoom: Math.max(map.getZoom() + 2, 8) });
            }
        });

        map.on('click', 'fires-cluster', (e: any) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['fires-cluster'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.getSource('fires').getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                if (err) return;
                map.flyTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom + 0.5,
                    speed: 1.5,
                    curve: 1.2,
                });
            });
        });

        // Cursor pointer on clusters
        map.on('mouseenter', 'events-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'events-point', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'fires-cluster', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'fires-cluster', () => { map.getCanvas().style.cursor = ''; });

        // Flight airplane click popup
        map.on('mouseenter', 'flights-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'flights-point', () => { map.getCanvas().style.cursor = ''; });
        map.on('click', 'flights-point', (e: any) => {
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
                .addTo(map);
        });

        // Initialize panel toggle system
        initPanelToggles();

        updateMapSources();

        // Force MapLibre into continuous 120fps repaint mode
        startContinuousRepaint();
    });
}

// ─── Data Fetching ──────────────────────────────────────────

async function fetchAllData() {
    await measure('Fetch all data', async (m) => {
        const tasks: Promise<any>[] = [];
        if (FF.news) tasks.push(m('News', () => fetchNews()));
        if (FF.gdelt) tasks.push(m('GDELT', () => fetchGdelt()));
        if (FF.fires) tasks.push(m('Fires', () => fetchFires()));
        if (FF.flights) tasks.push(m('Flights', () => fetchFlights()));
        if (FF.markets) tasks.push(m('Markets', () => fetchMarkets()));
        if (FF.telegram) tasks.push(m('Telegram', () => fetchTelegramAlerts()));
        if (FF.assets) tasks.push(m('Assets', () => fetchAssets()));
        if (FF.acled) tasks.push(m('ACLED', () => fetchAcled()));
        if (FF.seismic) tasks.push(m('Seismic', () => fetchSeismic()));
        if (FF.crypto) tasks.push(m('Crypto', () => fetchCrypto()));
        if (FF.webcams) tasks.push(m('Webcams', () => fetchWebcams()));
        if (FF.pumpfun) tasks.push(m('PumpFun', () => fetchPumpfun()));

        await Promise.allSettled(tasks);

        if (FF.ticker) measureSync('Update ticker', () => updateTicker());
        measureSync('Update stats', () => updateStats());

        return `${tasks.length} sources`;
    });
}

async function fetchAcled() {
    try {
        const res = await fetch('/api/acled');
        acledEvents = await res.json();
        const aSrc = map?.getSource('acled');
        if (aSrc) aSrc.setData(acledEvents);
    } catch (e) {
        console.error('[WARMAPS] ACLED events fetch failed:', e);
    }
}

async function fetchSeismic() {
    try {
        const res = await fetch('/api/seismic');
        const data = await res.json();
        if (data.events) {
            seismicData = {
                type: 'FeatureCollection',
                features: data.events.map((e: any) => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
                    properties: {
                        type: 'seismic',
                        id: e.id,
                        title: e.title,
                        mag: e.mag,
                        depth: e.depth,
                        is_kinetic: e.is_kinetic
                    }
                }))
            };
            const aSrc = map?.getSource('seismic');
            if (aSrc) aSrc.setData(seismicData);
        }
    } catch (e) {
        console.error('[WARMAPS] Seismic events fetch failed:', e);
    }
}

async function fetchCrypto() {
    try {
        const res = await fetch('/api/crypto');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !data.history || data.history.length === 0) return;

        // Update badge
        const badge = document.getElementById('crypto-premium-badge');
        if (badge) {
            const prem = data.currentPremium;
            badge.innerText = `${prem >= 0 ? '+' : ''}${prem.toFixed(2)}%`;
            badge.className = data.alertStatus === 'HIGH_PANIC' ? 'badge badge--hot badge--active' : 'badge';
            if (data.alertStatus === 'HIGH_PANIC') {
                badge.style.animation = 'pulseBorder 2s infinite';
                badge.style.color = '#fff';
                badge.style.backgroundColor = '#ef4444';
            } else {
                badge.style.animation = '';
                badge.style.backgroundColor = '';
            }
        }

        // Draw chart
        const chartCanvas = document.getElementById('crypto-chart') as HTMLCanvasElement;
        if (!chartCanvas) return;

        const ctx = chartCanvas.getContext('2d');
        if (!ctx) return;

        // Set canvas pixel dimensions to match its CSS container
        const rect = chartCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        chartCanvas.width = rect.width * dpr;
        chartCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        if (w < 10 || h < 10) return; // Container not visible

        ctx.clearRect(0, 0, w, h);

        // Draw background grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const gy = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        const values = data.history.map((h: any) => h.premiumPercent);
        const min = Math.min(...values) - 0.5;
        const max = Math.max(...values) + 0.5;
        const range = max - min || 1;

        // Draw zero line
        const zeroY = h - ((0 - min) / range) * h * 0.8 - h * 0.1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw rate line
        const lineColor = data.alertStatus === 'HIGH_PANIC' ? '#ef4444' : '#06b6d4';
        ctx.beginPath();
        const n = values.length;
        values.forEach((v: number, i: number) => {
            const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
            const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Fill area under curve
        if (n > 1) {
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
        } else {
            // Single point — draw a wider area
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
        }
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Draw latest value + source label
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'right';
        ctx.fillText(data.source || '', w - 4, h - 4);

        // Draw dot on latest point
        if (n >= 1) {
            const lastX = n === 1 ? w / 2 : w;
            const lastY = h - ((values[n - 1] - min) / range) * h * 0.8 - h * 0.1;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();
        }
    } catch (e) {
        console.error('[WARMAPS] Crypto data fetch failed:', e);
    }
}

async function fetchAssets() {
    try {
        const res = await fetch('/api/assets');
        strategicAssets = await res.json();
        const aSrc = map?.getSource('assets');
        if (aSrc) aSrc.setData(strategicAssets);
    } catch (e) {
        console.error('[WARMAPS] Strategic assets fetch failed:', e);
    }
}

async function fetchNews() {
    try {
        const res = await fetch(`/api/news?source=${currentFilter}`);
        const data = await res.json();
        newsItems = data.items || [];
        markFresh('news');
        renderNewsFeed();
    } catch (e) {
        console.error('[WARMAPS] News fetch failed:', e);
    }
}

async function fetchGdelt() {
    try {
        const prevCount = gdeltEvents.length;
        const res = await fetch('/api/gdelt?region=conflict');
        const data = await res.json();
        gdeltEvents = data.events || [];
        markFresh('gdelt');
        renderGdeltFeed();
        updateMapSources();
        const el = document.getElementById('gdelt-count');
        if (el) el.textContent = String(gdeltEvents.length);
        console.log(`[WARMAPS] GDELT loaded: ${gdeltEvents.length} events, ${gdeltEvents.filter((e: any) => e.imageUrl).length} with images`);

        // ─── Live animations on data arrival ───
        const newCount = gdeltEvents.length;
        const diff = Math.abs(newCount - prevCount);
        if (prevCount > 0 && diff > 0) {
            spawnRadarPings(gdeltEvents.slice(0, Math.min(diff, 10)));
            showDataFlash(`⚡ ${newCount} EVENTS • ${diff} NEW`);
        } else if (prevCount === 0 && newCount > 0) {
            showDataFlash(`📡 ${newCount} EVENTS LOADED`);
            spawnRadarPings(gdeltEvents);
        }
    } catch (e) {
        console.error('[WARMAPS] GDELT fetch failed:', e);
    }
}

async function fetchFires() {
    try {
        const res = await fetch('/api/fires');
        const data = await res.json();
        firePoints = data.fires || [];
        markFresh('fires');
        renderFiresFeed();
        updateMapSources();
        const el = document.getElementById('firms-count');
        if (el) el.textContent = String(firePoints.length);
    } catch (e) {
        console.error('[WARMAPS] FIRMS fetch failed:', e);
    }
}

async function fetchMarkets() {
    try {
        const res = await fetch('/api/markets');
        if (!res.ok) return;
        const data = await res.json();
        marketData = data.markets || [];
        threatAlerts = data.alerts || [];
        renderRadarFeed();
        updateMapSources();

        const countEl = document.getElementById('radar-alert-count');
        if (countEl) {
            const criticalCount = threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').length;
            countEl.textContent = String(criticalCount);
            countEl.className = criticalCount > 0 ? 'badge badge--hot badge--active' : 'badge badge--hot';
        }

        const marketCountEl = document.getElementById('market-count');
        if (marketCountEl) marketCountEl.textContent = String(marketData.length);

        // Show critical threat banner
        const criticals = threatAlerts.filter((a: any) => a.level === 'critical');
        if (criticals.length > 0) {
            showThreatBanner(criticals[0]);
        }
    } catch (e) {
        console.error('[WARMAPS] Markets fetch failed:', e);
    }
}

async function fetchTelegramAlerts() {
    try {
        const res = await fetch('/api/telegram/alerts');
        if (!res.ok) return;
        const alerts = await res.json();
        if (Array.isArray(alerts) && alerts.length > 0) {
            renderTelegramFeed(alerts);
            const countEl = document.getElementById('tg-count');
            if (countEl) countEl.textContent = String(alerts.length);
        }
    } catch { /* telegram not connected */ }
}

async function fetchFlights() {
    try {
        const res = await fetch('/api/flights');
        if (!res.ok) return;
        const data = await res.json();
        flightData = data.flights || [];
        flightStats = data.stats || {};
        markFresh('flights');
        updateMapSources(); // Update map features

        // Update flight count in stats
        const flightCountEl = document.getElementById('flight-count');
        if (flightCountEl) flightCountEl.textContent = String(flightData.length);
    } catch (e) {
        console.error('[WARMAPS] Flights fetch failed:', e);
    }
}

async function fetchWebcams() {
    try {
        const res = await fetch('/api/webcams');
        if (!res.ok) return;
        const data = await res.json();
        webcamData = data.webcams || [];

        const webcamGeoJSON = {
            type: 'FeatureCollection',
            features: webcamData.map((cam: any) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [cam.lon, cam.lat] },
                properties: {
                    type: 'webcam',
                    id: cam.id,
                    title: `📷 ${cam.title}`,
                    city: cam.city,
                    country: cam.country,
                    playerUrl: cam.playerUrl,
                    status: cam.status,
                }
            }))
        };

        const src = map?.getSource('webcams');
        if (src) src.setData(webcamGeoJSON);

        console.log(`[WARMAPS] Loaded ${webcamData.length} webcams`);
    } catch (e) {
        console.error('[WARMAPS] Webcams fetch failed:', e);
    }
}

// ─── Pump.fun Conflict Token Fetching ───────────────────────

// Token markers are now rendered as HTML image markers via updateTokenMapSource()
// They show actual token images instead of yellow circles

async function fetchPumpfun() {
    try {
        const res = await fetch('/api/pumpfun');
        const data = await res.json();
        pumpfunTokens = data.tokens || [];
        markFresh('pumpfun');
        updateTokenMapSource();
        renderTokensFeed();
        console.log(`[WARMAPS] Pump.fun: ${pumpfunTokens.length} conflict tokens loaded`);
    } catch (e) {
        console.error('[WARMAPS] Pump.fun fetch failed:', e);
    }
}

// Track active token markers for cleanup
const TOKEN_MARKERS: Map<string, any> = new Map();

function updateTokenMapSource() {
    if (!map) return;

    // Remove old token markers
    for (const [, m] of TOKEN_MARKERS) m.remove();
    TOKEN_MARKERS.clear();

    // Place each token as an HTML image marker
    for (const token of pumpfunTokens) {
        if (!token.imageUrl) continue;

        // Try to find a nearby GDELT event matching this token's keywords
        let placeLat = token.lat;
        let placeLon = token.lng;
        const keywords = (token.matchedKeywords || []).map((k: string) => k.toLowerCase());

        if (keywords.length > 0 && gdeltEvents.length > 0) {
            // Find a GDELT event whose title or country matches token keywords
            const match = gdeltEvents.find((ev: any) => {
                const evText = ((ev.title || '') + ' ' + (ev.country || '')).toLowerCase();
                return keywords.some((kw: string) => evText.includes(kw));
            });
            if (match && match.lat && (match.lon || match.lng)) {
                // Offset slightly from the event so they don't stack
                const offsetLon = (Math.random() - 0.5) * 3;
                const offsetLat = (Math.random() - 0.5) * 2;
                placeLat = match.lat + offsetLat;
                placeLon = (match.lon || match.lng) + offsetLon;
            }
        }

        if (!placeLat || !placeLon) continue;

        // Create token image element
        const el = document.createElement('div');
        el.className = 'map-token-marker';
        el.innerHTML = `
            <img src="${proxyImg(token.imageUrl)}" onerror="this.parentElement.style.display='none'" alt="" />
            <div class="map-token-marker__label">${escHtml((token.symbol || '').slice(0, 10))}</div>
        `;
        el.addEventListener('click', () => showTokenPopup(token));

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([placeLon, placeLat])
            .addTo(map);

        TOKEN_MARKERS.set(token.symbol + '-' + token.name, marker);
    }
}

/** Show a rich popup for a token with nearby GDELT event cross-references */
function showTokenPopup(token: any) {
    if (!map) return;

    // Find nearby GDELT events in the same country/region (within ~5° radius)
    const nearbyEvents = gdeltEvents.filter(ev => {
        if (!ev.lat || !ev.lon) return false;
        const dlat = Math.abs(ev.lat - token.lat);
        const dlng = Math.abs(ev.lon - token.lng);
        return dlat < 5 && dlng < 5;
    }).slice(0, 5);

    const keywords = (token.matchedKeywords || []).map((k: string) =>
        `<span class="token-popup__keyword">${escHtml(k)}</span>`
    ).join('');

    const imgSrc = token.imageUrl ? proxyImg(token.imageUrl) : '';
    const pfUrl = token.url || `https://pump.fun/coin/${token.tokenAddress || ''}`;

    const eventsHtml = nearbyEvents.length > 0
        ? nearbyEvents.map(ev => `
            <div class="token-popup__event">
                <a href="${escHtml(ev.url || '#')}" target="_blank" rel="noopener">${escHtml((ev.title || '').slice(0, 60))}</a>
                <span class="token-popup__event-time">${ev.date ? formatTime(ev.date) : ''}</span>
            </div>
        `).join('')
        : '<div class="token-popup__no-events">No nearby events</div>';

    const html = `
        <div class="token-popup">
            <div class="token-popup__header">
                ${imgSrc ? `<img class="token-popup__img" src="${escHtml(imgSrc)}" onerror="this.style.display='none'" />` : ''}
                <div class="token-popup__title">
                    <div class="token-popup__symbol">$${escHtml(token.symbol || '???')}</div>
                    <div class="token-popup__name">${escHtml(token.name || 'Unknown')}</div>
                </div>
            </div>
            <div class="token-popup__meta">
                ${token.country ? `<span>📍 ${escHtml(token.country)}</span>` : ''}
                ${token.boostAmount ? `<span>🚀 ${token.boostAmount} SOL</span>` : ''}
            </div>
            ${keywords ? `<div class="token-popup__keywords">${keywords}</div>` : ''}
            <div class="token-popup__divider"></div>
            <div class="token-popup__events-header">⚡ NEARBY EVENTS (${nearbyEvents.length})</div>
            <div class="token-popup__events">${eventsHtml}</div>
            <a href="${escHtml(pfUrl)}" target="_blank" rel="noopener" class="token-popup__cta">
                Open on DexScreener ↗
            </a>
        </div>
    `;

    // Remove any existing token popup
    document.querySelectorAll('.maplibregl-popup').forEach(p => {
        if (p.querySelector('.token-popup')) p.remove();
    });

    // Fly to the token first so popup is visible, then open popup
    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, 6);
    map.flyTo({
        center: [token.lng, token.lat],
        zoom: targetZoom,
        duration: 800,
        offset: [0, 80], // offset down so popup renders above center
    });

    const openPopup = () => {
        new maplibregl.Popup({ className: 'tactical-popup', maxWidth: '300px', offset: [0, -10] })
            .setLngLat([token.lng, token.lat])
            .setHTML(html)
            .addTo(map);
    };

    map.once('moveend', openPopup);
}

// ─── Render PF Tokens Feed in Sidebar Panel ─────────────────

function renderTokensFeed() {
    const container = document.getElementById('tokens-feed');
    const countEl = document.getElementById('tokens-count');
    if (!container) return;
    if (countEl) countEl.textContent = String(pumpfunTokens.length);

    if (pumpfunTokens.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No conflict tokens found</span></div>`;
        return;
    }

    container.innerHTML = pumpfunTokens.map((token, i) => {
        const keywords = (token.matchedKeywords || []).slice(0, 4).map((k: string) =>
            `<span class="token-card__keyword">${escHtml(k)}</span>`
        ).join('');

        const pfUrl = token.url || `https://pump.fun/coin/${token.mint || ''}`;
        const imgSrc = token.imageUrl ? proxyImg(token.imageUrl) : '';

        return `
            <div class="token-card" data-token-idx="${i}">
                <div class="token-card__header">
                    ${imgSrc
                ? `<img class="token-card__thumb" src="${escHtml(imgSrc)}" onerror="this.style.display='none'" />`
                : `<div class="token-card__icon">💰</div>`}
                    <div class="token-card__info">
                        <div class="token-card__symbol">${escHtml((token.symbol || '???').slice(0, 12))}</div>
                        <div class="token-card__name">${escHtml((token.name || 'Unknown').slice(0, 30))}</div>
                    </div>
                    <a href="${escHtml(pfUrl)}" target="_blank" rel="noopener" class="token-card__link" title="Open on DexScreener">↗</a>
                </div>
                <div class="token-card__meta">
                    ${token.country ? `<span class="token-card__country">📍 ${escHtml(token.country)}</span>` : ''}
                    ${token.boostAmount ? `<span class="token-card__boost">🚀 ${token.boostAmount} SOL</span>` : ''}
                </div>
                ${keywords ? `<div class="token-card__keywords">${keywords}</div>` : ''}
            </div>
        `;
    }).join('');

    // Fly to token location on card click
    container.querySelectorAll('.token-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't interfere with the external link button
            if ((e.target as HTMLElement).closest('.token-card__link')) return;
            const idx = parseInt((card as HTMLElement).dataset.tokenIdx || '0');
            const token = pumpfunTokens[idx];
            if (token && token.lat && token.lng && map) {
                map.flyTo({ center: [token.lng, token.lat], zoom: 6, duration: 1500 });
            }
        });
    });
}

// ─── Rendering ──────────────────────────────────────────────

function renderNewsFeed() {
    const container = document.getElementById('news-feed');
    if (!container) return;

    // Merge GDELT events (with images+coords) and RSS news into a unified feed
    // GDELT events are the primary source since they have location data
    const feedEvents = gdeltEvents
        .filter((ev: any) => ev.imageUrl && ev.lat && (ev.lon || ev.lng))
        .slice(0, 40);

    if (feedEvents.length === 0 && newsItems.length === 0) {
        container.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>Establishing secure feed...</span></div>`;
        return;
    }

    // If no GDELT yet, show RSS items as fallback (no click-to-fly)
    if (feedEvents.length === 0) {
        container.innerHTML = newsItems.slice(0, 15).map(item => `
            <div class="pulse-card">
                <div class="pulse-card__title">${escHtml(item.title)}</div>
                <div class="pulse-card__meta">${escHtml(item.source || '')} · ${formatTime(item.pubDate)}</div>
            </div>
        `).join('');
        return;
    }

    container.innerHTML = feedEvents.map((ev: any, idx: number) => {
        const lat = ev.lat;
        const lon = ev.lon || ev.lng;
        const source = ev.source || ev.domain || '';
        const time = ev.date ? formatTime(ev.date) : '';
        const title = (ev.title || '').slice(0, 80);
        const imgUrl = proxyImg(ev.imageUrl);

        return `
            <div class="pulse-card" data-lat="${lat}" data-lon="${lon}" data-idx="${idx}">
                <img class="pulse-card__img" src="${imgUrl}" 
                     onerror="this.style.display='none'" alt="" loading="lazy" />
                <div class="pulse-card__body">
                    <div class="pulse-card__title">${escHtml(title)}</div>
                    <div class="pulse-card__meta">${escHtml(source)} · ${time}</div>
                </div>
            </div>
        `;
    }).join('');

    // Click handler: fly to location on map
    container.querySelectorAll('.pulse-card[data-lat]').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const el = card as HTMLElement;
            const lat = parseFloat(el.dataset.lat || '0');
            const lon = parseFloat(el.dataset.lon || '0');
            if (!map || isNaN(lat) || isNaN(lon)) return;

            // Fly to the event location
            map.flyTo({
                center: [lon, lat],
                zoom: 6,
                speed: 1.5,
                curve: 1.2,
            });

            // Highlight the clicked card
            container.querySelectorAll('.pulse-card--active').forEach(c => c.classList.remove('pulse-card--active'));
            el.classList.add('pulse-card--active');
        });
    });
}

function renderGdeltFeed() {
    // GDELT feed is now merged into the main pulse feed via renderNewsFeed
    // This function is kept as a no-op for backward compatibility
    renderNewsFeed();
}

function renderFiresFeed() {
    const container = document.getElementById('firms-feed');
    if (!container) return;

    if (firePoints.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No thermal anomalies</span></div>`;
        return;
    }

    container.innerHTML = firePoints.slice(0, 10).map(fire => `
        <div class="feed-item feed-item--fire">
            <div class="feed-item-source firms">🔥 THERMAL ANOMALY</div>
            <div class="feed-item-title">
                ${fire.country || 'Unknown Region'} — ${fire.lat.toFixed(2)}°, ${fire.lon.toFixed(2)}°
            </div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${fire.acq_date} ${fire.acq_time}</span>
                <span>Brightness: ${fire.brightness.toFixed(0)}K</span>
                <span>Confidence: ${fire.confidence}</span>
            </div>
        </div>
    `).join('');
}

function renderTelegramFeed(alerts: any[]) {
    const container = document.getElementById('tg-feed');
    if (!container) return;

    container.innerHTML = alerts.slice(0, 15).map(alert => `
        <div class="feed-item feed-item--telegram">
            <div class="feed-item-source telegram">📡 ${escHtml(alert.channelTitle)}</div>
            <div class="feed-item-title">${escHtml(alert.text.slice(0, 200))}</div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${formatTime(new Date(alert.date * 1000).toISOString())}</span>
            </div>
        </div>
    `).join('');
}

// ─── Threat Radar Rendering ─────────────────────────────────

function renderRadarFeed() {
    const container = document.getElementById('radar-feed');
    if (!container) return;

    if (marketData.length === 0 && threatAlerts.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No prediction market data available</span></div>`;
        return;
    }

    // Render alerts first, then markets
    let html = '';

    // Show active threat alerts
    for (const alert of threatAlerts.slice(0, 5)) {
        const levelClass = `radar-alert--${alert.level}`;
        const icon = alert.level === 'critical' ? '🚨' : alert.level === 'high' ? '⚠️' : '📊';
        html += `
            <div class="radar-alert ${levelClass}">
                <div class="radar-alert-header">
                    <span class="radar-alert-icon">${icon}</span>
                    <span class="radar-alert-level">${alert.level.toUpperCase()}</span>
                    <span class="radar-alert-time">${formatTime(alert.timestamp || alert.created_at || '')}</span>
                </div>
                <div class="radar-alert-title">${escHtml(alert.title.replace(/^[🚨⚠📊️\s]+/, ''))}</div>
                <div class="radar-alert-desc">${escHtml(alert.description)}</div>
            </div>
        `;
    }

    // Show top prediction markets
    for (const market of marketData.slice(0, 8)) {
        const probClass = market.probability >= 70 ? 'prob--hot' :
            market.probability >= 50 ? 'prob--warm' : 'prob--cool';
        const catIcon = getCategoryIcon(market.category);
        const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
        const velocityClass = market.velocityPct > 5 ? 'velocity--up' : market.velocityPct < -5 ? 'velocity--down' : '';

        html += `
            <div class="radar-market" data-link="${escHtml(market.url)}">
                <div class="radar-market-header">
                    <span class="radar-market-cat">${catIcon} ${market.category.toUpperCase()}</span>
                    <span class="radar-market-platform">${market.platform === 'polymarket' ? 'PM' : 'KA'}</span>
                </div>
                <div class="radar-market-title">${escHtml(market.title)}</div>
                <div class="radar-market-stats">
                    <span class="radar-market-prob ${probClass}">${market.probability}%</span>
                    ${velocity ? `<span class="radar-market-velocity ${velocityClass}">${velocity}</span>` : ''}
                    <span class="radar-market-vol">$${formatVolume(market.volume)}</span>
                    ${market.region ? `<span class="radar-market-region">📍 ${market.region}</span>` : ''}
                </div>
                <div class="radar-market-bar">
                    <div class="radar-market-bar-fill ${probClass}" style="width:${market.probability}%"></div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Also populate the dedicated Markets panel (shows ALL markets)
    const marketsContainer = document.getElementById('markets-feed');
    const marketsCount = document.getElementById('markets-alert-count');
    if (marketsContainer) {
        if (marketData.length === 0) {
            marketsContainer.innerHTML = `<div class="loading-state"><span>No prediction market data available</span></div>`;
        } else {
            // Get active category filter
            const activeFilter = document.querySelector('#market-filters .pf-pill.active')?.getAttribute('data-market-cat') || 'all';
            const filtered = activeFilter === 'all' ? marketData : marketData.filter(m => m.category === activeFilter);

            let marketsHtml = '';
            for (const market of filtered) {
                const probClass = market.probability >= 70 ? 'prob--hot' :
                    market.probability >= 50 ? 'prob--warm' : 'prob--cool';
                const catIcon = getCategoryIcon(market.category);
                const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
                const velocityClass = market.velocityPct > 5 ? 'velocity--up' : market.velocityPct < -5 ? 'velocity--down' : '';

                marketsHtml += `
                    <div class="radar-market" data-link="${escHtml(market.url)}">
                        <div class="radar-market-header">
                            <span class="radar-market-cat">${catIcon} ${market.category.toUpperCase()}</span>
                            <span class="radar-market-platform">${market.platform === 'polymarket' ? 'PM' : 'KA'}</span>
                        </div>
                        <div class="radar-market-title">${escHtml(market.title)}</div>
                        <div class="radar-market-stats">
                            <span class="radar-market-prob ${probClass}">${market.probability}%</span>
                            ${velocity ? `<span class="radar-market-velocity ${velocityClass}">${velocity}</span>` : ''}
                            <span class="radar-market-vol">$${formatVolume(market.volume)}</span>
                            ${market.region ? `<span class="radar-market-region">📍 ${market.region}</span>` : ''}
                        </div>
                        <div class="radar-market-bar">
                            <div class="radar-market-bar-fill ${probClass}" style="width:${market.probability}%"></div>
                        </div>
                    </div>
                `;
            }
            marketsContainer.innerHTML = marketsHtml;
        }
        if (marketsCount) marketsCount.textContent = String(marketData.length);
    }
}

function getCategoryIcon(cat: string): string {
    switch (cat) {
        case 'strike': return '💣';
        case 'regime': return '👑';
        case 'chokepoint': return '🚢';
        case 'nuclear': return '☢️';
        case 'escalation': return '⚔️';
        default: return '📊';
    }
}

function formatVolume(vol: number): string {
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
    return String(Math.round(vol));
}

function showThreatBanner(alert: any) {
    const banner = document.getElementById('threat-banner');
    const content = document.getElementById('threat-banner-content');
    if (!banner || !content) return;

    content.innerHTML = `
        <div class="threat-banner-title">${escHtml(alert.title)}</div>
        <div class="threat-banner-desc">${escHtml(alert.description)}</div>
    `;
    banner.style.display = 'flex';

    // Auto-hide after 15 seconds
    setTimeout(() => {
        banner.style.display = 'none';
    }, 15000);
}

// ─── Tactical Map Updating ──────────────────────────────────

function updateMapSources() {
    if (!map || !map.isStyleLoaded()) return;

    const now = Date.now();

    // Fires GeoJSON
    const firesGeoJSON = {
        type: 'FeatureCollection',
        features: firePoints.map(f => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: { brightness: f.brightness, confidence: f.confidence }
        }))
    };
    const fSrc = map.getSource('fires');
    if (fSrc) fSrc.setData(firesGeoJSON);

    // Flights GeoJSON
    const flightsGeoJSON = {
        type: 'FeatureCollection',
        features: flightData.map((f: any) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: {
                type: f.type,
                callsign: f.callsign,
                heading: f.heading || 0,
                alt: Math.round((f.alt || 0) * 3.281), // meters → feet
                velocity: Math.round((f.velocity || 0) * 1.944), // m/s → knots
                country: f.country || '??',
            }
        }))
    };
    const flSrc = map.getSource('flights');
    if (flSrc) flSrc.setData(flightsGeoJSON);

    // Events GeoJSON — show all current GDELT events at full opacity for circles.
    // The floating image markers handle the visual stagger/fade lifecycle.
    const features: any[] = [];

    // Queue new image events BEFORE the loop below sets their arrival times
    if (FF.imageMarkers) queueNewEvents(gdeltEvents);

    gdeltEvents.filter(e => e.lat && e.lon).forEach(e => {
        const eid = e.id || e.url || `${e.lat}-${e.lon}`;
        if (!eventArrivalTime.has(eid)) {
            eventArrivalTime.set(eid, now);
        }

        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
            properties: {
                type: 'gdelt',
                title: e.title,
                date: e.date,
                url: e.url || null,
                source: e.source || null,
                opacity: 1.0,
                imageUrl: e.imageUrl || null,
                vgkg: e.vgkg || false,
                confidence: e.confidence || 0.5,
            }
        });
    });

    if (FF.markets) {
        marketData.filter((m: any) => m.lat && m.lon).forEach((m: any) => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
                properties: { type: m.probability >= 60 ? 'market-hot' : 'market', title: m.title, opacity: 1.0 }
            });
        });
    }

    const eventsGeoJSON = {
        type: 'FeatureCollection',
        features: features
    };
    const eSrc = map.getSource('events');
    if (eSrc) eSrc.setData(eventsGeoJSON);
}

// ─── Real-Time Image Marker Functions ────────────────────────

/** Queue new events that we haven't seen before for staggered appearance */
function queueNewEvents(events: any[]) {
    const eventsWithImages = events.filter(e => {
        if (!e.lat || !e.lon || !e.imageUrl) return false;
        return e.lat >= -90 && e.lat <= 90 && e.lon >= -180 && e.lon <= 180;
    });
    for (const ev of eventsWithImages) {
        const eid = ev.id || ev.url || `${ev.lat}-${ev.lon}`;
        if (!eventArrivalTime.has(eid) && !IMAGE_MARKERS.has(eid)) {
            // Don't re-queue something already in queue
            if (!eventQueue.some(q => (q.id || q.url || `${q.lat}-${q.lon}`) === eid)) {
                eventQueue.push(ev);
            }
        }
    }

    // Start draining the queue if not already running
    if (!queueDrainTimer && eventQueue.length > 0) {
        drainOneEvent();
        queueDrainTimer = setInterval(drainOneEvent, IMAGE_APPEAR_INTERVAL);
    }
}

/** Place one event from the queue onto the map as a floating image */
function drainOneEvent() {
    if (!map) return;

    const ev = eventQueue.shift();
    if (!ev) {
        if (queueDrainTimer) {
            clearInterval(queueDrainTimer);
            queueDrainTimer = null;
        }
        return;
    }

    const eid = ev.id || ev.url || `${ev.lat}-${ev.lon}`;
    spawnImageMarker(ev, eid);
}

/** Create a floating image marker and recompute all opacities by rank */
function spawnImageMarker(ev: any, eid: string) {
    if (!map || !ev.imageUrl) return;

    // Validate coordinates
    const lat = ev.lat;
    const lon = ev.lon || ev.lng;
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        isNaN(lat) || isNaN(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return;
    }

    const arrivedAt = Date.now();
    eventArrivalTime.set(eid, arrivedAt);

    // Simple geo-jitter to prevent exact overlaps
    // Check if any existing marker is within ~2° — if so, offset this one
    let finalLon = lon;
    let finalLat = lat;
    const GEO_MIN_DIST = 2.5; // min degrees apart

    for (let attempt = 0; attempt < 8; attempt++) {
        let tooClose = false;
        for (const [, data] of IMAGE_MARKERS) {
            const other = data.marker.getLngLat();
            const dLat = Math.abs(finalLat - other.lat);
            const dLon = Math.abs(finalLon - other.lng);
            if (dLat < GEO_MIN_DIST && dLon < GEO_MIN_DIST) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) break;

        // Golden angle spiral offset in degrees
        const angle = (attempt * 137.5) * Math.PI / 180;
        const r = GEO_MIN_DIST * (1 + attempt * 0.5);
        finalLon = lon + Math.cos(angle) * r;
        finalLat = lat + Math.sin(angle) * r * 0.7;
        finalLat = Math.max(-80, Math.min(80, finalLat));
        if (finalLon > 180) finalLon -= 360;
        if (finalLon < -180) finalLon += 360;
    }

    // Create the marker element — rectangular image card
    const el = document.createElement('div');
    el.className = 'map-image-marker';
    el.innerHTML = `
        <img src="${proxyImg(ev.imageUrl)}" 
             onerror="this.parentElement.style.display='none'" 
             alt="" />
        <div class="map-image-marker__label">${escHtml((ev.title || '').slice(0, 50))}</div>
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([finalLon, finalLat])
        .addTo(map);

    IMAGE_MARKERS.set(eid, { marker, el, ev });
    IMAGE_MARKER_ORDER.push(eid);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        el.classList.add('map-image-marker--visible');
    });

    // Recompute all markers' opacity based on rank
    updateImageMarkerRanks();
}

/**
 * Rank-based opacity: newest image = 1.0, each older image loses FADE_PER_RANK.
 * When an image's opacity hits 0, remove it from the map.
 */
function updateImageMarkerRanks() {
    const total = IMAGE_MARKER_ORDER.length;

    // Walk backwards through the order array (newest = last)
    for (let i = total - 1; i >= 0; i--) {
        const eid = IMAGE_MARKER_ORDER[i];
        const data = IMAGE_MARKERS.get(eid);
        if (!data) continue;

        const rank = total - 1 - i; // 0 = newest, 1 = second newest, etc.
        const opacity = Math.max(0, 1.0 - rank * FADE_PER_RANK);
        const scale = 0.7 + 0.3 * opacity; // shrink as it fades

        data.el.style.opacity = String(opacity);
        data.el.style.transform = `scale(${scale})`;

        // Remove markers that have faded out completely
        if (opacity <= 0 || rank >= MAX_VISIBLE_IMAGES) {
            data.marker.remove();
            IMAGE_MARKERS.delete(eid);
            IMAGE_MARKER_ORDER.splice(i, 1);
            eventArrivalTime.delete(eid);
        }
    }
}

// startImageDecayLoop and startMapRefreshLoop are no longer needed —
// rank updates happen synchronously in spawnImageMarker.

// ─── Panel Toggle System ────────────────────────────────────

function initPanelToggles() {
    // Panel tabs toggle panels — all right-side now
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panelId = (tab as HTMLElement).dataset.panel;
            if (!panelId) return;

            const panel = document.getElementById(panelId);
            if (!panel) return;

            // Close all other panels first
            document.querySelectorAll('.overlay-panel--right.open').forEach(p => {
                if (p.id !== panelId) {
                    p.classList.remove('open');
                    document.querySelector(`.panel-tab[data-panel="${p.id}"]`)?.classList.remove('active');
                }
            });

            const isOpen = panel.classList.toggle('open');
            tab.classList.toggle('active', isOpen);
        });
    });

    // Close buttons
    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = (btn as HTMLElement).dataset.panel;
            if (!panelId) return;
            document.getElementById(panelId)?.classList.remove('open');
            document.querySelector(`.panel-tab[data-panel="${panelId}"]`)?.classList.remove('active');
        });
    });

    // Market category filter buttons
    document.querySelectorAll('#market-filters .pf-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#market-filters .pf-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderRadarFeed(); // Re-render with new filter
        });
    });
}

// ─── Ticker ─────────────────────────────────────────────────

function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;

    const headlines = [
        ...threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').slice(0, 3)
            .map((a: any) => `[THREAT RADAR] ${a.title}`),
        ...newsItems.slice(0, 6).map(n => `[${(n.source || 'NEWS').toUpperCase()}] ${n.title}`),
        ...marketData.filter((m: any) => m.probability >= 60).slice(0, 3)
            .map((m: any) => `[MARKET] ${m.title} — ${m.probability}% (${m.platform})`),
        ...gdeltEvents.slice(0, 3).map(e => `[GDELT] ${e.title}`),
    ];

    if (headlines.length === 0) {
        el.textContent = 'Monitoring global conflict feeds...';
        return;
    }

    const text = decodeEntities(headlines.join('    ◆    '));
    el.textContent = text + '    ◆    ' + text;
}

function updateStats() {
    const evtEl = document.getElementById('event-count');
    const fireEl = document.getElementById('fire-count');
    const flightEl = document.getElementById('flight-count');
    const webcamEl = document.getElementById('webcam-count');
    if (evtEl) evtEl.textContent = String(gdeltEvents.length);
    if (fireEl) fireEl.textContent = String(firePoints.length);
    if (flightEl) flightEl.textContent = String(flightData.length);
    if (webcamEl) webcamEl.textContent = String(webcamData.length);

    // Data freshness display
    const freshnessEl = document.getElementById('data-freshness');
    if (freshnessEl) {
        const sources = ['gdelt', 'fires', 'flights', 'news'];
        freshnessEl.innerHTML = sources.map(s => {
            const label = getFreshnessLabel(s);
            const color = label === '—' ? 'var(--text-muted)' : (parseInt(label) > 5 && label.endsWith('m') ? 'var(--amber)' : 'var(--accent)');
            return `<span style="color:${color}">${s.toUpperCase()}: ${label}</span>`;
        }).join(' · ');
    }
    updatePerfDisplay();
}

// ─── TV Channel Switching ───────────────────────────────────

// Dynamic live stream discovery — populated from /api/youtube
let discoveredStreams: Record<string, { embedUrl: string | null; isLive: boolean; label: string }> = {};

// Hardcoded fallbacks (in case YouTube scraping fails)
const FALLBACK_URLS: Record<string, string> = {
    aljazeeraenglish: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1',
    france24english: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1',
    skynews: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1',
    dwnews: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRhGGw&autoplay=1&mute=1',
    cnn: 'https://www.youtube.com/embed/live_stream?channel=UCupvZG-5ko_eiXAupbDfxWw&autoplay=1&mute=1',
};

async function fetchYouTubeStreams() {
    try {
        const res = await fetch('/api/youtube');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.streams) return;

        for (const s of data.streams) {
            discoveredStreams[s.key] = {
                embedUrl: s.embedUrl,
                isLive: s.isLive,
                label: s.label,
            };
        }

        // Update channel buttons with live indicators
        const container = document.getElementById('tv-channels');
        if (!container) return;

        // Clear and rebuild buttons with live status
        container.innerHTML = '';
        const channels = data.streams as { key: string; label: string; isLive: boolean }[];

        channels.forEach((ch: any, i: number) => {
            const btn = document.createElement('button');
            btn.className = `channel-btn${i === 0 ? ' active' : ''}`;
            btn.dataset.channel = ch.key;
            btn.innerHTML = `${ch.label}${ch.isLive ? ' <span style="color:#ef4444;font-size:8px;">● LIVE</span>' : ''}`;
            container.appendChild(btn);
        });

        console.log(`[WARMAPS] YouTube: ${channels.filter((c: any) => c.isLive).length}/${channels.length} channels live`);
    } catch (e) {
        console.error('[WARMAPS] YouTube stream discovery failed:', e);
    }
}

function loadTVChannel(channelKey: string) {
    const player = document.getElementById('tv-player');
    if (!player) return;

    // Try discovered URL first, then fallback
    const stream = discoveredStreams[channelKey];
    const embedUrl = stream?.embedUrl || FALLBACK_URLS[channelKey];

    if (embedUrl) {
        player.innerHTML = `<iframe id="tv-iframe" src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
    } else {
        player.innerHTML = `<div class="loading-state" style="height:100%"><span>No live stream found for ${channelKey}</span></div>`;
    }
}

function initTVChannels() {
    const container = document.getElementById('tv-channels');
    if (!container) return;

    // Load fallback immediately while discovery runs
    loadTVChannel('aljazeeraenglish');

    // Start auto-discovery in parallel
    fetchYouTubeStreams().then(() => {
        // Reload current channel with discovered URL
        const active = container.querySelector('.channel-btn.active') as HTMLElement;
        if (active?.dataset.channel) {
            loadTVChannel(active.dataset.channel);
        }
    });

    // Refresh discovery every 10 minutes
    setInterval(fetchYouTubeStreams, 10 * 60 * 1000);

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.channel-btn') as HTMLElement | null;
        if (!btn) return;

        const channelKey = btn.dataset.channel;
        if (!channelKey) return;

        container.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        loadTVChannel(channelKey);
    });
}

// ─── Feed Filters ───────────────────────────────────────────

function initFilters() {
    const container = document.getElementById('feed-filters');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.filter-btn') as HTMLElement | null;
        if (!btn) return;

        const source = btn.dataset.source || 'all';
        currentFilter = source;

        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        fetchNews();
    });
}

// ─── Telegram Auto-Status ───────────────────────────────────

function initTelegram() {
    const statusBar = document.getElementById('tg-status');

    // Poll status every 10s to track auto-connection
    const checkStatus = () => {
        fetch('/api/telegram/status').then(r => r.json()).then(data => {
            if (statusBar) {
                if (data.status === 'connected') {
                    statusBar.textContent = `● Connected as ${data.me?.firstName || data.me?.username || 'OSINT'} — ${data.channelCount} channels`;
                    statusBar.className = 'tg-status tg-connected';
                } else if (data.status === 'awaiting_code' || data.status === 'awaiting_password') {
                    statusBar.textContent = `⚠ Auth required — check server logs`;
                    statusBar.className = 'tg-status';
                } else if (data.status === 'error') {
                    statusBar.textContent = `✗ ${data.error || 'Connection failed'}`;
                    statusBar.className = 'tg-status';
                } else {
                    statusBar.textContent = 'Connecting...';
                }
            }
        }).catch(() => {
            if (statusBar) statusBar.textContent = 'Offline';
        });
    };

    checkStatus();
    setInterval(checkStatus, 10_000);
}

// ─── Threat Banner ──────────────────────────────────────────

function initThreatBanner() {
    const closeBtn = document.getElementById('threat-banner-close');
    const banner = document.getElementById('threat-banner');
    if (closeBtn && banner) {
        closeBtn.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }
}

// ─── Clock ──────────────────────────────────────────────────

function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;

    const update = () => {
        el.textContent = new Date().toUTCString();
    };
    update();
    setInterval(update, 1000);
}

// ─── Aurebesh Toggle ────────────────────────────────────────

function initAurebeshToggle() {
    const btn = document.getElementById('aurebesh-toggle');
    if (!btn) return;

    // Restore saved preference
    if (localStorage.getItem('warmaps-aurebesh') === 'on') {
        document.body.classList.add('aurebesh');
    }

    btn.addEventListener('click', () => {
        document.body.classList.toggle('aurebesh');
        const isOn = document.body.classList.contains('aurebesh');
        localStorage.setItem('warmaps-aurebesh', isOn ? 'on' : 'off');
    });
}

// ─── Utilities ──────────────────────────────────────────────

function decodeEntities(str: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

function escHtml(str: string): string {
    // First decode RSS/HTML entities, then escape for safe HTML output
    const decoded = decodeEntities(str);
    return decoded
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const now = Date.now();
        const diff = now - date.getTime();
        if (diff < 60_000) return 'JUST NOW';
        if (diff < 3600_000) return `${Math.floor(diff / 60_000)}M AGO`;
        if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}H AGO`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

// ─── Chat WebSocket ─────────────────────────────────────────

let ws: WebSocket | null = null;
let chatUsername = '';

function initChat() {
    const messagesEl = document.getElementById('chat-messages');
    const inputEl = document.getElementById('chat-input') as HTMLInputElement | null;
    const sendBtn = document.getElementById('chat-send');
    const onlineEl = document.getElementById('chat-online');
    if (!messagesEl || !inputEl || !sendBtn) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/chat`);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'init') {
                chatUsername = data.username;
                data.history?.forEach((msg: any) => appendChatMessage(msg));
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            } else if (data.type === 'message') {
                appendChatMessage(data);
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            } else if (data.type === 'system') {
                appendSystemMessage(data.text);
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            }
        } catch { /* ignore */ }
    };

    ws.onclose = () => {
        appendSystemMessage('Connection lost. Reconnecting...');
        setTimeout(initChat, 3000);
    };

    const sendMessage = () => {
        const text = inputEl.value.trim();
        if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'message', text }));
        inputEl.value = '';
    };

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function appendChatMessage(msg: { user: string; text: string; time: string }) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const timeStr = msg.time ? new Date(msg.time).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
    }) : '';

    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
        <span class="chat-msg-time">${timeStr}</span>
        <span class="chat-msg-user">${escHtml(msg.user)}:</span>
        <span class="chat-msg-text">${escHtml(msg.text)}</span>
    `;
    messagesEl.appendChild(div);
}

function appendSystemMessage(text: string) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--system';
    div.textContent = text;
    messagesEl.appendChild(div);
}

function scrollChat() {
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

// ─── Search / Jump Modal ────────────────────────────────────

const GLOBE_LOCATIONS = [
    { name: 'Iran', lat: 32.42, lng: 53.68 },
    { name: 'Israel', lat: 31.04, lng: 34.85 },
    { name: 'Gaza Strip', lat: 31.41, lng: 34.35 },
    { name: 'Lebanon (Beirut)', lat: 33.89, lng: 35.50 },
    { name: 'Syria (Damascus)', lat: 33.51, lng: 36.29 },
    { name: 'Yemen (Sanaa)', lat: 15.36, lng: 44.19 },
    { name: 'Ukraine (Kyiv)', lat: 50.45, lng: 30.52 },
    { name: 'Russia (Moscow)', lat: 55.75, lng: 37.61 },
    { name: 'United States (DC)', lat: 38.90, lng: -77.03 },
    { name: 'China (Beijing)', lat: 39.90, lng: 116.40 },
    { name: 'Taiwan', lat: 23.69, lng: 120.96 },
    { name: 'North Korea', lat: 40.33, lng: 127.51 },
];

function initSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    const resultsContainer = document.getElementById('search-results');

    if (!modal || !input || !resultsContainer) return;

    // Toggle on Ctrl+K or Cmd+K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const isVisible = modal.style.display === 'flex';
            modal.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                input.value = '';
                renderResults(GLOBE_LOCATIONS);
                setTimeout(() => input.focus(), 50);
            }
        }
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    const renderResults = (locs: typeof GLOBE_LOCATIONS) => {
        resultsContainer.innerHTML = '';
        locs.forEach(loc => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<span>${loc.name}</span><span style="opacity:0.5">${loc.lat}, ${loc.lng}</span>`;
            div.addEventListener('click', () => {
                if (map) {
                    map.flyTo({ center: [loc.lng, loc.lat], zoom: 6, essential: true });
                }
                modal.style.display = 'none';
            });
            resultsContainer.appendChild(div);
        });
    };

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase();
        const filtered = GLOBE_LOCATIONS.filter(l => l.name.toLowerCase().includes(query));
        renderResults(filtered);
    });
}

// ─── Boot Sequence ──────────────────────────────────────────

function initBootSequence() {
    const bootEl = document.getElementById('boot-sequence');
    if (!bootEl) return;

    // Only show once per session to avoid annoying the user on refresh
    if (sessionStorage.getItem('warmaps-booted')) {
        bootEl.style.display = 'none';
        return;
    }

    sessionStorage.setItem('warmaps-booted', 'true');

    // Fast boot — 1.5s then fade out
    setTimeout(() => {
        bootEl.classList.add('done');
        setTimeout(() => {
            bootEl.style.display = 'none';
        }, 500);
    }, 1500);
}

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    measure('Mount WARMAPS', async (m) => {
        measureSync('Boot sequence', () => initBootSequence());
        measureSync('Clock', () => startClock());
        measureSync('Init map', () => initMap());
        measureSync('TV channels', () => initTVChannels());
        measureSync('Filters', () => initFilters());
        measureSync('Chat', () => initChat());
        measureSync('Telegram', () => initTelegram());
        measureSync('Threat banner', () => initThreatBanner());
        measureSync('Aurebesh toggle', () => initAurebeshToggle());
        measureSync('Search modal', () => initSearchModal());

        // Performance monitoring
        measureSync('FPS counter', () => startFPSCounter());
        measureSync('Ping monitor', () => startPingMonitor());

        // Start data fetching immediately
        await m('Initial data fetch', () => fetchAllData());

        // Refresh all data every 10 seconds for realtime feel
        setInterval(fetchAllData, 10_000);

        // Fast data loops (gated by feature flags)
        if (FF.flights) setInterval(fetchFlights, 5_000);
        if (FF.crypto) setInterval(fetchCrypto, 15_000);

        // Refresh data freshness labels every 5s
        setInterval(updateStats, 5_000);

        // ─── LIVE MAP ANIMATIONS ─────────────────────────────────
        if (FF.spotlight) startConflictSpotlight();

        // Click on feed items opens link
        document.addEventListener('click', (e) => {
            const item = (e.target as HTMLElement).closest('.feed-item, .radar-market') as HTMLElement | null;
            if (item && item.dataset.link && !(e.target as HTMLElement).closest('a')) {
                window.open(item.dataset.link, '_blank');
            }
        });

        // Check legend filters to update map layers
        measureSync('Legend filters', () => setupLegendFilters());

        return 'ready';
    });
}

// ─── Live Animation: Radar Pings ────────────────────────────

function spawnRadarPings(events: any[], color = '') {
    if (!map) return;
    const mapContainer = document.querySelector('.maplibregl-canvas-container') || document.getElementById('map-container');
    if (!mapContainer) return;

    // Spawn up to 8 pings at random event locations
    const subset = events.sort(() => Math.random() - 0.5).slice(0, 8);
    for (const evt of subset) {
        const lat = evt.lat || evt.latitude;
        const lng = evt.lng || evt.longitude || evt.lon;
        if (!lat || !lng) continue;

        try {
            const point = map.project([lng, lat]);
            const ping = document.createElement('div');
            ping.className = `radar-ping ${color}`;
            ping.style.left = `${point.x}px`;
            ping.style.top = `${point.y}px`;
            mapContainer.appendChild(ping);
            setTimeout(() => ping.remove(), 2500);
        } catch (_) { /* point outside viewport */ }
    }
}

function showDataFlash(message: string) {
    const flash = document.createElement('div');
    flash.className = 'data-flash';
    flash.textContent = message;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 3500);
}

// ─── Live Animation: Conflict Theater Spotlight ─────────────

const CONFLICT_THEATERS = [
    { name: 'Iran Theater', lat: 32.42, lng: 53.68, zoom: 5.5 },
    { name: 'Israel-Gaza', lat: 31.5, lng: 34.8, zoom: 7 },
    { name: 'Ukraine Front', lat: 48.5, lng: 37.5, zoom: 6 },
    { name: 'Syria-Iraq', lat: 35.0, lng: 40.0, zoom: 5.5 },
    { name: 'Red Sea', lat: 15.5, lng: 42.0, zoom: 5.5 },
    { name: 'Taiwan Strait', lat: 24.0, lng: 121.0, zoom: 5 },
    { name: 'Korean DMZ', lat: 38.0, lng: 127.0, zoom: 6 },
];

let spotlightIndex = 0;
let spotlightActive = true;
let spotlightMarker: any = null;

function startConflictSpotlight() {
    // Don't auto-pan immediately — let user explore first
    setTimeout(() => {
        cycleSpotlight();
        setInterval(cycleSpotlight, 45_000);
    }, 30_000); // Start after 30s

    // Pause spotlight when user interacts with map
    const mapEl = document.getElementById('map-container');
    if (mapEl) {
        mapEl.addEventListener('mousedown', () => { spotlightActive = false; });
        mapEl.addEventListener('wheel', () => { spotlightActive = false; });
        // Resume after 60s of no interaction
        let resumeTimer: any;
        const resetResume = () => {
            spotlightActive = false;
            clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => { spotlightActive = true; }, 60_000);
        };
        mapEl.addEventListener('mousedown', resetResume);
        mapEl.addEventListener('wheel', resetResume);
        mapEl.addEventListener('touchstart', resetResume);
    }
}

function cycleSpotlight() {
    if (!map || !spotlightActive) return;

    const theater = CONFLICT_THEATERS[spotlightIndex % CONFLICT_THEATERS.length];
    spotlightIndex++;

    // Smooth fly to the next theater
    map.flyTo({
        center: [theater.lng, theater.lat],
        zoom: theater.zoom,
        duration: 3000,
        essential: false,
    });

    // Show "Now Monitoring: ..." flash
    showDataFlash(`🎯 ${theater.name.toUpperCase()}`);

    // Spawn pings at nearby events
    setTimeout(() => {
        const nearbyEvents = gdeltEvents.filter((e: any) => {
            const eLat = e.lat || e.latitude;
            const eLng = e.lng || e.longitude || e.lon;
            if (!eLat || !eLng) return false;
            return Math.abs(eLat - theater.lat) < 8 && Math.abs(eLng - theater.lng) < 12;
        });
        if (nearbyEvents.length > 0) {
            const BREAKING_KW = ['breaking', 'missile', 'strike', 'bomb', 'explosion', 'attack', 'drone', 'killed', 'dead', 'war'];
            const hasBreaking = nearbyEvents.some((e: any) => {
                const t = (e.title || '').toLowerCase();
                return BREAKING_KW.some(kw => t.includes(kw));
            });
            spawnRadarPings(nearbyEvents, hasBreaking ? 'radar-ping--red' : '');
        }
    }, 3500);
}

function setupLegendFilters() {
    const toggleLayer = (id: string, visible: boolean) => {
        if (!map || !map.getLayer(id)) return;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };

    // Collapsible header
    const toggleBtn = document.getElementById('layer-filters-toggle');
    const panel = document.getElementById('layer-filters');
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });
    }

    // Layer toggles
    const bind = (filterId: string, layerIds: string[], onToggle?: (visible: boolean) => void) => {
        const el = document.getElementById(filterId) as HTMLInputElement | null;
        if (!el) return;
        el.addEventListener('change', () => {
            for (const id of layerIds) toggleLayer(id, el.checked);
            if (onToggle) onToggle(el.checked);
        });
    };

    bind('filter-events', ['events-heat', 'events-point']);
    bind('filter-fires', ['fires-heat']);
    bind('filter-flights', ['flights-point']);
    bind('filter-tokens', [], (on: boolean) => {
        document.querySelectorAll('.map-token-marker').forEach((el: any) => {
            el.style.display = on ? '' : 'none';
        });
    });
    bind('filter-acled', ['acled-kinetic']);
    bind('filter-assets', ['assets-nuclear', 'assets-base']);
    bind('filter-seismic', ['seismic-kinetic']);
    bind('filter-webcams', ['webcams-point']);
    bind('filter-flags', ['country-flag-labels']);
}
