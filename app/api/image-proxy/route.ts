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
const FAIL_CACHE = new Map<string, number>(); // URL -> timestamp of failure
const CACHE_TTL = 300_000; // 5 minutes
const FAIL_TTL = 600_000; // 10 minutes — don't retry failed URLs
const MAX_CACHE = 200;

// 1x1 transparent PNG for graceful failures
const TRANSPARENT_1PX = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
    31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 98, 0, 0, 0, 6, 0, 5, 130, 208, 64, 0,
    0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

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

    // Check negative cache — return transparent pixel for recently failed URLs
    const failTs = FAIL_CACHE.get(imageUrl);
    if (failTs && Date.now() - failTs < FAIL_TTL) {
        return new Response(TRANSPARENT_1PX, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=60',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    // Check positive cache
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
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            FAIL_CACHE.set(imageUrl, Date.now());
            return new Response(TRANSPARENT_1PX, {
                headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' },
            });
        }

        const contentType = res.headers.get('content-type') || 'image/jpeg';

        // Only proxy images
        if (!contentType.startsWith('image/')) {
            FAIL_CACHE.set(imageUrl, Date.now());
            return new Response(TRANSPARENT_1PX, {
                headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' },
            });
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
        FAIL_CACHE.set(imageUrl, Date.now());
        return new Response(TRANSPARENT_1PX, {
            headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
