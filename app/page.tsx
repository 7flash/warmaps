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

            {/* ─── Main Dashboard Grid ─────────────────── */}
            <div id="dashboard">

                {/* Left Panel: News Feed (Redesigned Pulse Feed) */}
                <aside id="news-panel">
                    <div class="pulse-smart-digest">
                        <span class="pulse-icon">📄</span> SMART DIGEST <span class="pulse-lock">🔒</span>
                    </div>
                    <div class="panel-header pulse-header">
                        <div class="pulse-title">
                            <span class="icon">📡</span> PULSE FEED
                        </div>
                        <div class="pulse-header-actions">
                            <button class="pulse-mute-btn" title="Mute Alerts">🔕</button>
                            <div class="pulse-meta">
                                <span class="pulse-sync">🔄</span> <span id="pulse-time">{now.split(' ').pop()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="pulse-filters" id="feed-filters">
                        <button class="pf-pill hot active" data-source="all">🔥 HIGH</button>
                        <button class="pf-pill med" data-source="reuters">⚡ MEDIUM</button>
                        <button class="pf-pill std" data-source="bbc">24H</button>
                        <button class="pf-pill esc" data-source="aljazeera">↗ ESCALATION</button>
                        <button class="pf-pill des" data-source="irna">↘ DE-ESCALATION</button>
                    </div>

                    <div class="pulse-search">
                        <span class="pulse-search-icon">🔍</span>
                        <input type="text" id="pulse-search-input" placeholder="Search..." />
                        <button class="pulse-filter-icon">⚗️</button>
                    </div>

                    <div id="news-feed" class="pulse-list">
                        <div class="loading-state">
                            <span class="spinner"></span>
                            <span>Establishing secure feed...</span>
                        </div>
                    </div>
                </aside>

                {/* Center: Map */}
                <main id="map-container">
                    <div id="map" class="map-view"></div>

                    {/* Tactical Map UI Overlays */}
                    <div id="map-ui-layer" class="map-ui-layer">

                        {/* Legend & Filters Container */}
                        <div class="tactical-legend panel-section">
                            <div class="panel-header" style="border:none; margin:0">
                                <h2>Legend & Filters</h2>
                            </div>
                            <div class="legend-items">
                                <label class="legend-filter"><input type="checkbox" id="filter-protest" checked /><span class="legend-dot bg-orange"></span> Protests / Unrest</label>
                                <label class="legend-filter"><input type="checkbox" id="filter-base" checked /><span class="legend-dot bg-blue"></span> IRGC / Military Bases</label>
                                <label class="legend-filter"><input type="checkbox" id="filter-nuclear" checked /><span class="legend-dot bg-cyan"></span> Nuclear Facilities</label>
                                <label class="legend-filter"><input type="checkbox" id="filter-strike" checked /><span class="legend-dot bg-red"></span> Kinetic Strikes</label>
                            </div>
                            <div class="confidence-toggles mt-2" style="border-top: 1px solid var(--border); padding-top: 8px;">
                                <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">CONFIDENCE LEVEL</div>
                                <div style="display:flex; gap:8px;">
                                    <label class="legend-filter"><input type="checkbox" id="conf-high" checked /> High</label>
                                    <label class="legend-filter"><input type="checkbox" id="conf-mod" checked /> Mod</label>
                                    <label class="legend-filter"><input type="checkbox" id="conf-low" /> Low</label>
                                </div>
                            </div>
                        </div>

                        {/* Temporal Control / Timeline Slider */}
                        <div class="tactical-timeline panel-section">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                <h2>Temporal Dynamics</h2>
                                <span class="badge" id="timeline-date">—</span>
                            </div>
                            <div class="slider-row" style="display:flex; align-items:center; gap: 12px;">
                                <button id="timeline-play" class="play-btn">▶</button>
                                <input type="range" id="timeline-slider" class="timeline-slider" min="0" max="100" value="100" />
                            </div>
                        </div>

                    </div>

                    <div id="map-overlay" class="map-overlay" style="bottom: auto; top: 12px; right: 12px; pointer-events: none;">
                        <div class="map-stats" id="map-stats" style="background: rgba(5, 9, 19, 0.85); backdrop-filter: blur(8px);">
                            <span>Events: <strong id="event-count">—</strong></span>
                            <span class="separator">│</span>
                            <span>Fires: <strong id="fire-count">—</strong></span>
                            <span class="separator">│</span>
                            <span>✈: <strong id="flight-count">—</strong></span>
                        </div>
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
                </main>

                {/* Right Panel: Markets + Live TV + Data Feeds */}
                <aside id="intel-panel">

                    {/* Threat Radar / Prediction Markets */}
                    <div class="panel-section panel-section--radar">
                        <div class="panel-header">
                            <h2>🎯 THREAT RADAR</h2>
                            <span class="badge badge--hot" id="radar-alert-count">0</span>
                        </div>
                        <div id="radar-feed" class="feed-list feed-list--radar">
                            <div class="loading-state">
                                <span class="spinner"></span>
                                <span>Scanning prediction markets...</span>
                            </div>
                        </div>
                    </div>

                    {/* Live TV */}
                    <div class="panel-section panel-section--tv">
                        <div class="panel-header">
                            <h2>LIVE NEWS TV</h2>
                        </div>
                        <div id="tv-channels" class="tv-channels">
                            <button class="channel-btn active" data-channel="aljazeeraenglish" data-search="Al Jazeera English Live">AL JAZEERA</button>
                            <button class="channel-btn" data-channel="france24english" data-search="France 24 English Live">FRANCE24</button>
                            <button class="channel-btn" data-channel="skynews" data-search="Sky News Live">SKY NEWS</button>
                            <button class="channel-btn" data-channel="dwnews" data-search="DW News Live">DW</button>
                            <button class="channel-btn" data-channel="cnn" data-search="CNN News Live">CNN</button>
                        </div>
                        <div id="tv-player" class="tv-player">
                            <div id="tv-loading" class="loading-state" style="height:100%">
                                <span class="spinner"></span>
                                <span>Searching for live stream...</span>
                            </div>
                        </div>
                    </div>

                    {/* GDELT Events */}
                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>GDELT EVENTS</h2>
                            <span class="badge" id="gdelt-count">0</span>
                        </div>
                        <div id="gdelt-feed" class="feed-list feed-list--short">
                            <div class="loading-state">
                                <span class="spinner"></span>
                                <span>Querying GDELT...</span>
                            </div>
                        </div>
                    </div>

                    {/* Telegram OSINT */}
                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>📡 TELEGRAM OSINT</h2>
                            <span class="badge" id="tg-count">0</span>
                        </div>
                        <div id="tg-status" class="tg-status">Connecting...</div>
                        <div id="tg-feed" class="feed-list feed-list--short">
                            <div class="loading-state">
                                <span class="spinner"></span>
                                <span>Initializing OSINT channels...</span>
                            </div>
                        </div>
                    </div>

                    {/* Satellite Fires */}
                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>🔥 SATELLITE FIRES</h2>
                            <span class="badge" id="firms-count">0</span>
                        </div>
                        <div id="firms-feed" class="feed-list feed-list--short">
                            <div class="loading-state">
                                <span class="spinner"></span>
                                <span>Scanning NASA FIRMS...</span>
                            </div>
                        </div>
                    </div>

                    {/* Global Chat */}
                    <div class="panel-section panel-section--chat">
                        <div class="panel-header">
                            <h2>GLOBAL CHAT</h2>
                            <span class="badge" id="chat-online">0</span>
                        </div>
                        <div id="chat-messages" class="chat-messages"></div>
                        <div class="chat-input-row">
                            <input
                                type="text"
                                id="chat-input"
                                class="chat-input"
                                placeholder="Type message..."
                                maxLength={500}
                                autoComplete="off"
                            />
                            <button id="chat-send" class="chat-send-btn">SEND</button>
                        </div>
                    </div>
                </aside>
            </div>
        </>
    );
}
