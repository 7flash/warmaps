/**
 * page.client.tsx — Dashboard Client Controller
 * 
 * Thin orchestrator that imports and initializes all modules.
 * 
 * Modules:
 *   lib/state.ts     — Global state, feature flags, mutable data
 *   lib/utils.ts     — Shared utilities (debounce, proxyImg, escHtml, formatTime)
 *   lib/perf.ts      — FPS counter, ping monitor, continuous repaint
 *   lib/map.ts       — MapLibre map initialization, sources, layers, popups
 *   lib/data.ts      — All data fetching (GDELT, fires, flights, markets, etc.)
 *   lib/feeds.ts     — Feed rendering (news, fires, radar, ticker, stats)
 *   lib/markers.ts   — Real-time image marker system (stagger, fade, rank)
 *   lib/tokens.ts    — Pump.fun conflict token markers & feed
 *   lib/modals.ts    — Article modal
 *   lib/panels.ts    — Panel toggles, filters, search, boot, clock, wallet
 *   lib/tv.ts        — TV channel switching & YouTube stream discovery
 *   lib/chat.ts      — WebSocket chat
 *   lib/ai.ts        — AI chat with Gemini streaming
 *   lib/betting.ts   — Market modal & native SOL betting
 *   lib/spotlight.ts — Conflict spotlight, radar pings, data flash
 */

import { FF, measure, measureSync, dataPaused } from './lib/state';
import { initMap } from './lib/map';
import { fetchAllData, fetchFlights, fetchCrypto } from './lib/data';
import { updateStats } from './lib/feeds';
import { startFPSCounter, startPingMonitor } from './lib/perf';
import {
    initFilters, initTelegram, initThreatBanner,
    startClock, initAurebeshToggle, initSearchModal,
    initBootSequence, setupLegendFilters,
} from './lib/panels';
import { initTVChannels } from './lib/tv';
import { initChat } from './lib/chat';
import { startConflictSpotlight } from './lib/spotlight';
import { setDataPaused } from './lib/state';

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

        // CA click-to-copy
        const caBadge = document.getElementById('token-ca');
        if (caBadge) {
            caBadge.addEventListener('click', () => {
                const ca = caBadge.dataset.ca || '';
                if (ca) {
                    navigator.clipboard.writeText(ca).then(() => {
                        const val = document.getElementById('ca-value');
                        if (val) {
                            const original = val.textContent;
                            val.textContent = 'COPIED!';
                            setTimeout(() => { val.textContent = original; }, 1500);
                        }
                    });
                }
            });
        }

        // Performance monitoring
        measureSync('FPS counter', () => startFPSCounter());
        measureSync('Ping monitor', () => startPingMonitor());

        // Pause button — stops all data polling
        function initPauseButton() {
            const pauseBtn = document.createElement('button');
            pauseBtn.id = 'data-pause-btn';
            pauseBtn.className = 'pause-btn';
            pauseBtn.title = 'Pause all data polling (P)';
            pauseBtn.textContent = '⏸';
            pauseBtn.addEventListener('click', toggleDataPause);
            document.getElementById('map-stats')?.appendChild(pauseBtn);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'p' || e.key === 'P') {
                    if (document.activeElement?.tagName === 'INPUT') return;
                    toggleDataPause();
                }
            });
        }

        function toggleDataPause() {
            setDataPaused(!dataPaused);
            const btn = document.getElementById('data-pause-btn');
            if (btn) {
                btn.textContent = dataPaused ? '▶' : '⏸';
                btn.title = dataPaused ? 'Resume data polling (P)' : 'Pause all data polling (P)';
                btn.classList.toggle('paused', dataPaused);
            }
            const liveEl = document.querySelector('.status-indicator');
            if (liveEl) {
                if (dataPaused) {
                    liveEl.innerHTML = '<span style="color:#f59e0b">⏸ PAUSED</span>';
                } else {
                    liveEl.innerHTML = '<span class="pulse-dot"></span> LIVE';
                }
            }
        }
        initPauseButton();

        // Start data fetching immediately
        await m('Initial data fetch', () => fetchAllData());

        // All intervals guard with dataPaused
        setInterval(() => { if (!dataPaused) fetchAllData(); }, 30_000);

        // Fast data loops (gated by feature flags)
        if (FF.flights) setInterval(() => { if (!dataPaused) fetchFlights(); }, 15_000);
        if (FF.crypto) setInterval(() => { if (!dataPaused) fetchCrypto(); }, 30_000);

        // Refresh data freshness labels every 15s
        setInterval(() => { if (!dataPaused) updateStats(); }, 15_000);

        // Poll market cap every 30s
        async function pollMcap() {
            try {
                const res = await fetch('/api/mcap');
                const data = await res.json();
                const val = document.getElementById('ca-value');
                if (val && data.mcap) {
                    const mcap = Number(data.mcap);
                    let formatted: string;
                    if (mcap >= 1_000_000) formatted = `$${(mcap / 1_000_000).toFixed(1)}M`;
                    else if (mcap >= 1_000) formatted = `$${(mcap / 1_000).toFixed(1)}K`;
                    else formatted = `$${mcap.toFixed(0)}`;
                    const caBadge = document.getElementById('token-ca');
                    const caStr = caBadge?.dataset.ca || '';
                    const caShort = caStr ? `${caStr.slice(0, 4)}...${caStr.slice(-4)}` : '';
                    val.textContent = `${formatted}${caShort ? ' · ' + caShort : ''}`;
                }
            } catch { }
        }
        pollMcap();
        setInterval(pollMcap, 30_000);

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
