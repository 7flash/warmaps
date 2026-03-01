/**
 * /api/image-proxy — CORS-safe image proxy for external OSINT images
 *
 * External images from GDELT, news sources, etc. are blocked by browsers
 * due to CORS policies. This proxy fetches them server-side and returns
 * them to the client with proper headers.
 *
 * Usage: /api/image-proxy?url=https://example.com/image.jpg
 */

const CACHE = new Map<string, { data: ArrayBuffer; contentType: string; ts: number }>();
const CACHE_TTL = 300_000; // 5 minutes
const MAX_CACHE = 200;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return new Response('Missing ?url= parameter', { status: 400 });
    }

    // Validate URL
    try {
        new URL(imageUrl);
    } catch {
        return new Response('Invalid URL', { status: 400 });
    }

    // Check cache
    const cached = CACHE.get(imageUrl);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return new Response(cached.data, {
            headers: {
                'Content-Type': cached.contentType,
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    try {
        const res = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*',
                'Referer': new URL(imageUrl).origin,
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
            return new Response(`Upstream returned ${res.status}`, { status: 502 });
        }

        const contentType = res.headers.get('content-type') || 'image/jpeg';

        // Only proxy images
        if (!contentType.startsWith('image/')) {
            return new Response('Not an image', { status: 400 });
        }

        const data = await res.arrayBuffer();

        // Cache (evict oldest if over limit)
        if (CACHE.size >= MAX_CACHE) {
            const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
            if (oldest) CACHE.delete(oldest[0]);
        }
        CACHE.set(imageUrl, { data, contentType, ts: Date.now() });

        return new Response(data, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (e: any) {
        console.error('[IMAGE-PROXY] Failed:', imageUrl, e.message);
        return new Response('Proxy fetch failed', { status: 502 });
    }
}
