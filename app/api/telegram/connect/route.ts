// POST /api/telegram/connect
// Standard connect: body { appId, appHash, phone }
// Retry reconnect: body { retry: true, retries?: 5, delay?: 15000 }
import * as tg from '../../../../src/telegram';
import * as fs from 'fs';
import * as path from 'path';

function getConfig() {
    // Try env vars first
    if (process.env.TG_APP_ID && process.env.TG_APP_HASH && process.env.TG_PHONE) {
        return { appId: Number(process.env.TG_APP_ID), appHash: process.env.TG_APP_HASH, phone: process.env.TG_PHONE };
    }
    // Fallback: read .config.toml directly
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
    const body = await req.json().catch(() => ({} as any));

    // Retry reconnect mode
    if (body.retry) {
        const config = getConfig();
        if (!config) {
            return Response.json({ error: 'No Telegram config found (env or .config.toml)' }, { status: 400 });
        }

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

    // Standard connect mode
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
