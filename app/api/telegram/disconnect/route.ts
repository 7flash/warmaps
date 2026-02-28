// POST /api/telegram/disconnect
import * as tg from '../../../../src/telegram';

export async function POST() {
    await tg.disconnect();
    return Response.json({ ok: true });
}
