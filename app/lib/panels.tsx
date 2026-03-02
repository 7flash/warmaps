/**
 * panels.ts — Panel toggles, legend filters, search modal, boot sequence, 
 *              clock, Aurebesh toggle, Telegram status, threat banner
 */

import { render } from 'melina/client';
import { map, setCurrentFilter } from './state';
import { fetchNews } from './data';
import { renderRadarFeed } from './feeds';

// ─── Panel Toggle System ────────────────────────────────────

export function initPanelToggles() {
    // Helper: kill YouTube iframe to stop background playback
    function stopTVIfHidden() {
        const tvPanel = document.getElementById('tv-panel');
        if (tvPanel && !tvPanel.classList.contains('open')) {
            const player = document.getElementById('tv-player');
            if (player) {
                const iframe = player.querySelector('iframe');
                if (iframe) iframe.src = '';
            }
        }
    }

    // Panel tabs toggle panels — all right-side now
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panelId = (tab as HTMLElement).dataset.panel;
            if (!panelId) return;

            const panel = document.getElementById(panelId);
            if (!panel) return;

            // Close all other panels first
            document.querySelectorAll('.overlay-panel--right.open').forEach(p => {
                if (p.id !== panelId) {
                    p.classList.remove('open');
                    document.querySelector(`.panel-tab[data-panel="${p.id}"]`)?.classList.remove('active');
                }
            });

            const isOpen = panel.classList.toggle('open');
            tab.classList.toggle('active', isOpen);

            // Stop YouTube if TV panel just closed or another panel opened
            stopTVIfHidden();
        });
    });

    // Close buttons
    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = (btn as HTMLElement).dataset.panel;
            if (!panelId) return;
            document.getElementById(panelId)?.classList.remove('open');
            document.querySelector(`.panel-tab[data-panel="${panelId}"]`)?.classList.remove('active');

            stopTVIfHidden();
        });
    });

    // Market category filter buttons
    document.querySelectorAll('#market-filters .pf-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#market-filters .pf-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderRadarFeed();
        });
    });
}

// ─── Feed Filters ───────────────────────────────────────────

export function initFilters() {
    const container = document.getElementById('feed-filters');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.filter-btn') as HTMLElement | null;
        if (!btn) return;

        const source = btn.dataset.source || 'all';
        setCurrentFilter(source);

        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        fetchNews();
    });
}

// ─── Telegram Auto-Status ───────────────────────────────────

export function initTelegram() {
    const statusBar = document.getElementById('tg-status');

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

export function initThreatBanner() {
    const closeBtn = document.getElementById('threat-banner-close');
    const banner = document.getElementById('threat-banner');
    if (closeBtn && banner) {
        closeBtn.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }
}

// ─── Clock ──────────────────────────────────────────────────

export function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;

    const update = () => {
        el.textContent = new Date().toUTCString();
    };
    update();
    setInterval(update, 1000);
}

// ─── Aurebesh Toggle ────────────────────────────────────────

export function initAurebeshToggle() {
    const btn = document.getElementById('aurebesh-toggle');
    if (!btn) return;

    // Restore saved preference
    if (localStorage.getItem('warmaps-aurebesh') === 'on') {
        document.body.classList.add('aurebesh');
    }

    btn.addEventListener('click', () => {
        document.body.classList.toggle('aurebesh');
        const isOn = document.body.classList.contains('aurebesh');
        localStorage.setItem('warmaps-aurebesh', isOn ? 'on' : 'off');
    });
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

export function initSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    const resultsContainer = document.getElementById('search-results');

    if (!modal || !input || !resultsContainer) return;

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

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    const renderResults = (locs: typeof GLOBE_LOCATIONS) => {
        render(
            <>{
                locs.map(loc =>
                    <div className="search-result-item" onClick = {() => {
        if (map) map.flyTo({ center: [loc.lng, loc.lat], zoom: 6, essential: true });
        modal!.style.display = 'none';
    }
}>
    <span>{ loc.name } </span>
    < span style = {{ opacity: 0.5 }}> { loc.lat }, { loc.lng } </span>
        </div>
            )}</>,
resultsContainer
        );
    };

input.addEventListener('input', () => {
    const query = input.value.toLowerCase();
    const filtered = GLOBE_LOCATIONS.filter(l => l.name.toLowerCase().includes(query));
    renderResults(filtered);
});
}

