// POST /api/telegram/connect
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
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
