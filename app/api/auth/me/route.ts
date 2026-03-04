/**
 * GET /api/auth/me — Get current user + preferences
 * POST /api/auth/me — Logout (delete session)
 */
import { getSessionFromRequest, deleteSession, getAllPrefs } from '../../../lib/auth';

export async function GET(req: Request) {
    const user = getSessionFromRequest(req);
    if (!user) {
        return Response.json({ authenticated: false });
    }

    const preferences = getAllPrefs(user.id);

    return Response.json({
        authenticated: true,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            email: user.email,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
        },
        preferences,
    });
}

export async function POST(req: Request) {
    // Logout
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/wm_session=([a-f0-9]+)/);
    if (match) {
        deleteSession(match[1]);
    }

    return new Response(null, {
        status: 200,
        headers: {
            'Set-Cookie': 'wm_session=; Path=/; HttpOnly; Max-Age=0',
        },
    });
}
