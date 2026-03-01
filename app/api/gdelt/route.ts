/**
 * /api/gdelt — GDELT Visual Intelligence Pipeline
 *
 * Three-source architecture for maximum image coverage + precision:
 *
 * 1. GDELT GKG Raw CSV (PRIMARY) — 15-minute update cadence
 *    Downloads the latest Global Knowledge Graph export from GDELT v2.
 *    Parses V2EnhancedLocations for Cloud Vision-derived lat/lon.
 *    Extracts SharingImage + RelatedImages for photographic markers.
 *    Filters by conflict-related V2EnhancedThemes.
 *
 * 2. GDELT DOC API (SECONDARY) — Article-level keyword search
 *    Queries by conflict keywords, returns socialimage URLs.
 *    Title-based geolocation via KNOWN_LOCATIONS dictionary.
 *
 * 3. Merge + Deduplicate — URL-based dedup, coordinate enrichment.
 *
 * ARCHITECTURAL DECISIONS (see ARCHITECTURE.md):
 * - fflate chosen over adm-zip: 8KB pure JS, works in Bun, handles ZIP containers
 * - GKG raw files preferred over GDELT GEO API: gives ALL images per article,
 *   not just social share image. Also provides V2EnhancedThemes for filtering.
 * - Cache TTL set to 90s (GKG updates every 15min, but DOC API is faster)
 * - KNOWN_LOCATIONS fallback retained: GKG may not always have V2EnhancedLocations
 *   for every article; title parsing catches additional matches.
 */

import { unzipSync } from 'fflate';

// ─── Types ───────────────────────────────────────────────────

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
    imageUrl?: string;
    images?: string[];        // All related images from article
    themes?: string[];        // Cloud Vision / GKG themes
    confidence?: number;      // Geolocation confidence (0-1)
    vgkg?: boolean;           // Whether sourced from VGKG (higher quality geo)
}

// ─── Conflict Theme Detection ────────────────────────────────

const CONFLICT_THEMES = [
    'MILITARY', 'KILL', 'TERROR', 'PROTEST', 'ARREST',
    'ARMED_CONFLICT', 'WAR', 'BOMB', 'WEAPON', 'STRIKE',
    'REBELLION', 'SIEGE', 'DRONE', 'MISSILE', 'HOSTAGE',
    'SANCTIONS', 'NUCLEAR', 'ASSASSINATION', 'EXPLOSION',
    'AIRSTRIKE', 'CEASEFIRE', 'ARTILLERY', 'CASUALTIES',
    'REFUGEE', 'HUMANITARIAN', 'CRISISLEX', 'WMD',
    'TAX_FNCACT_KILL', 'TAX_FNCACT_WOUND', 'TAX_FNCACT_ARREST',
    'ARMEDCONFLICT', 'GENERAL_GOVERNMENT', 'ECON_SANCTIONS',
    'POLITICAL_TURMOIL', 'MANMADE_DISASTER',
];

function isConflictTheme(themes: string): boolean {
    const upper = themes.toUpperCase();
    return CONFLICT_THEMES.some(t => upper.includes(t));
}

// ─── Source 1: GDELT GKG Raw 15-min File ─────────────────────

const GDELT_LASTUPDATE = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

