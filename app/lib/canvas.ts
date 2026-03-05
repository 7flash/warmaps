/**
 * canvas.ts — Canvas engine for WARMAPS
 * 
 * Provides pan/zoom/drag infrastructure for positioning
 * information containers on an infinite 2D canvas.
 */
import { measureSync } from './state';

const GRID_SIZE = 20;

// ─── Canvas State ───────────────────────────────────────
export interface CanvasState {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

let state: CanvasState = { zoom: 1, offsetX: 0, offsetY: 0 };
let viewport: HTMLElement | null = null;
let content: HTMLElement | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let spaceHeld = false;

// Container drag state 
let draggingContainer: HTMLElement | null = null;
let containerDragOffsetX = 0;
let containerDragOffsetY = 0;

// Z-order management
let topZIndex = 10;

export function getCanvasState(): CanvasState { return state; }

export function initCanvas() {
    viewport = document.getElementById('wm-viewport');
    content = document.getElementById('wm-content');
    if (!viewport || !content) return;

    // Restore saved positions
    restoreLayout();

    // ── Wheel zoom ──
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newZoom = Math.max(0.15, Math.min(3, state.zoom * zoomFactor));

        // Zoom toward cursor
        const rect = viewport!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - state.offsetX) / state.zoom;
        const worldY = (mouseY - state.offsetY) / state.zoom;

        state.zoom = newZoom;
        state.offsetX = mouseX - worldX * newZoom;
        state.offsetY = mouseY - worldY * newZoom;

        updateTransform();
        updateMinimap();
    }, { passive: false });

    // ── Pan on mousedown ──
    viewport.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;

        // If clicking a container drag handle, start container drag
        const dragHandle = target.closest('.wm-container-header');
        if (dragHandle && e.button === 0) {
            const container = dragHandle.closest('.wm-container') as HTMLElement;
            if (container) {
                // Bring to front
                bringToFront(container);
                draggingContainer = container;
                const cx = parseFloat(container.style.left) || 0;
                const cy = parseFloat(container.style.top) || 0;
                const rect = viewport!.getBoundingClientRect();
                containerDragOffsetX = (e.clientX - rect.left - state.offsetX) / state.zoom - cx;
                containerDragOffsetY = (e.clientY - rect.top - state.offsetY) / state.zoom - cy;
                container.classList.add('dragging');
                e.preventDefault();
                return;
            }
        }

        // Click on any container = bring to front
        const clickedContainer = target.closest('.wm-container') as HTMLElement;
        if (clickedContainer && e.button === 0) {
            bringToFront(clickedContainer);
        }

        // middle-click or space held = canvas pan
        if (e.button === 1 || spaceHeld) {
            isDragging = true;
            dragStartX = e.clientX - state.offsetX;
            dragStartY = e.clientY - state.offsetY;
            viewport!.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // Left click on empty canvas
        if (e.button === 0 && !target.closest('.wm-container')) {
            isDragging = true;
            dragStartX = e.clientX - state.offsetX;
            dragStartY = e.clientY - state.offsetY;
            viewport!.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (draggingContainer) {
            const rect = viewport!.getBoundingClientRect();
            let newX = (e.clientX - rect.left - state.offsetX) / state.zoom - containerDragOffsetX;
            let newY = (e.clientY - rect.top - state.offsetY) / state.zoom - containerDragOffsetY;
            // Snap to grid when Shift held
            if (e.shiftKey) {
                newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
                viewport!.classList.add('snap-grid');
            } else {
                viewport!.classList.remove('snap-grid');
            }
            draggingContainer.style.left = `${newX}px`;
            draggingContainer.style.top = `${newY}px`;
            updateMinimap();
            return;
        }
        if (isDragging) {
            state.offsetX = e.clientX - dragStartX;
            state.offsetY = e.clientY - dragStartY;
            updateTransform();
            updateMinimap();
        }
    });

    window.addEventListener('mouseup', () => {
        if (draggingContainer) {
            draggingContainer.classList.remove('dragging');
            viewport?.classList.remove('snap-grid');
            saveLayout();
            draggingContainer = null;
            return;
        }
        if (isDragging) {
            isDragging = false;
            if (viewport) viewport.style.cursor = '';
        }
    });

    // Space bar
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            spaceHeld = true;
            if (viewport) viewport.classList.add('space-panning');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            spaceHeld = false;
            if (viewport) viewport.classList.remove('space-panning');
            if (isDragging) {
                isDragging = false;
                if (viewport) viewport.style.cursor = '';
            }
        }
    });

    // ── Touch support (mobile) ──
    let touchStartX = 0, touchStartY = 0;
    let lastTouchDist = 0;
    let touchDraggingContainer: HTMLElement | null = null;
    let touchContainerOffX = 0, touchContainerOffY = 0;

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const target = touch.target as HTMLElement;

            // Container drag
            const header = target.closest('.wm-container-header');
            if (header) {
                const container = header.closest('.wm-container') as HTMLElement;
                if (container) {
                    bringToFront(container);
                    touchDraggingContainer = container;
                    const cx = parseFloat(container.style.left) || 0;
                    const cy = parseFloat(container.style.top) || 0;
                    const rect = viewport!.getBoundingClientRect();
                    touchContainerOffX = (touch.clientX - rect.left - state.offsetX) / state.zoom - cx;
                    touchContainerOffY = (touch.clientY - rect.top - state.offsetY) / state.zoom - cy;
                    e.preventDefault();
                    return;
                }
            }

            // Canvas pan
            if (!target.closest('.wm-container')) {
                touchStartX = touch.clientX - state.offsetX;
                touchStartY = touch.clientY - state.offsetY;
                isDragging = true;
                e.preventDefault();
            }
        } else if (e.touches.length === 2) {
            // Pinch zoom
            isDragging = false;
            touchDraggingContainer = null;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            e.preventDefault();
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        if (touchDraggingContainer && e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = viewport!.getBoundingClientRect();
            const worldX = (touch.clientX - rect.left - state.offsetX) / state.zoom;
            const worldY = (touch.clientY - rect.top - state.offsetY) / state.zoom;
            touchDraggingContainer.style.left = `${worldX - touchContainerOffX}px`;
            touchDraggingContainer.style.top = `${worldY - touchContainerOffY}px`;
            updateMinimap();
            e.preventDefault();
            return;
        }
        if (isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            state.offsetX = touch.clientX - touchStartX;
            state.offsetY = touch.clientY - touchStartY;
            updateTransform();
            updateMinimap();
            e.preventDefault();
        }
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastTouchDist > 0) {
                const ratio = dist / lastTouchDist;
                const newZoom = Math.max(0.15, Math.min(3, state.zoom * ratio));
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = viewport!.getBoundingClientRect();
                const mx = midX - rect.left;
                const my = midY - rect.top;
                const worldX = (mx - state.offsetX) / state.zoom;
                const worldY = (my - state.offsetY) / state.zoom;
                state.zoom = newZoom;
                state.offsetX = mx - worldX * newZoom;
                state.offsetY = my - worldY * newZoom;
                updateTransform();
                updateMinimap();
            }
            lastTouchDist = dist;
            e.preventDefault();
        }
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
        isDragging = false;
        if (touchDraggingContainer) {
            saveLayout();
            touchDraggingContainer = null;
        }
        lastTouchDist = 0;
    });

    // Initialize container resize handles
    initContainerResize();

    // Initialize container collapse (double-click header)
    initContainerCollapse();

    updateTransform();
    updateMinimap();
}

