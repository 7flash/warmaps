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
import { dataFreshness, getFreshnessLabel } from './lib/state';
import { initMap } from './lib/map';
import { fetchAllData, fetchFlights, fetchCrypto } from './lib/data';
import { updateStats, reRenderWidget } from './lib/feeds';
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
import { initLinks } from './lib/links';
import { initCanvas, fitAllContainers, initMinimapClick, updateMinimap, autoArrangeContainers } from './lib/canvas';
import { WIDGET_TYPES, encodeShareLink, loadInstances, saveInstances, createInstance, getDefaultInstances, LAYOUT_PRESETS, loadUserPresets, saveUserPresets } from './lib/widgets';
import type { WidgetInstance, ConfigField } from './lib/widgets';

// ─── Widget Config Panel ────────────────────────────────────

function addConfigGearToContainer(container: HTMLElement) {
    const typeId = container.dataset.widgetType;
    if (!typeId) return;
    const wt = WIDGET_TYPES.find(w => w.id === typeId);
    if (!wt?.configFields?.length) return;

    const header = container.querySelector('.wm-container-header');
    if (!header) return;

    // Don't add if already present
    if (header.querySelector('.wm-c-config')) return;

    const actions = header.querySelector('.wm-c-actions') || header;
    const gearBtn = document.createElement('button');
    gearBtn.className = 'wm-c-config';
    gearBtn.title = 'Widget settings';
    gearBtn.textContent = '⚙';
    gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleConfigPanel(container, wt.configFields!);
    });

    // Insert before the remove button
    const removeBtn = actions.querySelector('.wm-c-remove');
    if (removeBtn) {
        actions.insertBefore(gearBtn, removeBtn);
    } else {
        actions.appendChild(gearBtn);
    }
}

function toggleConfigPanel(container: HTMLElement, fields: ConfigField[]) {
    const existing = container.querySelector('.wm-config-panel');
    if (existing) {
        existing.remove();
        return;
    }

    const panel = document.createElement('div');
    panel.className = 'wm-config-panel';

    fields.forEach(field => {
        const row = document.createElement('div');
        row.className = 'wm-config-row';

        const label = document.createElement('label');
        label.className = 'wm-config-label';
        label.textContent = field.label;
        row.appendChild(label);

        if (field.type === 'select' && field.options) {
            const select = document.createElement('select');
            select.className = 'wm-config-select';
            select.dataset.configKey = field.key;
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                // Try to get current value from container dataset
                const currentVal = container.dataset[`cfg${field.key}`] || '';
                if (opt.value === currentVal) option.selected = true;
                select.appendChild(option);
            });
            select.addEventListener('change', () => {
                container.dataset[`cfg${field.key}`] = select.value;
                reRenderWidget(container.dataset.widgetType || '');
                // Flash the title to indicate change applied
                const title = container.querySelector('.wm-c-title') as HTMLElement;
                if (title) {
                    title.style.color = 'var(--accent)';
                    setTimeout(() => { title.style.color = ''; }, 600);
                }
            });
            row.appendChild(select);
        } else if (field.type === 'text') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'wm-config-input';
            input.placeholder = field.label;
            input.dataset.configKey = field.key;
            input.value = container.dataset[`cfg${field.key}`] || '';
            input.addEventListener('input', () => {
                container.dataset[`cfg${field.key}`] = input.value;
                reRenderWidget(container.dataset.widgetType || '');
            });
            row.appendChild(input);
        }

        panel.appendChild(row);
    });

    // Insert panel after header
    const header = container.querySelector('.wm-container-header');
    if (header && header.nextSibling) {
        container.insertBefore(panel, header.nextSibling);
    } else {
        container.appendChild(panel);
    }
}

// ─── Widget Catalog Management ──────────────────────────────

