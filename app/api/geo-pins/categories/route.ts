import { savePinCategory, getPinCategory, PIN_CATEGORIES } from '../../../lib/geo-pins'

export function GET(req: Request) {
    const url = new URL(req.url)
    const signature = url.searchParams.get('signature')
    if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 })

    const category = getPinCategory(signature)
    return Response.json({ category })
}

export function POST(req: Request) {
    return req.json().then((body: any) => {
        const { signature, category } = body
        if (!signature || !category) {
            return Response.json({ error: 'Missing signature or category' }, { status: 400 })
        }
        if (!(category in PIN_CATEGORIES)) {
            return Response.json({ error: `Invalid category. Allowed: ${Object.keys(PIN_CATEGORIES).join(', ')}` }, { status: 400 })
        }
        savePinCategory(signature, category)
        return Response.json({ ok: true, category })
    })
}
