import { createAppRouter } from 'melina';
import { measure } from 'measure-fn';
import { builtAssets } from 'melina/server';
import path from 'path';
import * as fs from 'fs';
import { saveChatMessage, getChatHistory, cleanupOldData } from './src/db';
import * as tg from './src/telegram';

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

const server = Bun.serve({
    port,
    idleTimeout: 60, // seconds — allow slow external APIs (GDELT, FIRMS)
    async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade for chat
        if (url.pathname === '/ws/chat') {
            const username = generateGuestName();
            const upgraded = server.upgrade(req, {
                data: { username },
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
    },
    websocket: {
        open(ws: any) {
            ws.subscribe('chat');
            console.log(`[Chat] ${ws.data.username} connected`);

            // Load chat history from database
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
            }));
        },
        message(ws: any, message: string | Buffer) {
            try {
                const data = JSON.parse(String(message));
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

                    // Persist to database
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
