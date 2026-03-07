// Telegram OSINT API — auth + alerts
import { measure } from 'measure-fn';
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    return measure('api:telegram', async () => {
        const url = new URL(req.url);
        const action = url.pathname.split('/').pop();
        const body = await req.json().catch(() => ({}));

        switch (action) {
            case 'connect': {
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
