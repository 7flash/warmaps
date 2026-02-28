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

// ─── State ──────────────────────────────────────────────────

let globe: any;
let newsItems: any[] = [];
let gdeltEvents: any[] = [];
let firePoints: any[] = [];
let flightData: any[] = [];
let flightStats: any = {};
let marketData: any[] = [];
let threatAlerts: any[] = [];
let currentFilter = 'all';

// ─── 3D Globe Setup ─────────────────────────────────────────

function initGlobe() {
    const mapEl = document.getElementById('map');
    if (!mapEl || globe) return;

    // Load Globe.gl from CDN (unpkg serves the UMD build with globals)
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/globe.gl';
    script.onerror = () => {
        console.error('[STARWAR] Failed to load Globe.gl from CDN');
        mapEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#475569;font-size:12px;font-family:monospace;">⚠ Globe visualization unavailable — CDN blocked</div>`;
    };
    script.onload = () => {
        const Globe = (window as any).Globe;
        if (!Globe) {
            console.error('[STARWAR] Globe constructor not found after script load');
            return;
        }

        globe = Globe({ animateIn: true })
            (mapEl)
            .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
            .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
            .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
            .showAtmosphere(true)
            .atmosphereColor('#22d3ee')
            .atmosphereAltitude(0.2)
            // Point of view: centered on Middle East
            .pointOfView({ lat: 30, lng: 45, altitude: 2.2 }, 1000)

            // Fire points (orange pulsing dots)
            .pointsData([])
            .pointColor(() => '#ff6b35')
            .pointAltitude(0.01)
            .pointRadius((d: any) => d.size || 0.15)
            .pointsMerge(true)

            // GDELT events (green rings)
            .ringsData([])
            .ringColor(() => '#22c55e')
            .ringMaxRadius(3)
            .ringPropagationSpeed(1.5)
            .ringRepeatPeriod(2000)

            // Arcs between related events
            .arcsData([])
            .arcColor(() => ['#22d3ee44', '#ef444444'])
            .arcStroke(0.4)
            .arcDashLength(0.4)
            .arcDashGap(0.2)
            .arcDashAnimateTime(2000)

            // HTML labels for key events
            .htmlElementsData([])
            .htmlElement((d: any) => {
                const el = document.createElement('div');
                el.className = 'globe-label';
                el.innerHTML = `<span class="globe-label-dot ${d.type}"></span>${d.label}`;
                return el;
            })
            .htmlAltitude(0.02);

        // Adjust globe size on window resize
        const handleResize = () => {
            if (globe && mapEl) {
                globe.width(mapEl.clientWidth);
                globe.height(mapEl.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        // Auto-rotate slowly
        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.3;

        // Stop auto-rotate on user interaction
        globe.controls().addEventListener('start', () => {
            globe.controls().autoRotate = false;
        });

        // Globe is ready — plot any data we already have
        plotGdeltOnGlobe();
        plotFiresOnGlobe();
        plotMarketsOnGlobe();
    };
    document.head.appendChild(script);
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
        plotGdeltOnGlobe();
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
        plotFiresOnGlobe();
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
        plotMarketsOnGlobe();

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
        plotFiresOnGlobe(); // Re-plot combined fires + flights

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

// ─── Globe Plotting ─────────────────────────────────────────

function plotGdeltOnGlobe() {
    if (!globe) return;

    const geoEvents = gdeltEvents.filter(ev => ev.lat && ev.lon);
    const seen = new Set<string>();

    // Rings for GDELT events
    const rings = geoEvents.filter(ev => {
        const key = `${(ev.lat! * 10 | 0)}_${(ev.lon! * 10 | 0)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(ev => ({
        lat: ev.lat,
        lng: ev.lon,
    }));

    globe.ringsData(rings);

    // HTML labels — combine GDELT + market labels
    updateGlobeLabels();
}

function plotFiresOnGlobe() {
    if (!globe) return;

    // Combine fires (orange) + flights (cyan) into one point layer
    const firePointsForGlobe = firePoints.map(fire => ({
        lat: fire.lat,
        lng: fire.lon,
        size: Math.min(fire.brightness / 2000, 0.4),
        color: '#ff6b35',
        type: 'fire',
    }));

    const flightPointsForGlobe = flightData.map((f: any) => ({
        lat: f.lat,
        lng: f.lon,
        size: f.type === 'military' ? 0.25 : f.type === 'sigint' ? 0.3 : 0.1,
        color: f.type === 'military' ? '#ef4444' : f.type === 'sigint' ? '#a855f7' : '#22d3ee',
        type: 'flight',
    }));

    globe
        .pointsData([...firePointsForGlobe, ...flightPointsForGlobe])
        .pointColor((d: any) => d.color)
        .pointRadius((d: any) => d.size || 0.15)
        .pointAltitude((d: any) => d.type === 'flight' ? 0.04 : 0.01);
}

function plotMarketsOnGlobe() {
    if (!globe) return;

    // Add market arcs connecting related bets
    const geoMarkets = marketData.filter((m: any) => m.lat && m.lon);
    if (geoMarkets.length >= 2) {
        const arcs = [];
        for (let i = 0; i < geoMarkets.length - 1 && i < 5; i++) {
            arcs.push({
                startLat: geoMarkets[i].lat,
                startLng: geoMarkets[i].lon,
                endLat: geoMarkets[i + 1].lat,
                endLng: geoMarkets[i + 1].lon,
            });
        }
        globe.arcsData(arcs);
    }

    // Update labels to include market data
    updateGlobeLabels();
}

function updateGlobeLabels() {
    if (!globe) return;

    const labels: any[] = [];

    // GDELT labels
    const geoEvents = gdeltEvents.filter(ev => ev.lat && ev.lon);
    for (const ev of geoEvents.slice(0, 5)) {
        labels.push({
            lat: ev.lat,
            lng: ev.lon,
            label: ev.country || 'Unknown',
            type: 'gdelt',
        });
    }

    // Market labels (with probability)
    const geoMarkets = marketData.filter((m: any) => m.lat && m.lon);
    const seenRegions = new Set<string>();
    for (const market of geoMarkets.slice(0, 6)) {
        if (market.region && seenRegions.has(market.region)) continue;
        if (market.region) seenRegions.add(market.region);
        labels.push({
            lat: market.lat + 0.5,
            lng: market.lon + 0.5,
            label: `${market.region || 'Market'} ${market.probability}%`,
            type: market.probability >= 60 ? 'market-hot' : 'market',
        });
    }

    globe.htmlElementsData(labels);
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

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    startClock();
    initGlobe();
    initTVChannels();
    initFilters();
    initChat();
    initTelegram();
    initThreatBanner();
    initAurebeshToggle();

    // Start data fetching immediately (don't wait for globe)
    fetchAllData();
    setInterval(fetchAllData, 120_000);

    // Click on feed items opens link
    document.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.feed-item, .radar-market') as HTMLElement | null;
        if (item && item.dataset.link && !(e.target as HTMLElement).closest('a')) {
            window.open(item.dataset.link, '_blank');
        }
    });
}
