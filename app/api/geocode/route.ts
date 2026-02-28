/**
 * /api/geocode — OpenStreetMap Nominatim Geocoder
 * 
 * Turns location names ("Isfahan", "Kharkiv") into lat/lon.
 * Free, no key. Rate limit: 1 req/sec.
 */

interface GeoResult {
    query: string;
    lat: number;
    lon: number;
    displayName: string;
}

// In-memory cache — locations don't move
const geoCache = new Map<string, GeoResult | null>();

async function geocode(query: string): Promise<GeoResult | null> {
    const key = query.toLowerCase().trim();
    if (geoCache.has(key)) return geoCache.get(key) || null;

    try {
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            limit: '1',
        });

        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: { 'User-Agent': 'STARWAR/1.0 (conflict-monitor)' },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return null;
        const data = await res.json();

        if (!data.length) {
            geoCache.set(key, null);
            return null;
        }

        const result: GeoResult = {
            query,
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            displayName: data[0].display_name,
        };

        geoCache.set(key, result);
        return result;
    } catch {
        return null;
    }
}

// Rate limiter — 1 request per second for Nominatim
let lastRequest = 0;

async function geocodeThrottled(query: string): Promise<GeoResult | null> {
    const key = query.toLowerCase().trim();
    if (geoCache.has(key)) return geoCache.get(key) || null;

    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastRequest));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequest = Date.now();

    return geocode(query);
}

// Batch geocode multiple queries (respecting rate limit)
async function batchGeocode(queries: string[]): Promise<Map<string, GeoResult>> {
    const results = new Map<string, GeoResult>();
    const unique = [...new Set(queries.map(q => q.toLowerCase().trim()))];

    for (const q of unique) {
        const result = await geocodeThrottled(q);
        if (result) results.set(q, result);
    }

    return results;
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');

    if (!query) {
        return Response.json({ error: 'Missing ?q= parameter' }, { status: 400 });
    }

    const result = await geocodeThrottled(query);
    return Response.json({ result });
}

export async function POST(req: Request) {
    const body = await req.json();
    const queries: string[] = body.queries || [];

    if (!queries.length) {
        return Response.json({ error: 'Missing queries array' }, { status: 400 });
    }

    const results = await batchGeocode(queries.slice(0, 20));
    return Response.json({ results: Object.fromEntries(results) });
}
