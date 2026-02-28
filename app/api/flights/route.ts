/**
 * /api/flights — Live Aircraft Telemetry (ADS-B)
 * 
 * Fetches real-time aircraft positions over the Middle East
 * from the OpenSky Network REST API.
 * 
 * Bounding box: lat 20-42, lon 25-65 (Middle East + Eastern Med)
 */

// In-memory cache to respect OpenSky rate limits
let flightCache: { data: any[]; ts: number } | null = null;
const CACHE_TTL = 15_000; // 15 seconds

export async function GET(request: Request) {
    // Return from cache if fresh
    if (flightCache && Date.now() - flightCache.ts < CACHE_TTL) {
        return Response.json({
            flights: flightCache.data,
            stats: { total: flightCache.data.length },
            cached: true,
        });
    }

    try {
        // OpenSky Network — wider Middle East bounding box
        const res = await fetch(
            'https://opensky-network.org/api/states/all?lamin=20&lamax=42&lomin=25&lomax=65',
            { signal: AbortSignal.timeout(12000) }
        );

        if (!res.ok) throw new Error(`OpenSky returned ${res.status}`);
        const data = await res.json();

        let flights: any[] = [];
        if (data && data.states) {
            flights = data.states
                .filter((s: any) => s[5] !== null && s[6] !== null)
                .map((state: any) => {
                    const callsign = (state[1] || '').trim();
                    return {
                        lon: state[5],
                        lat: state[6],
                        callsign: callsign || state[0],
                        country: state[2],
                        alt: state[7] || 0,
                        velocity: state[9] || 0,
                        heading: state[10] || 0,
                        on_ground: state[8] || false,
                        type: classifyAircraft(callsign, state[2]),
                    };
                })
                .filter((f: any) => !f.on_ground); // Only airborne
        }

        flightCache = { data: flights, ts: Date.now() };

        return Response.json({
            flights,
            stats: { total: flights.length },
            cached: false,
        });
    } catch (e: any) {
        console.error('[flights] OpenSky fetch failed:', e.message);

        // Return stale cache if available
        if (flightCache) {
            return Response.json({
                flights: flightCache.data,
                stats: { total: flightCache.data.length },
                cached: true,
                stale: true,
            });
        }

        return Response.json({
            flights: [],
            stats: { total: 0 },
            error: 'OpenSky unavailable',
        });
    }
}

/**
 * Heuristic aircraft classification based on callsign patterns.
 * Military / government aircraft often use non-ICAO callsigns.
 */
function classifyAircraft(callsign: string, country: string): string {
    const cs = callsign.toUpperCase();

    // Known military callsign prefixes
    const milPrefixes = [
        'RCH', 'REACH', 'DUKE', 'DOOM', 'KNIFE', 'PYTHON', 'VIPER',
        'COBRA', 'HAWK', 'EAGLE', 'FORTE', 'HOMER', 'LAGR', 'NCHO',
        'JAKE', 'TOPCAT', 'RRR', 'CNV', 'IAM', // IRGC/IRIAF
        'IRGC', 'IAF', 'USAF', 'RAF', 'RFR',
    ];

    if (milPrefixes.some(p => cs.startsWith(p))) return 'military';

    // Common civilian airline ICAO prefixes (3-letter + digits)
    if (cs.match(/^[A-Z]{3}\d/)) return 'civilian';

    // Government / special ops (short non-standard callsigns)
    if (cs.length > 0 && cs.length <= 4 && !cs.match(/^\d/)) return 'government';

    return 'civilian';
}
