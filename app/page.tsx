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
                    <div class="boot-version">v2.0 · {GIT_HASH || 'dev'}</div>
                    <div id="boot-lines" class="boot-lines"></div>
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

                    <button id="wm-share" class="top-btn" title="Share this layout">🔗</button>
                    <button id="wm-reset-layout" class="top-btn" title="Reset to default layout">↺</button>
                    <button id="wm-sync-maps" class="top-btn" title="Sync Map Pan/Zoom (Off)">🔓</button>
                    <button id="wm-terrain-toggle" class="top-btn" title="Toggle 3D Terrain">🏔️</button>
                    <button id="wm-sync-collab" class="top-btn" title="War Room Sync (Off)">👤</button>
                    <button id="wm-fit-all" class="top-btn" title="Fit all containers (F)">⊞<span class="shortcut-badge">F</span></button>
                    <button id="wm-auto-arrange" class="top-btn" title="Auto-arrange layout (A)">▦<span class="shortcut-badge">A</span></button>
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



            {/* ─── Share Toast ─────────────────────────── */}
            <div id="share-toast" class="share-toast" style={{ display: 'none' }}>
                <div class="share-toast-content">
                    <span class="share-toast-icon">🔗</span>
                    <span class="share-toast-text">Link copied to clipboard!</span>
                </div>
            </div>

            {/* ─── Canvas Viewport ─────────────────────── */}
            <div id="wm-viewport" class="wm-viewport">
                <div id="wm-content" class="wm-content">
                    <svg id="wm-links" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 4000 }}></svg>

                    {/* Widgets are dynamically attached here by page.client.tsx */}
                </div>

                {/* ─── Minimap ────────────────────────────── */}
                <div id="wm-minimap" class="wm-minimap">
                    <div id="wm-minimap-content" class="wm-minimap-content"></div>
                    <div id="wm-minimap-vp" class="wm-minimap-vp"></div>
                </div>

                {/* ─── Bottom Widget Tray (Game Engine Boilerplates) ─── */}
                <div id="widget-tray" class="widget-tray">
                    <div class="widget-tray-label">🔥 WIDGETS</div>
                    <div class="widget-tray-scroll-row">
                        <button class="tray-scroll-arrow tray-scroll-left" data-target=".widget-tray-categories" aria-label="Scroll left">‹</button>
                        <div class="widget-tray-categories">
                            <button class="wc-cat-btn active" data-cat="all">All</button>
                            <button class="wc-cat-btn" data-cat="saved">⭐ Saved</button>
                            <button class="wc-cat-btn" data-cat="map">🗺 Maps</button>
                            <button class="wc-cat-btn" data-cat="telegram">💬 Telegram</button>
                            <button class="wc-cat-btn" data-cat="rss">📰 News</button>
                            <button class="wc-cat-btn" data-cat="data">📊 Data</button>
                            <button class="wc-cat-btn" data-cat="media">📺 Media</button>
                            <button class="wc-cat-btn" data-cat="social">💬 Social</button>
                        </div>
                        <button class="tray-scroll-arrow tray-scroll-right" data-target=".widget-tray-categories" aria-label="Scroll right">›</button>
                    </div>
                    <div class="widget-tray-scroll-row">
                        <button class="tray-scroll-arrow tray-scroll-left" data-target=".widget-tray-grid" aria-label="Scroll left">‹</button>
                        <div id="widget-tray-grid" class="widget-tray-grid">
                            {/* Populated by JS */}
                        </div>
                        <button class="tray-scroll-arrow tray-scroll-right" data-target=".widget-tray-grid" aria-label="Scroll right">›</button>
                    </div>
                </div>
            </div >

            {/* Legacy elements kept for module compatibility */}
            < div id="map-overlay" class="map-overlay" style="display:none" >
                <div id="data-freshness" class="data-freshness"></div>
                <div id="perf-hud" class="perf-hud"></div>
            </div >
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