function initWidgetCatalog() {
    const tray = document.getElementById('widget-tray');
    const grid = document.getElementById('widget-tray-grid');
    const shareBtn = document.getElementById('wm-share');
    const resetBtn = document.getElementById('wm-reset-layout');
    const syncMapsBtn = document.getElementById('wm-sync-maps');
    const fitAllBtn = document.getElementById('wm-fit-all');
    const autoArrangeBtn = document.getElementById('wm-auto-arrange');

    if (!tray || !grid) return;

    let activeCategory = 'all';

    function renderCatalog() {
        if (!grid) return;
        grid.innerHTML = '';
        const filtered = activeCategory === 'all'
            ? WIDGET_TYPES
            : WIDGET_TYPES.filter(w => w.category === activeCategory);

        filtered.forEach(wt => {
            const card = document.createElement('div');
            card.className = 'wc-widget-card';
            card.dataset.widgetType = wt.id;
            card.innerHTML = `
                <div class="wc-widget-icon">${wt.icon}</div>
                <div class="wc-widget-info">
                    <div class="wc-widget-name">${wt.name.toUpperCase()}</div>
                    <div class="wc-widget-desc">${wt.description}</div>
                </div>
                ${wt.multi ? '<span class="wc-widget-badge">MULTI</span>' : ''}
            `;
            // Optional: Support drag & drop or click to add
            card.addEventListener('click', () => addWidgetToCanvas(wt.id));

            // Allow native drag dropping from tray
            card.draggable = true;
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', wt.id);
            });

            grid.appendChild(card);
        });
    }

    // Category filtering
    tray.querySelectorAll('.wc-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tray.querySelectorAll('.wc-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = (btn as HTMLElement).dataset.cat || 'all';
            renderCatalog();
        });
    });

    // Share button
    shareBtn?.addEventListener('click', () => {
        const instances = getCurrentInstances();
        const link = encodeShareLink(instances);
        navigator.clipboard.writeText(link).then(() => {
            const toast = document.getElementById('share-toast');
            if (toast) {
                toast.style.display = 'block';
                // Reset animation
                toast.style.animation = 'none';
                toast.offsetHeight; // force reflow
                toast.style.animation = 'toastIn 0.3s ease, toastOut 0.3s ease 2s forwards';
                setTimeout(() => { toast.style.display = 'none'; }, 2500);
            }
        });
    });

    // Reset layout
    resetBtn?.addEventListener('click', () => {
        if (!confirm('Reset to default widget layout?')) return;
        localStorage.removeItem('warmaps:instances');
        localStorage.removeItem('warmaps:layout');
        window.location.reload();
    });

    // Sync maps
    syncMapsBtn?.addEventListener('click', () => {
        import('./lib/map').then(({ toggleMapSync }) => {
            const enabled = toggleMapSync();
            if (syncMapsBtn) {
                syncMapsBtn.textContent = enabled ? '🔒' : '🔓';
                syncMapsBtn.title = `Sync Map Pan/Zoom (${enabled ? 'On' : 'Off'})`;
            }
        });
    });

    // Fit all
    fitAllBtn?.addEventListener('click', () => {
        fitAllContainers();
    });

    // Auto arrange
    autoArrangeBtn?.addEventListener('click', () => {
        autoArrangeContainers();
    });

    // 3D Terrain toggle
    const terrainBtn = document.getElementById('wm-terrain-toggle');
    terrainBtn?.addEventListener('click', () => {
        import('./lib/map').then(({ toggle3DTerrain }) => {
            const enabled = toggle3DTerrain();
            if (terrainBtn) {
                terrainBtn.textContent = enabled ? '🌋' : '🏔️';
                terrainBtn.title = `3D Terrain (${enabled ? 'On' : 'Off'})`;
                terrainBtn.classList.toggle('active', enabled);
            }
        });
    });

    // Collaborative sync toggle
    const syncCollabBtn = document.getElementById('wm-sync-collab');
    syncCollabBtn?.addEventListener('click', () => {
        import('./lib/sync').then(({ initSync, disconnectSync, isSyncEnabled }) => {
            if (isSyncEnabled()) {
                disconnectSync();
                syncCollabBtn.classList.remove('active');
            } else {
                initSync();
                syncCollabBtn.classList.add('active');
            }
        });
    });

    // Broadcast layout on drag/resize end (for sync)
    document.addEventListener('mouseup', () => {
        import('./lib/sync').then(({ broadcastLayout, isSyncEnabled }) => {
            if (isSyncEnabled()) broadcastLayout();
        });
    });

    // Add remove, detach, and link handles to existing containers
    document.querySelectorAll('.wm-container-header').forEach(header => {
        let actions = header.querySelector('.wm-c-actions') as HTMLElement;
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'wm-c-actions';
            header.appendChild(actions);
        }

        // Add link handle if missing
        if (!actions.querySelector('.wm-c-link-handle')) {
            const linkBtn = document.createElement('button');
            linkBtn.className = 'wm-c-link-handle wm-link-handle';
            linkBtn.title = 'Drag to link';
            linkBtn.textContent = '🔗';
            actions.appendChild(linkBtn);
        }

        // Add detach if missing
        if (!actions.querySelector('.wm-c-detach')) {
            const detachBtn = document.createElement('button');
            detachBtn.className = 'wm-c-detach';
            detachBtn.title = 'Detach to new window';
            detachBtn.textContent = '⎘';
            actions.appendChild(detachBtn);
        }

        // Add remove if missing
        if (!actions.querySelector('.wm-c-remove')) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'wm-c-remove';
            removeBtn.title = 'Remove widget';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = (header as HTMLElement).closest('.wm-container') as HTMLElement;
                if (container && confirm(`Remove ${container.querySelector('.wm-c-title')?.textContent}?`)) {
                    container.remove();
                    updateMinimap();
                }
            });
            actions.appendChild(removeBtn);
        }
    });

    // Add config gear to containers that have configurable fields
    document.querySelectorAll('.wm-container').forEach(c => {
        addConfigGearToContainer(c as HTMLElement);
    });

    renderCatalog();
}

