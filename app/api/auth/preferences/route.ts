/**
 * GET /api/auth/preferences — Get all preferences for current user
 * PUT /api/auth/preferences — Save a preference
 * 
 * Body for PUT: { key: string, value: any }
 * Valid keys: watch_regions, filters, map_view, portfolio, theme, feature_flags
 */
import { getSessionFromRequest, setPref, getAllPrefs, type PrefKey } from '../../../lib/auth';

const VALID_KEYS: PrefKey[] = ['watch_regions', 'filters', 'map_view', 'portfolio', 'theme', 'feature_flags'];

export async function GET(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return Response.json({ preferences: getAllPrefs(user.id) });
}

export async function PUT(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await req.json() as { key: string; value: any };
        if (!body.key || !VALID_KEYS.includes(body.key as PrefKey)) {
            return Response.json({
                error: `Invalid key. Valid keys: ${VALID_KEYS.join(', ')}`
            }, { status: 400 });
        }

        setPref(user.id, body.key as PrefKey, body.value);
        return Response.json({ ok: true, key: body.key });
    } catch (err: any) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
