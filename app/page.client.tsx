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
let currentFilter = 'all';

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
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // Fixed Tactical Assets Source
        map.addSource('assets', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // --- Layers ---

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

        // Aircraft (Points)
        map.addLayer({
            id: 'flights-point',
            type: 'circle',
            source: 'flights',
            paint: {
                'circle-radius': ['match', ['get', 'type'], 'military', 4, 'sigint', 5, 2],
                'circle-color': ['match', ['get', 'type'], 'military', '#ef4444', 'sigint', '#a855f7', '#22d3ee'],
                'circle-opacity': 0.8,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#000'
            }
        });

        // Event Clusters
        map.addLayer({
            id: 'events-clusters',
            type: 'circle',
            source: 'events',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#eab308',
                'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 30],
                'circle-opacity': 0.7,
                'circle-stroke-width': 2,
                'circle-stroke-color': 'rgba(234, 179, 8, 0.3)'
            }
        });

        map.addLayer({
            id: 'events-cluster-count',
            type: 'symbol',
            source: 'events',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12
            },
            paint: {
                'text-color': '#000'
            }
        });

        map.addLayer({
            id: 'events-point',
            type: 'circle',
            source: 'events',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['match', ['get', 'type'], 'market-hot', '#ef4444', 'market', '#22d3ee', '#22c55e'],
                'circle-radius': 5,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#050913'
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

        // --- Interactive Intel Popups ---

        const popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: false,
            className: 'tactical-popup'
        });

        const setupInteractiveLayer = (layerId: string) => {
            map.on('mouseenter', layerId, () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
            });

            map.on('click', layerId, (e: any) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const props = e.features[0].properties;

                // Ensure that if the map is zoomed out such that multiple copies of the feature are visible, the popup appears over the copy being pointed to.
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
                }

                if (htmlContent) {
                    popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
                }
            });
        };

        setupInteractiveLayer('assets-nuclear');
        setupInteractiveLayer('assets-base');
        setupInteractiveLayer('events-point');

        // Initialize Timeline UI logic
        initTimelineSlider();

        updateMapSources();
    });
}

// ─── Data Fetching ──────────────────────────────────────────

async function fetchAllData() {
    await Promise.all([
        fetchNews(),
        fetchGdelt(),
        fetchFires(),
        fetchFlights(),
        fetchMarkets(),
        fetchTelegramAlerts(),
        fetchAssets(),
    ]);
    updateTicker();
    updateStats();
}

async function fetchAssets() {
    try {
        const res = await fetch('/api/assets');
        strategicAssets = await res.json();
        const aSrc = map?.getSource('assets');
        if (aSrc) aSrc.setData(strategicAssets);
    } catch (e) {
        console.error('[STARWAR] Strategic assets fetch failed:', e);
    }
}

async function fetchNews() {
    try {
        const res = await fetch(`/api/news?source=${currentFilter}`);
        const data = await res.json();
        newsItems = data.items || [];
        renderNewsFeed();
    } catch (e) {
        console.error('[STARWAR] News fetch failed:', e);
    }
}

async function fetchGdelt() {
    try {
        const res = await fetch('/api/gdelt?region=conflict');
        const data = await res.json();
        gdeltEvents = data.events || [];
        renderGdeltFeed();
        updateMapSources();
        const el = document.getElementById('gdelt-count');
        if (el) el.textContent = String(gdeltEvents.length);
    } catch (e) {
        console.error('[STARWAR] GDELT fetch failed:', e);
    }
}

async function fetchFires() {
    try {
        const res = await fetch('/api/fires');
        const data = await res.json();
        firePoints = data.fires || [];
        renderFiresFeed();
        updateMapSources();
        const el = document.getElementById('firms-count');
        if (el) el.textContent = String(firePoints.length);
    } catch (e) {
        console.error('[STARWAR] FIRMS fetch failed:', e);
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
        console.error('[STARWAR] Markets fetch failed:', e);
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
        updateMapSources(); // Update map features

        // Update flight count in stats
        const flightCountEl = document.getElementById('flight-count');
        if (flightCountEl) flightCountEl.textContent = String(flightData.length);
    } catch (e) {
        console.error('[STARWAR] Flights fetch failed:', e);
    }
}

// ─── Rendering ──────────────────────────────────────────────