async function fetchLatestGKG(): Promise<GdeltEvent[]> {
    try {
        // Step 1: Get the latest GKG file URL from the master index
        const indexRes = await fetch(GDELT_LASTUPDATE, {
            signal: AbortSignal.timeout(10000),
        });
        if (!indexRes.ok) throw new Error(`lastupdate.txt returned ${indexRes.status}`);

        const indexText = await indexRes.text();
        const lines = indexText.trim().split('\n');

        // The 3rd line is the GKG file (format: "SIZE MD5HASH URL")
        const gkgLine = lines.find(l => l.includes('.gkg.csv'));
        if (!gkgLine) {
            console.log('[VGKG] No GKG line found in lastupdate.txt');
            return [];
        }

        const gkgUrl = gkgLine.split(' ').pop()!.trim();
        console.log('[VGKG] Fetching GKG file:', gkgUrl);

        // Step 2: Download the ZIP file
        const zipRes = await fetch(gkgUrl, {
            signal: AbortSignal.timeout(30000),
        });
        if (!zipRes.ok) throw new Error(`GKG ZIP returned ${zipRes.status}`);

        const zipBuffer = await zipRes.arrayBuffer();
        const zipData = new Uint8Array(zipBuffer);
        console.log('[VGKG] Downloaded', (zipData.length / 1024).toFixed(1), 'KB');

        // Step 3: Decompress ZIP using fflate
        const entries = unzipSync(zipData);
        const csvFileName = Object.keys(entries)[0];
        if (!csvFileName) throw new Error('Empty ZIP archive');

        const csvData = new TextDecoder().decode(entries[csvFileName]);
        const rows = csvData.split('\n');
        console.log('[VGKG] Parsed', rows.length, 'GKG rows');

        // Step 4: Parse GKG 2.0 TSV format
        // Key columns (0-indexed, tab-separated):
        //  0: GKGRECORDID
        //  1: V2.1DATE (YYYYMMDDHHMMSS)
        //  3: V2SourceCommonName
        //  4: V2DocumentIdentifier (URL)
        //  8: V2EnhancedThemes (semicolon-delimited, contains TAX_ codes)
        // 10: V2EnhancedLocations (TYPE#FULLNAME#COUNTRYCODE#ADM1CODE#LAT#LON#FEATUREID;...)
        // 15: V2Tone (comma-separated tone values)
        // 18: V2.1SharingImage
        // 19: V2.1RelatedImages (semicolon-delimited URLs)

        const events: GdeltEvent[] = [];
        let conflictCount = 0;
        let geoCount = 0;
        let imageCount = 0;

        for (const row of rows) {
            if (!row.trim()) continue;
            const cols = row.split('\t');
            if (cols.length < 20) continue;

            const themes = cols[8] || '';
            const locations = cols[10] || '';
            const sharingImage = (cols[18] || '').trim();
            const relatedImages = (cols[19] || '').trim();

            // Must have at least one image
            if (!sharingImage && !relatedImages) continue;
            imageCount++;

            // Filter for conflict-related content
            if (!isConflictTheme(themes)) continue;
            conflictCount++;

            // Parse V2EnhancedLocations for lat/lon
            let lat: number | undefined, lon: number | undefined, country = '';
            const locParts = locations.split(';').filter(Boolean);

            for (const loc of locParts) {
                const fields = loc.split('#');
                if (fields.length >= 6) {
                    const locLat = parseFloat(fields[4]);
                    const locLon = parseFloat(fields[5]);
                    if (!isNaN(locLat) && !isNaN(locLon) && locLat !== 0 && locLon !== 0) {
                        lat = locLat;
                        lon = locLon;
                        country = fields[2] || '';
                        break;
                    }
                }
            }

            // Must have coordinates (Cloud Vision geolocated)
            if (lat === undefined || lon === undefined) continue;
            geoCount++;

            const date = cols[1] || '';
            const source = cols[3] || '';
            const articleUrl = cols[4] || '';

            // Collect all images
            const images: string[] = [];
            if (sharingImage) images.push(sharingImage);
            if (relatedImages) {
                images.push(...relatedImages.split(';').filter(u => u.trim().startsWith('http')));
            }

            // Parse tone (first value is overall tone, negative = negative sentiment)
            const toneValues = (cols[15] || '').split(',');
            const tone = parseFloat(toneValues[0]) || 0;

            // Extract theme labels (strip TAX_ prefix, limit to 5)
            const themeLabels = themes.split(';')
                .filter(Boolean)
                .map(t => t.split(',')[0]?.replace(/^TAX_/i, '') || t)
                .slice(0, 5);

            // Build a human-readable title from theme + country
            const THEME_LABELS: Record<string, string> = {
                'KILL': 'Attack', 'TERROR': 'Terror Incident', 'PROTEST': 'Protest',
                'MILITARY': 'Military Activity', 'ARREST': 'Arrest', 'WOUND': 'Casualties',
                'ARMEDCONFLICT': 'Armed Conflict', 'CRISISLEX': 'Crisis',
                'WMD': 'WMD Threat', 'FNCACT_KILL': 'Killing',
                'ECON_SANCTIONS': 'Sanctions', 'REFUGEE': 'Refugee Crisis',
                'HUMANITARIAN': 'Humanitarian Crisis', 'POLITICAL_TURMOIL': 'Political Turmoil',
            };
            const readableTheme = themeLabels.reduce((acc: string, t: string) => {
                if (acc !== 'Conflict Event') return acc;
                for (const [key, label] of Object.entries(THEME_LABELS)) {
                    if (t.toUpperCase().includes(key)) return label;
                }
                return acc;
            }, 'Conflict Event');
            const location = country || source;

            events.push({
                id: `gkg-${date}-${events.length}`,
                title: `${readableTheme}${location ? ' — ' + location : ''}`,
                url: articleUrl,
                source,
                date: formatGkgDate(date),
                country,
                lat,
                lon,
                tone,
                imageUrl: images[0] || undefined,
                images: images.slice(0, 5), // Cap at 5 images per event
                themes: themeLabels,
                confidence: 0.85, // Cloud Vision geolocation = high confidence
                vgkg: true,
            });
        }

        console.log(`[VGKG] Pipeline: ${rows.length} rows → ${imageCount} with images → ${conflictCount} conflict → ${geoCount} geolocated → ${events.length} final events`);
        return events;

    } catch (err) {
        console.error('[VGKG] Fetch error:', err);
        return [];
    }
}

