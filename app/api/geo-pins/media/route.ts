// app/api/geo-pins/media/route.ts — Geo-Pin Media Attachment API
// GET: get media for a pin | POST: upload media for a pin
import { savePinMedia, getPinMedia } from '../../../lib/geo-pins'

const MAX_SIZE = 2 * 1024 * 1024 // 2MB max

/** GET /api/geo-pins/media?signature=... — get image for a pin */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const signature = url.searchParams.get('signature')
    if (!signature) {
        return Response.json({ error: 'Missing signature' }, { status: 400 })
    }

    const media = getPinMedia(signature)
    if (!media) {
        return Response.json({ error: 'No media found' }, { status: 404 })
    }

    return Response.json({
        signature,
        imageData: media.imageData,
        mimeType: media.mimeType,
        timestamp: media.timestamp,
    })
}

/** POST /api/geo-pins/media — upload image for a pin */
export async function POST(req: Request) {
    const body = await req.json() as { signature: string; imageData: string; mimeType?: string }

    if (!body.signature || !body.imageData) {
        return Response.json({ error: 'Missing signature or imageData' }, { status: 400 })
    }

    // Validate base64 data URL
    if (!body.imageData.startsWith('data:image/')) {
        return Response.json({ error: 'imageData must be a base64 data URL (data:image/...)' }, { status: 400 })
    }

    // Check size (rough: base64 is ~1.37x the binary size)
    if (body.imageData.length > MAX_SIZE * 1.37) {
        return Response.json({ error: 'Image too large (max 2MB)' }, { status: 413 })
    }

    const mimeType = body.mimeType || body.imageData.split(';')[0]?.replace('data:', '') || 'image/jpeg'

    savePinMedia({
        pinSignature: body.signature,
        imageData: body.imageData,
        mimeType,
        timestamp: Date.now(),
    })

    return Response.json({ ok: true, signature: body.signature })
}
