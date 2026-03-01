import { Head } from 'melina/web';

export default function Page() {
    const now = new Date().toUTCString();

    return (
        <>
            <Head>
                <title>STARWAR — Global Conflict Monitor</title>
                <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@^5.0.0/dist/maplibre-gl.css" />
            </Head>

            {/* ─── Cinematic Boot Sequence ───────────────── */}
            <div id="boot-sequence" class="boot-sequence">
                <div class="boot-content">
                    <div class="boot-logo">◆ STARWAR</div>
                    <div id="boot-text" class="boot-text">INITIALIZING PROTOCOL...</div>
                    <div class="boot-progress">
                        <div id="boot-bar" class="boot-bar"></div>
                    </div>
                </div>
            </div>

            {/* ─── Country Search Modal (Ctrl+K) ─────────── */}
            <div id="search-modal" class="modal-overlay" style="display:none">
                <div class="search-box">
                    <input type="text" id="search-input" class="search-input" placeholder="Jump to country/city... (Press Esc to close)" autocomplete="off" />
                    <div id="search-results" class="search-results"></div>
                </div>
            </div>

            {/* ─── Top Bar ─────────────────────────────── */}
            <header id="top-bar">
                <div class="top-bar-left">
                    <span class="logo">◆ STARWAR</span>
                    <span class="separator">│</span>
                    <span class="tagline">GLOBAL CONFLICT MONITOR</span>
                    <span class="separator">│</span>
                    <div class="token-links">
                        <a href="https://twitter.com/starwar_xyz" target="_blank" rel="noopener" class="social-link" title="Twitter/X">
                            <span class="social-icon">𝕏</span>
                        </a>
                        <a href="https://pump.fun" target="_blank" rel="noopener" class="social-link pump" title="PumpFun">
                            <span class="social-icon">🟢</span>
                        </a>
                        <a href="https://dexscreener.com" target="_blank" rel="noopener" class="social-link dex" title="DexScreener">
                            <span class="social-icon">📊</span>
                        </a>
                        <span class="token-badge" id="token-mcap" title="$STARWAR Market Cap">$STARWAR: <span id="mcap-value">—</span></span>
                    </div>
                </div>
                <div class="top-bar-right">
                    <button id="aurebesh-toggle" class="aurebesh-toggle" title="Toggle Aurebesh / Human mode">AB</button>
                    <span class="separator">│</span>
                    <span class="status-indicator">
                        <span class="pulse-dot"></span>
                        LIVE
                    </span>
                    <span class="separator">│</span>
                    <span id="clock" class="clock">{now}</span>
                </div>
            </header>

            {/* ─── Full-Screen Map ─────────────────────── */}
            <div id="map-wrapper">
                <div id="map" class="map-view"></div>

                {/* Map Stats Overlay (top-right) */}
                <div id="map-overlay" class="map-overlay">
                    <div class="map-stats" id="map-stats">
                        <span>Events: <strong id="event-count">—</strong></span>
                        <span class="separator">│</span>
                        <span>Fires: <strong id="fire-count">—</strong></span>
                        <span class="separator">│</span>
                        <span>✈: <strong id="flight-count">—</strong></span>
                        <span class="separator">│</span>
                        <span>📷: <strong id="webcam-count">—</strong></span>
                    </div>
                    <div id="data-freshness" class="data-freshness"></div>
                </div>

                {/* Threat Alert Banner */}
                <div id="threat-banner" class="threat-banner" style="display:none">
                    <div class="threat-banner-icon">🚨</div>
                    <div class="threat-banner-content" id="threat-banner-content"></div>
                    <button class="threat-banner-close" id="threat-banner-close">×</button>
                </div>

                {/* Bottom Ticker */}
                <div id="ticker" class="ticker">
                    <div class="ticker-label">▶ BREAKING</div>
                    <div class="ticker-content" id="ticker-content">
                        Initializing global monitoring systems...
                    </div>
                </div>

                {/* ─── Right-side Tab Bar ───────────────── */}
                <div class="panel-tabs panel-tabs--right">
                    <button class="panel-tab active" data-panel="pulse-panel" title="News Feed">📡</button>
                    <button class="panel-tab" data-panel="intel-panel" title="Intel & Threats">🎯</button>
                    <button class="panel-tab" data-panel="signal-panel" title="Telegram">💬</button>
                    <button class="panel-tab" data-panel="live-panel" title="Live TV">📺</button>
                    <button class="panel-tab" data-panel="data-panel" title="Data & Stats">📊</button>
                    <button class="panel-tab" data-panel="layers-panel" title="Map Layers">🗺️</button>
                </div>

                {/* ─── Tab: PULSE FEED ─────────────────────── */}
                <aside id="pulse-panel" class="overlay-panel overlay-panel--right open">
                    <div class="panel-drag-header">
                        <span class="icon">📡</span> PULSE FEED
                        <button class="panel-close-btn" data-panel="pulse-panel">×</button>
                    </div>
                    <div class="pulse-filters" id="feed-filters">
                        <button class="pf-pill hot active" data-source="all">🔥 HIGH</button>
                        <button class="pf-pill med" data-source="reuters">⚡ MED</button>
                        <button class="pf-pill std" data-source="bbc">24H</button>
                        <button class="pf-pill esc" data-source="aljazeera">↗ ESC</button>
                    </div>
                    <div class="pulse-search">
                        <input type="text" id="pulse-search-input" placeholder="Search..." />
                    </div>
                    <div id="news-feed" class="pulse-list">
                        <div class="loading-state">
                            <span class="spinner"></span>
                            <span>Establishing secure feed...</span>
                        </div>
                    </div>
                </aside>

                {/* ─── Tab: INTEL ───────────────────────────── */}
                <aside id="intel-panel" class="overlay-panel overlay-panel--right">
                    <div class="panel-drag-header">
                        <span>🎯</span> INTEL
                        <button class="panel-close-btn" data-panel="intel-panel">×</button>
                    </div>

                    {/* Threat Radar */}
                    <div class="panel-section panel-section--radar">
                        <div class="panel-header">
                            <h2>THREAT RADAR</h2>
                            <span class="badge badge--hot" id="radar-alert-count">0</span>
                        </div>
                        <div id="radar-feed" class="feed-list feed-list--short">
                            <div class="loading-state">
                                <span class="spinner"></span>
                                <span>Scanning prediction markets...</span>
                            </div>
                        </div>
                    </div>

                    {/* Panic Economy */}
                    <div class="panel-section panel-section--crypto">
                        <div class="panel-header" style="justify-content: space-between;">
                            <div>
                                <h2>Panic Economy (USDT/IRT)</h2>
                                <div style="font-size:9px; color:var(--text-dim); margin-top:2px;">LOCAL "WAR PREMIUM"</div>
                            </div>
                            <span class="badge" id="crypto-premium-badge">0%</span>
                        </div>
                        <div class="crypto-chart-container" style="padding: 8px; height: 90px; position:relative;">
                            <canvas id="crypto-chart"></canvas>
                        </div>
                    </div>
                </aside>

                {/* ─── Tab: SIGNAL (Telegram) ──────────────── */}
                <aside id="signal-panel" class="overlay-panel overlay-panel--right">
                    <div class="panel-drag-header">
                        <span>💬</span> SIGNAL
                        <button class="panel-close-btn" data-panel="signal-panel">×</button>
                    </div>
                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>📡 TELEGRAM OSINT</h2>
                            <span class="badge" id="tg-count">0</span>
                        </div>
                        <div id="tg-status" class="tg-status">Connecting...</div>
                        <div id="tg-feed" class="feed-list">
                            <div class="loading-state"><span class="spinner"></span><span>Connecting channels...</span></div>
                        </div>
                    </div>
                </aside>

                {/* ─── Tab: LIVE TV ─────────────────────────── */}
                <aside id="live-panel" class="overlay-panel overlay-panel--right">
                    <div class="panel-drag-header">
                        <span>📺</span> LIVE TV
                        <button class="panel-close-btn" data-panel="live-panel">×</button>
                    </div>
                    <div id="tv-channels" class="tv-channels">
                        <button class="channel-btn active" data-channel="aljazeeraenglish">AL JAZEERA</button>
                        <button class="channel-btn" data-channel="france24english">FRANCE24</button>
                        <button class="channel-btn" data-channel="skynews">SKY NEWS</button>
                        <button class="channel-btn" data-channel="dwnews">DW</button>
                        <button class="channel-btn" data-channel="cnn">CNN</button>
                        <button class="channel-btn" data-channel="wion">WION</button>
                        <button class="channel-btn" data-channel="trt">TRT WORLD</button>
                        <button class="channel-btn" data-channel="ndtv">NDTV</button>
                    </div>
                    <div id="tv-player" class="tv-player">
                        <div id="tv-loading" class="loading-state" style="height:100%">
                            <span class="spinner"></span>
                            <span>Discovering live streams...</span>
                        </div>
                    </div>
                </aside>

                {/* ─── Tab: DATA FEEDS ──────────────────────── */}
                <aside id="data-panel" class="overlay-panel overlay-panel--right">
                    <div class="panel-drag-header">
                        <span>📊</span> DATA FEEDS
                        <button class="panel-close-btn" data-panel="data-panel">×</button>
                    </div>

                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>GDELT EVENTS</h2>
                            <span class="badge" id="gdelt-count">0</span>
                        </div>
                        <div id="gdelt-feed" class="feed-list feed-list--short">
                            <div class="loading-state"><span class="spinner"></span><span>Querying GDELT...</span></div>
                        </div>
                    </div>

                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>🔥 SATELLITE FIRES</h2>
                            <span class="badge" id="firms-count">0</span>
                        </div>
                        <div id="firms-feed" class="feed-list feed-list--short">
                            <div class="loading-state"><span class="spinner"></span><span>Scanning NASA FIRMS...</span></div>
                        </div>
                    </div>

                    <div class="panel-section panel-section--chat">
                        <div class="panel-header">
                            <h2>GLOBAL CHAT</h2>
                            <span class="badge" id="chat-online">0</span>
                        </div>
                        <div id="chat-messages" class="chat-messages"></div>
                        <div class="chat-input-row">
                            <input type="text" id="chat-input" class="chat-input" placeholder="Type message..." maxLength={500} autoComplete="off" />
                            <button id="chat-send" class="chat-send-btn">SEND</button>
                        </div>
                    </div>
                </aside>

                {/* ─── Tab: LAYERS ──────────────────────────── */}
                <aside id="layers-panel" class="overlay-panel overlay-panel--right">
                    <div class="panel-drag-header">
                        <span>🗺️</span> MAP LAYERS
                        <button class="panel-close-btn" data-panel="layers-panel">×</button>
                    </div>
                    <div class="panel-section" style="padding: 12px;">
                        <label class="legend-filter"><input type="checkbox" id="filter-protest" checked /><span class="legend-dot bg-orange"></span> Events</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-base" checked /><span class="legend-dot bg-blue"></span> Bases</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-nuclear" checked /><span class="legend-dot bg-cyan"></span> Nuclear</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-strike" checked /><span class="legend-dot bg-red"></span> Strikes</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-seismic" checked /><span class="legend-dot" style="background:#fbbf24; border-radius:0;"></span> Seismic</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-flights" checked /><span class="legend-dot bg-blue" style="border-radius:0;"></span> Flights</label>
                        <label class="legend-filter"><input type="checkbox" id="filter-webcams" checked /><span class="legend-dot" style="background:#fff; border:2px solid #6366f1;"></span> Webcams</label>
                    </div>
                </aside>

            </div>
        </>
    );
}
