/**
 * /api/seismic — USGS Earthquake Feed
 *
 * Fetches real seismic data from USGS GeoJSON feeds.
 * Returns ALL earthquakes in the Middle East + Central Asia region,
 * and flags shallow events (≤2km depth) as potential kinetic suspects.
 *
 * Also fetches globally significant events (M4.5+) for wider context.
 */

let seismicCache: { events: any[]; ts: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute

export async function GET(request: Request) {
    if (seismicCache && Date.now() - seismicCache.ts < CACHE_TTL) {
        return Response.json({ events: seismicCache.events, cached: true });
    }

    try {
        // Fetch two feeds in parallel for maximum coverage
        const [allDayRes, sig7dRes] = await Promise.all([
            fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
                signal: AbortSignal.timeout(10000),
            }),
            fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', {
                signal: AbortSignal.timeout(10000),
            }),
        ]);

        const allDay = allDayRes.ok ? await allDayRes.json() : { features: [] };
        const sig7d = sig7dRes.ok ? await sig7dRes.json() : { features: [] };

        // Merge and deduplicate
        const seenIds = new Set<string>();
        const allFeatures = [...(allDay.features || []), ...(sig7d.features || [])];

        const events = allFeatures
            .filter((feat: any) => {
                if (seenIds.has(feat.id)) return false;
                seenIds.add(feat.id);
                return true; // Global coverage — no bounding box filter
            })
            .map((feat: any) => ({
                id: feat.id,
                title: feat.properties.title,
                mag: feat.properties.mag,
                time: feat.properties.time,
                lon: feat.geometry.coordinates[0],
                lat: feat.geometry.coordinates[1],
                depth: feat.geometry.coordinates[2],
                isKineticSuspect: feat.geometry.coordinates[2] <= 2.0,
                url: feat.properties.url,
            }))
            .sort((a: any, b: any) => b.time - a.time);

        seismicCache = { events, ts: Date.now() };
        return Response.json({ events, cached: false });
    } catch (e: any) {
        console.error('[seismic] USGS fetch failed:', e.message);

        if (seismicCache) {
            return Response.json({ events: seismicCache.events, cached: true, stale: true });
        }

        return Response.json({ error: 'Failed to fetch USGS' }, { status: 500 });
    }
}
