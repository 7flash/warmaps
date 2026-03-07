// POST /api/telegram/reconnect
// Attempts to reconnect Telegram with retry logic for AUTH_KEY_DUPLICATED
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const maxRetries = Number(body.retries) || 5;
    const delayMs = Number(body.delay) || 15_000;

    // Load config from env (set by server.ts from .config.toml)
    const appId = Number(process.env.TG_APP_ID);
    const appHash = process.env.TG_APP_HASH;
    const phone = process.env.TG_PHONE;

    if (!appId || !appHash || !phone) {
        return Response.json({ error: 'No Telegram config found in env' }, { status: 400 });
    }

    // Disconnect first to release any existing session
    await tg.disconnect();

    const results: string[] = [];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        results.push(`Attempt ${attempt}/${maxRetries}...`);
        const r = await tg.sendCode(appId, appHash, phone);

        if (r.ok && r.restored) {
            tg.startPolling();
            tg.startHeartbeat();
            results.push(`✓ Connected & polling ${tg.OSINT_CHANNELS.length} channels`);
            return Response.json({ ok: true, results, attempt });
        }

        const isRetryable = r.error?.includes('AUTH_KEY') || r.error?.includes('DUPLICATED');
        if (!isRetryable) {
            results.push(`Non-retryable error: ${r.error}`);
            return Response.json({ ok: false, results, error: r.error });
        }

        results.push(`Session conflict — waiting ${delayMs / 1000}s...`);
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    results.push('All retries exhausted');
    return Response.json({ ok: false, results, error: 'AUTH_KEY_DUPLICATED persists after all retries' });
}
