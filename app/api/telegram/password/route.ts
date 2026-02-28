// POST /api/telegram/password
import * as tg from '../../../../src/telegram';

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password) {
        return Response.json({ error: 'Missing password' }, { status: 400 });
    }

    const result = await tg.submitPassword(password);
    if (result.ok) {
        tg.startPolling();
    }
    return Response.json(result);
}
