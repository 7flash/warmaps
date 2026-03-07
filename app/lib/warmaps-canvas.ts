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
            // Container header drag is handled by our initContainerDrag
            if (target.closest('.wm-container-header')) {
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

// ─── Container bounds helper ────────────────────────────

interface ContainerBounds {
    minX: number; minY: number;
    maxX: number; maxY: number;
    worldW: number; worldH: number;
}

function getContainerBounds(padding = 0): ContainerBounds | null {
    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return null;
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
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    return { minX, minY, maxX, maxY, worldW: maxX - minX || 1, worldH: maxY - minY || 1 };
}

// ─── Minimap ────────────────────────────────────────────

export function updateMinimap() {
    if (!_gd) return;
    const minimap = document.getElementById('wm-minimap');
    const minimapDots = document.getElementById('wm-minimap-content');
    const minimapVp = document.getElementById('wm-minimap-vp');
    if (!minimap || !minimapDots || !minimapVp) return;

    const bounds = getContainerBounds(100);
    if (!bounds) return;
    const { minX, minY, worldW, worldH } = bounds;

    const containers = document.querySelectorAll('.wm-container');
    const mapW = minimap.clientWidth || 180;
    const mapH = minimap.clientHeight || 120;
    const scale = Math.min(mapW / worldW, mapH / worldH);

    // Render dots
    let dots = '';
    containers.forEach((c: HTMLElement) => {
        const x = parseFloat(c.style.left) || 0;
        const y = parseFloat(c.style.top) || 0;
        const w = c.offsetWidth || 300;
        const h = c.offsetHeight || 200;
        const mx = ((x - minX) * scale);
        const my = ((y - minY) * scale);
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

// ─── Minimap click navigation ───────────────────────────

export function initMinimapClick() {
    const minimap = document.getElementById('wm-minimap');
    if (!minimap || !_gd) return;

    minimap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const bounds = getContainerBounds(200);
        if (!bounds) return;
        const { minX, minY, worldW, worldH } = bounds;

        const mmRect = minimap.getBoundingClientRect();
        const scale = Math.min(mmRect.width / worldW, mmRect.height / worldH);

        const clickX = (e.clientX - mmRect.left) / scale + minX;
        const clickY = (e.clientY - mmRect.top) / scale + minY;

        const state = getCanvasState();
        const viewport = _gd!.getViewport();
        const vpRect = viewport.getBoundingClientRect();
        const newOffsetX = -(clickX - vpRect.width / (2 * state.zoom)) * state.zoom;
        const newOffsetY = -(clickY - vpRect.height / (2 * state.zoom)) * state.zoom;

        _gd!.state.set(state.zoom, newOffsetX, newOffsetY);
        updateMinimap();
    });
}

// ─── Fit all containers ─────────────────────────────────

export function fitAllContainers() {
    if (!_gd) return;
    const bounds = getContainerBounds();
    if (!bounds) return;
    const { minX, minY, worldW, worldH } = bounds;
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

// ─── Snap Guidelines ────────────────────────────────────
const SNAP_THRESHOLD = 8; // world pixels
const GRID_SIZE = 20;

let snapGuideOverlay: SVGElement | null = null;

function getOrCreateSnapOverlay(): SVGElement {
    if (snapGuideOverlay) return snapGuideOverlay;
    const canvas = _gd?.getCanvas();
    if (!canvas) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('snap-guide-overlay');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    canvas.appendChild(svg);
    snapGuideOverlay = svg;
    return svg;
}

function clearSnapGuides() {
    if (snapGuideOverlay) snapGuideOverlay.innerHTML = '';
}

function drawGuideLine(x1: number, y1: number, x2: number, y2: number) {
    const svg = getOrCreateSnapOverlay();
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', '#38bdf8');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4,3');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);
}

function snapToGuides(
    dragged: HTMLElement,
    x: number,
    y: number,
): { x: number; y: number } {
    clearSnapGuides();

    const dw = dragged.offsetWidth || 380;
    const dh = dragged.offsetHeight || 300;
    const dLeft = x, dRight = x + dw, dCenterX = x + dw / 2;
    const dTop = y, dBottom = y + dh, dCenterY = y + dh / 2;

    const containers = document.querySelectorAll('.wm-container');
    let snappedX = x, snappedY = y;

    const xEdges: { val: number }[] = [];
    const yEdges: { val: number }[] = [];

    containers.forEach(c => {
        const el = c as HTMLElement;
        if (el === dragged) return;
        const ex = parseFloat(el.style.left) || 0;
        const ey = parseFloat(el.style.top) || 0;
        const ew = el.offsetWidth || 380;
        const eh = el.offsetHeight || 300;
        xEdges.push({ val: ex }, { val: ex + ew }, { val: ex + ew / 2 });
        yEdges.push({ val: ey }, { val: ey + eh }, { val: ey + eh / 2 });
    });

    // X snap
    let bestDx = SNAP_THRESHOLD + 1, matchedXVal = 0;
    for (const { edge, offset } of [
        { edge: dLeft, offset: 0 }, { edge: dRight, offset: dw }, { edge: dCenterX, offset: dw / 2 },
    ]) {
        for (const t of xEdges) {
            const dist = Math.abs(edge - t.val);
            if (dist < bestDx) { bestDx = dist; snappedX = t.val - offset; matchedXVal = t.val; }
        }
    }
    if (bestDx <= SNAP_THRESHOLD) drawGuideLine(matchedXVal, -10000, matchedXVal, 10000);
    else snappedX = x;

    // Y snap
    let bestDy = SNAP_THRESHOLD + 1, matchedYVal = 0;
    for (const { edge, offset } of [
        { edge: dTop, offset: 0 }, { edge: dBottom, offset: dh }, { edge: dCenterY, offset: dh / 2 },
    ]) {
        for (const t of yEdges) {
            const dist = Math.abs(edge - t.val);
            if (dist < bestDy) { bestDy = dist; snappedY = t.val - offset; matchedYVal = t.val; }
        }
    }
    if (bestDy <= SNAP_THRESHOLD) drawGuideLine(-10000, matchedYVal, 10000, matchedYVal);
    else snappedY = y;

    return { x: snappedX, y: snappedY };
}

// ─── Container drag (header-based) ──────────────────────
// GalaxyDraw engine handles .gd-card drag, but WARMAPS containers are
// pre-rendered DOM elements (.wm-container). We handle their drag manually.

let _topZIndex = 10;

function initContainerDrag() {
    if (!_gd) return;
    const viewport = _gd.getViewport();

    let draggingContainer: HTMLElement | null = null;
    let containerDragOffsetX = 0;
    let containerDragOffsetY = 0;

    // ── Mouse drag ──
    viewport.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        const dragHandle = target.closest('.wm-container-header');
        if (!dragHandle || e.button !== 0) return;

        const container = dragHandle.closest('.wm-container') as HTMLElement;
        if (!container) return;

        // Bring to front
        _topZIndex++;
        container.style.zIndex = String(_topZIndex);

        draggingContainer = container;
        const state = getCanvasState();
        const rect = viewport.getBoundingClientRect();
        const cx = parseFloat(container.style.left) || 0;
        const cy = parseFloat(container.style.top) || 0;
        containerDragOffsetX = (e.clientX - rect.left - state.offsetX) / state.zoom - cx;
        containerDragOffsetY = (e.clientY - rect.top - state.offsetY) / state.zoom - cy;
        container.classList.add('dragging');
        e.preventDefault();
        e.stopPropagation(); // Prevent GalaxyDraw from starting a pan
    });

    window.addEventListener('mousemove', (e) => {
        if (!draggingContainer) return;
        const state = getCanvasState();
        const rect = viewport.getBoundingClientRect();
        let newX = (e.clientX - rect.left - state.offsetX) / state.zoom - containerDragOffsetX;
        let newY = (e.clientY - rect.top - state.offsetY) / state.zoom - containerDragOffsetY;

        // Snap to grid when Shift held, otherwise snap to guides
        if (e.shiftKey) {
            newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
            newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
            viewport.classList.add('snap-grid');
            clearSnapGuides();
        } else {
            viewport.classList.remove('snap-grid');
            const snapped = snapToGuides(draggingContainer, newX, newY);
            newX = snapped.x;
            newY = snapped.y;
        }

        draggingContainer.style.left = `${newX}px`;
        draggingContainer.style.top = `${newY}px`;
        updateMinimap();
    });

    window.addEventListener('mouseup', () => {
        if (!draggingContainer) return;
        draggingContainer.classList.remove('dragging');
        viewport.classList.remove('snap-grid');
        clearSnapGuides();
        saveLayout();
        draggingContainer = null;
    });

    // ── Touch drag ──
    let touchContainer: HTMLElement | null = null;
    let touchOffX = 0, touchOffY = 0;

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const target = touch.target as HTMLElement;
        const header = target.closest('.wm-container-header');
        if (!header) return;

        const container = header.closest('.wm-container') as HTMLElement;
        if (!container) return;

        _topZIndex++;
        container.style.zIndex = String(_topZIndex);
        touchContainer = container;

        const state = getCanvasState();
        const rect = viewport.getBoundingClientRect();
        const cx = parseFloat(container.style.left) || 0;
        const cy = parseFloat(container.style.top) || 0;
        touchOffX = (touch.clientX - rect.left - state.offsetX) / state.zoom - cx;
        touchOffY = (touch.clientY - rect.top - state.offsetY) / state.zoom - cy;
        e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        if (!touchContainer || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const state = getCanvasState();
        const rect = viewport.getBoundingClientRect();
        const worldX = (touch.clientX - rect.left - state.offsetX) / state.zoom;
        const worldY = (touch.clientY - rect.top - state.offsetY) / state.zoom;
        touchContainer.style.left = `${worldX - touchOffX}px`;
        touchContainer.style.top = `${worldY - touchOffY}px`;
        updateMinimap();
        e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
        if (touchContainer) {
            saveLayout();
            touchContainer = null;
        }
    });
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
    initContainerDrag();

    // Save layout on any pan/zoom state change (debounced via rAF)
    let saveRaf = 0;
    _gd.state.subscribe(() => {
        updateMinimap();
        // Save canvas pan/zoom state (debounced)
        cancelAnimationFrame(saveRaf);
        saveRaf = requestAnimationFrame(() => {
            const s = _gd!.state.getSnapshot();
            localStorage.setItem(CANVAS_STATE_KEY, JSON.stringify({
                zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY
            }));
        });
    });

    // Initial render
    updateMinimap();

    // ─── Keyboard shortcuts ─────────────────────────────
    initKeyboardShortcuts();
}

