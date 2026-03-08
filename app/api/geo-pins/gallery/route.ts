import { getAllPinMedia, getPinMedia } from '../../../lib/geo-pins'

export function GET(req: Request) {
    const url = new URL(req.url)
    const signature = url.searchParams.get('signature')

    // Single media: return full base64 data
    if (signature) {
        const media = getPinMedia(signature)
        return Response.json(media || { error: 'Not found' }, { status: media ? 200 : 404 })
    }

    // Gallery listing: return lightweight metadata (no base64 payload)
    const gallery = getAllPinMedia()
    return Response.json({ gallery, count: gallery.length })
}