function initPresets() {
    const select = document.getElementById('wm-preset-select') as HTMLSelectElement;
    if (!select) return;

    // Load user presets into dropdown
    const userPresets = loadUserPresets();
    Object.keys(userPresets).forEach(name => {
        const option = document.createElement('option');
        option.value = `user_${name}`;
        option.textContent = name;
        select.insertBefore(option, select.options[select.options.length - 2]); // Insert before separator
    });

    select.addEventListener('change', () => {
        const val = select.value;
        if (!val) return;

        if (val === 'save_current') {
            const name = prompt('Enter a name for this layout preset:');
            if (name) {
                const current = getCurrentInstances();
                const presets = loadUserPresets();
                presets[name] = current;
                saveUserPresets(presets);
                alert(`Layout "${name}" saved!`);
                window.location.reload();
            }
            select.value = '';
            return;
        }

        const applyLayout = (instances: WidgetInstance[]) => {
            saveInstances(instances);
            const layouts = instances.map(inst => ({
                id: inst.id,
                x: inst.x,
                y: inst.y,
                w: inst.width,
                h: inst.height,
                collapsed: inst.collapsed
            }));
            localStorage.setItem('warmaps:layout', JSON.stringify(layouts));
            window.location.reload();
        };

        if (val.startsWith('user_')) {
            const name = val.replace('user_', '');
            const presets = loadUserPresets();
            if (presets[name]) applyLayout(presets[name]);
        } else if (LAYOUT_PRESETS[val]) {
            applyLayout(LAYOUT_PRESETS[val]);
        }

        select.value = '';
    });
}

