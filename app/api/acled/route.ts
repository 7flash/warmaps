export async function GET(req: Request) {
    // In a production environment, this would call the ACLED public API with an access key:
    // https://api.acleddata.com/acled/read/
    // We are serving a highly-realistic, curated set of tactical kinetic events representing
    // recent regional escalations in the Middle East (Israel, Lebanon, Syria, Iraq, Iran, Yemen).

    const acledEvents = [
        {
            id: 'acled-1',
            date: new Date().toISOString().slice(0, 10),
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
            date: new Date().toISOString().slice(0, 10),
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
            date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // Yesterday
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
            date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
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
            date: new Date(Date.now() - 172800000).toISOString().slice(0, 10), // 2 days ago
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
            date: new Date(Date.now() - 259200000).toISOString().slice(0, 10), // 3 days ago
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
            date: new Date(Date.now() - 345600000).toISOString().slice(0, 10), // 4 days ago
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
        }
    ];

    // Format directly as GeoJSON
    const geojson = {
        type: 'FeatureCollection',
        features: acledEvents.map(ev => ({
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
                title: `${ev.sub_type}: ${ev.actor1} vs ${ev.actor2}` // For compatibility with popups
            }
        }))
    };

    return Response.json(geojson);
}
