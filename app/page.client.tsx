/**
 * page.client.tsx — Dashboard Client Controller
 * 
 * Handles:
 * - Leaflet map initialization with dark tiles
 * - RSS news feed polling & rendering
 * - GDELT event feed
 * - NASA FIRMS fire overlay
 * - Live TV channel switching
 * - Clock update
 * - Breaking news ticker
 */

declare const L: any; // Leaflet global

// ─── State ──────────────────────────────────────────────────

let map: any;
let newsItems: any[] = [];
let gdeltEvents: any[] = [];
let firePoints: any[] = [];
let currentFilter = 'all';
let tickerItems: string[] = [];

// ─── Leaflet Map Setup ──────────────────────────────────────

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || map) return;

    // Load Leaflet from CDN
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
        map = L.map('map', {
            center: [30, 45], // Middle East center
            zoom: 4,
            zoomControl: true,
            attributionControl: false,
        });

        // CartoDB dark tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
        }).addTo(map);

        // Start data fetching
        fetchAllData();
        setInterval(fetchAllData, 120_000); // Refresh every 2 min
    };
    document.head.appendChild(script);
}

// ─── Data Fetching ──────────────────────────────────────────

async function fetchAllData() {
    await Promise.all([
        fetchNews(),
        fetchGdelt(),
        fetchFires(),
    ]);
    updateTicker();
    updateStats();
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
        plotGdeltOnMap();
        document.getElementById('gdelt-count')!.textContent = String(gdeltEvents.length);
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
        plotFiresOnMap();
        document.getElementById('firms-count')!.textContent = String(firePoints.length);
    } catch (e) {
        console.error('[STARWAR] FIRMS fetch failed:', e);
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

// ─── Map Plotting ───────────────────────────────────────────

let gdeltMarkers: any[] = [];
let fireMarkers: any[] = [];

function plotGdeltOnMap() {
    if (!map) return;

    // Clear old markers
    gdeltMarkers.forEach(m => map.removeLayer(m));
    gdeltMarkers = [];

    // Plot events that have real coordinates from location extraction
    const geoEvents = gdeltEvents.filter(ev => ev.lat && ev.lon);

    // Deduplicate by rounding to ~10km grid
    const seen = new Set<string>();

    geoEvents.forEach(ev => {
        const gridKey = `${(ev.lat! * 10 | 0)}_${(ev.lon! * 10 | 0)}`;
        if (seen.has(gridKey)) return;
        seen.add(gridKey);

        const icon = L.divIcon({
            className: 'conflict-marker',
            iconSize: [12, 12],
        });

        const marker = L.marker([ev.lat!, ev.lon!], { icon })
            .addTo(map)
            .bindPopup(`
                <div style="min-width:200px">
                    <div style="font-weight:700; color:#22c55e; margin-bottom:4px;font-size:12px;">📡 ${escHtml(ev.country || 'Unknown')}</div>
                    <div style="color:#e2e8f0; font-size:11px; margin-bottom:6px;">${escHtml(ev.title)}</div>
                    <div style="color:#94a3b8; font-size:10px;">${ev.source} · ${ev.date ? formatTime(ev.date) : 'recent'}</div>
                </div>
            `);

        gdeltMarkers.push(marker);
    });
}

function plotFiresOnMap() {
    if (!map) return;

    // Clear old markers
    fireMarkers.forEach(m => map.removeLayer(m));
    fireMarkers = [];

    firePoints.forEach(fire => {
        const icon = L.divIcon({
            className: 'fire-marker',
            iconSize: [8, 8],
        });

        const marker = L.marker([fire.lat, fire.lon], { icon })
            .addTo(map)
            .bindPopup(`
                <div style="min-width:160px">
                    <div style="font-weight:700; color:#f97316; margin-bottom:4px;font-size:12px;">🔥 Thermal Anomaly</div>
                    <div style="color:#94a3b8; font-size:10px;">${fire.country || 'Unknown'}</div>
                    <div style="color:#94a3b8; font-size:10px;">Brightness: ${fire.brightness.toFixed(0)}K</div>
                    <div style="color:#94a3b8; font-size:10px;">${fire.acq_date} ${fire.acq_time} UTC</div>
                    <div style="color:#94a3b8; font-size:10px;">Satellite: ${fire.satellite}</div>
                </div>
            `);

        fireMarkers.push(marker);
    });
}

// ─── Ticker ─────────────────────────────────────────────────

function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;

    const headlines = [
        ...newsItems.slice(0, 8).map(n => `[${n.source.toUpperCase()}] ${n.title}`),
        ...gdeltEvents.slice(0, 4).map(e => `[GDELT] ${e.title}`),
    ];

    if (headlines.length === 0) {
        el.textContent = 'Monitoring global conflict feeds...';
        return;
    }

    // Duplicate for seamless scroll
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

function initTVChannels() {
    const container = document.getElementById('tv-channels');
    const iframe = document.getElementById('tv-iframe') as HTMLIFrameElement | null;
    if (!container || !iframe) return;

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.channel-btn') as HTMLElement | null;
        if (!btn) return;

        const channelId = btn.dataset.channel;
        if (!channelId) return;

        // Update active state
        container.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Switch stream using channel live URL
        iframe.src = `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&mute=1`;
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

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    startClock();
    initMap();
    initTVChannels();
    initFilters();

    // Click on feed items opens link
    document.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.feed-item') as HTMLElement | null;
        if (item && item.dataset.link && !(e.target as HTMLElement).closest('a')) {
            window.open(item.dataset.link, '_blank');
        }
    });
}
