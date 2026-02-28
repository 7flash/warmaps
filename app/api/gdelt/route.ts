/**
 * /api/gdelt — GDELT Event Query
 * 
 * Two modes:
 * 1. DOC API — searches recent news articles by keyword
 * 2. GKG 15-min export — downloads the latest event CSV with lat/lon
 * 
 * Extracts conflict events with geo coordinates when available,
 * falls back to Nominatim geocoding for location extraction.
 */

interface GdeltEvent {
    id: string;
    title: string;
    url: string;
    source: string;
    date: string;
    country: string;
    lat?: number;
    lon?: number;
    tone?: number;
    eventType?: string;
}

// ─── GDELT DOC 2.0 API (article search) ─────────────────────

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

async function queryGdeltDocs(query: string, maxRecords = 40): Promise<GdeltEvent[]> {
    try {
        const params = new URLSearchParams({
            query: query,
            mode: 'artlist',
            maxrecords: String(maxRecords),
            format: 'json',
            sort: 'datedesc',
        });

        const url = `${GDELT_DOC_API}?${params}`;
        console.log('[GDELT] Fetching:', url);

        const res = await fetch(url, {
            signal: AbortSignal.timeout(55000),
        });

        console.log('[GDELT] Status:', res.status);
        if (!res.ok) return [];

        const text = await res.text();
        console.log('[GDELT] Response length:', text.length, 'chars');

        const data = JSON.parse(text);
        if (!data.articles) {
            console.log('[GDELT] No articles key in response');
            return [];
        }

        console.log('[GDELT] Got', data.articles.length, 'articles');

        return data.articles.map((article: any, idx: number) => ({
            id: `gdelt-${idx}-${Date.now()}`,
            title: article.title || 'Untitled',
            url: article.url,
            source: article.domain || 'unknown',
            date: article.seendate || '',
            country: article.sourcecountry || '',
        }));
    } catch (err) {
        console.error('[GDELT] Fetch error:', err);
        return [];
    }
}

// ─── Location extraction from titles ─────────────────────────

// Known conflict locations → coordinates (fast, no API call)
const KNOWN_LOCATIONS: Record<string, [number, number]> = {
    'iran': [32.4, 53.7],
    'tehran': [35.69, 51.39],
    'isfahan': [32.65, 51.68],
    'shiraz': [29.59, 52.58],
    'tabriz': [38.07, 46.29],
    'ukraine': [49.0, 32.0],
    'kyiv': [50.45, 30.52],
    'kharkiv': [49.99, 36.23],
    'odesa': [46.47, 30.73],
    'donetsk': [48.0, 37.8],
    'zaporizhzhia': [47.85, 35.12],
    'gaza': [31.35, 34.31],
    'israel': [31.05, 34.85],
    'tel aviv': [32.07, 34.77],
    'jerusalem': [31.77, 35.23],
    'syria': [34.8, 38.99],
    'damascus': [33.51, 36.29],
    'aleppo': [36.20, 37.16],
    'iraq': [33.22, 43.68],
    'baghdad': [33.31, 44.37],
    'mosul': [36.34, 43.12],
    'lebanon': [33.85, 35.86],
    'beirut': [33.89, 35.50],
    'yemen': [15.55, 48.52],
    'sanaa': [15.37, 44.19],
    'aden': [12.78, 45.02],
    'russia': [55.75, 37.62],
    'moscow': [55.75, 37.62],
    'crimea': [44.95, 34.10],
    'sudan': [12.86, 30.22],
    'khartoum': [15.50, 32.56],
    'libya': [26.33, 17.23],
    'tripoli': [32.90, 13.18],
    'somalia': [5.15, 46.20],
    'mogadishu': [2.05, 45.32],
    'pakistan': [30.38, 69.35],
    'afghanistan': [33.94, 67.71],
    'kabul': [34.53, 69.17],
    'taiwan': [23.70, 120.96],
    'south china sea': [15.0, 115.0],
    'north korea': [40.0, 127.0],
    'pyongyang': [39.02, 125.75],
    'nato': [50.88, 4.32],
    'pentagon': [38.87, -77.06],
};

function extractLocations(title: string): Array<{ name: string; lat: number; lon: number }> {
    const lower = title.toLowerCase();
    const found: Array<{ name: string; lat: number; lon: number }> = [];

    for (const [name, [lat, lon]] of Object.entries(KNOWN_LOCATIONS)) {
        if (lower.includes(name)) {
            found.push({ name, lat, lon });
        }
    }

    return found;
}

// ─── Main handler ────────────────────────────────────────────

let cache: { data: GdeltEvent[]; ts: number } | null = null;
const CACHE_TTL = 3 * 60 * 1000;

export async function GET(req: Request) {
    const url = new URL(req.url);
    const region = url.searchParams.get('region') || 'conflict';

    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        return Response.json({ events: cache.data, cached: true });
    }

    const queries: Record<string, string> = {
        conflict: 'war conflict military strike missile attack',
        mideast: 'Iran Israel Gaza Syria Lebanon military',
        europe: 'Ukraine Russia NATO military',
    };

    const query = queries[region] || queries.conflict;
    const events = await queryGdeltDocs(query, 40);

    // Enrich events with coordinates from title analysis
    for (const ev of events) {
        const locs = extractLocations(ev.title);
        if (locs.length > 0) {
            ev.lat = locs[0].lat;
            ev.lon = locs[0].lon;
            if (!ev.country) ev.country = locs[0].name;
        }
    }

    cache = { data: events, ts: Date.now() };
    return Response.json({ events, cached: false });
}
