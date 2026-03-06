/**
 * links.ts — Container and Node Linking System
 * Supports drawing SVG bezier curves between containers, feed items, and map coordinates.
 */

import { map } from './state';

export interface LinkNode {
    type: 'dom' | 'geo';
    id?: string;
    lat?: number;
    lon?: number;
}

export interface LinkDef {
    id: string;
    source: LinkNode;
    target: LinkNode;
}

const LINKS_KEY = 'warmaps:links';
export let activeLinks: LinkDef[] = [];
let isDragging = false;
let currentLine: SVGPathElement | null = null;
let dragSourceNode: LinkNode | null = null;
let svgLayer: SVGSVGElement | null = null;

export function initLinks() {
    svgLayer = document.getElementById('wm-links') as unknown as SVGSVGElement;
    if (!svgLayer) return;

    loadLinks();

    // Global listeners for the linking interaction
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Context menu to delete links
    svgLayer.addEventListener('contextmenu', (e) => {
        if (e.target instanceof SVGPathElement && (e.target as any).dataset.linkId) {
            e.preventDefault();
            const linkId = (e.target as any).dataset.linkId;
            if (confirm('Delete this connection?')) {
                activeLinks = activeLinks.filter(l => l.id !== linkId);
                saveLinks();
            }
        }
    });

    requestAnimationFrame(renderLinks);
}

function loadLinks() {
    try {
        const saved = localStorage.getItem(LINKS_KEY);
        if (saved) {
            activeLinks = JSON.parse(saved);
        }
    } catch { }
}

function saveLinks() {
    localStorage.setItem(LINKS_KEY, JSON.stringify(activeLinks));
}

// Ensure an element has an ID, or generate one
function ensureNodeId(el: HTMLElement): string {
    if (!el.id) {
        el.id = 'wm-node-' + Math.random().toString(36).substr(2, 9);
    }
    return el.id;
}

function getNodeFromHandle(handle: HTMLElement): LinkNode | null {
    if (handle.dataset.geoLat && handle.dataset.geoLon) {
        return {
            type: 'geo',
            lat: parseFloat(handle.dataset.geoLat),
            lon: parseFloat(handle.dataset.geoLon)
        };
    }

    const container = handle.closest('.wm-container, .feed-item, .pulse-card, .radar-market');
    if (container) {
        return {
            type: 'dom',
            id: ensureNodeId(container as HTMLElement)
        };
    }

    return null;
}

function onMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wm-c-link-handle') || target.closest('.wm-c-link-handle')) {
        e.preventDefault();
        e.stopPropagation();

        const handle = target.classList.contains('wm-c-link-handle') ? target : target.closest('.wm-c-link-handle') as HTMLElement;
        dragSourceNode = getNodeFromHandle(handle);

        if (dragSourceNode) {
            isDragging = true;
            currentLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            currentLine.setAttribute('stroke', '#22c55e');
            currentLine.setAttribute('stroke-width', '2');
            currentLine.setAttribute('fill', 'none');
            currentLine.setAttribute('stroke-dasharray', '4 4');
            svgLayer?.appendChild(currentLine);
            document.body.style.cursor = 'crosshair';
        }
    }
}

function onMouseMove(e: MouseEvent) {
    if (!isDragging || !currentLine || !dragSourceNode || !svgLayer) return;

    const sourcePoint = getPointForNode(dragSourceNode);
    if (!sourcePoint) return;

    // Get current mouse position relative to #wm-content
    const contentRect = svgLayer.getBoundingClientRect();
    const targetPoint = {
        x: e.clientX - contentRect.left,
        y: e.clientY - contentRect.top
    };

    const d = drawBezier(sourcePoint, targetPoint);
    currentLine.setAttribute('d', d);
}

