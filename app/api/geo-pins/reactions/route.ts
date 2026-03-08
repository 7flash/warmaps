// app/api/geo-pins/reactions/route.ts — Geo-Pin Reaction API
// GET: get reactions for a pin | POST: add a reaction
import { savePinReaction, getPinReactions, ALLOWED_REACTIONS } from '../../../lib/geo-pins'

/** GET /api/geo-pins/reactions?signature=... — get reaction counts for a pin */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const signature = url.searchParams.get('signature')
    if (!signature) {
        return Response.json({ error: 'Missing signature query param' }, { status: 400 })
    }
    const reactions = getPinReactions(signature)
    return Response.json({ signature, reactions })
}

/** POST /api/geo-pins/reactions — add a reaction to a pin */
export async function POST(req: Request) {
    const body = await req.json() as { signature: string; reactor: string; emoji: string }

    if (!body.signature || !body.reactor || !body.emoji) {
        return Response.json({ error: 'Missing signature, reactor, or emoji' }, { status: 400 })
    }

    if (!ALLOWED_REACTIONS.includes(body.emoji as any)) {
        return Response.json({ error: `Invalid reaction. Allowed: ${ALLOWED_REACTIONS.join(' ')}` }, { status: 400 })
    }

    savePinReaction({
        pinSignature: body.signature,
        reactor: body.reactor,
        emoji: body.emoji,
        timestamp: Date.now(),
    })

    const reactions = getPinReactions(body.signature)
    return Response.json({ ok: true, reactions })
}
