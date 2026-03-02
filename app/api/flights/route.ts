/**
 * /api/flights — Live Aircraft Telemetry (ADS-B)
 * 
 * Primary: ADSB.lol (free, no rate limits, richer data)
 * Fallback: OpenSky Network (rate-limited, exponential backoff)
 * 
 * Coverage: Middle East + Eastern Med (lat 20-42, lon 25-65)
 */

// In-memory cache
let flightCache: { data: any[]; ts: number; source: string } | null = null;
let openSkyCacheTTL = 60_000;
const MIN_TTL = 30_000;      // 30s minimum between fetches
const MAX_TTL = 300_000;     // 5 min max backoff for OpenSky
const ADSBLOL_TTL = 15_000;  // ADSB.lol can handle 15s intervals

export async function GET(request: Request) {
    // Return from cache if fresh
    const cacheTTL = flightCache?.source === 'adsb.lol' ? ADSBLOL_TTL : openSkyCacheTTL;
    if (flightCache && Date.now() - flightCache.ts < cacheTTL) {
        return Response.json({
            flights: flightCache.data,
            stats: { total: flightCache.data.length, source: flightCache.source },
            cached: true,
        });
    }

    // Try ADSB.lol first (no rate limits, better data)
    const adsbResult = await fetchAdsbLol();
    if (adsbResult) {
        flightCache = { data: adsbResult, ts: Date.now(), source: 'adsb.lol' };
        return Response.json({
            flights: adsbResult,
            stats: { total: adsbResult.length, source: 'adsb.lol' },
            cached: false,
        });
    }

    // Fallback to OpenSky
    const openSkyResult = await fetchOpenSky();
    if (openSkyResult) {
        flightCache = { data: openSkyResult, ts: Date.now(), source: 'opensky' };
        return Response.json({
            flights: openSkyResult,
            stats: { total: openSkyResult.length, source: 'opensky' },
            cached: false,
        });
    }

    // Both failed — return stale cache or empty
    if (flightCache) {
        return Response.json({
            flights: flightCache.data,
            stats: { total: flightCache.data.length, source: flightCache.source },
            cached: true,
            stale: true,
        });
    }

    return Response.json({
        flights: [],
        stats: { total: 0 },
        error: 'All flight data sources unavailable',
    });
}

/**
 * ADSB.lol — Free, community-sourced ADS-B data
 * Uses center-point + radius API (1500km covers Middle East)
 */
async function fetchAdsbLol(): Promise<any[] | null> {
    try {
        // Center of Middle East: lat 31, lon 45, radius 1500km 
        const res = await fetch(
            'https://api.adsb.lol/v2/lat/31/lon/45/dist/1500',
            { signal: AbortSignal.timeout(10000) }
        );

        if (!res.ok) {
            console.warn(`[flights] ADSB.lol returned ${res.status}`);
            return null;
        }

        const data = await res.json();
        if (!data.ac || !Array.isArray(data.ac)) return null;

        const flights = data.ac
            .filter((a: any) => a.lat != null && a.lon != null)
            .filter((a: any) => {
                // Filter to Middle East bounding box
                return a.lat >= 20 && a.lat <= 42 && a.lon >= 25 && a.lon <= 65;
            })
            .filter((a: any) => {
                // Only airborne (alt_baro > 0 or not on ground)
                return (a.alt_baro && a.alt_baro !== 'ground') || !a.ground;
            })
            .map((a: any) => {
                const callsign = (a.flight || '').trim();
                return {
                    lon: a.lon,
                    lat: a.lat,
                    callsign: callsign || a.hex || 'UNKNOWN',
                    country: a.r ? getCountryFromReg(a.r) : '??',
                    alt: typeof a.alt_baro === 'number' ? a.alt_baro * 0.3048 : 0, // ft → m
                    velocity: (a.gs || 0) * 0.514444, // knots → m/s
                    heading: a.track || 0,
                    on_ground: a.alt_baro === 'ground',
                    type: classifyAircraft(callsign, a.category || '', a.t || ''),
                    // Extra data from ADSB.lol
                    aircraft_type: a.t || null,
                    registration: a.r || null,
                    squawk: a.squawk || null,
                };
            });

        console.log(`[flights] ADSB.lol: ${flights.length} aircraft (from ${data.ac.length} raw)`);
        return flights;
    } catch (e: any) {
        console.error('[flights] ADSB.lol fetch failed:', e.message);
        return null;
    }
}

/**
 * OpenSky Network — Fallback source
 * Rate-limited: anonymous 1 req/10s, authenticated 1 req/5s
 */
async function fetchOpenSky(): Promise<any[] | null> {
    try {
        const res = await fetch(
            'https://opensky-network.org/api/states/all?lamin=20&lamax=42&lomin=25&lomax=65',
            { signal: AbortSignal.timeout(12000) }
        );

        if (res.status === 429) {
            openSkyCacheTTL = Math.min(openSkyCacheTTL * 2, MAX_TTL);
            console.warn(`[flights] OpenSky 429 — backoff to ${openSkyCacheTTL / 1000}s`);
            return null;
        }

        if (!res.ok) {
            console.warn(`[flights] OpenSky returned ${res.status}`);
            return null;
        }

        const data = await res.json();
        openSkyCacheTTL = MIN_TTL; // Reset on success

        if (!data?.states) return [];

        return data.states
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
                    type: classifyAircraft(callsign, '', ''),
                };
            })
            .filter((f: any) => !f.on_ground);
    } catch (e: any) {
        console.error('[flights] OpenSky fetch failed:', e.message);
        return null;
    }
}

