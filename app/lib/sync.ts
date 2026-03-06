/**
 * sync.ts — Collaborative Dashboard Sync
 * 
 * Connects to /ws/sync for real-time layout synchronization.
 * When enabled, broadcasts widget moves/resizes/collapses to
 * all connected peers in the same room. Shows colored peer
 * cursors and a peer count badge.
 */

let ws: WebSocket | null = null;
let myPeerId = '';
let myPeerName = '';
let myPeerColor = '';
let syncEnabled = false;
let peerCount = 0;
let pendingSend: ReturnType<typeof setTimeout> | null = null;

// Peer cursor elements
const peerCursors = new Map<string, HTMLElement>();

/**
 * Initialize the sync WebSocket connection
 */
export function initSync(room = 'default') {
    if (ws) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/sync?room=${encodeURIComponent(room)}`);

    ws.onopen = () => {
        syncEnabled = true;
        console.log(`[sync] Connected to room: ${room}`);
        updateSyncBadge();
    };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleSyncMessage(msg);
        } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
        syncEnabled = false;
        ws = null;
        console.log('[sync] Disconnected');
        updateSyncBadge();
        // Clear peer cursors
        peerCursors.forEach((el) => el.remove());
        peerCursors.clear();

        // Auto-reconnect after 3s if we were intentionally connected
        if (document.getElementById('wm-sync-collab')?.classList.contains('active')) {
            setTimeout(() => initSync(room), 3000);
        }
    };

    ws.onerror = () => {
        console.warn('[sync] WebSocket error');
    };
}

/**
 * Disconnect from sync
 */
export function disconnectSync() {
    syncEnabled = false;
    if (ws) {
        ws.close();
        ws = null;
    }
    peerCursors.forEach((el) => el.remove());
    peerCursors.clear();
    updateSyncBadge();
}

/**
 * Handle incoming sync messages
 */
function handleSyncMessage(msg: any) {
    switch (msg.type) {
        case 'sync:init':
            myPeerId = msg.peerId;
            myPeerName = msg.peerName;
            myPeerColor = msg.peerColor;
            peerCount = msg.peerCount;
            updateSyncBadge();
            break;

        case 'sync:peer-join':
            peerCount = msg.peerCount;
            updateSyncBadge();
            showSyncToast(`${msg.peerName} joined`, msg.peerColor);
            break;

        case 'sync:peer-leave':
            peerCount = msg.peerCount;
            updateSyncBadge();
            showSyncToast(`${msg.peerName} left`, '#666');
            // Remove cursor
            const cursor = peerCursors.get(msg.peerId);
            if (cursor) {
                cursor.remove();
                peerCursors.delete(msg.peerId);
            }
            break;

        case 'sync:layout':
            // Skip own messages
            if (msg.peerId === myPeerId) return;
            applyRemoteLayout(msg);
            break;

        case 'sync:cursor':
            if (msg.peerId === myPeerId) return;
            showPeerCursor(msg);
            break;

        case 'sync:viewport':
            if (msg.peerId === myPeerId) return;
            // Optional: could sync canvas pan/zoom
            break;
    }
}

/**
 * Broadcast current layout state to peers (throttled)
 */
export function broadcastLayout() {
    if (!syncEnabled || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Throttle to max 10 updates/sec
    if (pendingSend) return;
    pendingSend = setTimeout(() => {
        pendingSend = null;

        const containers = document.querySelectorAll('.wm-container');
        const layout: any[] = [];

        containers.forEach(c => {
            const el = c as HTMLElement;
            layout.push({
                id: el.id,
                typeId: el.dataset.widgetType || '',
                x: parseFloat(el.style.left) || 0,
                y: parseFloat(el.style.top) || 0,
                w: el.offsetWidth,
                h: el.offsetHeight,
                collapsed: el.classList.contains('collapsed'),
            });
        });

        ws!.send(JSON.stringify({
            type: 'sync:layout',
            layout,
            timestamp: Date.now(),
        }));
    }, 100);
}

/**
 * Broadcast my cursor position
 */
export function broadcastCursor(x: number, y: number) {
    if (!syncEnabled || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'sync:cursor', x, y }));
}

/**
 * Apply a remote peer's layout update
 */
function applyRemoteLayout(msg: any) {
    const { layout, peerName, peerColor } = msg;
    if (!Array.isArray(layout)) return;

    for (const item of layout) {
        const el = document.getElementById(item.id) as HTMLElement;
        if (!el) continue;

        // Smoothly animate to peer's position
        el.style.transition = 'left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease';
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        el.style.width = `${item.w}px`;
        el.style.height = `${item.h}px`;

        if (item.collapsed) {
            el.classList.add('collapsed');
        } else {
            el.classList.remove('collapsed');
        }

        // Brief colored border flash to show who moved it
        el.style.borderColor = peerColor;
        setTimeout(() => {
            el.style.transition = '';
            el.style.borderColor = '';
        }, 400);
    }

    // Trigger minimap update
    const event = new CustomEvent('layout-changed');
    document.dispatchEvent(event);
}

/**
 * Show a colored peer cursor on the canvas
 */
function showPeerCursor(msg: any) {
    let cursor = peerCursors.get(msg.peerId);

    if (!cursor) {
        cursor = document.createElement('div');
        cursor.className = 'sync-peer-cursor';
        cursor.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="${msg.peerColor}">
                <path d="M0 0 L16 6 L6 7 L5 16 Z" />
            </svg>
            <span class="sync-peer-label" style="background:${msg.peerColor}">${msg.peerName}</span>
        `;
        document.getElementById('wm-content')?.appendChild(cursor);
        peerCursors.set(msg.peerId, cursor);
    }

    cursor.style.left = `${msg.x}px`;
    cursor.style.top = `${msg.y}px`;

    // Auto-hide after 10s of inactivity
    cursor.dataset.lastSeen = String(Date.now());
    setTimeout(() => {
        if (cursor && Date.now() - parseInt(cursor.dataset.lastSeen || '0') > 9000) {
            cursor.style.opacity = '0';
        }
    }, 10000);
    cursor.style.opacity = '1';
}

/**
 * Update the sync badge in the toolbar
 */
function updateSyncBadge() {
    const btn = document.getElementById('wm-sync-collab');
    if (!btn) return;

    if (syncEnabled && peerCount > 0) {
        btn.innerHTML = `👥 <span class="sync-badge">${peerCount}</span>`;
        btn.title = `War Room Sync (${peerCount} connected)`;
    } else if (syncEnabled) {
        btn.textContent = '👥';
        btn.title = 'War Room Sync (Connected)';
    } else {
        btn.textContent = '👤';
        btn.title = 'War Room Sync (Off)';
    }
}

/**
 * Show a brief toast for sync events
 */
function showSyncToast(text: string, color: string) {
    const toast = document.createElement('div');
    toast.className = 'sync-toast';
    toast.style.borderColor = color;
    toast.innerHTML = `<span style="color:${color}">●</span> ${text}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

export function isSyncEnabled() {
    return syncEnabled;
}
