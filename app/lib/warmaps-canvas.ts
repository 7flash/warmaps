/**
 * warmaps-canvas.ts — GalaxyDraw adapter for WARMAPS
 *
 * Thin orchestrator (~340 lines) that wires together:
 *   - canvas-layout.ts    (minimap, fit, arrange)
 *   - container-drag.ts   (mouse + touch drag)
 *   - snap-guidelines.ts  (SVG alignment guides)
 *   - keyboard-shortcuts.ts (F/A/R/0/?/Esc)
 *   - command-palette.ts  (Ctrl+K launcher)
 *
 * This file owns: plugin definition, layout persistence,
 * container collapse/resize, and init wiring.
 */

import { GalaxyDraw } from 'galaxydraw';
import type { CardPlugin, CardData } from 'galaxydraw';

// ─── Module state ───────────────────────────────────────

let _gd: GalaxyDraw | null = null;

export interface CanvasState {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

export function getCanvasState(): CanvasState {
    if (!_gd) return { zoom: 1, offsetX: 0, offsetY: 0 };
    const s = _gd.state.snapshot();
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
    z?: number;
}

function saveLayout() {
    if (!_gd) return;
    const containers = document.querySelectorAll('.wm-container');
    const layouts: ContainerLayout[] = [];

    containers.forEach((el) => {
        const c = el as HTMLElement;
        const zStr = c.style.zIndex;
        layouts.push({
            id: c.id,
            x: parseFloat(c.style.left) || 0,
            y: parseFloat(c.style.top) || 0,
            w: c.offsetWidth,
            h: c.offsetHeight,
            collapsed: c.classList.contains('collapsed'),
            z: zStr ? parseInt(zStr, 10) : undefined
        });
    });

    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));

    // Also save canvas pan/zoom state
    const s = _gd.state.snapshot();
    localStorage.setItem(CANVAS_STATE_KEY, JSON.stringify({
        zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY
    }));
}

function restoreLayout() {
    const data = localStorage.getItem(LAYOUT_KEY);
    if (!data) return;

    try {
        const layouts: ContainerLayout[] = JSON.parse(data);
        let maxZ = 10;
        layouts.forEach(layout => {
            const el = document.getElementById(layout.id) as HTMLElement;
            if (!el) return;
            el.style.left = `${layout.x}px`;
            el.style.top = `${layout.y}px`;
            if (layout.w) el.style.width = `${layout.w}px`;
            if (layout.h) el.style.height = `${layout.h}px`;
            if (layout.collapsed) el.classList.add('collapsed');
            if (layout.z !== undefined) {
                el.style.zIndex = String(layout.z);
                if (layout.z > maxZ) maxZ = layout.z;
            }
        });
        setTopZIndex(maxZ);
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

// ─── Container resize (delegated to container-resize.ts) ─

import { initContainerResize as _initContainerResize } from './container-resize';

function initContainerResize() {
    _initContainerResize({ getCanvasState, saveLayout });
}

// ─── Layout operations (delegated to canvas-layout.ts) ──

import {
    updateMinimap as _updateMinimap,
    initMinimapClick as _initMinimapClick,
    fitAllContainers as _fitAllContainers,
    autoArrangeContainers as _autoArrangeContainers,
} from './canvas-layout';
import type { CanvasAccessor } from './canvas-layout';

function _getCanvasAccessor(): CanvasAccessor | null {
    if (!_gd) return null;
    return {
        getState: () => getCanvasState(),
        getViewport: () => _gd!.getViewport(),
        setState: (z, x, y) => _gd!.state.set(z, x, y),
    };
}

export function updateMinimap() {
    _updateMinimap(_getCanvasAccessor());
}

export function initMinimapClick() {
    _initMinimapClick(_getCanvasAccessor(), updateMinimap);
}

export function fitAllContainers() {
    _fitAllContainers(_getCanvasAccessor(), updateMinimap);
}

export function autoArrangeContainers() {
    _autoArrangeContainers(saveLayout, updateMinimap, fitAllContainers);
}

// ─── Snap Guidelines (delegated to snap-guidelines.ts) ──

import {
    GRID_SIZE,
    clearSnapGuides,
    snapToGuides as _snapToGuides,
} from './snap-guidelines';

function snapToGuides(dragged: HTMLElement, x: number, y: number): { x: number; y: number } {
    return _snapToGuides(_gd?.getCanvas() ?? null, dragged, x, y);
}

// ─── Container drag (delegated to container-drag.ts) ────

import {
    initContainerDrag as _initContainerDrag,
    bringToFront,
    setTopZIndex
} from './container-drag';

function initContainerDrag() {
    if (!_gd) return;
    _initContainerDrag({
        getState: () => getCanvasState(),
        getViewport: () => _gd!.getViewport(),
        snapToGuides,
        clearSnapGuides,
        updateMinimap,
        saveLayout,
        gridSize: GRID_SIZE,
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
        containers.forEach((el) => {
            const c = el as HTMLElement;
            // Stamp card type so GalaxyDraw engine routes events through the plugin
            c.dataset.cardType = WARMAPS_CARD_TYPE;
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
            const s = _gd!.state.snapshot();
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

// ─── Keyboard Shortcuts (delegated to keyboard-shortcuts.ts) ──

import { initKeyboardShortcuts as _initShortcuts } from './keyboard-shortcuts';

function initKeyboardShortcuts() {
    _initShortcuts({
        fitAll: fitAllContainers,
        arrange: autoArrangeContainers,
        resetZoom: () => {
            if (_gd) {
                const s = _gd.state.snapshot();
                _gd.state.set(1, s.offsetX, s.offsetY);
            }
        },
        resetToOrigin: () => {
            if (_gd) _gd.state.set(1, 0, 0);
        },
    });
}

// ─── Command Palette (delegated to command-palette.ts) ──

import { registerCanvasActions } from './command-palette';

// Register canvas actions — called once after initCanvas
function _registerPaletteActions() {
    registerCanvasActions({
        fitAll: () => fitAllContainers(),
        arrange: () => autoArrangeContainers(),
        resetZoom: () => { if (_gd) { const s = _gd.state.snapshot(); _gd.state.set(1, s.offsetX, s.offsetY); } },
        resetAll: () => { if (_gd) _gd.state.set(1, 0, 0); },
    });
}

// Register palette actions after canvas is ready
_registerPaletteActions();

// ─── Bring to front (re-exported from container-drag.ts) ──
// bringToFront is already imported above — re-export it
export { bringToFront };

// ─── Update transform (compatibility shim) ──────────────

export function updateTransform() {
    // No-op: GalaxyDraw handles transforms automatically via state.subscribe()
}
