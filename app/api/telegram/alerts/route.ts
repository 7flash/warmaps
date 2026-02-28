// GET /api/telegram/alerts
import * as tg from '../../../../src/telegram';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || '50');
    return Response.json(tg.getAlerts(limit));
}