function addWidgetToCanvas(typeId: string, dropX?: number, dropY?: number) {
    const wt = WIDGET_TYPES.find(w => w.id === typeId);
    if (!wt) return;

    // Check if non-multi widget already exists
    if (!wt.multi) {
        const existing = document.querySelector(`[data-widget-type="${typeId}"]`);
        if (existing) {
            // Flash the existing one
            existing.classList.add('dragging');
            setTimeout(() => existing.classList.remove('dragging'), 500);
            return;
        }
    }

    const content = document.getElementById('wm-content');
    if (!content) return;

    let x: number, y: number;
    if (dropX !== undefined && dropY !== undefined) {
        // Dropped at specific canvas position — convert screen to canvas coords
        const viewport = document.getElementById('wm-viewport');
        const vRect = viewport?.getBoundingClientRect();
        const transform = content.style.transform;
        const match = transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/);
        const tx = match ? parseFloat(match[1]) : 0;
        const ty = match ? parseFloat(match[2]) : 0;
        const scale = match ? parseFloat(match[3]) : 1;
        const relX = dropX - (vRect?.left || 0);
        const relY = dropY - (vRect?.top || 0);
        x = (relX - tx) / scale - wt.defaultWidth / 2;
        y = (relY - ty) / scale - wt.defaultHeight / 2;
    } else {
        // Default: center of viewport
        const viewport = document.getElementById('wm-viewport');
        const vRect = viewport?.getBoundingClientRect();
        x = vRect ? (vRect.width / 2 - wt.defaultWidth / 2) : 200;
        y = vRect ? (vRect.height / 2 - wt.defaultHeight / 2) : 200;
    }

    // Create the DOM element
    const container = document.createElement('div');
    container.id = `wm-c-${typeId}-${Date.now()}`;
    container.className = 'wm-container';

    // Map widget IDs to their renderer type for feed compatibility
    // tg-* → 'telegram', news-* → 'news', everything else stays as-is
    let rendererType = typeId;
    if (typeId.startsWith('tg-')) rendererType = 'telegram';
    else if (typeId.startsWith('news-')) rendererType = 'news';

    container.dataset.widgetType = rendererType;

    // Apply default config as data attributes (e.g. cfgChannel for telegram)
    if (wt.defaultConfig) {
        Object.entries(wt.defaultConfig).forEach(([key, val]) => {
            container.dataset[`cfg${key.charAt(0).toUpperCase()}${key.slice(1)}`] = String(val);
        });
    }

    container.style.cssText = `left:${x}px;top:${y}px;width:${wt.defaultWidth}px;height:${wt.defaultHeight}px`;

    container.innerHTML = `
        <div class="wm-container-header">
            <span class="wm-c-icon">${wt.icon}</span>
            <span class="wm-c-title">${wt.name.toUpperCase()}</span>
            <div class="wm-c-actions">
                <button class="wm-c-link-handle wm-link-handle" title="Drag to link">🔗</button>
                <button class="wm-c-detach" title="Detach to new window">⎘</button>
                <button class="wm-c-remove" title="Remove widget">×</button>
            </div>
        </div>
        <div class="wm-container-body">
            <div class="loading-state" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
                <span class="spinner"></span>
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Initializing ${wt.name}...</span>
            </div>
        </div>
    `;

    // Remove button handler
    container.querySelector('.wm-c-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        container.remove();
        updateMinimap();
    });

    content.appendChild(container);
    addConfigGearToContainer(container);
    updateMinimap();

    // Re-render widget data asynchronously so it shows up instantly without reloading page
    import('./lib/feeds').then(({ reRenderWidget }) => {
        reRenderWidget(rendererType);
    });
    if (rendererType === 'map' || typeId === 'heatmap') {
        import('./lib/map').then(({ initMap }) => initMap());
    }
}

function getCurrentInstances(): WidgetInstance[] {
    const containers = document.querySelectorAll('.wm-container');
    const instances: WidgetInstance[] = [];
    containers.forEach(c => {
        const el = c as HTMLElement;
        const config: Record<string, any> = {};
        Object.keys(el.dataset).forEach(key => {
            if (key.startsWith('cfg')) {
                const configKey = key.slice(3).toLowerCase(); // cfgFilter -> filter
                config[configKey] = el.dataset[key];
            }
        });
        instances.push({
            id: el.id,
            typeId: el.dataset.widgetType || el.id.replace('wm-c-', ''),
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
            width: el.offsetWidth,
            height: el.offsetHeight,
            collapsed: el.classList.contains('collapsed'),
            config,
        });
    });
    return instances;
}

// ─── Feed Health Indicators ─────────────────────────────────

// Map widget type → data source name in dataFreshness
const WIDGET_DATA_SOURCE: Record<string, string> = {
    'map': 'gdelt',
    'heatmap': 'fires',
    'news': 'news',
    'news-reuters': 'news',
    'news-ap': 'news',
    'news-aljazeera': 'news',
    'news-bbc': 'news',
    'news-dw': 'news',
    'telegram': 'telegram',
    'tg-all': 'telegram',
    'tg-ddgeopolitics': 'telegram',
    'tg-intelslava': 'telegram',
    'tg-mod-russia': 'telegram',
    'tg-zoka': 'telegram',
    'tg-nexta': 'telegram',
    'tg-liveukraine': 'telegram',
    'tokens': 'pumpfun',
    'markets': 'markets',
    'intel': 'markets',
    'gdelt': 'gdelt',
    'fires': 'fires',
    'seismic': 'seismic',
    'ai': '', // no data source
    'chat': '', // no data source
    'tv': '', // no data source
};

