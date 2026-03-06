import { Head } from 'melina/web';

export default function Page() {
    let GIT_HASH = '';
    try {
        const proc = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: import.meta.dir });
        GIT_HASH = proc.stdout.toString().trim();
    } catch { }
    const now = new Date().toUTCString();
    const ca = process.env.WARMAPS_CA || 'CQm5FE2dSAdxCCt159EY7eGVfu425nBTCfxjZYjXpump';
    const caShort = ca ? `${ca.slice(0, 4)}...${ca.slice(-4)}` : '—';

    return (
        <>
            <Head>
                <title>WARMAPS — Global Conflict Monitor</title>
                <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@^5.0.0/dist/maplibre-gl.css" />
            </Head>

            {/* ─── Cinematic Boot Sequence ───────────────── */}
            <div id="boot-sequence" class="boot-sequence">
                <div class="boot-content">
                    <div class="boot-logo">◆ WARMAPS</div>
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
                    <span class="logo">◆ WARMAPS</span>
                    <span class="separator">│</span>
                    <span class="tagline">CANVAS MODE</span>
                    <span class="separator">│</span>
                    <div class="token-links">
                        <a href="https://x.com/i/communities/2028108812830306433" target="_blank" rel="noopener" class="social-link" title="X Community">
                            <span class="social-icon">𝕏</span>
                        </a>
                        <a href={`https://pump.fun/coin/${ca}`} target="_blank" rel="noopener" class="social-link pump" title="PumpFun">
                            <span class="social-icon">🟢</span>
                        </a>
                        <a href={`https://dexscreener.com/solana/${ca}`} target="_blank" rel="noopener" class="social-link dex" title="DexScreener">
                            <span class="social-icon">📊</span>
                        </a>
                        <span class="token-badge" id="token-ca" title={ca || 'No CA set'}
                            data-ca={ca}
                            style="cursor:pointer">
                            $WARMAPS: <span id="ca-value">{caShort}</span>
                        </span>
                    </div>
                </div>
                <div class="top-bar-right">
                    <select id="wm-preset-select" class="top-select" title="Layout Presets">
                        <option value="" disabled selected>Presets...</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="trading">Trading Desk</option>
                        <option value="analysis">Data Analysis</option>
                        <option disabled>──────</option>
                        <option value="save_current">+ Save Current</option>
                    </select>
                    <button id="wm-add-widget" class="top-btn top-btn--add" title="Add widget">＋</button>
                    <button id="wm-share" class="top-btn" title="Share this layout">🔗</button>
                    <button id="wm-reset-layout" class="top-btn" title="Reset to default layout">↺</button>
                    <button id="wm-fit-all" class="top-btn" title="Fit all containers">⊞</button>
                    <span class="separator">│</span>
                    <div id="user-auth" class="user-auth">
                        <a href="/api/auth/github" id="login-btn" class="login-btn" title="Sign in with GitHub">
                            <span class="login-icon">👤</span>
                            <span class="login-text">LOGIN</span>
                        </a>
                    </div>
                    <span class="separator">│</span>
                    <button id="wallet-btn" class="wallet-btn" title="Connect Solana Wallet">
                        <span id="wallet-label">🔗 CONNECT</span>
                    </button>
                    <span class="separator">│</span>
                    <button id="aurebesh-toggle" class="aurebesh-toggle" title="Toggle Aurebesh / Human mode">AB</button>
                    <span class="separator">│</span>
                    <span class="status-indicator">
                        <span class="pulse-dot"></span>
                        LIVE
                    </span>
                    <span class="separator">│</span>
                    <span id="clock" class="clock">{now}</span>
                    {GIT_HASH && <>
                        <span class="separator">│</span>
                        <span class="version-badge" title={`Build ${GIT_HASH}`}>v.{GIT_HASH}</span>
                    </>}
                </div>
            </header>

            {/* ─── Widget Catalog Panel ────────────────── */}
            <div id="widget-catalog" class="widget-catalog" style="display:none">
                <div class="wc-header">
                    <span class="wc-title">📦 Add Widget</span>
                    <button id="wc-close" class="wc-close">×</button>
                </div>
                <div class="wc-categories">
                    <button class="wc-cat-btn active" data-cat="all">All</button>
                    <button class="wc-cat-btn" data-cat="map">🗺 Maps</button>
                    <button class="wc-cat-btn" data-cat="feed">📡 Feeds</button>
                    <button class="wc-cat-btn" data-cat="data">📊 Data</button>
                    <button class="wc-cat-btn" data-cat="social">💬 Social</button>
                    <button class="wc-cat-btn" data-cat="media">📺 Media</button>
                    <button class="wc-cat-btn" data-cat="ai">🤖 AI</button>
                </div>
                <div id="wc-grid" class="wc-grid">
                    {/* Populated by client-side JS from widget registry */}
                </div>
            </div>

            {/* ─── Share Toast ─────────────────────────── */}
            <div id="share-toast" class="share-toast" style="display:none">
                <div class="share-toast-content">
                    <span class="share-toast-icon">🔗</span>
                    <span class="share-toast-text">Link copied to clipboard!</span>
                </div>
            </div>

            {/* ─── Canvas Viewport ─────────────────────── */}
            <div id="wm-viewport" class="wm-viewport">
                <div id="wm-content" class="wm-content">
                    <svg id="wm-links" style="position:absolute; top:0; left:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:4000;"></svg>

                    {/* ─── Container: MAP ─────────────────── */}
                    <div id="wm-c-map" class="wm-container wm-container--map" data-widget-type="map" style="left:0px;top:0px;width:700px;height:500px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">🌍</span>
                            <span class="wm-c-title">GLOBAL MAP</span>
                            <div class="wm-c-actions">
                                <div id="map-stats" class="wm-map-stats">
                                    <span>Events: <strong id="event-count">—</strong></span>
                                    <span>Fires: <strong id="fire-count">—</strong></span>
                                    <span>✈: <strong id="flight-count">—</strong></span>
                                </div>
                            </div>
                        </div>
                        <div class="wm-container-body">
                            <div id="map" class="wm-map-inner"></div>
                        </div>
                    </div>

                    {/* ─── Container: PULSE FEED ──────────── */}
                    <div id="wm-c-pulse" class="wm-container" data-widget-type="news" style="left:720px;top:0px;width:380px;height:500px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">📡</span>
                            <span class="wm-c-title">PULSE FEED</span>
                        </div>
                        <div class="wm-container-body">
                            <div class="pulse-filters" id="feed-filters">
                                <button class="pf-pill hot active" data-filter="all">🔥 ALL</button>
                                <button class="pf-pill med" data-filter="intense">⚡ INTENSE</button>
                                <button class="pf-pill std" data-filter="recent">24H</button>
                                <button class="pf-pill esc" data-filter="escalation">↗ ESC</button>
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
                        </div>
                    </div>

                    {/* ─── Container: INTEL ───────────────── */}
                    <div id="wm-c-intel" class="wm-container" data-widget-type="intel" style="left:1120px;top:0px;width:380px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">🎯</span>
                            <span class="wm-c-title">INTEL</span>
                        </div>
                        <div class="wm-container-body">
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
                        </div>
                    </div>

                    {/* ─── Container: TELEGRAM SIGNAL ─────── */}
                    <div id="wm-c-signal" class="wm-container" data-widget-type="telegram" style="left:1120px;top:360px;width:380px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">💬</span>
                            <span class="wm-c-title">SIGNAL</span>
                        </div>
                        <div class="wm-container-body">
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
                        </div>
                    </div>

                    {/* ─── Container: PF TOKENS ───────────── */}
                    <div id="wm-c-tokens" class="wm-container" data-widget-type="tokens" style="left:0px;top:520px;width:380px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">🪙</span>
                            <span class="wm-c-title">PF TOKENS</span>
                        </div>
                        <div class="wm-container-body">
                            <div class="panel-section">
                                <div class="panel-header">
                                    <h2>💰 PUMP.FUN CONFLICT TOKENS</h2>
                                    <span class="badge" id="tokens-count">0</span>
                                </div>
                                <div id="tokens-feed" class="feed-list tokens-list">
                                    <div class="loading-state"><span class="spinner"></span><span>Scanning Pump.fun...</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Container: MARKETS ─────────────── */}
                    <div id="wm-c-markets" class="wm-container" data-widget-type="markets" style="left:400px;top:520px;width:380px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">💎</span>
                            <span class="wm-c-title">PREDICTION MARKETS</span>
                        </div>
                        <div class="wm-container-body">
                            <div class="pulse-filters" id="market-filters">
                                <button class="pf-pill hot active" data-market-cat="all">ALL</button>
                                <button class="pf-pill med" data-market-cat="conflict">⚔️ CONFLICT</button>
                                <button class="pf-pill std" data-market-cat="geopolitical">🌐 GEO</button>
                            </div>
                            <div class="panel-section panel-section--radar">
                                <div class="panel-header">
                                    <h2>THREAT RADAR · WARMAPS</h2>
                                    <span class="badge badge--hot" id="markets-alert-count">0</span>
                                </div>
                                <div id="markets-feed" class="feed-list">
                                    <div class="loading-state">
                                        <span class="spinner"></span>
                                        <span>Scanning prediction markets...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Container: DATA FEEDS ──────────── */}
                    <div id="wm-c-data" class="wm-container" data-widget-type="gdelt" style="left:800px;top:520px;width:380px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">📊</span>
                            <span class="wm-c-title">DATA FEEDS</span>
                        </div>
                        <div class="wm-container-body">
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
                            <div class="panel-section">
                                <div class="panel-header">
                                    <h2>🌍 SEISMIC</h2>
                                    <span class="badge" id="seismic-count">0</span>
                                </div>
                                <div id="seismic-feed" class="feed-list feed-list--short">
                                    <div class="loading-state"><span class="spinner"></span><span>Scanning USGS...</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Container: AI ANALYST ──────────── */}
                    <div id="wm-c-ai" class="wm-container" data-widget-type="ai" style="left:1200px;top:520px;width:360px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">🤖</span>
                            <span class="wm-c-title">AI ANALYST</span>
                        </div>
                        <div class="wm-container-body">
                            <div class="panel-section panel-section--chat">
                                <div class="panel-header">
                                    <h2>WARMAPS AI</h2>
                                    <span class="badge ai-badge">GEMINI</span>
                                </div>
                                <div id="ai-messages" class="chat-messages ai-messages"></div>
                                <div class="chat-input-row">
                                    <input type="text" id="ai-input" class="chat-input" placeholder="Ask about conflicts, intelligence..." maxLength={2000} autoComplete="off" />
                                    <button id="ai-send" class="chat-send-btn ai-send-btn">ASK</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Container: GLOBAL CHAT ─────────── */}
                    <div id="wm-c-chat" class="wm-container" data-widget-type="chat" style="left:1520px;top:0px;width:340px;height:400px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">🗨️</span>
                            <span class="wm-c-title">GLOBAL CHAT</span>
                        </div>
                        <div class="wm-container-body">
                            <div class="panel-section panel-section--chat">
                                <div class="panel-header">
                                    <h2>LIVE CHAT</h2>
                                    <span class="badge" id="chat-online">0</span>
                                </div>
                                <div id="chat-messages" class="chat-messages"></div>
                                <div class="chat-input-row">
                                    <input type="text" id="chat-input" class="chat-input" placeholder="Type message..." maxLength={500} autoComplete="off" />
                                    <button id="chat-send" class="chat-send-btn">SEND</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Container: LIVE TV ─────────────── */}
                    <div id="wm-c-tv" class="wm-container" data-widget-type="tv" style="left:1520px;top:420px;width:340px;height:340px">
                        <div class="wm-container-header">
                            <span class="wm-c-icon">📺</span>
                            <span class="wm-c-title">LIVE TV</span>
                        </div>
                        <div class="wm-container-body">
                            <div id="tv-channels" class="tv-channels">
                                <button class="channel-btn active" data-channel="aljazeeraenglish">AL JAZEERA</button>
                                <button class="channel-btn" data-channel="france24english">FRANCE24</button>
                                <button class="channel-btn" data-channel="skynews">SKY</button>
                                <button class="channel-btn" data-channel="dwnews">DW</button>
                                <button class="channel-btn" data-channel="cnn">CNN</button>
                            </div>
                            <div id="tv-player" class="tv-player">
                                <div id="tv-loading" class="loading-state" style="height:100%">
                                    <span class="spinner"></span>
                                    <span>Discovering live streams...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* ─── Minimap ────────────────────────────── */}
                <div id="wm-minimap" class="wm-minimap">
                    <div id="wm-minimap-content" class="wm-minimap-content"></div>
                    <div id="wm-minimap-vp" class="wm-minimap-vp"></div>
                </div>

                {/* ─── Bottom Ticker ──────────────────────── */}
                <div id="ticker" class="ticker">
                    <div class="ticker-label">▶ BREAKING</div>
                    <div class="ticker-content" id="ticker-content">
                        Initializing global monitoring systems...
                    </div>
                </div>
            </div>

            {/* Legacy elements kept for module compatibility */}
            <div id="map-overlay" class="map-overlay" style="display:none">
                <div id="data-freshness" class="data-freshness"></div>
                <div id="perf-hud" class="perf-hud"></div>
            </div>
            <div id="threat-banner" class="threat-banner" style="display:none">
                <div class="threat-banner-icon">🚨</div>
                <div class="threat-banner-content" id="threat-banner-content"></div>
                <button class="threat-banner-close" id="threat-banner-close">×</button>
            </div>
            <div id="timeline-scrubber" class="timeline-scrubber" style="display:none">
                <input type="range" id="timeline-slider" class="timeline-slider" min="0" max="168" value="0" step="1" />
                <span class="timeline-value" id="timeline-value">ALL</span>
            </div>
            <div id="layer-filters" style="display:none">
                <div id="layer-filters-body">
                    <label><input type="checkbox" id="filter-events" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-fires" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-flights" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-tokens" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-acled" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-assets" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-seismic" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-webcams" checked /><span></span></label>
                    <label><input type="checkbox" id="filter-flags" checked /><span></span></label>
                </div>
            </div>
        </>
    );
}
