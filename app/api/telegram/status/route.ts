// GET /api/telegram/status
import * as tg from '../../../../src/telegram';

export async function GET() {
    return Response.json(tg.getStatus());
}