function renderNewsFeed() {
    const container = document.getElementById('news-feed');
    if (!container) return;

    if (newsItems.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No intel available</span></div>`;
        return;
    }

    container.innerHTML = newsItems.map(item => {
        const time = formatTime(item.pubDate);
        return `
            <div class="feed-item" data-link="${escHtml(item.link)}">
                <div class="feed-item-source ${item.source}">${item.source.toUpperCase()}</div>
                <div class="feed-item-title">
                    <a href="${escHtml(item.link)}" target="_blank" rel="noopener">${escHtml(item.title)}</a>
                </div>
                <div class="feed-item-meta">
                    <span class="feed-item-time">${time}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderGdeltFeed() {
    const container = document.getElementById('gdelt-feed');
    if (!container) return;

    if (gdeltEvents.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No GDELT events</span></div>`;
        return;
    }

    container.innerHTML = gdeltEvents.slice(0, 15).map(ev => `
        <div class="feed-item" data-link="${escHtml(ev.url)}">
            <div class="feed-item-source gdelt">${escHtml(ev.source)}</div>
            <div class="feed-item-title">
                <a href="${escHtml(ev.url)}" target="_blank" rel="noopener">${escHtml(ev.title)}</a>
            </div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${ev.date ? formatTime(ev.date) : '—'}</span>
                ${ev.country ? `<span class="feed-item-location">📍 ${escHtml(ev.country)}</span>` : ''}
            </div>
        </div>
    `).join('');
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
                    <span class="radar-alert-time">${formatTime(alert.timestamp)}</span>
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
            properties: { type: f.type, callsign: f.callsign }
        }))
    };
    const flSrc = map.getSource('flights');
    if (flSrc) flSrc.setData(flightsGeoJSON);

    // Events GeoJSON (GDELT + Markets)
    const features: any[] = [];

    gdeltEvents.filter(e => e.lat && e.lon).forEach(e => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
            properties: { type: 'gdelt', title: e.title, date: e.date }
        });
    });

    marketData.filter((m: any) => m.lat && m.lon).forEach((m: any) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
            properties: { type: m.probability >= 60 ? 'market-hot' : 'market', title: m.title }
        });
    });

    const eventsGeoJSON = {
        type: 'FeatureCollection',
        features: features
    };
    const eSrc = map.getSource('events');
    if (eSrc) eSrc.setData(eventsGeoJSON);
}

// ─── Timeline Slider Logic ──────────────────────────────────

function initTimelineSlider() {
    const slider = document.getElementById('timeline-slider') as HTMLInputElement;
    const dateLabel = document.getElementById('timeline-date');
    const playBtn = document.getElementById('timeline-play');
    if (!slider || !dateLabel || !playBtn) return;

    let isPlaying = false;
    let playInterval: any;

    const updateMapFilter = (val: number) => {
        // Here we would implement real maplibre temporal filtering
        // For now, it updates the visual date label to show intent
        const date = new Date();
        date.setDate(date.getDate() - (100 - val));
        dateLabel.textContent = formatTime(date.toISOString()).split('T')[0];
    };

    slider.addEventListener('input', (e) => {
        updateMapFilter(parseInt((e.target as HTMLInputElement).value));
    });

    playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.textContent = isPlaying ? '⏸' : '▶';

        if (isPlaying) {
            slider.value = '0';
            playInterval = setInterval(() => {
                let v = parseInt(slider.value) + 1;
                if (v > 100) {
                    v = 100;
                    isPlaying = false;
                    playBtn.textContent = '▶';
                    clearInterval(playInterval);
                }
                slider.value = String(v);
                updateMapFilter(v);
            }, 50);
        } else {
            clearInterval(playInterval);
        }
    });

    updateMapFilter(100);
}

// ─── Ticker ─────────────────────────────────────────────────

function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;

    const headlines = [
        ...threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').slice(0, 3)
            .map((a: any) => `[THREAT RADAR] ${a.title}`),
        ...newsItems.slice(0, 6).map(n => `[${n.source.toUpperCase()}] ${n.title}`),
        ...marketData.filter((m: any) => m.probability >= 60).slice(0, 3)
            .map((m: any) => `[MARKET] ${m.title} — ${m.probability}% (${m.platform})`),
        ...gdeltEvents.slice(0, 3).map(e => `[GDELT] ${e.title}`),
    ];

    if (headlines.length === 0) {
        el.textContent = 'Monitoring global conflict feeds...';
        return;
    }

    const text = headlines.join('    ◆    ');
    el.textContent = text + '    ◆    ' + text;
}

function updateStats() {
    const evtEl = document.getElementById('event-count');
    const fireEl = document.getElementById('fire-count');
    const srcEl = document.getElementById('source-count');
    if (evtEl) evtEl.textContent = String(gdeltEvents.length);
    if (fireEl) fireEl.textContent = String(firePoints.length);
    if (srcEl) srcEl.textContent = String(new Set(newsItems.map(n => n.source)).size);
}

// ─── TV Channel Switching ───────────────────────────────────

// Known YouTube handles → live embed URLs (most reliable approach)
const LIVE_STREAM_URLS: Record<string, string> = {
    aljazeeraenglish: 'https://www.youtube.com/embed/gCNeDWCI0vo?autoplay=1&mute=1',
    france24english: 'https://www.youtube.com/embed/h3MuIUNCCzI?autoplay=1&mute=1',
    skynews: 'https://www.youtube.com/embed/9Auq9mYxFEE?autoplay=1&mute=1',
    dwnews: 'https://www.youtube.com/embed/GE_SfNVNyqk?autoplay=1&mute=1',
    cnn: 'https://www.youtube.com/embed/ekAem7MBuGk?autoplay=1&mute=1',
};

function loadTVChannel(channelKey: string) {
    const player = document.getElementById('tv-player');
    if (!player) return;

    const embedUrl = LIVE_STREAM_URLS[channelKey];
    if (embedUrl) {
        player.innerHTML = `<iframe id="tv-iframe" src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
    } else {
        player.innerHTML = `<div class="loading-state" style="height:100%"><span>No live stream available</span></div>`;
    }
}

function initTVChannels() {
    const container = document.getElementById('tv-channels');
    if (!container) return;

    // Load the default channel (Al Jazeera)
    loadTVChannel('aljazeeraenglish');

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
    if (localStorage.getItem('starwar-aurebesh') === 'on') {
        document.body.classList.add('aurebesh');
    }

    btn.addEventListener('click', () => {
        document.body.classList.toggle('aurebesh');
        const isOn = document.body.classList.contains('aurebesh');
        localStorage.setItem('starwar-aurebesh', isOn ? 'on' : 'off');
    });
}

// ─── Utilities ──────────────────────────────────────────────

function escHtml(str: string): string {
    return str
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
    if (sessionStorage.getItem('starwar-booted')) {
        bootEl.style.display = 'none';
        return;
    }

    sessionStorage.setItem('starwar-booted', 'true');

    // Remove overlay after 4.5 seconds (matches CSS animation)
    setTimeout(() => {
        bootEl.classList.add('done');
        setTimeout(() => {
            bootEl.style.display = 'none';
        }, 1000);
    }, 4500);
}

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    initBootSequence();
    startClock();
    initMap();
    initTVChannels();
    initFilters();
    initChat();
    initTelegram();
    initThreatBanner();
    initAurebeshToggle();
    initSearchModal();

    // Start data fetching immediately
    fetchAllData();
    setInterval(fetchAllData, 120_000);

    // Click on feed items opens link
    document.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.feed-item, .radar-market') as HTMLElement | null;
        if (item && item.dataset.link && !(e.target as HTMLElement).closest('a')) {
            window.open(item.dataset.link, '_blank');
        }
    });

    // Check legend filters to update map layers
    setupLegendFilters();
}

function setupLegendFilters() {
    const toggleLayer = (id: string, visible: boolean) => {
        if (!map || !map.getLayer(id)) return;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };

    const cProtest = document.getElementById('filter-protest') as HTMLInputElement | null;
    const cBase = document.getElementById('filter-base') as HTMLInputElement | null;
    const cNuclear = document.getElementById('filter-nuclear') as HTMLInputElement | null;
    const cStrike = document.getElementById('filter-strike') as HTMLInputElement | null;

    if (cProtest) cProtest.addEventListener('change', e => {
        toggleLayer('events-clusters', cProtest.checked);
        toggleLayer('events-cluster-count', cProtest.checked);
        toggleLayer('events-point', cProtest.checked);
    });

    if (cStrike) cStrike.addEventListener('change', e => {
        // Fires/Strikes
        toggleLayer('fires-heat', cStrike.checked);
    });

    if (cBase) cBase.addEventListener('change', e => {
        toggleLayer('assets-base', cBase.checked);
    });

    if (cNuclear) cNuclear.addEventListener('change', e => {
        toggleLayer('assets-nuclear', cNuclear.checked);
    });
}
