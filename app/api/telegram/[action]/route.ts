// Telegram OSINT API — auth + alerts
import { measure } from 'measure-fn';
import * as tg from '../../../../src/telegram';
import * as fs from 'fs';
import * as path from 'path';

function getConfig() {
    if (process.env.TG_APP_ID && process.env.TG_APP_HASH && process.env.TG_PHONE) {
        return { appId: Number(process.env.TG_APP_ID), appHash: process.env.TG_APP_HASH, phone: process.env.TG_PHONE };
    }
    const configPath = path.join(import.meta.dir, '../../../../.config.toml');
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const appIdMatch = content.match(/app_id\s*=\s*"?(\d+)"?/);
        const apiHashMatch = content.match(/api_hash\s*=\s*"([^"]+)"/);
        const phoneMatch = content.match(/phone_number\s*=\s*"([^"]+)"/);
        if (appIdMatch && apiHashMatch && phoneMatch) {
            return { appId: Number(appIdMatch[1]), appHash: apiHashMatch[1], phone: phoneMatch[1] };
        }
    } catch { }
    return null;
}

export async function POST(req: Request) {
    return measure('api:telegram', async () => {
        const url = new URL(req.url);
        const action = url.pathname.split('/').pop();
        const body = await req.json().catch(() => ({} as any));

        switch (action) {
            case 'connect': {
                // Retry reconnect mode
                if (body.retry) {
                    const config = getConfig();
                    if (!config) return Response.json({ error: 'No Telegram config (env or .config.toml)' }, { status: 400 });

                    const maxRetries = Number(body.retries) || 5;
                    const delayMs = Number(body.delay) || 15_000;
                    await tg.disconnect();
                    const results: string[] = [];

                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        results.push(`Attempt ${attempt}/${maxRetries}...`);
                        const r = await tg.sendCode(config.appId, config.appHash, config.phone);
                        if (r.ok && r.restored) {
                            tg.startPolling();
                            tg.startHeartbeat();
                            results.push(`✓ Connected & polling ${tg.OSINT_CHANNELS.length} channels`);
                            return Response.json({ ok: true, results, attempt });
                        }
                        if (!r.error?.includes('AUTH_KEY')) {
                            results.push(`Non-retryable: ${r.error}`);
                            return Response.json({ ok: false, results, error: r.error });
                        }
                        results.push(`Session conflict — waiting ${delayMs / 1000}s...`);
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                    results.push('All retries exhausted');
                    return Response.json({ ok: false, results, error: 'AUTH_KEY_DUPLICATED persists' });
                }

                // Standard connect
                const { appId, appHash, phone } = body;
                if (!appId || !appHash || !phone) {
                    return Response.json({ error: 'Missing appId, appHash, or phone' }, { status: 400 });
                }
                const result = await tg.sendCode(Number(appId), appHash, phone);
                if (result.ok && result.restored) {
                    tg.startPolling();
                }
                return Response.json(result);
            }
            case 'verify': {
                const { code } = body;
                if (!code) return Response.json({ error: 'Missing code' }, { status: 400 });
                const result = await tg.verifyCode(code);
                if (result.ok && !result.needsPassword) {
                    tg.startPolling();
                }
                return Response.json(result);
            }
            case 'password': {
                const { password } = body;
                if (!password) return Response.json({ error: 'Missing password' }, { status: 400 });
                const result = await tg.submitPassword(password);
                if (result.ok) {
                    tg.startPolling();
                }
                return Response.json(result);
            }
            case 'disconnect': {
                await tg.disconnect();
                return Response.json({ ok: true });
            }
            case 'reconnect': {
                // Same as connect with retry:true
                const config = getConfig();
                if (!config) return Response.json({ error: 'No Telegram config (env or .config.toml)' }, { status: 400 });
                const maxRetries = Number(body.retries) || 5;
                const delayMs = Number(body.delay) || 15_000;
                await tg.disconnect();
                const results: string[] = [];
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    results.push(`Attempt ${attempt}/${maxRetries}...`);
                    const r = await tg.sendCode(config.appId, config.appHash, config.phone);
                    if (r.ok && r.restored) {
                        tg.startPolling();
                        tg.startHeartbeat();
                        results.push(`✓ Connected & polling ${tg.OSINT_CHANNELS.length} channels`);
                        return Response.json({ ok: true, results, attempt });
                    }
                    if (!r.error?.includes('AUTH_KEY')) {
                        results.push(`Non-retryable: ${r.error}`);
                        return Response.json({ ok: false, results, error: r.error });
                    }
                    results.push(`Session conflict — waiting ${delayMs / 1000}s...`);
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
                results.push('All retries exhausted');
                return Response.json({ ok: false, results, error: 'AUTH_KEY_DUPLICATED persists' });
            }
            default:
                return Response.json({ error: 'Unknown action' }, { status: 400 });
        }
    });
}

export async function GET(req: Request) {
    return measure('api:telegram:status', async () => {
        const url = new URL(req.url);
        const action = url.pathname.split('/').pop();

        if (action === 'alerts') {
            const limit = Number(url.searchParams.get('limit') || '50');
            return Response.json(tg.getAlerts(limit));
        }

        return Response.json(tg.getStatus());
    });
}
