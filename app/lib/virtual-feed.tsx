// @ts-nocheck
/**
 * virtual-feed.tsx — Lightweight virtual scrolling for feed widgets.
 *
 * Renders only the items visible in the scrollable container's viewport,
 * plus a small buffer above and below. As the user scrolls, items are
 * recycled: off-screen DOM is removed, newly-visible DOM is created.
 *
 * Design:
 * - Fixed item height for O(1) position calculation
 * - IntersectionObserver-free: uses scroll events + requestAnimationFrame
 * - Sentinel divs at top/bottom create correct scrollbar height
 * - Compatible with melina's jsx-dom (direct DOM, no VDOM diffing)
 *
 * Usage:
 *   const vf = createVirtualFeed({
 *       container: bodyEl,
 *       items: filteredAlerts,
 *       itemHeight: 72,
 *       overscan: 5,
 *       renderItem: (item, index) => <div className="feed-item">...</div>
 *   });
 *   // Later: vf.update(newItems) or vf.destroy()
 */

/** Configuration for a virtual feed instance */
export interface VirtualFeedOptions<T> {
    /** The scrollable container element (.wm-container-body) */
    container: HTMLElement;
    /** Full array of items to virtualize */
    items: T[];
    /** Fixed height per item in pixels */
    itemHeight: number;
    /** Number of extra items to render above/below viewport */
    overscan?: number;
    /** Render function: creates a DOM element for one item */
    renderItem: (item: T, index: number) => HTMLElement;
}

export interface VirtualFeedInstance<T> {
    /** Update the items array (re-renders visible slice) */
    update(items: T[]): void;
    /** Clean up scroll listener and DOM */
    destroy(): void;
    /** Force re-render at current scroll position */
    refresh(): void;
}

export function createVirtualFeed<T>(opts: VirtualFeedOptions<T>): VirtualFeedInstance<T> {
    const { container, itemHeight, renderItem } = opts;
    const overscan = opts.overscan ?? 5;
    let items = opts.items;
    let destroyed = false;
    let rafId = 0;
    let lastStartIdx = -1;
    let lastEndIdx = -1;

    // ── DOM structure ──────────────────────────────────────
    // container (scrollable)
    //   └── wrapper (full height for scrollbar)
    //       ├── topSpacer (pushes content down)
    //       ├── viewport (rendered items)
    //       └── (bottom space handled by wrapper height)

    container.innerHTML = '';
    container.style.overflow = 'auto';

    const wrapper = document.createElement('div');
    wrapper.className = 'vf-wrapper';
    wrapper.style.position = 'relative';

    const topSpacer = document.createElement('div');
    topSpacer.className = 'vf-spacer-top';
    topSpacer.style.height = '0px';
    topSpacer.style.pointerEvents = 'none';

    const viewport = document.createElement('div');
    viewport.className = 'vf-viewport';

    wrapper.appendChild(topSpacer);
    wrapper.appendChild(viewport);
    container.appendChild(wrapper);

    // ── Render logic ───────────────────────────────────────
    function renderSlice() {
        if (destroyed) return;

        const totalHeight = items.length * itemHeight;
        wrapper.style.height = totalHeight + 'px';

        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        let startIdx = Math.floor(scrollTop / itemHeight) - overscan;
        let endIdx = Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan;
        startIdx = Math.max(0, startIdx);
        endIdx = Math.min(items.length, endIdx);

        // Skip if same range
        if (startIdx === lastStartIdx && endIdx === lastEndIdx) return;
        lastStartIdx = startIdx;
        lastEndIdx = endIdx;

        // Position the viewport content
        topSpacer.style.height = (startIdx * itemHeight) + 'px';

        // Render only visible items
        viewport.innerHTML = '';
        for (let i = startIdx; i < endIdx; i++) {
            const el = renderItem(items[i], i);
            el.style.height = itemHeight + 'px';
            el.style.boxSizing = 'border-box';
            viewport.appendChild(el);
        }
    }

    // ── Scroll handler ─────────────────────────────────────
    function onScroll() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            renderSlice();
        });
    }

    container.addEventListener('scroll', onScroll, { passive: true });

    // Initial render
    renderSlice();

    // ── Public API ─────────────────────────────────────────
    return {
        update(newItems: T[]) {
            items = newItems;
            lastStartIdx = -1;
            lastEndIdx = -1;
            renderSlice();
        },
        refresh() {
            lastStartIdx = -1;
            lastEndIdx = -1;
            renderSlice();
        },
        destroy() {
            destroyed = true;
            container.removeEventListener('scroll', onScroll);
            if (rafId) cancelAnimationFrame(rafId);
            container.innerHTML = '';
        },
    };
}
