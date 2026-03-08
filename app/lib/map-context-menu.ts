/**
 * map-context-menu.ts — Custom right-click context menu for MapLibre maps
 *
 * Features:
 *   - "Copy Coordinates" — copies lat/lng to clipboard
 *   - "What's Here?" — AI geospatial query for clicked location
 *   - "Drop Pin" — adds a temporary marker at coordinates
 *   - "Zoom Here" — flies to clicked location
 *   - "Post Geo-Pin" — on-chain spatial chat message via Solana memo
 */

import { mapInstances } from './map';
import type { GeoPin } from './geo-pins';

let menuEl: HTMLElement | null = null;
let activeMarkerEl: HTMLElement | null = null;

const MENU_ITEMS = [
    { icon: '📋', label: 'Copy Coordinates', action: 'copy' },
    { icon: '📍', label: 'Drop Pin', action: 'pin' },
    { icon: '🔍', label: 'Zoom Here', action: 'zoom' },
    { icon: '🤖', label: "What's Here?", action: 'ai' },
    { icon: '⛓️', label: 'Post Geo-Pin', action: 'geopin' },
    { icon: '📏', label: 'Measure Distance', action: 'ruler' },
] as const;

interface ClickContext {
    lat: number;
    lng: number;
    map: any;
    screenX: number;
    screenY: number;
}

let lastClick: ClickContext | null = null;

function createMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'wm-context-menu';
    menu.style.cssText = `
        position: fixed; z-index: 99999; min-width: 200px;
        background: rgba(16,16,24,0.96); border: 1px solid rgba(128,90,255,0.25);
        border-radius: 10px; padding: 6px 0; backdrop-filter: blur(16px);
        box-shadow: 0 12px 40px rgba(0,0,0,0.5); font-family: 'Inter', sans-serif;
        animation: wm-ctx-in 0.12s ease;
    `;

    for (const item of MENU_ITEMS) {
        const row = document.createElement('div');
        row.dataset.action = item.action;
        row.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            padding: 9px 16px; cursor: pointer; font-size: 13px;
            color: #ccc; transition: background 0.1s, color 0.1s;
        `;
        row.innerHTML = `<span style="font-size:15px">${item.icon}</span>${item.label}`;
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(128,90,255,0.15)'; row.style.color = '#fff'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'none'; row.style.color = '#ccc'; });
        row.addEventListener('click', () => handleAction(item.action));
        menu.appendChild(row);
    }

    // Coordinate preview at bottom
    const coords = document.createElement('div');
    coords.className = 'wm-ctx-coords';
    coords.style.cssText = `
        padding: 6px 16px; font-size: 10px; color: #666;
        font-family: 'JetBrains Mono', monospace; border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 4px;
    `;
    menu.appendChild(coords);

    return menu;
}

function showMenu(x: number, y: number, ctx: ClickContext) {
    hideMenu();
    lastClick = ctx;

    menuEl = createMenu();

    // Position — keep inside viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    document.body.appendChild(menuEl);

    // Adjust if overflowing
    const menuW = menuEl.offsetWidth;
    const menuH = menuEl.offsetHeight;
    if (left + menuW > vw - 8) left = vw - menuW - 8;
    if (top + menuH > vh - 8) top = vh - menuH - 8;

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;

    // Show coordinates
    const coordsEl = menuEl.querySelector('.wm-ctx-coords') as HTMLElement;
    if (coordsEl) {
        coordsEl.textContent = `${ctx.lat.toFixed(6)}, ${ctx.lng.toFixed(6)}`;
    }
}

function hideMenu() {
    if (menuEl) {
        menuEl.remove();
        menuEl = null;
    }
}

function handleAction(action: string) {
    if (!lastClick) return;
    const { lat, lng, map } = lastClick;

    switch (action) {
        case 'copy': {
            const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            navigator.clipboard.writeText(text).then(() => {
                showToast(`📋 Copied: ${text}`);
            });
            break;
        }

        case 'pin': {
            dropPin(lat, lng, map);
            break;
        }

        case 'zoom': {
            map.flyTo({ center: [lng, lat], zoom: 14, duration: 1500 });
            break;
        }

        case 'ai': {
            showToast(`🤖 Querying location ${lat.toFixed(4)}, ${lng.toFixed(4)}...`);
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
                .then(r => r.json())
                .then(data => {
                    const name = data.display_name || 'Unknown location';
                    showToast(`📍 ${name}`, 5000);
                })
                .catch(() => showToast('❌ Could not identify location'));
            break;
        }

        case 'geopin': {
            postGeoPin(lat, lng, map);
            break;
        }

        case 'ruler': {
            startRuler(lat, lng, map);
            break;
        }
    }

    hideMenu();
}

function dropPin(lat: number, lng: number, map: any) {
    // Remove previous pin
    if (activeMarkerEl) activeMarkerEl.remove();

    const pin = document.createElement('div');
    pin.className = 'wm-map-pin';
    pin.innerHTML = '📍';
    pin.style.cssText = `
        position: absolute; font-size: 28px; cursor: pointer;
        transform: translate(-50%, -100%); z-index: 10;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        animation: wm-pin-drop 0.3s ease;
        transition: opacity 0.3s;
    `;

    // Project lat/lng to pixel and place on map container
    const point = map.project([lng, lat]);
    pin.style.left = `${point.x}px`;
    pin.style.top = `${point.y}px`;

    const mapContainer = map.getContainer();
    mapContainer.appendChild(pin);
    activeMarkerEl = pin;

    // Update pin position on map move
    const updatePos = () => {
        const p = map.project([lng, lat]);
        pin.style.left = `${p.x}px`;
        pin.style.top = `${p.y}px`;
    };
    map.on('move', updatePos);

    // Click pin to remove
    pin.addEventListener('click', () => {
        map.off('move', updatePos);
        pin.style.opacity = '0';
        setTimeout(() => pin.remove(), 300);
        activeMarkerEl = null;
    });

    showToast(`📍 Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)} (click pin to remove)`);
}

// ─── Ruler (Measure Distance) ───────────────────────────

let rulerState: { lat: number; lng: number; map: any; dotEl: HTMLElement; cleanup: () => void } | null = null;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startRuler(lat: number, lng: number, map: any) {
    // If first point — set it and wait for second
    if (!rulerState) {
        const dot = document.createElement('div');
        dot.style.cssText = `
            position: absolute; width: 10px; height: 10px; border-radius: 50%;
            background: #a78bfa; border: 2px solid #fff; z-index: 12;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 8px rgba(167,139,250,0.7);
        `;
        const p = map.project([lng, lat]);
        dot.style.left = `${p.x}px`;
        dot.style.top = `${p.y}px`;
        map.getContainer().appendChild(dot);

        const updateDot = () => {
            const pp = map.project([lng, lat]);
            dot.style.left = `${pp.x}px`;
            dot.style.top = `${pp.y}px`;
        };
        map.on('move', updateDot);

        rulerState = {
            lat, lng, map, dotEl: dot,
            cleanup: () => { map.off('move', updateDot); dot.remove(); }
        };

        showToast('📏 Point A set — right-click another location to measure');
        return;
    }

    // Second point — draw line and show distance
    const A = { lat: rulerState.lat, lng: rulerState.lng };
    const B = { lat, lng };
    const km = haversineKm(A.lat, A.lng, B.lat, B.lng);
    const mi = km * 0.621371;

    // SVG line overlay
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = `position: absolute; inset: 0; width: 100%; height: 100%; z-index: 11; pointer-events: none;`;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', '#a78bfa');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('stroke-opacity', '0.8');
    svg.appendChild(line);
    map.getContainer().appendChild(svg);

    // Second dot
    const dot2 = document.createElement('div');
    dot2.style.cssText = `
        position: absolute; width: 10px; height: 10px; border-radius: 50%;
        background: #a78bfa; border: 2px solid #fff; z-index: 12;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 8px rgba(167,139,250,0.7);
    `;
    map.getContainer().appendChild(dot2);

    // Distance label at midpoint
    const label = document.createElement('div');
    label.style.cssText = `
        position: absolute; z-index: 13; cursor: pointer;
        background: rgba(16,16,24,0.96); border: 1px solid rgba(167,139,250,0.4);
        border-radius: 8px; padding: 6px 12px; font-size: 12px; color: #e8e8f0;
        font-family: 'JetBrains Mono', monospace; backdrop-filter: blur(8px);
        transform: translate(-50%, -50%); box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        pointer-events: auto;
    `;
    label.innerHTML = `${km < 1 ? (km * 1000).toFixed(0) + ' m' : km.toFixed(2) + ' km'} <span style="color:#888">·</span> ${mi < 1 ? (mi * 5280).toFixed(0) + ' ft' : mi.toFixed(2) + ' mi'}`;
    label.title = 'Click to dismiss';
    map.getContainer().appendChild(label);

    const oldState = rulerState;

    const updateLine = () => {
        const pA = map.project([A.lng, A.lat]);
        const pB = map.project([B.lng, B.lat]);
        line.setAttribute('x1', String(pA.x));
        line.setAttribute('y1', String(pA.y));
        line.setAttribute('x2', String(pB.x));
        line.setAttribute('y2', String(pB.y));
        dot2.style.left = `${pB.x}px`;
        dot2.style.top = `${pB.y}px`;
        label.style.left = `${(pA.x + pB.x) / 2}px`;
        label.style.top = `${(pA.y + pB.y) / 2}px`;
        // Also update dot A
        const ppA = map.project([A.lng, A.lat]);
        oldState.dotEl.style.left = `${ppA.x}px`;
        oldState.dotEl.style.top = `${ppA.y}px`;
    };

    updateLine();
    map.on('move', updateLine);

    // Click label to dismiss everything
    label.addEventListener('click', () => {
        map.off('move', updateLine);
        oldState.cleanup();
        svg.remove();
        dot2.remove();
        label.remove();
    });

    rulerState = null;
    showToast(`📏 ${km.toFixed(2)} km (${mi.toFixed(2)} mi) — click label to dismiss`, 4000);
}

function showToast(message: string, duration = 3000) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(16,16,24,0.95); color: #fff; padding: 10px 20px;
        border-radius: 10px; font-size: 13px; font-family: 'Inter', sans-serif;
        z-index: 99999; pointer-events: none; backdrop-filter: blur(12px);
        border: 1px solid rgba(128,90,255,0.2); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        animation: wm-ctx-in 0.15s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Geo-Pin (on-chain) ──────────────────────────────────

async function postGeoPin(lat: number, lng: number, map: any) {
    const phantom = (window as any).solana;
    if (!phantom?.isPhantom) {
        showToast('❌ Phantom wallet not found — install at phantom.app');
        return;
    }

    const message = prompt('💬 Write a message for this location (280 chars max):');
    if (!message?.trim()) return;

    showToast('⛓️ Signing transaction via Phantom...');

    try {
        const { createGeoPin } = await import('./geo-pins');
        const result = await createGeoPin(lat, lng, message.trim());

        if ('error' in result) {
            showToast(`❌ ${result.error}`);
            return;
        }

        // Record on server
        await fetch('/api/geo-pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                signature: result.signature,
                sender: phantom.publicKey.toString(),
                lat, lng,
                message: message.trim(),
            }),
        });

        // Render the pin on the map
        renderGeoPin({
            signature: result.signature,
            sender: phantom.publicKey.toString(),
            lat, lng,
            message: message.trim(),
            timestamp: Date.now(),
        }, map);

        showToast(`✅ Geo-Pin posted on-chain! tx: ${result.signature.substring(0, 8)}...`, 5000);
    } catch (err: any) {
        showToast(`❌ ${err.message || 'Transaction failed'}`);
    }
}

function renderGeoPin(pin: GeoPin, map: any) {
    const el = document.createElement('div');
    el.className = 'wm-geo-pin';
    el.innerHTML = '💬';
    el.style.cssText = `
        position: absolute; font-size: 22px; cursor: pointer;
        transform: translate(-50%, -100%); z-index: 11;
        filter: drop-shadow(0 2px 6px rgba(128,90,255,0.6));
        animation: wm-pin-drop 0.3s ease;
    `;

    const point = map.project([pin.lng, pin.lat]);
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;

    // Tooltip on hover
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%);
        background: rgba(16,16,24,0.96); border: 1px solid rgba(128,90,255,0.3);
        border-radius: 8px; padding: 8px 12px; min-width: 160px; max-width: 260px;
        font-size: 12px; color: #ccc; font-family: 'Inter', sans-serif;
        pointer-events: none; opacity: 0; transition: opacity 0.15s;
        backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    `;
    const sender = pin.sender.substring(0, 4) + '...' + pin.sender.substring(pin.sender.length - 4);
    const time = new Date(pin.timestamp).toLocaleTimeString();
    tooltip.innerHTML = `<div style="color:#a78bfa;font-weight:600;margin-bottom:2px">${sender}</div>${pin.message}<div style="color:#666;font-size:10px;margin-top:4px">${time} · <a href="https://solscan.io/tx/${pin.signature}" target="_blank" style="color:#7c3aed">view tx</a></div>`;
    el.appendChild(tooltip);

    el.addEventListener('mouseenter', () => { tooltip.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

    map.getContainer().appendChild(el);

    // Track position
    const updatePos = () => {
        const p = map.project([pin.lng, pin.lat]);
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
    };
    map.on('move', updatePos);
}

// ─── Load existing geo-pins from server ──────────────────

async function loadGeoPins(map: any) {
    try {
        const res = await fetch('/api/geo-pins');
        const data = await res.json();
        if (data.pins?.length) {
            for (const pin of data.pins) {
                renderGeoPin(pin, map);
            }
        }
    } catch { }
}

// ─── CSS Animations (injected once) ──────────────────────

let cssInjected = false;
function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
        @keyframes wm-ctx-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes wm-pin-drop {
            from { transform: translate(-50%, -150%) scale(1.3); opacity: 0.5; }
            to { transform: translate(-50%, -100%) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ─── Init ────────────────────────────────────────────────

export function initMapContextMenu() {
    injectCSS();

    // Close on any click outside
    document.addEventListener('click', (e) => {
        if (menuEl && !menuEl.contains(e.target as Node)) hideMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideMenu();
    });

    // Attach to all map instances — poll for new ones
    const attached = new WeakSet();

    function attachToMaps() {
        for (const map of mapInstances) {
            if (attached.has(map)) continue;
            attached.add(map);

            // Load existing geo-pins onto this map
            loadGeoPins(map);

            map.on('contextmenu', (e: any) => {
                e.preventDefault();
                const { lat, lng } = e.lngLat;
                const { x, y } = e.originalEvent || e.point;

                // Convert map-relative coords to screen coords
                const rect = map.getContainer().getBoundingClientRect();
                const screenX = rect.left + (e.point?.x ?? x);
                const screenY = rect.top + (e.point?.y ?? y);

                showMenu(screenX, screenY, { lat, lng, map, screenX, screenY });
            });
        }
    }

    // Attach immediately and re-check periodically (maps are lazy-loaded)
    attachToMaps();
    setInterval(attachToMaps, 3000);
}
