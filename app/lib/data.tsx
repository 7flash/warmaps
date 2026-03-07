/**
 * data.ts — Data fetching & map source updates
 */

import {
    FF, map, measure, measureSync,
    gdeltEvents, setGdeltEvents,
    firePoints, setFirePoints,
    flightData, setFlightData,
    flightStats, setFlightStats,
    marketData, setMarketData,
    threatAlerts, setThreatAlerts,
    strategicAssets, setStrategicAssets,
    acledEvents, setAcledEvents,
    seismicData, setSeismicData,
    webcamData, setWebcamData,
    newsItems, setNewsItems,
    pumpfunTokens, setPumpfunTokens,
    telegramAlerts, setTelegramAlerts as storeTelegramAlerts,
    currentFilter, dataPaused,
    eventArrivalTime, markFresh,
} from './state';
import { renderNewsFeed, renderGdeltFeed, renderFiresFeed, renderRadarFeed, renderSeismicFeed, showThreatBanner, updateTicker, updateStats, renderTelegramFeed } from './feeds';
import { queueNewEvents } from './markers';
import { updateTokenMapSource, renderTokensFeed } from './tokens';
import { cachedFetch } from './cache';
import { spawnRadarPings, showDataFlash } from './spotlight';

/** Validate that coordinates are within MapLibre's accepted range */
function isValidCoord(lat: number, lon: number): boolean {
    return typeof lat === 'number' && typeof lon === 'number' &&
        !isNaN(lat) && !isNaN(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// ─── WebWorker Data Layer ───────────────────────────────────

const workerCode = `
self.onmessage = function(e) {
    const { type, payload } = e.data;
    if (type === 'parse-flights') {
        try {
            const data = JSON.parse(payload);
            const flights = data.flights || [];
            const features = flights
                .filter(f => typeof f.lat === 'number' && typeof f.lon === 'number' && !isNaN(f.lat) && !isNaN(f.lon) && f.lat >= -90 && f.lat <= 90 && f.lon >= -180 && f.lon <= 180)
                .map(f => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
                properties: {
                    type: f.type,
                    callsign: f.callsign,
                    heading: f.heading || 0,
                    alt: Math.round((f.alt || 0) * 3.281),
                    velocity: Math.round((f.velocity || 0) * 1.944),
                    country: f.country || '??',
                }
            }));
            self.postMessage({ type: 'flights-done', features, flights, stats: data.stats || {} });
        } catch (err) {
            self.postMessage({ type: 'error', msg: 'Flight parse fail' });
        }
    } else if (type === 'parse-fires') {
        try {
            const data = JSON.parse(payload);
            const fires = data.fires || [];
            const features = fires
                .filter(f => typeof f.lat === 'number' && typeof f.lon === 'number' && !isNaN(f.lat) && !isNaN(f.lon) && f.lat >= -90 && f.lat <= 90 && f.lon >= -180 && f.lon <= 180)
                .map(f => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
                properties: { brightness: f.brightness, confidence: f.confidence }
            }));
            self.postMessage({ type: 'fires-done', features, fires });
        } catch (err) {
            self.postMessage({ type: 'error', msg: 'Fires parse fail' });
        }
    } else if (type === 'parse-gdelt') {
        try {
            const data = JSON.parse(payload);
            self.postMessage({ type: 'gdelt-done', events: data.events || [] });
        } catch (err) {
            self.postMessage({ type: 'error', msg: 'GDELT parse fail' });
        }
    }
};
`;
const blob = new Blob([workerCode], { type: 'application/javascript' });
const geoWorker = new Worker(URL.createObjectURL(blob));

let latestFlightsGeoJSON: any = null;
let latestFiresGeoJSON: any = null;

geoWorker.onmessage = (e) => {
    if (e.data.type === 'flights-done') {
        setFlightData(e.data.flights);
        setFlightStats(e.data.stats);
        latestFlightsGeoJSON = { type: 'FeatureCollection', features: e.data.features };
        markFresh('flights');

        const flSrc = map?.getSource('flights');
        if (flSrc) flSrc.setData(latestFlightsGeoJSON);

        const flightCountEl = document.getElementById('flight-count');
        if (flightCountEl) flightCountEl.textContent = String(e.data.flights.length);
    } else if (e.data.type === 'fires-done') {
        setFirePoints(e.data.fires);
        latestFiresGeoJSON = { type: 'FeatureCollection', features: e.data.features };
        markFresh('fires');
        renderFiresFeed();

        const fSrc = map?.getSource('fires');
        if (fSrc) fSrc.setData(latestFiresGeoJSON);

        const el = document.getElementById('firms-count');
        if (el) el.textContent = String(e.data.fires.length);
    } else if (e.data.type === 'gdelt-done') {
        const events = e.data.events;
        const prevCount = gdeltEvents.length;
        setGdeltEvents(events);
        markFresh('gdelt');
        renderGdeltFeed();
        // Since we are off-worker, MapLibre doesn't have an automated update tick for specific events without updateMapSources.
        // It's hoisted below but accessible since we're in the same scope.
        updateMapSources();

        const el = document.getElementById('gdelt-count');
        if (el) el.textContent = String(events.length);
        console.log(`[WARMAPS] GDELT via Worker: ${events.length} events, ${events.filter((ev: any) => ev.imageUrl).length} with images`);

        const newCount = events.length;
        const diff = Math.abs(newCount - prevCount);
        if (prevCount > 0 && diff > 0) {
            spawnRadarPings(events.slice(0, Math.min(diff, 10)));
            showDataFlash(`⚡ ${newCount} EVENTS • ${diff} NEW`);
        } else if (prevCount === 0 && newCount > 0) {
            showDataFlash(`📡 ${newCount} EVENTS LOADED`);
            spawnRadarPings(events);
        }
    }
};

// ─── Data Fetching ──────────────────────────────────────────

export async function fetchAllData() {
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

export async function fetchAcled() {
    await cachedFetch('/api/acled', 'acled', (data) => {
        setAcledEvents(data);
        markFresh('acled');
        const aSrc = map?.getSource('acled');
        if (aSrc) aSrc.setData(acledEvents);
    });
}

export async function fetchSeismic() {
    await cachedFetch('/api/seismic', 'seismic', (data) => {
        if (data.events) {
            const geo = {
                type: 'FeatureCollection',
                features: data.events
                    .filter((e: any) => isValidCoord(e.lat, e.lon))
                    .map((e: any) => ({
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
            setSeismicData(geo);
            const aSrc = map?.getSource('seismic');
            if (aSrc) aSrc.setData(geo);
            renderSeismicFeed();
            markFresh('seismic');
            const el = document.getElementById('seismic-count');
            if (el) el.textContent = String(data.events.length);
        }
    });
}

export async function fetchCrypto() {
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

        const rect = chartCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        chartCanvas.width = rect.width * dpr;
        chartCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        if (w < 10 || h < 10) return;

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
        markFresh('crypto');
    } catch (e) {
        console.error('[WARMAPS] Crypto data fetch failed:', e);
    }
}

export async function fetchAssets() {
    await cachedFetch('/api/assets', 'assets', (data) => {
        setStrategicAssets(data);
        markFresh('assets');
        const aSrc = map?.getSource('assets');
        if (aSrc) aSrc.setData(data);
    });
}

export async function fetchNews() {
    await cachedFetch(`/api/news?source=${currentFilter}`, `news-${currentFilter}`, (data) => {
        setNewsItems(data.items || []);
        markFresh('news');
        renderNewsFeed();
    });
}

export async function fetchGdelt() {
    await cachedFetch('/api/gdelt?region=conflict', 'gdelt', (data) => {
        // data is text (raw JSON string), pass to worker
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        geoWorker.postMessage({ type: 'parse-gdelt', payload: text });
    }, { parseAs: 'text' });
}

export async function fetchFires() {
    await cachedFetch('/api/fires', 'fires', (data) => {
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        geoWorker.postMessage({ type: 'parse-fires', payload: text });
    }, { parseAs: 'text' });
}

export async function fetchMarkets() {
    await cachedFetch('/api/markets', 'markets', (data) => {
        setMarketData(data.markets || []);
        setThreatAlerts(data.alerts || []);
        markFresh('markets');
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
    }, { maxAgeMs: 15 * 60 * 1000 });
}

export async function fetchTelegramAlerts() {
    try {
        const res = await fetch('/api/telegram/alerts');
        if (!res.ok) return;
        const alerts = await res.json();
        if (Array.isArray(alerts) && alerts.length > 0) {
            storeTelegramAlerts(alerts);
            markFresh('telegram');
            renderTelegramFeed(alerts);
            updateMapSources(); // Plot alerts with locations on the map
            const countEl = document.getElementById('tg-count');
            if (countEl) countEl.textContent = String(alerts.length);
        }
    } catch { /* telegram not connected */ }
}

export async function fetchFlights() {
    await cachedFetch('/api/flights', 'flights', (data) => {
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        geoWorker.postMessage({ type: 'parse-flights', payload: text });
    }, { parseAs: 'text', maxAgeMs: 5 * 60 * 1000 });
}

export async function fetchWebcams() {
    await cachedFetch('/api/webcams', 'webcams', (data) => {
        setWebcamData(data.webcams || []);
        markFresh('webcams');

        const webcamGeoJSON = {
            type: 'FeatureCollection',
            features: webcamData
                .filter((cam: any) => isValidCoord(cam.lat, cam.lon))
                .map((cam: any) => ({
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
    });
}

export async function fetchPumpfun() {
    await cachedFetch('/api/pumpfun', 'pumpfun', (data) => {
        setPumpfunTokens(data.tokens || []);
        markFresh('pumpfun');
        updateTokenMapSource();
        renderTokensFeed();
        console.log(`[WARMAPS] Pump.fun: ${pumpfunTokens.length} conflict tokens loaded`);
    }, { maxAgeMs: 15 * 60 * 1000 });
}

// ─── Tactical Map Updating ──────────────────────────────────

let _mapUpdatePending = false;
let _mapUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let _lastMapUpdate = 0;

/** Throttled map update — first call is immediate, subsequent calls within 500ms are coalesced */
export function updateMapSources() {
    const now = Date.now();
    if (now - _lastMapUpdate > 500) {
        _lastMapUpdate = now;
        _updateMapSourcesNow();
    } else if (!_mapUpdateTimer) {
        _mapUpdateTimer = setTimeout(() => {
            _mapUpdateTimer = null;
            _lastMapUpdate = Date.now();
            _updateMapSourcesNow();
        }, 500 - (now - _lastMapUpdate));
    }
}

function _updateMapSourcesNow() {
    if (!map || !map.isStyleLoaded() || dataPaused) return;

    const now = Date.now();

    // Features pushed from off-thread worker that just need their Source to be synced
    // if we dropped a frame
    if (latestFiresGeoJSON) {
        const fSrc = map.getSource('fires');
        if (fSrc) fSrc.setData(latestFiresGeoJSON);
    }

    if (latestFlightsGeoJSON) {
        const flSrc = map.getSource('flights');
        if (flSrc) flSrc.setData(latestFlightsGeoJSON);
    }

    // Events GeoJSON
    const features: any[] = [];

    // Queue new image events
    if (FF.imageMarkers) queueNewEvents(gdeltEvents);

    gdeltEvents.filter(e => e.lat && e.lon && isValidCoord(e.lat, e.lon)).forEach(e => {
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
        marketData.filter((m: any) => m.lat && m.lon && isValidCoord(m.lat, m.lon)).forEach((m: any) => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
                properties: { type: m.probability >= 60 ? 'market-hot' : 'market', title: m.title, opacity: 1.0 }
            });
        });
    }

    // Telegram OSINT alerts with extracted locations
    if (FF.telegram) {
        telegramAlerts.filter((a: any) => a.location?.lat && a.location?.lon && isValidCoord(a.location.lat, a.location.lon)).forEach((a: any) => {
            const tType = a.threatLevel === 'critical' ? 'telegram-critical' :
                a.threatLevel === 'high' ? 'telegram-high' : 'telegram';
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [a.location.lon, a.location.lat] },
                properties: {
                    type: tType,
                    title: `📡 ${a.channelTitle}: ${a.text.slice(0, 80)}`,
                    opacity: 1.0,
                    equipmentType: a.equipmentType || null,
                    channel: a.channel,
                }
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
