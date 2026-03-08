import maplibregl from 'maplibre-gl';
import { mapInstances } from './map';
import { showToast } from './map-context-menu';

let terminatorEnabled = false;
let updateInterval: number | null = null;
const SOURCE_ID = 'terminator-source';
const LAYER_ID = 'terminator-layer';

export function toggleTerminator(map?: maplibregl.Map): boolean {
    terminatorEnabled = !terminatorEnabled;

    if (terminatorEnabled) {
        // Enable on all maps
        for (const m of mapInstances) {
            addTerminatorToMap(m);
        }

        // Setup clock to update terminator position every minute
        updateInterval = window.setInterval(() => {
            const geojson = getTerminatorGeoJSON();
            for (const m of mapInstances) {
                const source = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
                if (source) source.setData(geojson);
            }
        }, 60000);

        showToast('🌗 Day/Night Terminator Enabled');
    } else {
        // Disable on all maps
        if (updateInterval) clearInterval(updateInterval);
        for (const m of mapInstances) {
            removeTerminatorFromMap(m);
        }
        showToast('🌗 Day/Night Terminator Disabled');
    }

    return terminatorEnabled;
}

export function addTerminatorToMap(map: maplibregl.Map) {
    if (!terminatorEnabled) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: getTerminatorGeoJSON()
    });

    map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        layout: {},
        paint: {
            'fill-color': '#000010',
            'fill-opacity': 0.4
        }
    });
}

function removeTerminatorFromMap(map: maplibregl.Map) {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

// ─── Mathematical Terminator Generation ─────────────────────────

function getTerminatorGeoJSON(): any {
    const time = Date.now();
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [computeTerminatorPolygon(time)]
                }
            }
        ]
    };
}

function computeTerminatorPolygon(timeMs: number): number[][] {
    const RAD = Math.PI / 180;
    const DEG = 180 / Math.PI;

    // Julian date approximation
    const T = (timeMs / 86400000) + 2440587.5;
    const JD2000 = 2451545.0;
    const d = T - JD2000;

    // Sun position
    const L = (280.460 + 0.9856474 * d) * RAD;
    const g = (357.528 + 0.9856003 * d) * RAD;
    const lambda = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const obliq = (23.439 - 0.0000004 * d) * RAD;

    // Right ascension and declination
    let alpha = Math.atan2(Math.cos(obliq) * Math.sin(lambda), Math.cos(lambda));
    const delta = Math.asin(Math.sin(obliq) * Math.sin(lambda));

    // Equation of time and GMT
    const q = (280.460 + 360.98564736629 * d) * RAD;
    let gha = q - alpha;
    if (gha < 0) gha += Math.PI * 2;
    gha = gha * DEG;

    // Subsolar point
    const sunLng = -gha;
    const sunLat = delta * DEG;

    const coords: number[][] = [];
    const step = 2; // Resolution in degrees

    // Northern hemisphere winter: North pole is in night
    const isNorthPoleDark = sunLat < 0;

    for (let lng = -180; lng <= 180; lng += step) {
        // Spherical trigonometry to find the latitude of the terminator at this longitude
        const dx = (lng - sunLng) * RAD;
        // Cosine formula: cos(c) = cos(a)cos(b) + sin(a)sin(b)cos(C)
        // Set angular distance to 90 deg (cos(90) = 0)
        // 0 = sin(lat)*sin(sunLat) + cos(lat)*cos(sunLat)*cos(dx)
        // tan(lat) = - cos(dx) / tan(sunLat)
        const tanLat = -Math.cos(dx) / Math.tan(sunLat * RAD);
        let lat = Math.atan(tanLat) * DEG;
        coords.push([lng, lat]);
    }

    // Complete the polygon wrapping around the pole
    if (isNorthPoleDark) {
        coords.push([180, 90]);
        coords.push([-180, 90]);
        coords.push([coords[0][0], coords[0][1]]);
    } else {
        coords.push([180, -90]);
        coords.push([-180, -90]);
        coords.push([coords[0][0], coords[0][1]]);
    }

    return coords;
}
