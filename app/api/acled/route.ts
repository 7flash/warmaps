/**
 * /api/acled — ACLED Tactical Kinetic Events + GDELT News Cross-Reference
 *
 * Returns curated conflict events as GeoJSON with enrichment:
 * - Each event is cross-referenced against cached GDELT data
 * - Nearby GDELT articles (within ~50km) are attached as related_news
 * - Provides spatial context: "This strike happened HERE, and these articles covered it"
 *
 * Note: Currently uses curated mock events. When ACLED API key is available,
 * swap the `getCuratedEvents()` call with a real API fetch:
 *   https://api.acleddata.com/acled/read?key=XXX&email=XXX&...
 */

// In-memory GDELT cache for cross-referencing (populated by /api/gdelt calls)
let gdeltCache: Array<{ title: string; url: string; lat: number; lon: number; date: string; source: string }> = [];
let gdeltCacheTs = 0;

// Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
    // Refresh GDELT cache for cross-referencing (every 2 min)
    if (Date.now() - gdeltCacheTs > 120_000) {
        try {
            const gdeltRes = await fetch(new URL('/api/gdelt?region=conflict', req.url).toString());
            if (gdeltRes.ok) {
                const gdeltData = await gdeltRes.json();
                if (gdeltData.events) {
                    gdeltCache = gdeltData.events
                        .filter((e: any) => e.lat && e.lon && e.title)
                        .map((e: any) => ({
                            title: e.title,
                            url: e.url || '',
                            lat: e.lat,
                            lon: e.lon,
                            date: e.date || '',
                            source: e.source || '',
                        }));
                    gdeltCacheTs = Date.now();
                }
            }
        } catch { /* GDELT cross-ref is optional */ }
    }

    const acledEvents = getCuratedEvents();

    // Enrich each ACLED event with nearby GDELT articles
    const RADIUS_KM = 75; // Match radius for "related news"
    const MAX_RELATED = 5;

    const geojson = {
        type: 'FeatureCollection',
        features: acledEvents.map(ev => {
            // Find GDELT articles within radius
            const related = gdeltCache
                .filter(g => haversineKm(ev.lat, ev.lon, g.lat, g.lon) < RADIUS_KM)
                .sort((a, b) => {
                    // Prioritize articles closer in time, then distance
                    const distA = haversineKm(ev.lat, ev.lon, a.lat, a.lon);
                    const distB = haversineKm(ev.lat, ev.lon, b.lat, b.lon);
                    return distA - distB;
                })
                .slice(0, MAX_RELATED)
                .map(g => ({
                    title: g.title,
                    url: g.url,
                    source: g.source,
                    distance_km: Math.round(haversineKm(ev.lat, ev.lon, g.lat, g.lon)),
                }));

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [ev.lon, ev.lat]
                },
                properties: {
                    id: ev.id,
                    date: ev.date,
                    type: ev.type,
                    sub_type: ev.sub_type,
                    actor1: ev.actor1,
                    actor2: ev.actor2,
                    location: ev.location,
                    country: ev.country,
                    fatalities: ev.fatalities,
                    notes: ev.notes,
                    confidence: ev.confidence,
                    title: `${ev.sub_type}: ${ev.actor1} vs ${ev.actor2}`,
                    // Enrichment
                    related_news: related,
                    related_count: related.length,
                    severity: ev.fatalities > 5 ? 'critical' :
                        ev.fatalities > 0 ? 'high' :
                            ev.sub_type.includes('Airstrike') || ev.sub_type.includes('Missile') ? 'high' : 'medium',
                }
            };
        })
    };

    return Response.json(geojson);
}

/**
 * Curated tactical events — replace with real ACLED API when key is available.
 * Events are dynamically dated relative to "now" for realism.
 */
