/**
 * /api/webcams — Live Webcam Surveillance Layer
 *
 * Fetches public webcams in the Middle East region from Windy.com API v3.
 * Falls back to a curated list of known public streams when no API key is configured.
 *
 * Set WINDY_API_KEY env var for full Windy API access.
 * Free tier: image tokens expire after 10-15 minutes.
 */

interface WebcamData {
    id: string;
    title: string;
    lat: number;
    lon: number;
    country: string;
    city: string;
    previewUrl: string | null;
    playerUrl: string | null;
    status: 'active' | 'inactive';
    lastUpdated: string;
}

// Curated fallback webcams — known public streams in strategic locations
const CURATED_WEBCAMS: WebcamData[] = [
    {
        id: 'tehran-azadi',
        title: 'Tehran — Azadi Tower',
        lat: 35.6997, lon: 51.3380,
        country: 'IR', city: 'Tehran',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/iran/tehran/tehran/azadi-tower.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'telaviv-beach',
        title: 'Tel Aviv — Beach & Skyline',
        lat: 32.0853, lon: 34.7818,
        country: 'IL', city: 'Tel Aviv',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/israel/tel-aviv/tel-aviv/tel-aviv-beach.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'jerusalem-wall',
        title: 'Jerusalem — Western Wall',
        lat: 31.7767, lon: 35.2345,
        country: 'IL', city: 'Jerusalem',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/israel/jerusalem-district/jerusalem/western-wall.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'beirut-port',
        title: 'Beirut — Port & Skyline',
        lat: 33.9010, lon: 35.5180,
        country: 'LB', city: 'Beirut',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/lebanon/mount-lebanon/beirut/beirut.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'istanbul-bosphorus',
        title: 'Istanbul — Bosphorus Strait',
        lat: 41.0422, lon: 29.0078,
        country: 'TR', city: 'Istanbul',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/turkey/marmara/istanbul/bosphorus.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'dubai-burj',
        title: 'Dubai — Burj Khalifa & Downtown',
        lat: 25.1972, lon: 55.2744,
        country: 'AE', city: 'Dubai',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/dubai-panorama.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'haifa-port',
        title: 'Haifa — Port & Bay',
        lat: 32.7940, lon: 34.9896,
        country: 'IL', city: 'Haifa',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/israel/haifa-district/haifa/haifa.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'cairo-pyramids',
        title: 'Cairo — Pyramids of Giza',
        lat: 29.9792, lon: 31.1342,
        country: 'EG', city: 'Cairo',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/egypt/cairo-governorate/giza/pyramids-of-giza.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'ankara-kizilay',
        title: 'Ankara — Kızılay Square',
        lat: 39.9208, lon: 32.8541,
        country: 'TR', city: 'Ankara',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/turkey/central-anatolia/ankara/ankara.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'kyiv-maidan',
        title: 'Kyiv — Maidan Nezalezhnosti',
        lat: 50.4501, lon: 30.5234,
        country: 'UA', city: 'Kyiv',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/ukraine/kyiv/kyiv/maidan-nezalezhnosti.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'odesa-port',
        title: 'Odesa — Black Sea Port',
        lat: 46.4825, lon: 30.7233,
        country: 'UA', city: 'Odesa',
        previewUrl: null,
        playerUrl: 'https://www.skylinewebcams.com/en/webcam/ukraine/odesa/odesa/port-of-odesa.html',
        status: 'active', lastUpdated: new Date().toISOString(),
    },
    {
        id: 'hormuz-bandar',
        title: 'Bandar Abbas — Strait of Hormuz',
        lat: 27.1865, lon: 56.2808,
        country: 'IR', city: 'Bandar Abbas',
        previewUrl: null,
        playerUrl: null, // No known webcam, marker only
        status: 'inactive', lastUpdated: new Date().toISOString(),
    },
];

let webcamCache: { webcams: WebcamData[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (Windy free tier tokens expire in ~15m)

export async function GET(request: Request) {
    if (webcamCache && Date.now() - webcamCache.ts < CACHE_TTL) {
        return Response.json({ webcams: webcamCache.webcams, cached: true });
    }

    const apiKey = process.env.WINDY_API_KEY;

    if (apiKey) {
        try {
            const webcams = await fetchWindyWebcams(apiKey);
            webcamCache = { webcams, ts: Date.now() };
            return Response.json({ webcams, cached: false, source: 'windy' });
        } catch (e: any) {
            console.error('[webcams] Windy API failed:', e.message);
        }
    }

    // Fallback: curated webcam list
    webcamCache = { webcams: CURATED_WEBCAMS, ts: Date.now() };
    return Response.json({
        webcams: CURATED_WEBCAMS,
        cached: false,
        source: 'curated',
    });
}

async function fetchWindyWebcams(apiKey: string): Promise<WebcamData[]> {
    // Windy API v3 — fetch webcams in the Middle East bounding box
    const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        include: 'location,images,player',
    });

    const res = await fetch(
        `https://api.windy.com/webcams/api/v3/webcams?${params}&nearby=33,45,2000`,
        {
            signal: AbortSignal.timeout(10000),
            headers: {
                'x-windy-api-key': apiKey,
                'Accept': 'application/json',
            },
        }
    );

    if (!res.ok) throw new Error(`Windy returned ${res.status}`);
    const data = await res.json();

    return (data.webcams || []).map((cam: any) => ({
        id: `windy-${cam.webcamId}`,
        title: cam.title || 'Unknown Webcam',
        lat: cam.location?.latitude || 0,
        lon: cam.location?.longitude || 0,
        country: cam.location?.country || '',
        city: cam.location?.city || '',
        previewUrl: cam.images?.current?.preview || null,
        playerUrl: cam.player?.day?.embed || cam.player?.lifetime?.embed || null,
        status: cam.status === 'active' ? 'active' : 'inactive',
        lastUpdated: cam.lastUpdatedOn || new Date().toISOString(),
    }));
}
