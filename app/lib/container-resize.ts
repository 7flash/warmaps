/**
 * container-resize.ts — Container resize handle logic
 *
 * Extracted from warmaps-canvas.ts for modularity.
 * Adds a resize handle to each .wm-container and handles
 * mouse drag to resize, accounting for canvas zoom level.
 */

export interface ResizeContext {
    getCanvasState: () => { zoom: number };
    saveLayout: () => void;
}

/**
 * Initialize resize handles on all .wm-container elements.
 * Skips containers that already have a handle.
 */
export function initContainerResize(ctx: ResizeContext) {
    document.querySelectorAll('.wm-container').forEach((el) => {
        const c = el as HTMLElement;
        if (c.querySelector('.wm-resize-handle')) return;

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
                const state = ctx.getCanvasState();
                const dx = (ev.clientX - startX) / state.zoom;
                const dy = (ev.clientY - startY) / state.zoom;
                c.style.width = `${Math.max(200, startW + dx)}px`;
                c.style.height = `${Math.max(150, startH + dy)}px`;
            };

            const onUp = () => {
                resizing = false;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                ctx.saveLayout();
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    });
}
