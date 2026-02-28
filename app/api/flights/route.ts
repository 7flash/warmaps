/**
 * /api/flights — OpenSky Network Aviation Tracking
 * 
 * Fetches live aircraft positions from the OpenSky Network API
 * over conflict zones (Middle East, Ukraine, etc.)
 * 
 * Key intelligence value:
 * - Commercial airspace clearing → imminent strike indicator
 * - Military transport patterns → troop movements
 * - SIGINT aircraft orbits → intelligence gathering operations
 */

interface FlightData {
    icao24: string;
    callsign: string;
    origin_country: string;
    lat: number;
    lon: number;
    altitude: number;       // meters
    velocity: number;       // m/s
    heading: number;        // degrees
    on_ground: boolean;
    squawk: string | null;
}

// Bounding boxes for conflict regions
const CONFLICT_BOXES = {
    middleEast: { lamin: 12, lamax: 42, lomin: 25, lomax: 63 },
    ukraine: { lamin: 44, lamax: 53, lomin: 22, lomax: 41 },
};

const OPENSKY_API = 'https://opensky-network.org/api';

async function fetchFlightsInBox(box: typeof CONFLICT_BOXES[keyof typeof CONFLICT_BOXES]): Promise<FlightData[]> {
    try {
        const url = `${OPENSKY_API}/states/all?lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;

        const res = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
            console.log(`[flights] OpenSky responded ${res.status}`);
            return [];
        }

        const data = await res.json();
        const states: any[][] = data.states || [];

        return states.map(s => ({
            icao24: s[0] || '',
            callsign: (s[1] || '').trim(),
            origin_country: s[2] || '',
            lat: s[6] ?? 0,
            lon: s[5] ?? 0,
            altitude: s[7] ?? s[13] ?? 0,  // geo_altitude or baro_altitude
            velocity: s[9] ?? 0,
            heading: s[10] ?? 0,
            on_ground: s[8] ?? false,
            squawk: s[14] || null,
        })).filter(f => f.lat !== 0 && f.lon !== 0 && !f.on_ground);
    } catch (err) {
        console.error('[flights] OpenSky fetch failed:', err);
        return [];
    }
}

// Detect potentially interesting aircraft
function classifyAircraft(flight: FlightData): 'military' | 'tanker' | 'sigint' | 'civil' {
    const cs = flight.callsign.toUpperCase();

    // Known military prefixes
    if (cs.match(/^(RCH|REACH|DUKE|EVAC|COBRA|TOPCAT|SHARK|VIPER|HAWK|EAGLE|FORTE|HOMER|JAKE|NCHO|SPAR|SAM|AF[12]|RRR|NATO|LAGR|ASCOT|TARTN)/))
        return 'military';

    // SIGINT/ISR aircraft patterns (high altitude, slow, orbiting)
    if (flight.altitude > 12000 && flight.velocity < 150 && cs.match(/^(FORTE|HOMER|JAKE|NCHO)/))
        return 'sigint';

    // Aerial refueling tankers
    if (cs.match(/^(LAGR|NKTR|PKOL|TEAL)/))
        return 'tanker';

    return 'civil';
}

// ─── Cache + Handler ─────────────────────────────────────────

let cache: { flights: FlightData[]; stats: any; ts: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1 minute (OpenSky rate limits: ~400/day unauthenticated)

export async function GET() {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        return Response.json({ ...cache, cached: true });
    }

    console.log('[flights] Fetching OpenSky data...');

    const [middleEast, ukraine] = await Promise.all([
        fetchFlightsInBox(CONFLICT_BOXES.middleEast),
        fetchFlightsInBox(CONFLICT_BOXES.ukraine),
    ]);

    const allFlights = [...middleEast, ...ukraine];

    // Classify aircraft
    const classified = allFlights.map(f => ({
        ...f,
        type: classifyAircraft(f),
    }));

    const militaryCount = classified.filter(f => f.type === 'military').length;
    const sigintCount = classified.filter(f => f.type === 'sigint').length;

    const stats = {
        total: classified.length,
        middleEast: middleEast.length,
        ukraine: ukraine.length,
        military: militaryCount,
        sigint: sigintCount,
        civil: classified.length - militaryCount - sigintCount,
    };

    console.log(`[flights] ${stats.total} aircraft (${stats.military} military, ${stats.sigint} SIGINT, ${stats.civil} civil)`);

    cache = { flights: classified.slice(0, 200), stats, ts: Date.now() };

    return Response.json({
        flights: classified.slice(0, 200), // Limit to 200 for performance
        stats,
        cached: false,
    });
}