function formatGkgDate(raw: string): string {
    if (!raw || raw.length < 8) return raw;
    // YYYYMMDDHHMMSS → YYYY-MM-DD HH:MM
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10) || '00'}:${raw.slice(10, 12) || '00'}`;
}

// ─── Source 2: GDELT DOC 2.0 API (article search) ───────────

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
        console.log('[GDELT-DOC] Fetching:', url);

        const res = await fetch(url, {
            signal: AbortSignal.timeout(55000),
        });

        if (!res.ok) return [];

        const text = await res.text();
        const data = JSON.parse(text);
        if (!data.articles) return [];

        console.log('[GDELT-DOC] Got', data.articles.length, 'articles');

        return data.articles.map((article: any, idx: number) => ({
            id: `doc-${idx}-${Date.now()}`,
            title: article.title || 'Untitled',
            url: article.url,
            source: article.domain || 'unknown',
            date: article.seendate || '',
            country: article.sourcecountry || '',
            imageUrl: article.socialimage || null,
            confidence: 0.5, // Title-based geolocation = moderate confidence
            vgkg: false,
        }));
    } catch (err) {
        console.error('[GDELT-DOC] Fetch error:', err);
        return [];
    }
}

// ─── Known Conflict Location Dictionary ──────────────────────
// Fallback geocoding for DOC API articles without native coordinates.
// VGKG events already have Cloud Vision-derived lat/lon and skip this.

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
    'kherson': [46.64, 32.62],
    'mariupol': [47.10, 37.55],
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
    'houthis': [15.37, 44.19],
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
    'dubai': [25.20, 55.27],
    'abu dhabi': [24.45, 54.65],
    'burj': [25.14, 55.19],
    'qatar': [25.29, 51.53],
    'doha': [25.29, 51.53],
    'bahrain': [26.07, 50.55],
    'kuwait': [29.38, 47.99],
    'riyadh': [24.71, 46.67],
    'jeddah': [21.49, 39.19],
    'hormuz': [26.60, 56.25],
    'natanz': [33.51, 51.92],
    'united arab emirates': [24.45, 54.65],
    'uae': [24.45, 54.65],
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

// ─── Merge & Deduplicate ─────────────────────────────────────

function mergeEvents(gkg: GdeltEvent[], docs: GdeltEvent[]): GdeltEvent[] {
    const seen = new Set<string>();
    const merged: GdeltEvent[] = [];

    // GKG events first (higher quality geo, direct Cloud Vision)
    for (const ev of gkg) {
        const key = ev.url || ev.id;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(ev);
    }

    // DOC API events second (enriched with title-based geocoding)
    for (const ev of docs) {
        const key = ev.url || ev.id;
        if (seen.has(key)) continue;
        seen.add(key);

        // Enrich with coordinates from title analysis
        if (!ev.lat || !ev.lon) {
            const locs = extractLocations(ev.title);
            if (locs.length > 0) {
                ev.lat = locs[0].lat;
                ev.lon = locs[0].lon;
                if (!ev.country) ev.country = locs[0].name;
            }
        }

        merged.push(ev);
    }

    return merged;
}

// ─── Main Handler ────────────────────────────────────────────

let cache: { data: GdeltEvent[]; ts: number } | null = null;
const CACHE_TTL = 90 * 1000; // 90 seconds (GKG updates every 15min)

export async function GET(req: Request) {
    const url = new URL(req.url);
    const region = url.searchParams.get('region') || 'conflict';

    if (cache && Date.now() - cache.ts < CACHE_TTL && cache.data.length > 0) {
        return Response.json({
            events: cache.data,
            cached: true,
            stats: buildStats(cache.data),
        });
    }

    const queries: Record<string, string> = {
        conflict: 'war conflict military strike missile attack',
        mideast: 'Iran Israel Gaza Syria Lebanon military',
        europe: 'Ukraine Russia NATO military',
    };

    const query = queries[region] || queries.conflict;

    try {
        // Fetch both sources in parallel
        const [gkgEvents, docEvents] = await Promise.all([
            fetchLatestGKG(),
            queryGdeltDocs(query, 60),
        ]);

        console.log(`[GDELT] Sources: GKG=${gkgEvents.length}, DOC=${docEvents.length}`);

        const merged = mergeEvents(gkgEvents, docEvents);

        console.log(`[GDELT] Merged: ${merged.length} total events (${merged.filter(e => e.lat && e.lon).length} geolocated, ${merged.filter(e => e.imageUrl).length} with images)`);

        // Only cache non-empty results
        if (merged.length > 0) {
            cache = { data: merged, ts: Date.now() };
        }

        // If we got nothing, return stale cache if available
        if (merged.length === 0 && cache && cache.data.length > 0) {
            return Response.json({
                events: cache.data,
                cached: true,
                stale: true,
                stats: buildStats(cache.data),
            });
        }

        return Response.json({
            events: merged,
            cached: false,
            stats: buildStats(merged),
        });
    } catch (err) {
        console.error('[GDELT] Pipeline error:', err);
        if (cache && cache.data.length > 0) {
            return Response.json({
                events: cache.data,
                cached: true,
                stale: true,
                stats: buildStats(cache.data),
            });
        }
        return Response.json({ events: [], cached: false, error: 'GDELT unavailable' });
    }
}

function buildStats(events: GdeltEvent[]) {
    return {
        total: events.length,
        geolocated: events.filter(e => e.lat && e.lon).length,
        withImages: events.filter(e => e.imageUrl).length,
        vgkg: events.filter(e => e.vgkg).length,
        docApi: events.filter(e => !e.vgkg).length,
    };
}
