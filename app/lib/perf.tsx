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
    const measure = async () => {
        try {
            const t0 = performance.now();
            await fetch('/api/ping', { cache: 'no-store' });
            _pingMs = Math.round(performance.now() - t0);
        } catch { _pingMs = -1; }
    };
    measure();
    setInterval(measure, 30_000);
}

export function updatePerfDisplay() {
    const el = document.getElementById('perf-hud');
    if (!el) return;
    const fpsColor = _fps >= 100 ? 'var(--accent)' : _fps >= 60 ? 'var(--amber)' : '#ef4444';
    const pingColor = _pingMs < 100 ? 'var(--accent)' : _pingMs < 300 ? 'var(--amber)' : '#ef4444';
    render(
        <>
        <span style={{ color: fpsColor }}> { _fps } FPS </span>
{ ' · ' }
<span style={ { color: pingColor } }> { _pingMs >= 0 ? _pingMs + 'ms' : '—'}</span>
    </>,
el
    );
}
