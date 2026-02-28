import { Head } from 'melina/web';

export default function Page() {
    const now = new Date().toUTCString();

    return (
        <>
            <Head>
                <title>STARWAR — Global Conflict Monitor</title>
            </Head>

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

                {/* Left Panel: News Feed */}
                <aside id="news-panel">
                    <div class="panel-header">
                        <h2>INTEL FEED</h2>
                        <div class="feed-filters" id="feed-filters">
                            <button class="filter-btn active" data-source="all">ALL</button>
                            <button class="filter-btn" data-source="reuters">REUTERS</button>
                            <button class="filter-btn" data-source="bbc">BBC</button>
                            <button class="filter-btn" data-source="aljazeera">AL JAZEERA</button>
                            <button class="filter-btn" data-source="telegram">TELEGRAM</button>
                        </div>
                    </div>
                    <div id="news-feed" class="feed-list">
                        <div class="loading-state">
                            <span class="spinner"></span>
                            <span>Establishing secure feed...</span>
                        </div>
                    </div>
                </aside>

                {/* Center: Map */}
                <main id="map-container">
                    <div id="map" class="map-view"></div>
                    <div id="map-overlay" class="map-overlay">
                        <div class="map-stats" id="map-stats">
                            <span>Events: <strong id="event-count">—</strong></span>
                            <span class="separator">│</span>
                            <span>Fires: <strong id="fire-count">—</strong></span>
                            <span class="separator">│</span>
                            <span>Markets: <strong id="market-count">—</strong></span>
                            <span class="separator">│</span>
                            <span>Sources: <strong id="source-count">—</strong></span>
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
                    <div class="panel-section">
                        <div class="panel-header">
                            <h2>LIVE NEWS TV</h2>
                        </div>
                        <div id="tv-channels" class="tv-channels">
                            <button class="channel-btn active" data-channel="UCIRYBXDze5krPDzAEOxFGVA">AL JAZEERA</button>
                            <button class="channel-btn" data-channel="UCQfwfsi5VrQ8yKZ-UWmAEFg">FRANCE24</button>
                            <button class="channel-btn" data-channel="UC_gUM8rL-Lrg6O3adPW9K1g">SKY NEWS</button>
                            <button class="channel-btn" data-channel="UCUMZ7gohGI9HcU9VNsr2FJQ">BLOOMBERG</button>
                            <button class="channel-btn" data-channel="UCknLrEdhRCp1aegoMqRaCZg">DW</button>
                            <button class="channel-btn" data-channel="UCupvZG-5ko_eiXAupbDfxWw">CNN</button>
                        </div>
                        <div id="tv-player" class="tv-player">
                            <iframe
                                id="tv-iframe"
                                src="https://www.youtube.com/embed/live_stream?channel=UCIRYBXDze5krPDzAEOxFGVA&autoplay=1&mute=1"
                                allow="autoplay; encrypted-media"
                                allowFullScreen={true}
                            ></iframe>
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
                            <button id="tg-connect-btn" class="tg-connect-btn" title="Connect Telegram">⚡</button>
                        </div>
                        <div id="tg-status" class="tg-status">Not connected</div>
                        <div id="tg-feed" class="feed-list feed-list--short">
                            <div class="loading-state">
                                <span>Connect Telegram to stream OSINT channels</span>
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

            {/* ─── Telegram Auth Modal ─────────────────── */}
            <div id="tg-modal" class="modal-overlay" style="display:none">
                <div class="modal-box">
                    <div class="modal-header">
                        <h3>📡 TELEGRAM OSINT CONNECTION</h3>
                        <button id="tg-modal-close" class="modal-close">×</button>
                    </div>
                    <div id="tg-auth-step" class="modal-body">
                        <p class="modal-info">Connect your Telegram account to stream real-time OSINT from 10+ conflict channels.</p>
                        <div class="modal-field">
                            <label>API ID</label>
                            <input type="text" id="tg-app-id" placeholder="e.g. 12345678" />
                        </div>
                        <div class="modal-field">
                            <label>API Hash</label>
                            <input type="text" id="tg-app-hash" placeholder="e.g. abc123def456..." />
                        </div>
                        <div class="modal-field">
                            <label>Phone Number</label>
                            <input type="text" id="tg-phone" placeholder="+1234567890" />
                        </div>
                        <button id="tg-auth-submit" class="modal-submit">CONNECT</button>
                        <div id="tg-auth-status" class="modal-status"></div>
                    </div>
                </div>
            </div>
        </>
    );
}
