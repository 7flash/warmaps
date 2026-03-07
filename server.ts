import { createAppRouter } from 'melina';
import { measure } from 'measure-fn';
import { builtAssets } from 'melina/server';
import path from 'path';
import * as fs from 'fs';
import { saveChatMessage, getChatHistory, cleanupOldData } from './src/db';
import { getSessionUser } from './app/lib/auth';
import * as tg from './src/telegram';

// Load Gemini API key from config if not already in env
if (!process.env.GEMINI_API_KEY) {
    try {
        const configPaths = [
            path.join(import.meta.dir, '.config.toml'),
            'C:/Code/geeksy/.config.toml',
        ];
        for (const p of configPaths) {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf-8');
                const match = content.match(/api_key\s*=\s*"([^"]+)"/);
                if (match) { process.env.GEMINI_API_KEY = match[1]; break; }
            }
        }
    } catch { }
}

const appDir = path.join(import.meta.dir, 'app');
const port = parseInt(process.env.WARMAPS_PORT || "4444");
const isDev = process.env.NODE_ENV !== 'production';

// ─── Chat State ─────────────────────────────────────────────

interface ChatMessage {
    id: string;
    user: string;
    text: string;
    time: string;
}

const recentMessages: ChatMessage[] = [];
const MAX_HISTORY = 50;
let guestCounter = 0;

// ─── Sync State ─────────────────────────────────────────────

const SYNC_COLORS = [
    '#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#34d399',
    '#fbbf24', '#f87171', '#60a5fa', '#c084fc', '#4ade80',
];
let syncColorIdx = 0;
const syncPeers = new Map<string, { name: string; color: string }>();

// Cleanup old data on startup
cleanupOldData(7);

function generateGuestName(): string {
    guestCounter++;
    const suffix = Math.random().toString(36).substring(2, 6);
    return `Guest-${suffix}`;
}

// ─── Melina Router ──────────────────────────────────────────

const router = createAppRouter({
    appDir,
    defaultTitle: 'WARMAPS — Global Conflict Monitor',
});

// ─── Bun Server with WebSocket ──────────────────────────────

const routeMetrics = new Map<string, { count: number; sum: number }>();

