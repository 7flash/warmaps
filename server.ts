import { createAppRouter } from 'melina';
import { measure } from 'measure-fn';
import { builtAssets } from 'melina/server';
import path from 'path';

const appDir = path.join(import.meta.dir, 'app');
const port = parseInt(process.env.BUN_PORT || "4444");
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

function generateGuestName(): string {
    guestCounter++;
    const suffix = Math.random().toString(36).substring(2, 6);
    return `Guest-${suffix}`;
}

// ─── Melina Router ──────────────────────────────────────────

const router = createAppRouter({
    appDir,
    defaultTitle: 'STARWAR — Global Conflict Monitor',
});

// ─── Bun Server with WebSocket ──────────────────────────────

const server = Bun.serve({
    port,
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

        // Delegate to Melina — pass `measure` as second arg
        const response = await measure(
            { label: `${req.method} ${url.pathname}` },
            async (m: any) => {
                return await router(req, m);
            },
            (error: any) => {
                console.error('[STARWAR Error]', error);
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

            ws.send(JSON.stringify({
                type: 'init',
                username: ws.data.username,
                history: recentMessages.slice(-30),
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

console.log(`⚔ STARWAR running at http://localhost:${port}`);