function onMouseUp(e: MouseEvent) {
    if (!isDragging) return;

    isDragging = false;
    document.body.style.cursor = '';

    if (currentLine && currentLine.parentNode) {
        currentLine.parentNode.removeChild(currentLine);
    }
    currentLine = null;

    if (!dragSourceNode) return;

    // Check if we dropped on another handle or valid drop target
    const targetEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!targetEl) return;

    const handle = targetEl.classList.contains('wm-c-link-handle') ? targetEl : targetEl.closest('.wm-c-link-handle') as HTMLElement;
    let dropNode: LinkNode | null = null;

    if (handle) {
        dropNode = getNodeFromHandle(handle);
    } else {
        // Alternatively, if they just dropped on a container or feed-item generally
        const container = targetEl.closest('.wm-container, .feed-item, .pulse-card, .radar-market');
        if (container) dropNode = { type: 'dom', id: ensureNodeId(container as HTMLElement) };
    }

    if (dropNode && JSON.stringify(dragSourceNode) !== JSON.stringify(dropNode)) {
        const newLink: LinkDef = {
            id: 'link-' + Date.now(),
            source: dragSourceNode,
            target: dropNode
        };
        activeLinks.push(newLink);
        saveLinks();
    }

    dragSourceNode = null;
}

function getPointForNode(node: LinkNode): { x: number, y: number } | null {
    const wmContent = document.getElementById('wm-content');
    if (!wmContent) return null;
    const contentRect = wmContent.getBoundingClientRect();

    if (node.type === 'geo' && map && node.lat !== undefined && node.lon !== undefined) {
        // Project to pixel coordinates of the MapLibre canvas
        const point = map.project([node.lon, node.lat]);
        // The point is relative to the Map container
        const mapContainer = document.getElementById('wm-c-map');
        if (mapContainer) {
            const mapRect = mapContainer.getBoundingClientRect();
            // Calculate coordinates relative to #wm-content
            return {
                x: mapRect.left - contentRect.left + point.x,
                y: mapRect.top - contentRect.top + point.y + 40 // +40 for header offset
            };
        }
    } else if (node.type === 'dom' && node.id) {
        const el = document.getElementById(node.id);
        if (el) {
            // Some parents (like collapsed containers) might hide the element, get fallback bounding rect
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                // Return center of its parent container if hidden
                const parent = el.closest('.wm-container');
                if (parent) {
                    const parentRect = parent.getBoundingClientRect();
                    return {
                        x: parentRect.left - contentRect.left + parentRect.width / 2,
                        y: parentRect.top - contentRect.top + parentRect.height / 2
                    };
                }
                return null;
            }
            return {
                x: rect.left - contentRect.left + rect.width / 2,
                y: rect.top - contentRect.top + rect.height / 2
            };
        }
    }

    return null;
}

function drawBezier(p1: { x: number, y: number }, p2: { x: number, y: number }): string {
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const controlOffset = Math.max(dx * 0.4, dy * 0.4, 40);

    // Smooth bezier curve
    return `M ${p1.x} ${p1.y} 
            C ${p1.x + controlOffset} ${p1.y}, 
              ${p2.x - controlOffset} ${p2.y}, 
              ${p2.x} ${p2.y}`;
}

export function renderLinks() {
    if (!svgLayer) return;

    // Remove old rendered lines (except the current drag line)
    const paths = Array.from(svgLayer.querySelectorAll('path.wm-link-line, circle.wm-link-dot'));
    paths.forEach(p => p.remove());

    activeLinks.forEach(link => {
        const p1 = getPointForNode(link.source);
        const p2 = getPointForNode(link.target);

        if (p1 && p2) {
            // Draw path
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', drawBezier(p1, p2));
            path.setAttribute('class', 'wm-link-line');
            path.setAttribute('data-link-id', link.id);
            path.style.pointerEvents = 'stroke';
            path.style.cursor = 'crosshair';
            svgLayer!.appendChild(path);

            // Draw endpoints
            [p1, p2].forEach(p => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', String(p.x));
                circle.setAttribute('cy', String(p.y));
                circle.setAttribute('r', '4');
                circle.setAttribute('class', 'wm-link-dot');
                svgLayer!.appendChild(circle);
            });
        }
    });

    requestAnimationFrame(renderLinks);
}
