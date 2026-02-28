export async function GET(req: Request) {
    // A robust, ISW-style tactical assessment of key Iranian / Regional infrastructure
    // In a production system, this would be a PostGIS database.
    const assets = [
        // ─── IRAN NUCLEAR SITES ───────────────────────
        {
            id: 'nuc-natanz',
            name: 'Natanz Uranium Enrichment Facility',
            type: 'nuclear',
            lat: 33.7258,
            lon: 51.7289,
            confidence: 'High',
            description: 'Primary, heavily fortified underground uranium enrichment site.'
        },
        {
            id: 'nuc-fordow',
            name: 'Fordow Fuel Enrichment Plant',
            type: 'nuclear',
            lat: 34.8842,
            lon: 50.9950,
            confidence: 'High',
            description: 'Deep underground enrichment facility built into a mountain.'
        },
        {
            id: 'nuc-isfahan',
            name: 'Isfahan Nuclear Technology Center',
            type: 'nuclear',
            lat: 32.5597,
            lon: 51.8844,
            confidence: 'High',
            description: 'Uranium conversion facility and fuel production.'
        },
        {
            id: 'nuc-arak',
            name: 'Arak Heavy Water Reactor',
            type: 'nuclear',
            lat: 34.3722,
            lon: 49.2417,
            confidence: 'Moderate',
            description: 'Plutonium production capability (IR-40 reactor).'
        },
        {
            id: 'nuc-bushehr',
            name: 'Bushehr Nuclear Power Plant',
            type: 'nuclear',
            lat: 28.8286,
            lon: 50.8872,
            confidence: 'High',
            description: 'Civilian power plant, but heavily protected.'
        },

        // ─── IRGC / MILITARY BASES ────────────────────
        {
            id: 'base-parchin',
            name: 'Parchin Military Complex',
            type: 'base',
            lat: 35.5342,
            lon: 51.7761,
            confidence: 'High',
            description: 'Munitions production and historical high-explosive testing site.'
        },
        {
            id: 'base-shiraz',
            name: 'Shiraz Air Base (TFB 7)',
            type: 'base',
            lat: 29.5401,
            lon: 52.5898,
            confidence: 'High',
            description: 'Key air base operating Su-24s.'
        },
        {
            id: 'base-tabriz',
            name: 'Tabriz Air Base (TFB 2)',
            type: 'base',
            lat: 38.1344,
            lon: 46.2356,
            confidence: 'Moderate',
            description: 'Interceptor base.'
        },
        {
            id: 'base-shahid-mahdavi',
            name: 'IRGCN Base Bandar Abbas',
            type: 'base',
            lat: 27.1397,
            lon: 56.0378,
            confidence: 'Moderate',
            description: 'Naval headquarters for the IRGC.'
        },

        // ─── KEY US / ALLIED BASES (Contextual) ───────
        {
            id: 'base-al-udeid',
            name: 'Al Udeid Air Base, Qatar',
            type: 'base',
            lat: 25.1186,
            lon: 51.3147,
            confidence: 'High',
            description: 'Major staging point for USAF operations.'
        },
        {
            id: 'base-incirlik',
            name: 'Incirlik Air Base, Turkey',
            type: 'base',
            lat: 37.0019,
            lon: 35.4258,
            confidence: 'High',
            description: 'USAF European Forward Operating Base.'
        },
        {
            id: 'base-muwaffaq',
            name: 'Muwaffaq Salti Air Base, Jordan',
            type: 'base',
            lat: 31.8344,
            lon: 36.7867,
            confidence: 'High',
            description: 'Staging ground for counter-ISIS and defensive sorties.'
        },

        // ─── REPORTED PROXY STRIKE NODES ──────────────
        {
            id: 'base-imam-ali',
            name: 'Imam Ali Military Base, Syria',
            type: 'base',
            lat: 34.4533,
            lon: 40.9419,
            confidence: 'Low',
            description: 'IRGC staging ground near the Iraqi border.'
        }
    ];

    // Convert to GeoJSON directly for the frontend
    const geojson = {
        type: 'FeatureCollection',
        features: assets.map(asset => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [asset.lon, asset.lat]
            },
            properties: {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                confidence: asset.confidence,
                description: asset.description
            }
        }))
    };

    return Response.json(geojson);
}
