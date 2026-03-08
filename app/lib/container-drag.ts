/**
 * container-drag.ts — Mouse + touch drag for WARMAPS containers
 *
 * Handles header-based dragging of .wm-container elements on the
 * infinite canvas, with Shift+grid snap and guide-based snapping.
 *
 * Extracted from warmaps-canvas.ts for modularity.
 */

// ─── Types ──────────────────────────────────────────────

export interface DragContext {
    getState(): { zoom: number; offsetX: number; offsetY: number };
    getViewport(): HTMLElement;
    snapToGuides(dragged: HTMLElement, x: number, y: number): { x: number; y: number };
    clearSnapGuides(): void;
    updateMinimap(): void;
    saveLayout(): void;
    gridSize: number;
}

// ─── Z-order ────────────────────────────────────────────

let _topZIndex = 10;

export function setTopZIndex(z: number) {
    if (z > _topZIndex) _topZIndex = z;
}

export function bringToFront(container: HTMLElement) {
    _topZIndex++;
    container.style.zIndex = String(_topZIndex);
}

// ─── Init ───────────────────────────────────────────────

export function initContainerDrag(ctx: DragContext) {
    const viewport = ctx.getViewport();

    let draggingContainer: HTMLElement | null = null;
    let containerDragOffsetX = 0;
    let containerDragOffsetY = 0;

    // ── Mouse drag + Z-Index ──
    viewport.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;

        // Z-Index Elevation: any click inside a container brings it to the front
        const container = target.closest('.wm-container') as HTMLElement;
        if (container) {
            bringToFront(container);
        }

        // Only start drag if clicking the header
        const dragHandle = target.closest('.wm-container-header');
        if (!dragHandle || e.button !== 0 || !container) return;

        draggingContainer = container;
        const state = ctx.getState();
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
        const state = ctx.getState();
        const rect = viewport.getBoundingClientRect();
        let newX = (e.clientX - rect.left - state.offsetX) / state.zoom - containerDragOffsetX;
        let newY = (e.clientY - rect.top - state.offsetY) / state.zoom - containerDragOffsetY;

        // Snap to grid when Shift held, otherwise snap to guides
        if (e.shiftKey) {
            newX = Math.round(newX / ctx.gridSize) * ctx.gridSize;
            newY = Math.round(newY / ctx.gridSize) * ctx.gridSize;
            viewport.classList.add('snap-grid');
            ctx.clearSnapGuides();
        } else {
            viewport.classList.remove('snap-grid');
            const snapped = ctx.snapToGuides(draggingContainer, newX, newY);
            newX = snapped.x;
            newY = snapped.y;
        }

        draggingContainer.style.left = `${newX}px`;
        draggingContainer.style.top = `${newY}px`;
        ctx.updateMinimap();
    });

    window.addEventListener('mouseup', () => {
        if (!draggingContainer) return;
        draggingContainer.classList.remove('dragging');
        viewport.classList.remove('snap-grid');
        ctx.clearSnapGuides();
        ctx.saveLayout();
        draggingContainer = null;
    });

    // ── Touch drag + Z-Index ──
    let touchContainer: HTMLElement | null = null;
    let touchOffX = 0, touchOffY = 0;

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const target = touch.target as HTMLElement;

        // Z-Index Elevation: any touch inside a container brings it to the front
        const container = target.closest('.wm-container') as HTMLElement;
        if (container) {
            bringToFront(container);
        }

        // Only start drag if touching the header
        const header = target.closest('.wm-container-header');
        if (!header || !container) return;

        touchContainer = container;

        const state = ctx.getState();
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
        const state = ctx.getState();
        const rect = viewport.getBoundingClientRect();
        const worldX = (touch.clientX - rect.left - state.offsetX) / state.zoom;
        const worldY = (touch.clientY - rect.top - state.offsetY) / state.zoom;
        touchContainer.style.left = `${worldX - touchOffX}px`;
        touchContainer.style.top = `${worldY - touchOffY}px`;
        ctx.updateMinimap();
        e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
        if (touchContainer) {
            ctx.saveLayout();
            touchContainer = null;
        }
    });
}
