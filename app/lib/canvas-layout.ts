/**
 * canvas-layout.ts — Minimap, fit-all, auto-arrange, and bounds helpers
 *
 * All layout-aware operations that work with container positions
 * and the canvas viewport. Extracted from warmaps-canvas.ts.
 */

// ─── Types ──────────────────────────────────────────────

export interface ContainerBounds {
    minX: number; minY: number;
    maxX: number; maxY: number;
    worldW: number; worldH: number;
}

export interface CanvasAccessor {
    getState(): { zoom: number; offsetX: number; offsetY: number };
    getViewport(): HTMLElement;
    setState(zoom: number, offsetX: number, offsetY: number): void;
}

// ─── Container bounds ───────────────────────────────────

export function getContainerBounds(padding = 0): ContainerBounds | null {
    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    containers.forEach((el) => {
        const c = el as HTMLElement;
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

export function updateMinimap(canvas: CanvasAccessor | null) {
    if (!canvas) return;
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
    const pad = 100;
    containers.forEach((el) => {
        const c = el as HTMLElement;
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
    const state = canvas.getState();
    const viewport = canvas.getViewport();
    const vpW = viewport.clientWidth || window.innerWidth;
    const vpH = viewport.clientHeight || window.innerHeight;
    const vLeft = (-state.offsetX / state.zoom - minX + pad) * scale;
    const vTop = (-state.offsetY / state.zoom - minY + pad) * scale;
    const vW = (vpW / state.zoom) * scale;
    const vH = (vpH / state.zoom) * scale;
    minimapVp.style.cssText = `position:absolute;left:${vLeft}px;top:${vTop}px;width:${vW}px;height:${vH}px;border:1px solid rgba(124,58,237,0.6);border-radius:2px;background:rgba(124,58,237,0.1);`;
}

// ─── Minimap click navigation ───────────────────────────

export function initMinimapClick(canvas: CanvasAccessor | null, onUpdate: () => void) {
    const minimap = document.getElementById('wm-minimap');
    if (!minimap || !canvas) return;

    minimap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const bounds = getContainerBounds(200);
        if (!bounds) return;
        const { minX, minY, worldW, worldH } = bounds;

        const mmRect = minimap.getBoundingClientRect();
        const scale = Math.min(mmRect.width / worldW, mmRect.height / worldH);

        const clickX = (e.clientX - mmRect.left) / scale + minX;
        const clickY = (e.clientY - mmRect.top) / scale + minY;

        const state = canvas.getState();
        const viewport = canvas.getViewport();
        const vpRect = viewport.getBoundingClientRect();
        const newOffsetX = -(clickX - vpRect.width / (2 * state.zoom)) * state.zoom;
        const newOffsetY = -(clickY - vpRect.height / (2 * state.zoom)) * state.zoom;

        canvas.setState(state.zoom, newOffsetX, newOffsetY);
        onUpdate();
    });
}

// ─── Fit all containers ─────────────────────────────────

export function fitAllContainers(canvas: CanvasAccessor | null, onUpdate: () => void) {
    if (!canvas) return;
    const bounds = getContainerBounds();
    if (!bounds) return;
    const { minX, minY, worldW, worldH } = bounds;
    const viewport = canvas.getViewport();
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

    canvas.setState(zoom, offsetX, offsetY);
    onUpdate();
}

// ─── Auto-arrange containers ────────────────────────────

export function autoArrangeContainers(
    saveLayout: () => void,
    onUpdate: () => void,
    onFitAll: () => void,
) {
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
    onUpdate();
    onFitAll();
}
