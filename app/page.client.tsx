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
import { setDataPaused, setTimelineHours } from './lib/state';
import { initAlerts } from './lib/alerts';
import { initAuth } from './lib/user-auth';

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
        initAuth(); // async — doesn't block boot

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

        // Timeline scrubber
        function initTimeline() {
            const slider = document.getElementById('timeline-slider') as HTMLInputElement;
            const valueEl = document.getElementById('timeline-value');
            const btns = document.querySelectorAll('.timeline-btn');

            function formatHours(h: number): string {
                if (h <= 0) return 'ALL';
                if (h < 24) return h + 'H';
                if (h < 168) return Math.round(h / 24) + 'D';
                return '7D';
            }

            function setTimeline(hours: number) {
                setTimelineHours(hours);
                if (slider) slider.value = String(hours);
                if (valueEl) valueEl.textContent = formatHours(hours);
                btns.forEach(b => {
                    const bh = parseInt(b.getAttribute('data-hours') || '0');
                    b.classList.toggle('active', bh === hours);
                });
            }

            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const h = parseInt(btn.getAttribute('data-hours') || '0');
                    setTimeline(h);
                });
            });

            if (slider) {
                slider.addEventListener('input', () => {
                    const h = parseInt(slider.value);
                    setTimelineHours(h);
                    if (valueEl) valueEl.textContent = formatHours(h);
                    // Update active button
                    btns.forEach(b => {
                        const bh = parseInt(b.getAttribute('data-hours') || '0');
                        b.classList.toggle('active', bh === h);
                    });
                });
            }
        }
        measureSync('Timeline', () => initTimeline());
        measureSync('Alerts', () => initAlerts());

        // Keyboard shortcuts help (press ?)
        document.addEventListener('keydown', (e) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            if (e.key === '?') {
                const existing = document.getElementById('shortcuts-modal');
                if (existing) { existing.remove(); document.getElementById('shortcuts-overlay')?.remove(); return; }

                const overlay = document.createElement('div');
                overlay.id = 'shortcuts-overlay';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
                overlay.onclick = () => { overlay.remove(); modal.remove(); };

                const modal = document.createElement('div');
                modal.id = 'shortcuts-modal';
                modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:201;width:340px;max-width:90vw;background:rgba(10,15,26,0.98);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.6)';
                modal.innerHTML = `
                    <div style="font-family:var(--font-display);font-size:12px;font-weight:700;color:var(--accent);letter-spacing:2px;margin-bottom:16px">⌨ KEYBOARD SHORTCUTS</div>
                    ${[
                        ['?', 'Toggle this help'],
                        ['P', 'Pause/resume data polling'],
                        ['S', 'Copy shareable map URL'],
                        ['Ctrl+K', 'Search / jump to location'],
                        ['ESC', 'Close any modal or panel'],
                        ['1-9', 'Switch panel tab'],
                    ].map(([key, desc]) => `
                        <div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                            <kbd style="font-family:var(--font-mono);font-size:11px;background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);min-width:60px;text-align:center">${key}</kbd>
                            <span style="margin-left:12px;font-size:12px;color:var(--text-secondary)">${desc}</span>
                        </div>
                    `).join('')}
                    <div style="margin-top:12px;font-size:10px;color:var(--text-muted);text-align:center">Press ? or ESC to close</div>
                `;

                document.body.appendChild(overlay);
                document.body.appendChild(modal);

                const escHandler = (ev: KeyboardEvent) => {
                    if (ev.key === 'Escape' || ev.key === '?') {
                        overlay.remove(); modal.remove();
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);
            }
            // Share current map view
            if (e.key === 's' || e.key === 'S') {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    const toast = document.createElement('div');
                    toast.className = 'alert-toast visible';
                    toast.style.borderLeftColor = 'var(--accent)';
                    toast.style.borderColor = 'rgba(34,197,94,0.3)';
                    toast.innerHTML = '<div class="alert-toast-title" style="color:var(--accent)">📋 Link copied</div><div class="alert-toast-body">Share this URL to show your exact map view</div>';
                    document.body.appendChild(toast);
                    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3000);
                });
            }
        });

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