function getCuratedEvents() {
    const now = Date.now();
    const day = 86400000;

    return [
        {
            id: 'acled-1',
            date: new Date(now).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Airstrike',
            actor1: 'State Forces (Israel)',
            actor2: 'Hezbollah',
            location: 'Beirut Southern Suburbs (Dahiyeh)',
            country: 'Lebanon',
            lat: 33.8446,
            lon: 35.5135,
            fatalities: 2,
            notes: 'Targeted airstrike on reported Hezbollah command complex in Dahiyeh.',
            confidence: 'High'
        },
        {
            id: 'acled-2',
            date: new Date(now).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Drone Strike',
            actor1: 'Houthi Movement',
            actor2: 'Naval Forces (International)',
            location: 'Red Sea, off Al Hudaydah',
            country: 'Yemen',
            lat: 15.0135,
            lon: 41.9213,
            fatalities: 0,
            notes: 'Multiple one-way attack UAS intercepted by coalition air defenses.',
            confidence: 'Moderate'
        },
        {
            id: 'acled-3',
            date: new Date(now - day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Artillery Fire',
            actor1: 'State Forces (Israel)',
            actor2: 'Hezbollah',
            location: 'Kfar Kila',
            country: 'Lebanon',
            lat: 33.2847,
            lon: 35.5452,
            fatalities: 1,
            notes: 'IDF artillery targeted observation posts along the Blue Line.',
            confidence: 'High'
        },
        {
            id: 'acled-4',
            date: new Date(now - day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Missile Interception',
            actor1: 'State Forces (Iran)',
            actor2: 'State Forces (Israel)',
            location: 'Erbil Airspace',
            country: 'Iraq',
            lat: 36.1911,
            lon: 44.0091,
            fatalities: 0,
            notes: 'Reports of ballistic missile interceptions over Kurdish regional airspace.',
            confidence: 'Moderate'
        },
        {
            id: 'acled-5',
            date: new Date(now - 2 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Armed Clash',
            actor1: 'Islamic Resistance in Iraq',
            actor2: 'US Military Forces',
            location: 'Al Asad Airbase',
            country: 'Iraq',
            lat: 33.7915,
            lon: 42.4468,
            fatalities: 0,
            notes: 'Indirect fire (rockets) targeting US logistical staging area.',
            confidence: 'High'
        },
        {
            id: 'acled-6',
            date: new Date(now - 3 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Airstrike',
            actor1: 'State Forces (Israel)',
            actor2: 'IRGC (Quds Force)',
            location: 'Sayyidah Zaynab Shrine Area',
            country: 'Syria',
            lat: 33.4385,
            lon: 36.3353,
            fatalities: 3,
            notes: 'Alleged IAF strike targeting IRGC logistical facility south of Damascus.',
            confidence: 'Moderate'
        },
        {
            id: 'acled-7',
            date: new Date(now - 4 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Drone Strike',
            actor1: 'State Forces (USA)',
            actor2: 'Kataib Hezbollah',
            location: 'Baghdad (Eastern)',
            country: 'Iraq',
            lat: 33.3152,
            lon: 44.3661,
            fatalities: 1,
            notes: 'UAV strike targeting militia commander moving in a vehicle convoy.',
            confidence: 'High'
        },
        {
            id: 'acled-8',
            date: new Date(now - 5 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Shelling',
            actor1: 'State Forces (Israel)',
            actor2: 'Hamas',
            location: 'Rafah',
            country: 'Palestine',
            lat: 31.2889,
            lon: 34.2471,
            fatalities: 8,
            notes: 'Heavy shelling reported near Rafah crossing border zone.',
            confidence: 'High'
        },
        {
            id: 'acled-9',
            date: new Date(now - 2 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Car Bomb',
            actor1: 'ISIS (Islamic State)',
            actor2: 'Civilians',
            location: 'Raqqa',
            country: 'Syria',
            lat: 35.9528,
            lon: 39.0065,
            fatalities: 4,
            notes: 'IED detonated near marketplace, attributed to ISIS sleeper cell.',
            confidence: 'Moderate'
        },
        {
            id: 'acled-10',
            date: new Date(now - 6 * day).toISOString().slice(0, 10),
            type: 'acled-kinetic',
            sub_type: 'Naval Engagement',
            actor1: 'State Forces (USA)',
            actor2: 'Houthi Movement',
            location: 'Bab al-Mandab Strait',
            country: 'Yemen',
            lat: 12.5764,
            lon: 43.3315,
            fatalities: 0,
            notes: 'USN destroyer engaged incoming anti-ship ballistic missiles.',
            confidence: 'High'
        },
    ];
}
