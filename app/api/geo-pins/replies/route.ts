// app/api/geo-pins/replies/route.ts — Geo-Pin Thread Replies
// GET: list replies for a pin | POST: add a reply
import { saveReply, getReplies } from '../../../lib/geo-pins'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const signature = url.searchParams.get('signature')
    if (!signature) {
        return Response.json({ error: 'Missing signature' }, { status: 400 })
    }
    const replies = getReplies(signature)
    return Response.json({ replies })
}

export async function POST(req: Request) {
    const body = await req.json() as { signature: string; sender: string; message: string }
    if (!body.signature || !body.message) {
        return Response.json({ error: 'Missing signature or message' }, { status: 400 })
    }
    if (body.message.length > 500) {
        return Response.json({ error: 'Message too long (max 500 chars)' }, { status: 400 })
    }

    saveReply({
        pinSignature: body.signature,
        sender: body.sender || 'anonymous',
        message: body.message,
        timestamp: Date.now(),
    })

    const replies = getReplies(body.signature)
    return Response.json({ ok: true, replies })
}