function initFeedHealthIndicators() {
    // Inject status dots into all widget headers
    function updateAllDots() {
        document.querySelectorAll('.wm-container').forEach(container => {
            const el = container as HTMLElement;
            const typeId = el.dataset.widgetType || '';
            const source = WIDGET_DATA_SOURCE[typeId];
            if (source === undefined || source === '') return; // skip widgets without data

            const header = el.querySelector('.wm-container-header');
            if (!header) return;

            // Find or create status dot
            let dot = header.querySelector('.wm-feed-dot') as HTMLElement;
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'wm-feed-dot';
                dot.title = 'Data freshness';
                // Insert after title
                const title = header.querySelector('.wm-c-title');
                if (title && title.nextSibling) {
                    header.insertBefore(dot, title.nextSibling);
                } else if (title) {
                    title.parentNode?.insertBefore(dot, title.nextSibling);
                }
            }

            const ts = dataFreshness[source];
            let statusClass = 'unknown';
            let footerText = `⟳ ${source}: waiting…`;

            if (!ts) {
                // Never loaded
                dot.dataset.status = 'unknown';
                dot.title = `${source}: waiting for data...`;
            } else {
                const ageSec = Math.floor((Date.now() - ts) / 1000);
                const label = getFreshnessLabel(source);
                if (ageSec < 120) {
                    dot.dataset.status = 'live';
                    dot.title = `${source}: live (${label} ago)`;
                    statusClass = 'live';
                    footerText = `⟳ Updated ${label} ago`;
                } else if (ageSec < 600) {
                    dot.dataset.status = 'stale';
                    dot.title = `${source}: ${label} ago`;
                    statusClass = 'stale';
                    footerText = `⟳ Updated ${label} ago`;
                } else {
                    dot.dataset.status = 'dead';
                    dot.title = `${source}: stale (${label} ago)`;
                    statusClass = 'dead';
                    footerText = `⚠ Stale — ${label} ago`;
                }
            }

            // Find or create freshness footer
            let footer = el.querySelector('.wm-feed-footer') as HTMLElement;
            if (!footer) {
                footer = document.createElement('div');
                footer.className = 'wm-feed-footer';
                el.appendChild(footer);
            }
            footer.textContent = footerText;
            footer.dataset.status = statusClass;
        });
    }

    // Initial run after data has had time to load
    setTimeout(updateAllDots, 5000);
    // Then update every 10 seconds
    setInterval(updateAllDots, 10_000);
}

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    // Global container listeners
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Detach button
        if (target.closest('.wm-c-detach')) {
            const container = target.closest('.wm-container') as HTMLElement;
            if (!container) return;

            // Get bounds for popup geometry
            const rect = container.getBoundingClientRect();
            const typeId = container.dataset.widgetType || '';

            // Pass configurations across via URL hash
            const configParams = new URLSearchParams();
            Object.keys(container.dataset).forEach(key => {
                if (key.startsWith('cfg')) {
                    configParams.append(key.slice(3).toLowerCase(), container.dataset[key]!);
                }
            });

            // Remove from canvas immediately
            container.remove();
            updateMinimap();

            // Build detached window URL
            const popupUrl = `/?detached=true&type=${typeId}&${configParams.toString()}`;
            window.open(popupUrl, `warmaps_detach_${typeId}_${Date.now()}`, `width=${rect.width},height=${rect.height + 40},left=${window.screenX + rect.left},top=${window.screenY + rect.top}`);
        }
    });

    // ─── Canvas Drag & Drop from Widget Tray ────────────────────
    const viewport = document.getElementById('wm-viewport');
    if (viewport) {
        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });
        viewport.addEventListener('drop', (e) => {
            e.preventDefault();
            const typeId = e.dataTransfer?.getData('text/plain');
            if (typeId && WIDGET_TYPES.find(w => w.id === typeId)) {
                addWidgetToCanvas(typeId, e.clientX, e.clientY);
            }
        });
    }

    // ─── Right-click Context Menu on Widgets ─────────────────────
    let contextMenu: HTMLElement | null = null;

    function removeContextMenu() {
        if (contextMenu) {
            contextMenu.remove();
            contextMenu = null;
        }
    }

    document.addEventListener('click', removeContextMenu);
    document.addEventListener('contextmenu', (e) => {
        const target = e.target as HTMLElement;
        const container = target.closest('.wm-container') as HTMLElement;
        if (!container) {
            removeContextMenu();
            return;
        }

        e.preventDefault();
        removeContextMenu();

        const typeId = container.dataset.widgetType || '';
        const wt = WIDGET_TYPES.find(w => w.id === typeId);

        contextMenu = document.createElement('div');
        contextMenu.className = 'wm-context-menu';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;

        const items = [
            { label: '⚙️ Configure', action: 'configure', show: !!(wt?.configFields?.length) },
            { label: '📋 Duplicate', action: 'duplicate', show: !!wt?.multi },
            { label: '⎘ Detach to Window', action: 'detach', show: true },
            { label: '─', action: 'separator', show: true },
            { label: '🗑 Remove', action: 'remove', show: true },
        ];

        items.filter(i => i.show).forEach(item => {
            if (item.action === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'wm-ctx-separator';
                contextMenu!.appendChild(sep);
                return;
            }
            const btn = document.createElement('button');
            btn.className = 'wm-ctx-item';
            btn.textContent = item.label;
            btn.addEventListener('click', () => {
                removeContextMenu();
                switch (item.action) {
                    case 'configure': {
                        // Click the gear button if it exists
                        const gear = container.querySelector('.wm-c-gear') as HTMLElement;
                        if (gear) gear.click();
                        break;
                    }
                    case 'duplicate': {
                        const rect = container.getBoundingClientRect();
                        addWidgetToCanvas(typeId, rect.right + 20, rect.top + 20);
                        break;
                    }
                    case 'detach': {
                        const detachBtn = container.querySelector('.wm-c-detach') as HTMLElement;
                        if (detachBtn) detachBtn.click();
                        break;
                    }
                    case 'remove': {
                        container.remove();
                        updateMinimap();
                        break;
                    }
                }
            });
            contextMenu!.appendChild(btn);
        });

        document.body.appendChild(contextMenu);

        // Keep menu in viewport
        requestAnimationFrame(() => {
            if (!contextMenu) return;
            const rect = contextMenu.getBoundingClientRect();
            if (rect.right > window.innerWidth) contextMenu.style.left = `${window.innerWidth - rect.width - 8}px`;
            if (rect.bottom > window.innerHeight) contextMenu.style.top = `${window.innerHeight - rect.height - 8}px`;
        });
    });

    measure('Mount WARMAPS', async (m) => {
        // ─── Detached Window Mode ──────────────────────────────────
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('detached') === 'true') {
            document.body.classList.add('is-detached');
            const typeId = urlParams.get('type');
            if (!typeId) return;

            // Hide topbar, ticker, minimap, etc.
            const hideIds = ['top-bar', 'ticker', 'wm-minimap', 'shortcuts-overlay', 'widget-catalog', 'share-toast'];
            hideIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // Adjust viewport for fullscreen widget
            const vp = document.getElementById('wm-viewport');
            if (vp) {
                vp.style.top = '0';
                vp.style.height = '100vh';
                vp.style.background = 'var(--bg-primary)';
            }

            const content = document.getElementById('wm-content');
            if (content) {
                // Remove all default widgets
                content.innerHTML = '';
                content.style.width = '100%';
                content.style.height = '100%';
                content.style.transform = 'none';
                content.style.left = '0';
                content.style.top = '0';

                // Construct the requested widget
                const wt = WIDGET_TYPES.find(w => w.id === typeId);
                if (wt) {
                    const container = document.createElement('div');
                    container.id = `wm-c-${typeId}-detached`;
                    container.className = `wm-container detached-mode`;
                    container.dataset.widgetType = typeId;

                    // Pass configs back in
                    Array.from(urlParams.keys()).forEach(k => {
                        if (k !== 'detached' && k !== 'type') {
                            container.dataset['cfg' + k] = urlParams.get(k) || '';
                        }
                    });

                    container.style.cssText = `left:0px;top:0px;width:100%;height:100%;border-radius:0;border:none;box-shadow:none;background:var(--bg-primary)`;
                    container.innerHTML = `
                        <div class="wm-container-header" style="cursor:default;border-radius:0;">
                            <span class="wm-c-icon">${wt.icon}</span>
                            <span class="wm-c-title">${wt.name.toUpperCase()} (DETACHED)</span>
                            <div class="wm-c-actions">
                                <button onclick="window.close()" title="Close detached window" style="background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0 8px;">×</button>
                            </div>
                        </div>
                        <div class="wm-container-body" style="height:calc(100% - 32px)">
                            <div class="loading-state" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
                                <span class="spinner"></span>
                                <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Initializing ${wt.name}...</span>
                            </div>
                        </div>
                    `;
                    content.appendChild(container);
                }
            }

            // Only boot the necessary modules for data parsing
            measureSync('Boot sequence', () => initBootSequence());
            if (typeId === 'map') measureSync('Init map', () => initMap());
            if (typeId === 'tv') measureSync('TV channels', () => initTVChannels());
            if (['news', 'events', 'markets'].includes(typeId)) measureSync('Filters', () => initFilters());
            if (typeId === 'chat' || typeId === 'ai') measureSync('Chat', () => initChat());
            if (typeId === 'telegram') measureSync('Telegram', () => initTelegram());
            initAuth();

            // Re-render specifically this widget type
            setTimeout(() => {
                import('./lib/feeds').then(({ reRenderWidget }) => {
                    reRenderWidget(typeId);
                });
            }, 500);

            return; // Terminate normal canvas boot flow
        }

        // Apply saved configurations to DOM before anything else reads them
        measureSync('Load Configs', () => {
            const instances = loadInstances();

            // Reconstruct missing DOM elements for custom widgets/presets
            instances.forEach(inst => {
                let el = document.getElementById(inst.id);
                if (!el) {
                    const wt = WIDGET_TYPES.find(w => w.id === inst.typeId);
                    if (wt) {
                        const content = document.getElementById('wm-content');
                        if (content) {
                            const container = document.createElement('div');
                            container.id = inst.id;
                            container.className = `wm-container ${inst.collapsed ? 'collapsed' : ''}`;
                            container.dataset.widgetType = inst.typeId;
                            container.style.cssText = `left:${inst.x}px;top:${inst.y}px;width:${inst.width}px;height:${inst.height}px`;
                            container.innerHTML = `
                                <div class="wm-container-header">
                                    <span class="wm-c-icon">${wt.icon}</span>
                                    <span class="wm-c-title">${wt.name.toUpperCase()}</span>
                                    <div class="wm-c-actions">
                                        <button class="wm-c-link-handle wm-link-handle" title="Drag to link">🔗</button>
                                        <button class="wm-c-detach" title="Detach to new window">⎘</button>
                                        <button class="wm-c-remove" title="Remove widget">×</button>
                                    </div>
                                </div>
                                <div class="wm-container-body">
                                    <div class="loading-state" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
                                        <span class="spinner"></span>
                                        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Initializing ${wt.name}...</span>
                                    </div>
                                </div>
                            `;
                            content.appendChild(container);
                        }
                    }
                }
            });

            // Remove default widgets that are not in the current layout instance
            const currentContainers = Array.from(document.querySelectorAll('.wm-container'));
            currentContainers.forEach(el => {
                if (!instances.some(inst => inst.id === el.id)) {
                    el.remove();
                }
            });

            // Apply configurations to datasets
            instances.forEach(inst => {
                const el = document.getElementById(inst.id);
                if (el && inst.config) {
                    Object.keys(inst.config).forEach(k => {
                        el.dataset['cfg' + k] = inst.config[k];
                    });
                }
            });
        });

        measureSync('Boot sequence', () => initBootSequence());
        measureSync('Canvas engine', () => initCanvas());
        measureSync('Minimap', () => initMinimapClick());
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

        // Fit-all button
        document.getElementById('wm-fit-all')?.addEventListener('click', () => fitAllContainers());

        // ─── Widget Catalog & Presets ──────────────────────────
        initWidgetCatalog();
        initPresets();
        initLinks();

        // ─── Feed Health Indicators ─────────────────────────────
        initFeedHealthIndicators();

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