/**
 * Enhanced aircraft classification
 * Uses callsign, ICAO category, and aircraft type code
 */
function classifyAircraft(callsign: string, category: string, aircraftType: string): string {
    const cs = callsign.toUpperCase();
    const at = aircraftType.toUpperCase();

    // Military callsign prefixes
    const milPrefixes = [
        'RCH', 'REACH', 'DUKE', 'DOOM', 'KNIFE', 'PYTHON', 'VIPER',
        'COBRA', 'HAWK', 'EAGLE', 'FORTE', 'HOMER', 'LAGR', 'NCHO',
        'JAKE', 'TOPCAT', 'RRR', 'CNV', 'IAM', // IRGC/IRIAF
        'IRGC', 'IAF', 'USAF', 'RAF', 'RFR',
        'EVAC', 'KING', 'PEDRO', 'DUSTOFF', 'MEDEVAC',
    ];
    if (milPrefixes.some(p => cs.startsWith(p))) return 'military';

    // Military aircraft types
    const milTypes = [
        'F16', 'F15', 'F18', 'F22', 'F35', 'FA18', 'F14',
        'C130', 'C17', 'C5', 'KC10', 'KC13', 'KC46', 'KC35',
        'B1', 'B2', 'B52', 'E3', 'E6', 'RC13', 'P8', 'P3',
        'EUFI', 'RAFA', 'TYPH', 'GLF5', 'GLEX', // surveillance common
        'H60', 'UH60', 'AH64', 'CH47', 'V22', 'MV22',
        'MQ9', 'RQ4', 'RQ17', // drones
        'IL76', 'AN12', 'AN22', 'SU24', 'SU25', 'SU27', 'SU30', 'SU34', 'SU35',
        'MIG2', 'MIG3', 'TU95', 'TU16', 'TU22',
    ];
    if (milTypes.some(t => at.startsWith(t))) return 'military';

    // ICAO category A1 (light) through A5 (heavy) = civilian
    // B1-B4 = helicopter, C1-C7 = surface vehicle/obstruction
    if (category && (category.startsWith('B') || category === 'A6' || category === 'A7')) return 'military';

    // Government / special ops (non-ICAO short callsigns)
    if (cs.length > 0 && cs.length <= 4 && !cs.match(/^\d/) && !cs.match(/^[A-Z]{3}\d/)) return 'government';

    // Standard civilian (3-letter ICAO code + digits)
    return 'civilian';
}

/**
 * Guess country from aircraft registration prefix
 */
function getCountryFromReg(reg: string): string {
    if (!reg) return '??';
    const r = reg.toUpperCase();
    if (r.startsWith('N')) return 'United States';
    if (r.startsWith('G-')) return 'United Kingdom';
    if (r.startsWith('F-')) return 'France';
    if (r.startsWith('D-')) return 'Germany';
    if (r.startsWith('I-')) return 'Italy';
    if (r.startsWith('EC-')) return 'Spain';
    if (r.startsWith('TC-')) return 'Turkey';
    if (r.startsWith('4X-')) return 'Israel';
    if (r.startsWith('EP-')) return 'Iran';
    if (r.startsWith('A6-')) return 'UAE';
    if (r.startsWith('A7-')) return 'Qatar';
    if (r.startsWith('HZ-')) return 'Saudi Arabia';
    if (r.startsWith('A4O-')) return 'Oman';
    if (r.startsWith('9K-')) return 'Kuwait';
    if (r.startsWith('A9C-')) return 'Bahrain';
    if (r.startsWith('JY-')) return 'Jordan';
    if (r.startsWith('YI-')) return 'Iraq';
    if (r.startsWith('SU-')) return 'Egypt';
    if (r.startsWith('UR-')) return 'Ukraine';
    if (r.startsWith('RA-') || r.startsWith('RF-')) return 'Russia';
    if (r.startsWith('B-')) return 'China';
    if (r.startsWith('JA-')) return 'Japan';
    if (r.startsWith('HL-')) return 'South Korea';
    if (r.startsWith('VT-')) return 'India';
    if (r.startsWith('AP-')) return 'Pakistan';
    if (r.startsWith('CN-')) return 'Morocco';
    if (r.startsWith('9H-')) return 'Malta';
    if (r.startsWith('HA-')) return 'Hungary';
    if (r.startsWith('SP-')) return 'Poland';
    if (r.startsWith('OE-')) return 'Austria';
    if (r.startsWith('LN-')) return 'Norway';
    if (r.startsWith('SE-')) return 'Sweden';
    if (r.startsWith('OH-')) return 'Finland';
    if (r.startsWith('EI-')) return 'Ireland';
    if (r.startsWith('PH-')) return 'Netherlands';
    if (r.startsWith('OO-')) return 'Belgium';
    if (r.startsWith('HB-')) return 'Switzerland';
    if (r.startsWith('CS-')) return 'Portugal';
    return '??';
}