// ─── Keyboard Shortcuts ─────────────────────────────────

function initKeyboardShortcuts() {
    let helpVisible = false;

    window.addEventListener('keydown', (e) => {
        // Skip when typing in inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement)?.isContentEditable) return;

        switch (e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                fitAllContainers();
                break;

            case 'a':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    autoArrangeContainers();
                }
                break;

            case 'r':
                e.preventDefault();
                if (_gd) {
                    const s = _gd.state.getSnapshot();
                    _gd.state.set(1, s.offsetX, s.offsetY); // Reset zoom to 1:1
                }
                break;

            case '0':
                e.preventDefault();
                if (_gd) _gd.state.set(1, 0, 0); // Reset pan + zoom to origin
                break;

            case '?':
            case '/':
                if (e.key === '/' && !e.shiftKey) break; // Only ? (Shift+/)
                e.preventDefault();
                toggleShortcutHelp();
                break;

            case 'escape':
                // Close help overlay
                document.getElementById('wm-shortcut-help')?.remove();
                helpVisible = false;
                // Close country profile modal
                document.getElementById('country-profile-modal')?.remove();
                document.getElementById('country-profile-overlay')?.remove();
                // Close widget context menu
                document.querySelector('.wm-context-menu')?.remove();
                break;
        }
    });

    function toggleShortcutHelp() {
        const existing = document.getElementById('wm-shortcut-help');
        if (existing) {
            existing.remove();
            helpVisible = false;
            return;
        }
        helpVisible = true;

        const overlay = document.createElement('div');
        overlay.id = 'wm-shortcut-help';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
            animation: fadeIn 0.15s ease-out;
        `;
        overlay.onclick = (ev) => {
            if (ev.target === overlay) { overlay.remove(); helpVisible = false; }
        };

        overlay.innerHTML = `
            <div style="
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(100, 116, 139, 0.25);
                border-radius: 16px;
                padding: 28px 36px;
                max-width: 420px;
                color: #e2e8f0;
                font-family: var(--font-mono, 'SF Mono', monospace);
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            ">
                <div style="font-size: 14px; font-weight: 700; color: #22d3ee; margin-bottom: 16px; letter-spacing: 2px;">
                    ⌨ KEYBOARD SHORTCUTS
                </div>
                <div style="display: grid; grid-template-columns: 50px 1fr; gap: 8px 12px; font-size: 13px;">
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">F</kbd>
                    <span>Fit all containers to view</span>
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">A</kbd>
                    <span>Auto-arrange grid layout</span>
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">R</kbd>
                    <span>Reset zoom to 1:1</span>
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">0</kbd>
                    <span>Reset pan + zoom to origin</span>
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">?</kbd>
                    <span>Toggle this help</span>
                    <kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">Esc</kbd>
                    <span>Close overlays / menus</span>
                </div>
                <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(100,116,139,0.2); font-size: 11px; color: #64748b;">
                    <kbd style="background: rgba(51,65,85,0.4); padding: 1px 4px; border-radius: 3px; color: #94a3b8;">Shift</kbd>+drag → snap to grid  ·
                    <kbd style="background: rgba(51,65,85,0.4); padding: 1px 4px; border-radius: 3px; color: #94a3b8;">Scroll</kbd> → zoom  ·
                    <kbd style="background: rgba(51,65,85,0.4); padding: 1px 4px; border-radius: 3px; color: #94a3b8;">Drag</kbd> → pan  ·
                    <kbd style="background: rgba(51,65,85,0.4); padding: 1px 4px; border-radius: 3px; color: #94a3b8;">Dbl-click</kbd> header → collapse
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
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