function updateTransform() {
    if (!content) return;
    content.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.zoom})`;
}

// ─── Z-order management ─────────────────────────────────
function bringToFront(container: HTMLElement) {
    topZIndex++;
    container.style.zIndex = String(topZIndex);
}

// ─── Container collapse ────────────────────────────────
function initContainerCollapse() {
    document.querySelectorAll('.wm-container-header').forEach((header) => {
        header.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const container = (header as HTMLElement).closest('.wm-container') as HTMLElement;
            if (!container) return;
            container.classList.toggle('collapsed');
            saveLayout();
            updateMinimap();
        });
    });
}

// ─── Layout persistence ─────────────────────────────────
interface ContainerLayout {
    id: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    collapsed?: boolean;
}

const LAYOUT_KEY = 'warmaps:layout';

function saveLayout() {
    const containers = document.querySelectorAll('.wm-container');
    const layouts: ContainerLayout[] = [];
    containers.forEach((c) => {
        const el = c as HTMLElement;
        layouts.push({
            id: el.id,
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
            w: el.offsetWidth,
            h: el.offsetHeight,
            collapsed: el.classList.contains('collapsed'),
        });
    });
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
}

function restoreLayout() {
    try {
        const saved = localStorage.getItem(LAYOUT_KEY);
        if (!saved) return;
        const layouts: ContainerLayout[] = JSON.parse(saved);
        // Apply after a short delay to let containers render
        requestAnimationFrame(() => {
            layouts.forEach((layout) => {
                const el = document.getElementById(layout.id);
                if (el) {
                    el.style.left = `${layout.x}px`;
                    el.style.top = `${layout.y}px`;
                    if (layout.w) el.style.width = `${layout.w}px`;
                    if (layout.h && !layout.collapsed) el.style.height = `${layout.h}px`;
                    if (layout.collapsed) el.classList.add('collapsed');
                }
            });
            updateMinimap();
        });
    } catch { }
}

// ─── Container resize ───────────────────────────────────
function initContainerResize() {
    document.querySelectorAll('.wm-container').forEach((c) => {
        const el = c as HTMLElement;
        const handle = document.createElement('div');
        handle.className = 'wm-resize-handle';
        el.appendChild(handle);

        let resizing = false;
        let startW = 0, startH = 0, startX = 0, startY = 0;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resizing = true;
            startW = el.offsetWidth;
            startH = el.offsetHeight;
            startX = e.clientX;
            startY = e.clientY;
            el.classList.add('resizing');

            const onMove = (ev: MouseEvent) => {
                if (!resizing) return;
                const dw = (ev.clientX - startX) / state.zoom;
                const dh = (ev.clientY - startY) / state.zoom;
                el.style.width = `${Math.max(280, startW + dw)}px`;
                el.style.height = `${Math.max(200, startH + dh)}px`;
                updateMinimap();
            };

            const onUp = () => {
                resizing = false;
                el.classList.remove('resizing');
                saveLayout();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    });
}

// ─── Minimap ────────────────────────────────────────────
export function updateMinimap() {
    const minimap = document.getElementById('wm-minimap');
    const mmViewport = document.getElementById('wm-minimap-vp');
    const mmContent = document.getElementById('wm-minimap-content');
    if (!minimap || !mmViewport || !mmContent || !viewport) return;

    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return;

    // Find bounding box of all containers
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    containers.forEach((c) => {
        const el = c as HTMLElement;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 380;
        const h = el.offsetHeight || 300;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    });

    // Add padding
    const pad = 200;
    minX -= pad; minY -= pad;
    maxX += pad; maxY += pad;
    const worldW = maxX - minX;
    const worldH = maxY - minY;

    const mmW = minimap.offsetWidth;
    const mmH = minimap.offsetHeight;
    const scale = Math.min(mmW / worldW, mmH / worldH);

    // Draw container dots
    mmContent.innerHTML = '';
    containers.forEach((c) => {
        const el = c as HTMLElement;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 380;
        const h = el.offsetHeight || 300;

        const dot = document.createElement('div');
        dot.className = 'wm-mm-dot';
        dot.style.left = `${(x - minX) * scale}px`;
        dot.style.top = `${(y - minY) * scale}px`;
        dot.style.width = `${Math.max(4, w * scale)}px`;
        dot.style.height = `${Math.max(3, h * scale)}px`;
        // Color based on container type
        const id = el.id;
        if (id.includes('map')) dot.style.background = '#22d3ee';
        else if (id.includes('pulse') || id.includes('news')) dot.style.background = '#f59e0b';
        else if (id.includes('token')) dot.style.background = '#22c55e';
        else if (id.includes('intel')) dot.style.background = '#ef4444';
        else if (id.includes('signal') || id.includes('telegram')) dot.style.background = '#8b5cf6';
        else dot.style.background = '#6366f1';

        mmContent.appendChild(dot);
    });

    // Viewport indicator
    const vpRect = viewport.getBoundingClientRect();
    const vpWorldX = -state.offsetX / state.zoom;
    const vpWorldY = -state.offsetY / state.zoom;
    const vpWorldW = vpRect.width / state.zoom;
    const vpWorldH = vpRect.height / state.zoom;

    mmViewport.style.left = `${(vpWorldX - minX) * scale}px`;
    mmViewport.style.top = `${(vpWorldY - minY) * scale}px`;
    mmViewport.style.width = `${vpWorldW * scale}px`;
    mmViewport.style.height = `${vpWorldH * scale}px`;
}

// ─── Minimap click navigation ───────────────────────────
export function initMinimapClick() {
    const minimap = document.getElementById('wm-minimap');
    if (!minimap || !viewport) return;

    minimap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const containers = document.querySelectorAll('.wm-container');
        if (containers.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        containers.forEach((c) => {
            const el = c as HTMLElement;
            const x = parseFloat(el.style.left) || 0;
            const y = parseFloat(el.style.top) || 0;
            const w = el.offsetWidth || 380;
            const h = el.offsetHeight || 300;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        const pad = 200;
        minX -= pad; minY -= pad;
        maxX += pad; maxY += pad;
        const worldW = maxX - minX;
        const worldH = maxY - minY;

        const mmRect = minimap.getBoundingClientRect();
        const scale = Math.min(mmRect.width / worldW, mmRect.height / worldH);

        const clickX = (e.clientX - mmRect.left) / scale + minX;
        const clickY = (e.clientY - mmRect.top) / scale + minY;

        const vpRect = viewport!.getBoundingClientRect();
        state.offsetX = -(clickX - vpRect.width / (2 * state.zoom)) * state.zoom;
        state.offsetY = -(clickY - vpRect.height / (2 * state.zoom)) * state.zoom;

        updateTransform();
        updateMinimap();
    });
}

// ─── Fit all containers ─────────────────────────────────
export function fitAllContainers() {
    if (!viewport) return;
    const containers = document.querySelectorAll('.wm-container');
    if (containers.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    containers.forEach((c) => {
        const el = c as HTMLElement;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 380;
        const h = el.offsetHeight || 300;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    });

    const pad = 60;
    const vpRect = viewport.getBoundingClientRect();
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const zoom = Math.min(vpRect.width / worldW, vpRect.height / worldH, 1.5);

    state.zoom = zoom;
    state.offsetX = (vpRect.width - worldW * zoom) / 2 - (minX - pad) * zoom;
    state.offsetY = (vpRect.height - worldH * zoom) / 2 - (minY - pad) * zoom;

    updateTransform();
    updateMinimap();
}
