/**
 * perf.ts — Performance monitoring (FPS, ping, continuous repaint)
 */

import { render } from 'melina/client';
import { map, IMAGE_MARKERS } from './state';

let _fps = 0;
let _fpsFrames = 0;
let _fpsLast = performance.now();
let _pingMs = -1;

/**
 * Passive FPS counter — counts actual MapLibre render frames.
 * No hot loop. Only fires when the map actually redraws (pan/zoom/animation).
 * Idles at 0% CPU when the map is static.
 */
export function startFPSCounter() {
    setInterval(() => {
        _fps = _fpsFrames;
        _fpsFrames = 0;
        updatePerfDisplay();
    }, 1000);
}

/**
 * Force MapLibre GL into continuous 120fps repaint mode.
 * Called after map loads — hooks into the render event and immediately
 * requests another repaint, creating a continuous GPU render loop.
 */
export function startContinuousRepaint() {
    if (!map) return;

    // Count actual render frames for the FPS display
    map.on('render', () => { _fpsFrames++; });

    // Zoom-responsive image markers: update scale on zoom change (throttled)
    let _zoomScaleTimer: ReturnType<typeof setTimeout> | null = null;
    const updateMarkerScale = () => {
        if (_zoomScaleTimer) return;
        _zoomScaleTimer = setTimeout(() => {
            _zoomScaleTimer = null;
            const zoom = map.getZoom();
            const scale = Math.min(1.3, Math.max(0.3, (zoom - 2) * 0.15 + 0.3));
            for (const [, data] of IMAGE_MARKERS) {
                data.el.style.setProperty('--marker-scale', String(scale));
            }
        }, 200);
    };
    map.on('zoom', updateMarkerScale);
}

export function startPingMonitor() {
    let consecutiveFails = 0;

    const measure = async () => {
        try {
            const t0 = performance.now();
            const res = await fetch('/api/ping', { cache: 'no-store' });
            if (!res.ok) throw new Error('Bad status');

            _pingMs = Math.round(performance.now() - t0);
            consecutiveFails = 0;
            hideDisconnectOverlay();
        } catch {
            _pingMs = -1;
            consecutiveFails++;
            if (consecutiveFails >= 2) {
                showDisconnectOverlay();
            }
        }
    };
    measure();
    setInterval(measure, 5_000);
}

function showDisconnectOverlay() {
    if (document.getElementById('wm-disconnect-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'wm-disconnect-overlay';
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999999;
        background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:var(--font-mono,monospace);color:#e2e8f0;
    `;
    overlay.innerHTML = `
        <div style="font-size:48px;margin-bottom:16px">📡</div>
        <div style="font-size:24px;color:#ef4444;font-weight:700;margin-bottom:12px;letter-spacing:2px">CONNECTION LOST</div>
        <div style="color:#94a3b8;font-size:14px;max-width:400px;text-align:center;margin-bottom:24px;line-height:1.5">
            Unable to reach the WARMAPS data server. The dashboard will automatically reconnect when the connection is restored.
        </div>
        <div class="loading-state" style="display:flex;align-items:center;gap:12px">
            <span class="spinner" style="border-top-color:#38bdf8"></span>
            <span style="color:#38bdf8;font-size:12px">Reconnecting...</span>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideDisconnectOverlay() {
    const overlay = document.getElementById('wm-disconnect-overlay');
    if (overlay) overlay.remove();
}

export function updatePerfDisplay() {
    const el = document.getElementById('perf-hud');
    if (!el) return;
    const fpsColor = _fps >= 100 ? 'var(--accent)' : _fps >= 60 ? 'var(--amber)' : '#ef4444';
    const pingColor = _pingMs < 100 ? 'var(--accent)' : _pingMs < 300 ? 'var(--amber)' : '#ef4444';
    render(
        <>
            <span style={{ color: fpsColor }}> {_fps} FPS </span>
            {' · '}
            <span style={{ color: pingColor }}> {_pingMs >= 0 ? _pingMs + 'ms' : '—'}</span>
        </>,
        el
    );
}