const server = Bun.serve({
    port,
    idleTimeout: 60, // seconds — allow slow external APIs (GDELT, FIRMS)
    async fetch(req, server) {
        const start = performance.now();
        const url = new URL(req.url);

        if (url.pathname === '/api/metrics') {
            const mem = process.memoryUsage();
            let m = `# HELP warmaps_memory_rss_bytes Resident set size\n# TYPE warmaps_memory_rss_bytes gauge\nwarmaps_memory_rss_bytes ${mem.rss}\n\n`;
            m += `# HELP warmaps_websocket_connections Active WebSocket connections\n# TYPE warmaps_websocket_connections gauge\n`;
            m += `warmaps_websocket_connections{room="chat"} ${server.subscriberCount('chat')}\n`;
            m += `warmaps_websocket_connections{room="sync"} ${syncPeers.size}\n\n`;
            const tgStatus = tg.getStatus();
            m += `# HELP warmaps_telegram_connected Telegram OSINT connection status\n# TYPE warmaps_telegram_connected gauge\n`;
            m += `warmaps_telegram_connected ${tgStatus.status === 'connected' ? 1 : 0}\n\n`;
            m += `# HELP warmaps_http_requests_total Total number of HTTP requests\n# TYPE warmaps_http_requests_total counter\n`;
            for (const [route, stats] of routeMetrics.entries()) {
                const [method, path] = route.split(' ');
                m += `warmaps_http_requests_total{method="${method}",path="${path}"} ${stats.count}\n`;
            }
            m += `\n# HELP warmaps_http_request_duration_ms Total sum of HTTP request durations\n# TYPE warmaps_http_request_duration_ms summary\n`;
            for (const [route, stats] of routeMetrics.entries()) {
                const [method, path] = route.split(' ');
                m += `warmaps_http_request_duration_ms{method="${method}",path="${path}"} ${stats.sum.toFixed(2)}\n`;
            }
            return new Response(m, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' } });
        }

        const handle = async () => {

            // SEO: serve robots.txt and sitemap.xml at root
            if (url.pathname === '/robots.txt') {
                return Response.redirect(new URL('/api/robots.txt', req.url), 301);
            }
            if (url.pathname === '/sitemap.xml') {
                return Response.redirect(new URL('/api/sitemap.xml', req.url), 301);
            }

            // WebSocket upgrade for chat
            if (url.pathname === '/ws/chat') {
                const cookie = req.headers.get('cookie') || '';
                const sessionMatch = cookie.match(/wm_session=([a-f0-9]+)/);
                let username = generateGuestName();
                let isAuthenticated = false;
                if (sessionMatch) {
                    const user = getSessionUser(sessionMatch[1]);
                    if (user) {
                        username = user.displayName || user.username;
                        isAuthenticated = true;
                    }
                }
                const upgraded = server.upgrade(req, {
                    data: { channel: 'chat', username, isAuthenticated } as any,
                });
                if (upgraded) return undefined as any;
                return new Response('WebSocket upgrade failed', { status: 400 });
            }

            // WebSocket upgrade for collaborative sync
            if (url.pathname === '/ws/sync') {
                const room = url.searchParams.get('room') || 'default';
                const cookie = req.headers.get('cookie') || '';
                const sessionMatch = cookie.match(/wm_session=([a-f0-9]+)/);
                let peerName = generateGuestName();
                if (sessionMatch) {
                    const user = getSessionUser(sessionMatch[1]);
                    if (user) peerName = user.displayName || user.username;
                }
                const peerId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const peerColor = SYNC_COLORS[syncColorIdx++ % SYNC_COLORS.length];
                syncPeers.set(peerId, { name: peerName, color: peerColor });

                const upgraded = server.upgrade(req, {
                    data: { channel: 'sync', room: `sync:${room}`, peerId, peerName, peerColor } as any,
                });
                if (upgraded) return undefined as any;
                return new Response('WebSocket upgrade failed', { status: 400 });
            }

            // Serve built assets (CSS/JS) from melina's build cache
            const asset = (builtAssets as any)[url.pathname];
            if (asset) {
                return new Response(asset.content, {
                    headers: {
                        'Content-Type': asset.contentType,
                        'Cache-Control': isDev ? 'no-cache' : 'public, max-age=31536000, immutable',
                    },
                });
            }

            // Skip verbose logging for high-frequency polling routes
            const QUIET_ROUTES = ['/api/ping', '/api/flights', '/api/news', '/api/fires',
                '/api/markets', '/api/gdelt', '/api/seismic', '/api/acled', '/api/pumpfun',
                '/api/mcap', '/api/telegram/status'];
            const isQuiet = QUIET_ROUTES.includes(url.pathname);

            if (isQuiet) {
                // No-op measure that still executes and returns the fn result
                const noopMeasure: any = (_label: any, fn?: any) => fn ? fn(noopMeasure) : undefined;
                noopMeasure.assert = (_label: any, fn: any) => fn ? fn(noopMeasure) : undefined;
                try {
                    return await router(req, noopMeasure) as Response;
                } catch (error: any) {
                    console.error('[WARMAPS Error]', url.pathname, error?.message);
                    return new Response('Internal Server Error', { status: 500 });
                }
            }

            // Only log non-polling requests (page loads, rare API calls)
            const response = await measure(
                { label: `${req.method} ${url.pathname}` },
                async (m: any) => {
                    return await router(req, m);
                },
                (error: any) => {
                    console.error('[WARMAPS Error]', error);
                    return new Response(`<pre>${error?.stack || error}</pre>`, {
                        status: 500,
                        headers: { 'Content-Type': 'text/html' },
                    });
                }
            );

            return response as Response;
        };

        const response = await handle();
        if (response) {
            const duration = performance.now() - start;
            const routeKey = `${req.method} ${url.pathname}`;
            const metric = routeMetrics.get(routeKey) || { count: 0, sum: 0 };
            metric.count++;
            metric.sum += duration;
            routeMetrics.set(routeKey, metric);
        }
        return response as any;
    },
    websocket: {
        open(ws: any) {
            if (ws.data.channel === 'sync') {
                // ── Sync room join ──
                ws.subscribe(ws.data.room);
                const peerCount = server.subscriberCount(ws.data.room);
                console.log(`[Sync] ${ws.data.peerName} joined room ${ws.data.room} (${peerCount} peers)`);

                // Send peer identity
                ws.send(JSON.stringify({
                    type: 'sync:init',
                    peerId: ws.data.peerId,
                    peerName: ws.data.peerName,
                    peerColor: ws.data.peerColor,
                    peerCount,
                }));

                // Announce to room
                server.publish(ws.data.room, JSON.stringify({
                    type: 'sync:peer-join',
                    peerId: ws.data.peerId,
                    peerName: ws.data.peerName,
                    peerColor: ws.data.peerColor,
                    peerCount,
                }));
                return;
            }

            // ── Chat join ──
            ws.subscribe('chat');
            console.log(`[Chat] ${ws.data.username} connected`);

            const dbHistory = getChatHistory(30);
            ws.send(JSON.stringify({
                type: 'init',
                username: ws.data.username,
                history: dbHistory.map(m => ({ user: m.username, text: m.text, time: m.sent_at })),
                online: server.subscriberCount('chat'),
            }));

            server.publish('chat', JSON.stringify({
                type: 'system',
                text: `${ws.data.username} joined`,
                time: new Date().toISOString(),
                online: server.subscriberCount('chat'),
                isAuthenticated: ws.data.isAuthenticated,
            }));
        },
        message(ws: any, message: string | Buffer) {
            try {
                const data = JSON.parse(String(message));

                if (ws.data.channel === 'sync') {
                    // ── Sync messages: relay to room ──
                    // Attach peer identity and broadcast
                    data.peerId = ws.data.peerId;
                    data.peerName = ws.data.peerName;
                    data.peerColor = ws.data.peerColor;
                    server.publish(ws.data.room, JSON.stringify(data));
                    return;
                }

                // ── Chat messages ──
                if (data.type === 'message' && data.text?.trim()) {
                    const chatMsg: ChatMessage = {
                        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        user: ws.data.username,
                        text: data.text.trim().slice(0, 500),
                        time: new Date().toISOString(),
                    };

                    recentMessages.push(chatMsg);
                    if (recentMessages.length > MAX_HISTORY) {
                        recentMessages.shift();
                    }

                    saveChatMessage(chatMsg.user, chatMsg.text);

                    server.publish('chat', JSON.stringify({
                        type: 'message',
                        ...chatMsg,
                        online: server.subscriberCount('chat'),
                    }));
                }
            } catch { /* ignore malformed */ }
        },
        close(ws: any) {
            if (ws.data.channel === 'sync') {
                ws.unsubscribe(ws.data.room);
                syncPeers.delete(ws.data.peerId);
                const peerCount = server.subscriberCount(ws.data.room);
                console.log(`[Sync] ${ws.data.peerName} left (${peerCount} peers)`);
                server.publish(ws.data.room, JSON.stringify({
                    type: 'sync:peer-leave',
                    peerId: ws.data.peerId,
                    peerName: ws.data.peerName,
                    peerCount,
                }));
                return;
            }

            ws.unsubscribe('chat');
            console.log(`[Chat] ${ws.data.username} disconnected`);
            server.publish('chat', JSON.stringify({
                type: 'system',
                text: `${ws.data.username} left`,
                time: new Date().toISOString(),
                online: server.subscriberCount('chat'),
            }));
        },
    },
});

console.log(`⚔ WARMAPS running at http://localhost:${port}`);

// ─── Auto-connect Telegram OSINT ────────────────────────────

function loadConfig(): { appId?: number; apiHash?: string; phone?: string } {
    // Try .config.toml in project, then in geeksy
    const configPaths = [
        path.join(import.meta.dir, '.config.toml'),
        'C:/Code/geeksy/.config.toml',
    ];
    for (const p of configPaths) {
        try {
            if (!fs.existsSync(p)) continue;
            const content = fs.readFileSync(p, 'utf-8');
            const appIdMatch = content.match(/app_id\s*=\s*"?(\d+)"?/);
            const apiHashMatch = content.match(/api_hash\s*=\s*"([^"]+)"/);
            const phoneMatch = content.match(/phone_number\s*=\s*"([^"]+)"/);
            if (appIdMatch && apiHashMatch && phoneMatch) {
                console.log(`[telegram] Config loaded from ${p}`);
                return {
                    appId: Number(appIdMatch[1]),
                    apiHash: apiHashMatch[1],
                    phone: phoneMatch[1],
                };
            }
        } catch { }
    }
    // Fallback to env vars
    if (process.env.TG_APP_ID && process.env.TG_API_HASH && process.env.TG_PHONE) {
        return {
            appId: Number(process.env.TG_APP_ID),
            apiHash: process.env.TG_API_HASH,
            phone: process.env.TG_PHONE,
        };
    }
    return {};
}

(async () => {
    const config = loadConfig();
    if (config.appId && config.apiHash && config.phone) {
        console.log(`[telegram] Auto-connecting as ${config.phone}...`);
        const result = await tg.sendCode(config.appId, config.apiHash, config.phone);
        if (result.ok && result.restored) {
            tg.startPolling();
            console.log(`[telegram] ✓ Connected & polling ${tg.OSINT_CHANNELS.length} channels`);
        } else if (result.ok) {
            console.log('[telegram] Auth code required — use the dashboard UI to verify');
        } else {
            console.error('[telegram] Auto-connect failed:', result.error);
        }
    } else {
        console.log('[telegram] No config found — Telegram OSINT disabled');
        console.log('[telegram] Add [telegram] section to .config.toml with app_id, api_hash, phone_number');
    }
})();
