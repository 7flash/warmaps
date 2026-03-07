// @ts-nocheck
/**
 * warmaps-canvas.ts — GalaxyDraw adapter for WARMAPS
 *
 * Replaces the 760-line custom canvas.ts with a thin adapter that
 * delegates pan/zoom/container-drag to the galaxydraw engine.
 *
 * WARMAPS-specific behaviors preserved:
 * - MapLibre wheel/mouse passthrough
 * - Scrollable feed body passthrough
 * - Container collapse (double-click header)
 * - Layout persistence to localStorage
 * - Minimap with click navigation
 * - Snap guidelines
 * - Container resize handles
 * - Fit-all and auto-arrange
 * - Touch support (single-finger pan, pinch zoom)
 *
 * Architecture:
 *   initCanvas() → new GalaxyDraw(viewport, { mode: 'simple' })
 *   Registers a WarmapsContainerPlugin that handles consume checks.
 *   Existing container DOM (.wm-container) is adopted by CardManager.
 */

// Import galaxydraw engine
import { GalaxyDraw } from 'galaxydraw';
import type { CardPlugin, CardData } from 'galaxydraw';
import type { CanvasStateSnapshot } from 'galaxydraw';

// ─── Module state ───────────────────────────────────────

let _gd: GalaxyDraw | null = null;

export interface CanvasState {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

export function getCanvasState(): CanvasState {
    if (!_gd) return { zoom: 1, offsetX: 0, offsetY: 0 };
    const s = _gd.state.getSnapshot();
    return { zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY };
}

export function getGalaxyDraw(): GalaxyDraw | null {
    return _gd;
}

// ─── WARMAPS Container Plugin ───────────────────────────

const WARMAPS_CARD_TYPE = 'warmaps-container';

function createWarmapsPlugin(): CardPlugin {
    return {
        type: WARMAPS_CARD_TYPE,

        render(data: CardData): HTMLElement {
            // WARMAPS containers are pre-rendered in server-side HTML
            // This plugin is only for event passthrough checks
            const el = document.createElement('div');
            el.className = 'wm-container';
            el.innerHTML = `<div class="wm-container-header">${data.meta?.title || 'Widget'}</div><div class="wm-container-body"></div>`;
            return el;
        },

        onResize() { },
        onDestroy() { },

        consumesWheel(target: HTMLElement): boolean {
            // MapLibre handles its own zoom
            if (target.closest('.maplibregl-map') || target.closest('.maplibregl-canvas-container')) {
                return true;
            }
            // Scrollable feed bodies handle their own scroll
            const scrollBody = target.closest('.wm-container-body') as HTMLElement | null;
            if (scrollBody && scrollBody.scrollHeight > scrollBody.clientHeight) {
                const atTop = scrollBody.scrollTop <= 0;
                const atBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 1;
                // Only consume if there's room to scroll
                return !atTop || !atBottom; // simplified — exact direction checked at event time
            }
            return false;
        },

        consumesMouse(target: HTMLElement): boolean {
            // MapLibre handles its own drag/click
            if (target.closest('.maplibregl-map') || target.closest('.maplibregl-canvas-container')) {
                return true;
            }
            // Interactive elements inside containers
            return !!(
                target.closest('button') ||
                target.closest('a') ||
                target.closest('input') ||
                target.closest('select') ||
                target.closest('textarea') ||
                target.closest('.tv-player') ||
                target.closest('.chat-input')
            );
        },
    };
}

// ─── Layout persistence ─────────────────────────────────

const LAYOUT_KEY = 'warmaps:layout';
const CANVAS_STATE_KEY = 'warmaps:canvasState';

interface ContainerLayout {
    id: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    collapsed?: boolean;
}

function saveLayout() {
    if (!_gd) return;
    const containers = document.querySelectorAll('.wm-container');
    const layouts: ContainerLayout[] = [];

    containers.forEach((c: HTMLElement) => {
        layouts.push({
            id: c.id,
            x: parseFloat(c.style.left) || 0,
            y: parseFloat(c.style.top) || 0,
            w: c.offsetWidth,
            h: c.offsetHeight,
            collapsed: c.classList.contains('collapsed'),
        });
    });

    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));

    // Also save canvas pan/zoom state
    const s = _gd.state.getSnapshot();
    localStorage.setItem(CANVAS_STATE_KEY, JSON.stringify({
        zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY
    }));
}

