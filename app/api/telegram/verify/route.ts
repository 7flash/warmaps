// POST /api/telegram/verify
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const { code } = body;

    if (!code) {
        return Response.json({ error: 'Missing code' }, { status: 400 });
    }

    const result = await tg.verifyCode(code);
    if (result.ok && !result.needsPassword) {
        tg.startPolling();
    }
    return Response.json(result);
}
