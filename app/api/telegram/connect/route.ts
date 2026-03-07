// POST /api/telegram/connect
// If body has `retry: true`, will attempt reconnect with retries using env config
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));

    // Reconnect mode: use env config + retry
    if (body.retry) {
        const maxRetries = Number(body.retries) || 5;
        const delayMs = Number(body.delay) || 15_000;
        const appId = Number(process.env.TG_APP_ID);
        const appHash = process.env.TG_APP_HASH || '';
        const phone = process.env.TG_PHONE || '';

        if (!appId || !appHash || !phone) {
            return Response.json({ error: 'No Telegram config in env' }, { status: 400 });
        }

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