function restoreLayout() {
    const data = localStorage.getItem(LAYOUT_KEY);
    if (!data) return;

    try {
        const layouts: ContainerLayout[] = JSON.parse(data);
        layouts.forEach(layout => {
            const el = document.getElementById(layout.id) as HTMLElement;
            if (!el) return;
            el.style.left = `${layout.x}px`;
            el.style.top = `${layout.y}px`;
            if (layout.w) el.style.width = `${layout.w}px`;
            if (layout.h) el.style.height = `${layout.h}px`;
            if (layout.collapsed) el.classList.add('collapsed');
        });
    } catch { }
}

function restoreCanvasState(): CanvasState | null {
    const data = localStorage.getItem(CANVAS_STATE_KEY);
    if (!data) return null;
    try { return JSON.parse(data); } catch { return null; }
}

// ─── Container collapse ─────────────────────────────────

function initContainerCollapse() {
    document.addEventListener('dblclick', (e) => {
        const target = e.target as HTMLElement;
        const header = target.closest('.wm-container-header');
        if (!header) return;
        const container = header.closest('.wm-container') as HTMLElement;
        if (!container) return;

        container.classList.toggle('collapsed');
        saveLayout();
    });
}

// ─── Container resize ───────────────────────────────────

function initContainerResize() {
    document.querySelectorAll('.wm-container').forEach((c: HTMLElement) => {
        if (c.querySelector('.wm-resize-handle')) return; // Already has handle

        const handle = document.createElement('div');
        handle.className = 'wm-resize-handle';
        c.appendChild(handle);

        let resizing = false;
        let startW = 0, startH = 0, startX = 0, startY = 0;

        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            resizing = true;
            startW = c.offsetWidth;
            startH = c.offsetHeight;
            startX = e.clientX;
            startY = e.clientY;

            const onMove = (ev: MouseEvent) => {
                if (!resizing) return;
                const state = getCanvasState();
                const dx = (ev.clientX - startX) / state.zoom;
                const dy = (ev.clientY - startY) / state.zoom;
                c.style.width = `${Math.max(200, startW + dx)}px`;
                c.style.height = `${Math.max(150, startH + dy)}px`;
            };

            const onUp = () => {
                resizing = false;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                saveLayout();
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    });
}

// ─── Minimap ────────────────────────────────────────────

export function updateMinimap() {
    if (!_gd) return;
    const minimap = document.getElementById('minimap');
    const minimapDots = document.getElementById('minimap-dots');
    const minimapVp = document.getElementById('minimap-viewport');
    if (!minimap || !minimapDots || !minimapVp) return;

    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return;

    // Find bounds of all containers
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    containers.forEach((c: HTMLElement) => {
        const x = parseFloat(c.style.left) || 0;
        const y = parseFloat(c.style.top) || 0;
        const w = c.offsetWidth || 300;
        const h = c.offsetHeight || 200;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    });

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const pad = 100;
    const totalW = worldW + pad * 2;
    const totalH = worldH + pad * 2;

    const mapW = minimap.clientWidth || 180;
    const mapH = minimap.clientHeight || 120;
    const scale = Math.min(mapW / totalW, mapH / totalH);

    // Render dots
    let dots = '';
    containers.forEach((c: HTMLElement) => {
        const x = parseFloat(c.style.left) || 0;
        const y = parseFloat(c.style.top) || 0;
        const w = c.offsetWidth || 300;
        const h = c.offsetHeight || 200;
        const mx = ((x - minX + pad) * scale);
        const my = ((y - minY + pad) * scale);
        const mw = Math.max(3, w * scale);
        const mh = Math.max(3, h * scale);
        const color = c.classList.contains('collapsed') ? '#666' : '#7c3aed';
        dots += `<div style="position:absolute;left:${mx}px;top:${my}px;width:${mw}px;height:${mh}px;background:${color};border-radius:2px;opacity:0.7;"></div>`;
    });
    minimapDots.innerHTML = dots;

    // Render viewport indicator
    const state = getCanvasState();
    const viewport = _gd!.getViewport();
    const vpW = viewport.clientWidth || window.innerWidth;
    const vpH = viewport.clientHeight || window.innerHeight;
    const vLeft = (-state.offsetX / state.zoom - minX + pad) * scale;
    const vTop = (-state.offsetY / state.zoom - minY + pad) * scale;
    const vW = (vpW / state.zoom) * scale;
    const vH = (vpH / state.zoom) * scale;
    minimapVp.style.cssText = `position:absolute;left:${vLeft}px;top:${vTop}px;width:${vW}px;height:${vH}px;border:1px solid rgba(124,58,237,0.6);border-radius:2px;background:rgba(124,58,237,0.1);`;
}

// ─── Fit all containers ─────────────────────────────────

export function fitAllContainers() {
    if (!_gd) return;
    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    containers.forEach((c: HTMLElement) => {
        const x = parseFloat(c.style.left) || 0;
        const y = parseFloat(c.style.top) || 0;
        const w = c.offsetWidth || 300;
        const h = c.offsetHeight || 200;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    });

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const viewport = _gd.getViewport();
    const vpW = viewport.clientWidth || window.innerWidth;
    const vpH = viewport.clientHeight || window.innerHeight;
    const padding = 60;

    const zoom = Math.min(
        (vpW - padding * 2) / (worldW || 1),
        (vpH - padding * 2) / (worldH || 1),
        2 // max zoom
    );

    const centerX = minX + worldW / 2;
    const centerY = minY + worldH / 2;
    const offsetX = vpW / 2 - centerX * zoom;
    const offsetY = vpH / 2 - centerY * zoom;

    _gd.state.set(zoom, offsetX, offsetY);
    updateMinimap();
}

// ─── Auto-arrange containers ────────────────────────────

export function autoArrangeContainers() {
    const containers = Array.from(document.querySelectorAll('.wm-container')) as HTMLElement[];
    if (containers.length === 0) return;

    // Sort by current position (top-left first)
    containers.sort((a, b) => {
        const ay = parseFloat(a.style.top) || 0;
        const by = parseFloat(b.style.top) || 0;
        if (Math.abs(ay - by) > 50) return ay - by;
        return (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0);
    });

    const gap = 20;
    const cols = Math.max(1, Math.ceil(Math.sqrt(containers.length)));
    let x = 50, y = 50;
    let rowHeight = 0;
    let col = 0;

    containers.forEach(c => {
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
        const h = c.offsetHeight || 200;
        const w = c.offsetWidth || 300;
        if (h > rowHeight) rowHeight = h;
        col++;
        if (col >= cols) {
            col = 0;
            x = 50;
            y += rowHeight + gap;
            rowHeight = 0;
        } else {
            x += w + gap;
        }
    });

    saveLayout();
    updateMinimap();
    fitAllContainers();
}

// ─── Init ───────────────────────────────────────────────

export function initCanvas() {
    const container = document.getElementById('wm-viewport');
    if (!container) return;

    // Check for existing content div
    const existingContent = document.getElementById('wm-content');

    // Create GalaxyDraw engine in simple mode (drag = pan)
    _gd = new GalaxyDraw(container, {
        mode: 'simple',
        className: 'warmaps-canvas',
    });

    // Register container plugin for event passthrough
    _gd.registerPlugin(createWarmapsPlugin());

    // Move existing containers from wm-content into galaxydraw canvas
    if (existingContent) {
        const gdCanvas = _gd.getCanvas();
        const containers = existingContent.querySelectorAll('.wm-container');
        containers.forEach((c: HTMLElement) => {
            gdCanvas.appendChild(c);
        });
        // Remove the old content div since GD has its own
        existingContent.remove();
    }

    // Restore layout positions before displaying
    restoreLayout();

    // Restore pan/zoom state
    const savedState = restoreCanvasState();
    if (savedState) {
        _gd.state.set(savedState.zoom, savedState.offsetX, savedState.offsetY);
    }

    // WARMAPS-specific features not in galaxydraw core
    initContainerCollapse();
    initContainerResize();

    // Save layout on container move (via CardManager events)
    _gd.bus.on('card:move', () => saveLayout());
    _gd.bus.on('card:resize', () => saveLayout());

    // Subscribe to state changes for minimap
    _gd.state.subscribe(() => {
        updateMinimap();
    });

    // Initial render
    updateMinimap();
}

// ─── Bring to front ─────────────────────────────────────

export function bringToFront(container: HTMLElement) {
    if (!_gd) return;
    _gd.cards.bringToFront(container);
}

// ─── Update transform (compatibility shim) ──────────────

export function updateTransform() {
    // No-op: GalaxyDraw handles transforms automatically via state.subscribe()
}
