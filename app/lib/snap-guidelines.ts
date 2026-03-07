/**
 * snap-guidelines.ts — Alignment snap guides for container dragging
 *
 * Shows blue dashed SVG alignment guides when dragging a container
 * within SNAP_THRESHOLD pixels of another container's edge.
 * Snaps to left/right/top/bottom/center edges.
 *
 * Extracted from warmaps-canvas.ts for modularity.
 */

// ─── Constants ──────────────────────────────────────────

export const SNAP_THRESHOLD = 8;  // world pixels
export const GRID_SIZE = 20;

// ─── Overlay state ──────────────────────────────────────

let snapGuideOverlay: SVGElement | null = null;

/**
 * Get or create the SVG overlay element for snap guidelines.
 * Requires a parent element to attach to (the canvas viewport).
 */
export function getOrCreateSnapOverlay(parentEl: HTMLElement | null): SVGElement {
    if (snapGuideOverlay) return snapGuideOverlay;
    if (!parentEl) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('snap-guide-overlay');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    parentEl.appendChild(svg);
    snapGuideOverlay = svg;
    return svg;
}

/** Clear all visible snap guidelines. */
export function clearSnapGuides() {
    if (snapGuideOverlay) snapGuideOverlay.innerHTML = '';
}

/** Draw a single dashed guide line on the overlay. */
export function drawGuideLine(parentEl: HTMLElement | null, x1: number, y1: number, x2: number, y2: number) {
    const svg = getOrCreateSnapOverlay(parentEl);
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

/**
 * Compute snapped position for a dragged container.
 * Checks all other .wm-container elements for edge alignment.
 *
 * @returns Adjusted {x, y} that snaps to nearby edges, plus draws guide lines.
 */
export function snapToGuides(
    parentEl: HTMLElement | null,
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
    if (bestDx <= SNAP_THRESHOLD) drawGuideLine(parentEl, matchedXVal, -10000, matchedXVal, 10000);
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
    if (bestDy <= SNAP_THRESHOLD) drawGuideLine(parentEl, -10000, matchedYVal, 10000, matchedYVal);
    else snappedY = y;

    return { x: snappedX, y: snappedY };
}