// ─── Boot Sequence ──────────────────────────────────────────

export function initBootSequence() {
    const bootEl = document.getElementById('boot-sequence');
    if (!bootEl) return;

    if (sessionStorage.getItem('warmaps-booted')) {
        bootEl.style.display = 'none';
        return;
    }

    sessionStorage.setItem('warmaps-booted', 'true');

    setTimeout(() => {
        bootEl.classList.add('done');
        setTimeout(() => {
            bootEl.style.display = 'none';
        }, 500);
    }, 1500);
}

// ─── Legend Filters ─────────────────────────────────────────

export function setupLegendFilters() {
    const toggleLayer = (id: string, visible: boolean) => {
        if (!map || !map.getLayer(id)) return;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };

    // Collapsible header
    const toggleBtn = document.getElementById('layer-filters-toggle');
    const panel = document.getElementById('layer-filters');
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });
    }

    // Layer toggles
    const bind = (filterId: string, layerIds: string[], onToggle?: (visible: boolean) => void) => {
        const el = document.getElementById(filterId) as HTMLInputElement | null;
        if (!el) return;
        el.addEventListener('change', () => {
            for (const id of layerIds) toggleLayer(id, el.checked);
            if (onToggle) onToggle(el.checked);
        });
    };

    bind('filter-events', ['events-heat', 'events-point']);
    bind('filter-fires', ['fires-heat']);
    bind('filter-flights', ['flights-point']);
    bind('filter-tokens', [], (on: boolean) => {
        document.querySelectorAll('.map-token-marker').forEach((el: any) => {
            el.style.display = on ? '' : 'none';
        });
    });
    bind('filter-acled', ['acled-kinetic']);
    bind('filter-assets', ['assets-nuclear', 'assets-base']);
    bind('filter-seismic', ['seismic-kinetic']);
    bind('filter-webcams', ['webcams-point']);
    bind('filter-flags', ['country-flag-labels']);
}

// ─── Wallet ─────────────────────────────────────────────────

import { connectedWallet, setConnectedWallet } from './state';

export function initWallet() {
    const btn = document.getElementById('wallet-btn');
    const label = document.getElementById('wallet-label');
    if (!btn || !label) return;

    btn.addEventListener('click', async () => {
        if (connectedWallet) {
            setConnectedWallet(null);
            label.textContent = '🔗 CONNECT';
            btn.classList.remove('wallet-btn--connected');
            return;
        }

        const solana = (window as any).solana;
        if (!solana?.isPhantom) {
            window.open('https://phantom.app/', '_blank');
            return;
        }

        try {
            const resp = await solana.connect();
            const addr = resp.publicKey.toString();
            setConnectedWallet(addr);
            label.textContent = `👛 ${addr.slice(0, 4)}...${addr.slice(-4)}`;
            btn.classList.add('wallet-btn--connected');
            console.log('[wallet] Connected:', addr);
        } catch (err) {
            console.error('[wallet] Connection failed:', err);
        }
    });

    // Auto-reconnect if previously connected
    const solana = (window as any).solana;
    if (solana?.isPhantom) {
        solana.connect({ onlyIfTrusted: true }).then((resp: any) => {
            const addr = resp.publicKey.toString();
            setConnectedWallet(addr);
            label.textContent = `👛 ${addr.slice(0, 4)}...${addr.slice(-4)}`;
            btn.classList.add('wallet-btn--connected');
        }).catch(() => { });
    }
}
