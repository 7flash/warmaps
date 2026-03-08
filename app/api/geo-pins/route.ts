// app/api/geo-pins/route.ts — Geo-Pin Chat API
// GET: list recent pins | POST: record a new verified pin
import { parseMemoToGeoPin, addPinToCache, fetchRecentGeoPins } from '../../lib/geo-pins'
import type { GeoPin } from '../../lib/geo-pins'

/** GET /api/geo-pins — list recent geo-pins */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const pins = await fetchRecentGeoPins(limit)
    return Response.json({ pins, count: pins.length })
}

/** POST /api/geo-pins — record a confirmed geo-pin after client tx */
export async function POST(req: Request) {
    const body = await req.json() as {
        signature: string
        sender: string
        lat: number
        lng: number
        message: string
        timestamp?: number
    }

    if (!body.signature || !body.sender || body.lat == null || body.lng == null || !body.message) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify lat/lng bounds
    if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
        return Response.json({ error: 'Invalid coordinates' }, { status: 400 })
    }

    // Sanitize message
    const message = body.message.substring(0, 280).replace(/[<>]/g, '')

    const pin: GeoPin = {
        signature: body.signature,
        sender: body.sender,
        lat: body.lat,
        lng: body.lng,
        message,
        timestamp: body.timestamp || Date.now(),
    }

    addPinToCache(pin)

    return Response.json({ ok: true, pin })
}
