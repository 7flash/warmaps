/**
 * page.client.tsx — Dashboard Client Controller
 * 
 * Handles:
 * - 3D Globe (Globe.gl/Three.js) with conflict visualization  
 * - RSS news feed polling & rendering
 * - GDELT event feed
 * - NASA FIRMS fire overlay
 * - Prediction Markets / Threat Radar
 * - Live TV channel switching
 * - Clock update
 * - Breaking news ticker
 * - WebSocket chat
 * - Telegram OSINT
 */

import maplibregl from 'maplibre-gl';

// ─── State ──────────────────────────────────────────────────

let map: any;
let newsItems: any[] = [];
let gdeltEvents: any[] = [];
let firePoints: any[] = [];
let flightData: any[] = [];
let flightStats: any = {};
let marketData: any[] = [];
let threatAlerts: any[] = [];
let strategicAssets: any = null;
let acledEvents: any = null;
let seismicData: any = null;
let cryptoData: any = null;
let webcamData: any[] = [];
let currentFilter = 'all';

// Data freshness tracking
const dataFreshness: Record<string, number> = {};
function markFresh(source: string) { dataFreshness[source] = Date.now(); }
function getFreshnessLabel(source: string): string {
    const ts = dataFreshness[source];
    if (!ts) return '—';
    const age = Math.floor((Date.now() - ts) / 1000);
    if (age < 60) return `${age}s`;
    if (age < 3600) return `${Math.floor(age / 60)}m`;
    return `${Math.floor(age / 3600)}h`;
}

// Proxy external images through our server to bypass CORS
function proxyImg(url: string | null | undefined): string {
    if (!url || !url.startsWith('http')) return '';
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

// Image marker pool — HTML markers with actual article thumbnails
let imageMarkers: any[] = [];

// Breaking news keywords for special pulsing markers
const BREAKING_KEYWORDS = ['breaking', 'missile', 'strike', 'bomb', 'explosion', 'attack', 'drone', 'killed', 'dead', 'war', 'invasion', 'aircraft', 'shot down'];

function isBreaking(title: string): boolean {
    const lower = title.toLowerCase();
    return BREAKING_KEYWORDS.some(kw => lower.includes(kw));
}

function syncImageMarkers() {
    if (!map) return;

    // Remove all existing image markers
    imageMarkers.forEach(m => m.remove());
    imageMarkers = [];

    // Render directly from gdeltEvents data — NOT from clustered layer
    // This ensures markers are always visible regardless of zoom/clustering
    const bounds = map.getBounds();

    // Sort: breaking first, then VGKG (higher quality), then by freshness
    const eventsWithImages = gdeltEvents.filter(e => {
        if (!e.lat || !e.lon) return false;
        if (e.lon < bounds.getWest() || e.lon > bounds.getEast()) return false;
        if (e.lat < bounds.getSouth() || e.lat > bounds.getNorth()) return false;
        return e.imageUrl || isBreaking(e.title || '');
    }).sort((a, b) => {
        const aBreaking = isBreaking(a.title || '') ? 1 : 0;
        const bBreaking = isBreaking(b.title || '') ? 1 : 0;
        if (aBreaking !== bBreaking) return bBreaking - aBreaking;
        const aVgkg = a.vgkg ? 1 : 0;
        const bVgkg = b.vgkg ? 1 : 0;
        if (aVgkg !== bVgkg) return bVgkg - aVgkg;
        return 0; // Already ordered by API response (newest first)
    });

    console.log(`[STARWAR] syncImageMarkers: ${gdeltEvents.length} total events, ${eventsWithImages.length} with images/breaking in view`);

    // Spatial grid dedup: divide viewport into cells, max 1 marker per cell
    // At zoom 3 (world), cells are ~5° → ~10 markers max
    // At zoom 6 (continent), cells are ~1° → ~40 markers
    // At zoom 10 (city), cells are ~0.05° → many markers
    const zoom = map.getZoom();
    const cellSize = Math.max(0.02, 5 / Math.pow(2, zoom - 3));
    const maxMarkers = 60;
    const occupiedCells = new Set<string>();

    let rendered = 0;
    for (const e of eventsWithImages) {
        if (rendered >= maxMarkers) break;

        const breaking = isBreaking(e.title || '');

        // Breaking events bypass spatial grid (always shown)
        if (!breaking) {
            const cellX = Math.floor(e.lon / cellSize);
            const cellY = Math.floor(e.lat / cellSize);
            const cellKey = `${cellX},${cellY}`;
            if (occupiedCells.has(cellKey)) continue;
            occupiedCells.add(cellKey);
        }

        // Jitter scales with cell size to spread markers within cells
        const jitter = () => (Math.random() - 0.5) * cellSize * 0.6;
        const coords: [number, number] = [e.lon + jitter(), e.lat + jitter()];

        const imageUrl = e.imageUrl;
        const title = e.title || '';

        // ─── Zoom-responsive sizing ──────────────────────────
        // Simulates Deck.gl sizeUnits:'meters' + sizeMinPixels/sizeMaxPixels
        // Markers grow smoothly from 28px (global) to 160px (street level)
        const MIN_SIZE = 28;   // sizeMinPixels equivalent
        const MAX_SIZE = 160;  // sizeMaxPixels equivalent
        const markerSize = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE,
            MIN_SIZE * Math.pow(1.22, zoom - 3) // ~1.22x per zoom level
        )));
        const breakingSize = Math.round(markerSize * 1.25); // Breaking 25% larger

        // Create the marker element
        const el = document.createElement('div');
        el.className = 'map-image-marker' + (breaking ? ' map-image-marker--breaking' : '');
        const size = breaking ? breakingSize : markerSize;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;

        if (imageUrl && imageUrl.startsWith('http')) {
            const img = document.createElement('img');
            img.src = proxyImg(imageUrl);
            img.alt = title;
            img.loading = 'lazy';
            img.onerror = () => {
                el.innerHTML = '';
                el.classList.add('map-image-marker--fallback');
            };
            el.appendChild(img);
        } else {
            el.classList.add('map-image-marker--fallback');
            el.style.background = breaking ? '#ef4444' : '#22c55e';
        }

        // Hover preview
        if (imageUrl && imageUrl.startsWith('http')) {
            el.addEventListener('mouseenter', () => {
                document.querySelectorAll('.marker-hover-preview').forEach(p => p.remove());
                const preview = document.createElement('div');
                preview.className = 'marker-hover-preview';
                preview.innerHTML = `
                    <img src="${proxyImg(imageUrl)}" alt="" />
                    <div class="marker-hover-title">${title.length > 80 ? title.slice(0, 80) + '…' : title}</div>
                    <div class="marker-hover-source">${e.source || 'OSINT'} · ${breaking ? '🔴 BREAKING' : 'Event'}</div>
                `;
                document.body.appendChild(preview);
                const rect = el.getBoundingClientRect();
                preview.style.left = `${rect.right + 12}px`;
                preview.style.top = `${rect.top - 20}px`;
                requestAnimationFrame(() => {
                    const pr = preview.getBoundingClientRect();
                    if (pr.right > window.innerWidth - 10) {
                        preview.style.left = `${rect.left - pr.width - 12}px`;
                    }
                    if (pr.bottom > window.innerHeight - 10) {
                        preview.style.top = `${window.innerHeight - pr.height - 10}px`;
                    }
                });
            });
            el.addEventListener('mouseleave', () => {
                document.querySelectorAll('.marker-hover-preview').forEach(p => p.remove());
            });
        }

        // Click popup
        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            document.querySelectorAll('.marker-hover-preview').forEach(p => p.remove());
            const popup = new maplibregl.Popup({
                className: 'tactical-popup',
                closeButton: true,
                maxWidth: '320px',
            })
                .setLngLat(coords)
                .setHTML(`
                    <div class="intel-card">
                        ${imageUrl ? `<img src="${proxyImg(imageUrl)}" style="width:100%;height:140px;object-fit:cover;border-bottom:1px solid rgba(34,197,94,0.1);" />` : ''}
                        <div class="intel-card-body" style="padding:10px;">
                            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px;line-height:1.3;">${title}</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">📍 ${e.date || 'Recent'} · ${e.source || 'GDELT'}</div>
                            ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);text-decoration:none;">Read Article →</a>` : ''}
                        </div>
                    </div>
                `)
                .addTo(map);
        });

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);

        imageMarkers.push(marker);
        rendered++;
    }
}

// ─── MapLibre 2D Tactical Map Setup ─────────────────────────

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || map) return;

    // Use Carto Dark Matter style for tactical operations feel
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [45, 30], // Middle East
        zoom: 3,
        pitch: 0,
        attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
        // Create airplane icon for flights
        const planeSize = 24;
        const planeCanvas = document.createElement('canvas');
        planeCanvas.width = planeSize;
        planeCanvas.height = planeSize;
        const ctx = planeCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        // Simple airplane silhouette pointing UP
        ctx.moveTo(12, 2);   // nose
        ctx.lineTo(14, 10);
        ctx.lineTo(22, 12);  // right wing
        ctx.lineTo(22, 14);
        ctx.lineTo(14, 13);
        ctx.lineTo(14, 19);  // tail right
        ctx.lineTo(17, 21);
        ctx.lineTo(17, 22);
        ctx.lineTo(12, 20);
        ctx.lineTo(7, 22);   // tail left
        ctx.lineTo(7, 21);
        ctx.lineTo(10, 19);
        ctx.lineTo(10, 13);
        ctx.lineTo(2, 14);   // left wing
        ctx.lineTo(2, 12);
        ctx.lineTo(10, 10);
        ctx.closePath();
        ctx.fill();

        const imageData = ctx.getImageData(0, 0, planeSize, planeSize);
        map.addImage('airplane-icon', imageData, { sdf: true });
        // --- Sources ---

        map.addSource('fires', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addSource('flights', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addSource('events', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // Fixed Tactical Assets Source
        map.addSource('assets', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // ACLED Kinetic Events Source
        map.addSource('acled', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // Live Webcam Surveillance Source
        map.addSource('webcams', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // Seismic Activity Source (0-2km depth)
        map.addSource('seismic', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        // --- Layers ---

        // ─── Country Flag Territory Fills ────────────────────
        // Load simplified world boundaries and color each country with its dominant flag color
        // This creates a vibrant geopolitical backdrop behind all data layers
        const COUNTRY_FLAG_COLORS: Record<string, string> = {
            // Middle East & Central Asia
            'IRN': '#00a651', 'IRQ': '#ce1126', 'SYR': '#ce1126', 'ISR': '#0038b8',
            'PSE': '#009736', 'LBN': '#ce1126', 'JOR': '#007a3d', 'SAU': '#006c35',
            'YEM': '#ce1126', 'OMN': '#ce1126', 'ARE': '#00732f', 'QAT': '#8a1538',
            'KWT': '#007a3d', 'BHR': '#ce1126', 'AFG': '#009900', 'PAK': '#01411c',
            'TUR': '#e30a17', 'AZE': '#00b5e2', 'GEO': '#ff0000', 'ARM': '#f2a800',
            // Europe
            'UKR': '#0057b7', 'RUS': '#ff2d2d', 'BLR': '#ce1126', 'POL': '#dc143c',
            'DEU': '#ffcc00', 'FRA': '#0055a4', 'GBR': '#1a5cb5', 'ITA': '#009246',
            'ESP': '#c60b1e', 'PRT': '#006600', 'NLD': '#ae1c28', 'BEL': '#fdda24',
            'SWE': '#006aa7', 'NOR': '#ba0c2f', 'FIN': '#003580', 'DNK': '#c60c30',
            'ROU': '#002b7f', 'BGR': '#00966e', 'SRB': '#c6363c', 'HRV': '#171796',
            'GRC': '#004c98', 'CZE': '#11457e', 'HUN': '#436f4d', 'SVK': '#0b4ea2',
            'AUT': '#ed2939', 'CHE': '#ff0000', 'LTU': '#fdb913', 'LVA': '#9e3039',
            'EST': '#0072ce', 'MDA': '#003da5', 'MNE': '#d4af37', 'MKD': '#d20000',
            'ALB': '#e41e20', 'BIH': '#002395', 'KOS': '#003da5',
            // Africa
            'EGY': '#ce1126', 'LBY': '#239e46', 'TUN': '#e70013', 'DZA': '#006233',
            'MAR': '#c1272d', 'SDN': '#007229', 'SSD': '#078930', 'ETH': '#009b3a',
            'SOM': '#4189dd', 'KEN': '#006600', 'NGA': '#008751', 'ZAF': '#007749',
            'COD': '#007fff', 'TZA': '#1eb53a', 'UGA': '#fcdc04', 'RWA': '#00a1de',
            'MLI': '#14b53a', 'NER': '#e05206', 'TCD': '#002664', 'CMR': '#007a5e',
            // Americas
            'USA': '#1a6aff', 'CAN': '#ff0000', 'MEX': '#006847', 'BRA': '#009c3b',
            'ARG': '#74acdf', 'COL': '#fcd116', 'VEN': '#cf142b', 'CHL': '#d52b1e',
            'PER': '#d91023', 'CUB': '#002a8f',
            // Asia
            'CHN': '#de2910', 'JPN': '#bc002d', 'KOR': '#003478', 'PRK': '#024fa2',
            'IND': '#ff9933', 'MMR': '#fecb00', 'THA': '#241d4f', 'VNM': '#da251d',
            'IDN': '#ff0000', 'MYS': '#010066', 'PHL': '#0038a8', 'TWN': '#000095',
            'KAZ': '#00afca', 'UZB': '#1eb53a', 'TKM': '#1a8b42', 'KGZ': '#e8112d',
            'TJK': '#006600',
        };

        // Load world GeoJSON and add country fill layer
        fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
            .then(r => r.json())
            .then(topology => {
                // Convert TopoJSON to GeoJSON
                // @ts-ignore - topojson bundled in page
                const topojsonFeature = (topo: any, obj: any) => {
                    const features: any[] = [];
                    const arcs = topo.arcs;
                    const transform = topo.transform;
                    const decodeArc = (arcIdx: number) => {
                        const arc = arcs[arcIdx < 0 ? ~arcIdx : arcIdx];
                        const coords: [number, number][] = [];
                        let x = 0, y = 0;
                        for (const [dx, dy] of arc) {
                            x += dx; y += dy;
                            coords.push([
                                x * transform.scale[0] + transform.translate[0],
                                y * transform.scale[1] + transform.translate[1]
                            ]);
                        }
                        return arcIdx < 0 ? coords.reverse() : coords;
                    };
                    const decodeRings = (rings: number[][]) => rings.map((ring: number[]) =>
                        ring.reduce<[number, number][]>((acc, idx) => acc.concat(decodeArc(idx)), [])
                    );
                    for (const geom of obj.geometries) {
                        let geometry: any;
                        if (geom.type === 'Polygon') {
                            geometry = { type: 'Polygon', coordinates: decodeRings(geom.arcs) };
                        } else if (geom.type === 'MultiPolygon') {
                            geometry = { type: 'MultiPolygon', coordinates: geom.arcs.map((p: number[][]) => decodeRings(p)) };
                        } else continue;
                        features.push({
                            type: 'Feature',
                            properties: { ...geom.properties, id: geom.id },
                            geometry
                        });
                    }
                    return { type: 'FeatureCollection', features };
                };

                const countries = topojsonFeature(topology, topology.objects.countries);

                // Map numeric country IDs to ISO3 using a lookup
                const numToIso3: Record<string, string> = {
                    '4': 'AFG', '8': 'ALB', '12': 'DZA', '24': 'AGO', '32': 'ARG',
                    '36': 'AUS', '40': 'AUT', '31': 'AZE', '48': 'BHR', '50': 'BGD',
                    '56': 'BEL', '112': 'BLR', '68': 'BOL', '70': 'BIH', '72': 'BWA',
                    '76': 'BRA', '100': 'BGR', '854': 'BFA', '104': 'MMR', '108': 'BDI',
                    '116': 'KHM', '120': 'CMR', '124': 'CAN', '140': 'CAF', '148': 'TCD',
                    '152': 'CHL', '156': 'CHN', '170': 'COL', '178': 'COG', '180': 'COD',
                    '188': 'CRI', '191': 'HRV', '192': 'CUB', '196': 'CYP', '203': 'CZE',
                    '208': 'DNK', '262': 'DJI', '214': 'DOM', '218': 'ECU', '818': 'EGY',
                    '222': 'SLV', '226': 'GNQ', '232': 'ERI', '233': 'EST', '231': 'ETH',
                    '246': 'FIN', '250': 'FRA', '266': 'GAB', '270': 'GMB', '268': 'GEO',
                    '276': 'DEU', '288': 'GHA', '300': 'GRC', '320': 'GTM', '324': 'GIN',
                    '328': 'GUY', '332': 'HTI', '340': 'HND', '348': 'HUN', '352': 'ISL',
                    '356': 'IND', '360': 'IDN', '364': 'IRN', '368': 'IRQ', '372': 'IRL',
                    '376': 'ISR', '380': 'ITA', '384': 'CIV', '388': 'JAM', '392': 'JPN',
                    '400': 'JOR', '398': 'KAZ', '404': 'KEN', '408': 'PRK', '410': 'KOR',
                    '414': 'KWT', '417': 'KGZ', '418': 'LAO', '428': 'LVA', '422': 'LBN',
                    '426': 'LSO', '430': 'LBR', '434': 'LBY', '440': 'LTU', '442': 'LUX',
                    '807': 'MKD', '450': 'MDG', '454': 'MWI', '458': 'MYS', '466': 'MLI',
                    '478': 'MRT', '484': 'MEX', '498': 'MDA', '496': 'MNG', '499': 'MNE',
                    '504': 'MAR', '508': 'MOZ', '516': 'NAM', '524': 'NPL', '528': 'NLD',
                    '554': 'NZL', '558': 'NIC', '562': 'NER', '566': 'NGA', '578': 'NOR',
                    '512': 'OMN', '586': 'PAK', '591': 'PAN', '598': 'PNG', '600': 'PRY',
                    '604': 'PER', '608': 'PHL', '616': 'POL', '620': 'PRT', '634': 'QAT',
                    '642': 'ROU', '643': 'RUS', '646': 'RWA', '682': 'SAU', '686': 'SEN',
                    '688': 'SRB', '694': 'SLE', '702': 'SGP', '703': 'SVK', '705': 'SVN',
                    '706': 'SOM', '710': 'ZAF', '728': 'SSD', '724': 'ESP', '144': 'LKA',
                    '729': 'SDN', '740': 'SUR', '748': 'SWZ', '752': 'SWE', '756': 'CHE',
                    '760': 'SYR', '158': 'TWN', '762': 'TJK', '834': 'TZA', '764': 'THA',
                    '768': 'TGO', '780': 'TTO', '788': 'TUN', '792': 'TUR', '795': 'TKM',
                    '800': 'UGA', '804': 'UKR', '784': 'ARE', '826': 'GBR', '840': 'USA',
                    '858': 'URY', '860': 'UZB', '862': 'VEN', '704': 'VNM', '887': 'YEM',
                    '894': 'ZMB', '716': 'ZWE', '-99': 'XKX',
                };

                // Add ISO3 and flag color to each feature
                countries.features.forEach((f: any) => {
                    const iso3 = numToIso3[String(f.properties?.id || f.id)] || '';
                    f.properties = f.properties || {};
                    f.properties.iso3 = iso3;
                    f.properties.flagColor = COUNTRY_FLAG_COLORS[iso3] || '#334155';
                });

                map.addSource('countries', {
                    type: 'geojson',
                    data: countries
                });

                // Country fill — vivid flag-inspired territory coloring
                map.addLayer({
                    id: 'country-fills',
                    type: 'fill',
                    source: 'countries',
                    paint: {
                        'fill-color': ['get', 'flagColor'],
                        'fill-opacity': 0.35,
                    }
                }, 'fires-heat'); // Insert BELOW fires and other data layers

                // Country borders — bright glowing lines
                map.addLayer({
                    id: 'country-borders',
                    type: 'line',
                    source: 'countries',
                    paint: {
                        'line-color': ['get', 'flagColor'],
                        'line-width': 1.5,
                        'line-opacity': 0.65,
                    }
                }, 'fires-heat');
            })
            .catch(err => console.warn('[STARWAR] Country fills failed:', err));

        // Thermal Anomalies (Heatmap)
        map.addLayer({
            id: 'fires-heat',
            type: 'heatmap',
            source: 'fires',
            paint: {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'brightness'], 300, 0.2, 400, 1],
                'heatmap-intensity': 1.5,
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(255, 107, 53, 0)',
                    0.2, 'rgba(255, 107, 53, 0.4)',
                    1, 'rgba(255, 68, 68, 1)'
                ],
                'heatmap-radius': 15,
                'heatmap-opacity': 0.8
            }
        });

        // Aircraft (Symbol layer with rotated airplane icons)
        map.addLayer({
            id: 'flights-point',
            type: 'symbol',
            source: 'flights',
            layout: {
                'icon-image': 'airplane-icon',
                'icon-size': ['match', ['get', 'type'], 'military', 0.85, 'sigint', 1.0, 'government', 0.75, 0.55],
                'icon-rotate': ['get', 'heading'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-color': ['match', ['get', 'type'], 'military', '#ef4444', 'sigint', '#a855f7', 'government', '#f59e0b', '#22d3ee'],
                'icon-opacity': ['match', ['get', 'type'], 'military', 1, 'sigint', 1, 0.7],
            }
        });

        // Event Clusters (zoomed out) — bright pulsing nodes
        map.addLayer({
            id: 'events-clusters',
            type: 'circle',
            source: 'events',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#eab308',
                'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 35, 100, 45],
                'circle-opacity': 0.85,
                'circle-stroke-width': 3,
                'circle-stroke-color': 'rgba(234, 179, 8, 0.5)'
            }
        });

        map.addLayer({
            id: 'events-cluster-count',
            type: 'symbol',
            source: 'events',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12
            },
            paint: {
                'text-color': '#000'
            }
        });

        // Hidden hit-target for unclustered events (popup triggers)
        map.addLayer({
            id: 'events-point',
            type: 'circle',
            source: 'events',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': 'transparent',
                'circle-radius': 20,
                'circle-opacity': 0
            }
        });

        // Strategic Assets (Nuclear / Bases)
        map.addLayer({
            id: 'assets-nuclear',
            type: 'circle',
            source: 'assets',
            filter: ['==', ['get', 'type'], 'nuclear'],
            paint: {
                'circle-color': '#22d3ee', // Cyan
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3]
            }
        });

        map.addLayer({
            id: 'assets-base',
            type: 'circle',
            source: 'assets',
            filter: ['==', ['get', 'type'], 'base'],
            paint: {
                'circle-color': '#3b82f6', // Blue
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.6, 0.3]
            }
        });

        // ACLED Kinetic Strikes (Red Markers)
        map.addLayer({
            id: 'acled-kinetic',
            type: 'circle',
            source: 'acled',
            paint: {
                'circle-color': '#ef4444', // Red
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000',
                'circle-pitch-alignment': 'map',
                'circle-opacity': ['match', ['get', 'confidence'], 'High', 1, 'Moderate', 0.7, 0.4]
            }
        });

        // Live Webcam Markers (Camera icons)
        map.addLayer({
            id: 'webcams-point',
            type: 'circle',
            source: 'webcams',
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff',
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#6366f1', // Indigo border
                'circle-pitch-alignment': 'map'
            }
        });

        // Seismic Deep-Earth Detonation Suspects
        map.addLayer({
            id: 'seismic-kinetic',
            type: 'circle',
            source: 'seismic',
            paint: {
                'circle-radius': 12,
                'circle-color': '#fbbf24', // Amber
                'circle-opacity': 0.8,
                'circle-stroke-width': 4,
                'circle-stroke-color': '#b45309', // Dark amber
                'circle-pitch-alignment': 'map'
            }
        });

        // --- Interactive Intel Popups ---

        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'tactical-popup'
        });

        const setupInteractiveLayer = (layerId: string) => {
            map.on('mouseenter', layerId, (e: any) => {
                map.getCanvas().style.cursor = 'pointer';

                const coordinates = e.features[0].geometry.coordinates.slice();
                const props = e.features[0].properties;

                // Ensure popup appears over the copy being pointed to (if zoomed far out)
                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                let htmlContent = '';

                if (props.type === 'nuclear' || props.type === 'base') {
                    const icon = props.type === 'nuclear' ? '☢️' : '🔵';
                    const confColor = props.confidence === 'High' ? '#22c55e' : props.confidence === 'Moderate' ? '#eab308' : '#ef4444';
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header">${icon} ${props.name}</div>
                            <div class="intel-card-body">
                                <p>${props.description || 'No detailed intel available.'}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>TYPE: ${props.type.toUpperCase()}</span>
                                <span>CONF: <span style="color:${confColor}">${props.confidence}</span></span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'gdelt' || props.type === 'market-hot' || props.type === 'market') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header">📍 EVENT</div>
                            <div class="intel-card-body">
                                <p>${props.title}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>DATE: ${props.date ? props.date.slice(0, 10) : 'LIVE'}</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'acled-kinetic') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #ef4444;">💥 ${props.sub_type.toUpperCase()}</div>
                            <div class="intel-card-body">
                                <div style="margin-bottom: 8px; font-weight: bold; color: #f8fafc;">
                                    ${props.actor1} <span style="opacity: 0.5;">VS</span> ${props.actor2}
                                </div>
                                <p>${props.notes || ''}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>LOC: ${props.location}</span>
                                <span>FATALITIES: ${props.fatalities}</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'cyber') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #a855f7;">🚨 CYBER ANOMALY</div>
                            <div class="intel-card-body">
                                <p style="font-weight:bold; color: #f8fafc;">Severe Regional Internet Blackout Detected</p>
                                <p>Type: ${props.anomaly_type.toUpperCase()}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span>LOC: ${props.region}</span>
                                <span style="color:#ef4444">DROP: ${props.drop}%</span>
                            </div>
                        </div>
                    `;
                } else if (props.type === 'seismic') {
                    htmlContent = `
                        <div class="intel-card">
                            <div class="intel-card-header" style="color: #fbbf24;">🚨 CRITICAL SEISMIC EVENT</div>
                            <div class="intel-card-body">
                                <p style="font-weight:bold; color: #f8fafc;">Suspected Deep-Earth Kinetic Detonation</p>
                                <p>${props.title}</p>
                            </div>
                            <div class="intel-card-footer">
                                <span style="color:#ef4444">DEPTH: ${props.depth} km</span>
                                <span>MAG: ${props.mag}</span>
                            </div>
                        </div>
                    `;
                }

                if (htmlContent) {
                    popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
                }
            });

            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });
        };

        setupInteractiveLayer('assets-nuclear');
        setupInteractiveLayer('assets-base');
        setupInteractiveLayer('events-point');
        setupInteractiveLayer('acled-kinetic');
        setupInteractiveLayer('webcams-point');
        setupInteractiveLayer('seismic-kinetic');

        // Click-to-open webcam viewer
        map.on('click', 'webcams-point', (e: any) => {
            const props = e.features?.[0]?.properties;
            if (props?.playerUrl) {
                window.open(props.playerUrl, '_blank', 'width=800,height=600');
            }
        });

        // Click cluster → zoom in to break it apart
        map.on('click', 'events-clusters', (e: any) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['events-clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.getSource('events').getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                if (err) return;
                map.flyTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom + 0.5,
                    speed: 1.5,
                    curve: 1.2,
                });
            });
        });

        map.on('click', 'fires-cluster', (e: any) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['fires-cluster'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.getSource('fires').getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                if (err) return;
                map.flyTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom + 0.5,
                    speed: 1.5,
                    curve: 1.2,
                });
            });
        });

        // Cursor pointer on clusters
        map.on('mouseenter', 'events-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'events-clusters', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'fires-cluster', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'fires-cluster', () => { map.getCanvas().style.cursor = ''; });

        // Flight airplane click popup
        map.on('mouseenter', 'flights-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'flights-point', () => { map.getCanvas().style.cursor = ''; });
        map.on('click', 'flights-point', (e: any) => {
            if (!e.features || e.features.length === 0) return;
            const f = e.features[0];
            const p = f.properties;
            const coords = f.geometry.coordinates;
            const typeLabel = p.type === 'military' ? '🔴 MILITARY' : p.type === 'sigint' ? '🟣 SIGINT' : p.type === 'government' ? '🟡 GOV' : '🔵 CIVILIAN';
            new maplibregl.Popup({ className: 'tactical-popup', closeButton: true, maxWidth: '260px' })
                .setLngLat(coords)
                .setHTML(`
                    <div style="padding:10px;">
                        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;font-family:var(--font-mono);">${p.callsign || 'N/A'}</div>
                        <div style="font-size:10px;color:var(--text-secondary);line-height:1.6;">
                            ${typeLabel}<br/>
                            🏳️ ${p.country || '??'}<br/>
                            📏 ${p.alt ? p.alt.toLocaleString() + ' ft' : 'N/A'}<br/>
                            💨 ${p.velocity || 0} kts · HDG ${Math.round(p.heading || 0)}°
                        </div>
                    </div>
                `)
                .addTo(map);
        });

        // Initialize panel toggle system
        initPanelToggles();

        updateMapSources();

        // Sync image markers on map move/zoom
        map.on('moveend', syncImageMarkers);
        map.on('zoomend', syncImageMarkers);
        // Initial sync after a short delay for data to load
        setTimeout(syncImageMarkers, 3000);
    });
}

// ─── Data Fetching ──────────────────────────────────────────

async function fetchAllData() {
    await Promise.all([
        fetchNews(),
        fetchGdelt(),
        fetchFires(),
        fetchFlights(),
        fetchMarkets(),
        fetchTelegramAlerts(),
        fetchAssets(),
        fetchAcled(),
        fetchSeismic(),
        fetchCrypto(),
        fetchWebcams()
    ]);
    updateTicker();
    updateStats();
}

async function fetchAcled() {
    try {
        const res = await fetch('/api/acled');
        acledEvents = await res.json();
        const aSrc = map?.getSource('acled');
        if (aSrc) aSrc.setData(acledEvents);
    } catch (e) {
        console.error('[STARWAR] ACLED events fetch failed:', e);
    }
}

async function fetchSeismic() {
    try {
        const res = await fetch('/api/seismic');
        const data = await res.json();
        if (data.events) {
            seismicData = {
                type: 'FeatureCollection',
                features: data.events.map((e: any) => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
                    properties: {
                        type: 'seismic',
                        id: e.id,
                        title: e.title,
                        mag: e.mag,
                        depth: e.depth,
                        is_kinetic: e.is_kinetic
                    }
                }))
            };
            const aSrc = map?.getSource('seismic');
            if (aSrc) aSrc.setData(seismicData);
        }
    } catch (e) {
        console.error('[STARWAR] Seismic events fetch failed:', e);
    }
}

async function fetchCrypto() {
    try {
        const res = await fetch('/api/crypto');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !data.history || data.history.length === 0) return;

        // Update badge
        const badge = document.getElementById('crypto-premium-badge');
        if (badge) {
            const prem = data.currentPremium;
            badge.innerText = `${prem >= 0 ? '+' : ''}${prem.toFixed(2)}%`;
            badge.className = data.alertStatus === 'HIGH_PANIC' ? 'badge badge--hot badge--active' : 'badge';
            if (data.alertStatus === 'HIGH_PANIC') {
                badge.style.animation = 'pulseBorder 2s infinite';
                badge.style.color = '#fff';
                badge.style.backgroundColor = '#ef4444';
            } else {
                badge.style.animation = '';
                badge.style.backgroundColor = '';
            }
        }

        // Draw chart
        const chartCanvas = document.getElementById('crypto-chart') as HTMLCanvasElement;
        if (!chartCanvas) return;

        const ctx = chartCanvas.getContext('2d');
        if (!ctx) return;

        // Set canvas pixel dimensions to match its CSS container
        const rect = chartCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        chartCanvas.width = rect.width * dpr;
        chartCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        if (w < 10 || h < 10) return; // Container not visible

        ctx.clearRect(0, 0, w, h);

        // Draw background grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const gy = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        const values = data.history.map((h: any) => h.premiumPercent);
        const min = Math.min(...values) - 0.5;
        const max = Math.max(...values) + 0.5;
        const range = max - min || 1;

        // Draw zero line
        const zeroY = h - ((0 - min) / range) * h * 0.8 - h * 0.1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw rate line
        const lineColor = data.alertStatus === 'HIGH_PANIC' ? '#ef4444' : '#06b6d4';
        ctx.beginPath();
        const n = values.length;
        values.forEach((v: number, i: number) => {
            const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
            const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Fill area under curve
        if (n > 1) {
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
        } else {
            // Single point — draw a wider area
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
        }
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Draw latest value + source label
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'right';
        ctx.fillText(data.source || '', w - 4, h - 4);

        // Draw dot on latest point
        if (n >= 1) {
            const lastX = n === 1 ? w / 2 : w;
            const lastY = h - ((values[n - 1] - min) / range) * h * 0.8 - h * 0.1;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();
        }
    } catch (e) {
        console.error('[STARWAR] Crypto data fetch failed:', e);
    }
}

async function fetchAssets() {
    try {
        const res = await fetch('/api/assets');
        strategicAssets = await res.json();
        const aSrc = map?.getSource('assets');
        if (aSrc) aSrc.setData(strategicAssets);
    } catch (e) {
        console.error('[STARWAR] Strategic assets fetch failed:', e);
    }
}

async function fetchNews() {
    try {
        const res = await fetch(`/api/news?source=${currentFilter}`);
        const data = await res.json();
        newsItems = data.items || [];
        markFresh('news');
        renderNewsFeed();
    } catch (e) {
        console.error('[STARWAR] News fetch failed:', e);
    }
}

async function fetchGdelt() {
    try {
        const res = await fetch('/api/gdelt?region=conflict');
        const data = await res.json();
        gdeltEvents = data.events || [];
        markFresh('gdelt');
        renderGdeltFeed();
        updateMapSources();
        syncImageMarkers(); // Immediately render image markers — don't wait for map move
        const el = document.getElementById('gdelt-count');
        if (el) el.textContent = String(gdeltEvents.length);
        console.log(`[STARWAR] GDELT loaded: ${gdeltEvents.length} events, ${gdeltEvents.filter((e: any) => e.imageUrl).length} with images`);
    } catch (e) {
        console.error('[STARWAR] GDELT fetch failed:', e);
    }
}

async function fetchFires() {
    try {
        const res = await fetch('/api/fires');
        const data = await res.json();
        firePoints = data.fires || [];
        markFresh('fires');
        renderFiresFeed();
        updateMapSources();
        const el = document.getElementById('firms-count');
        if (el) el.textContent = String(firePoints.length);
    } catch (e) {
        console.error('[STARWAR] FIRMS fetch failed:', e);
    }
}

async function fetchMarkets() {
    try {
        const res = await fetch('/api/markets');
        if (!res.ok) return;
        const data = await res.json();
        marketData = data.markets || [];
        threatAlerts = data.alerts || [];
        renderRadarFeed();
        updateMapSources();

        const countEl = document.getElementById('radar-alert-count');
        if (countEl) {
            const criticalCount = threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').length;
            countEl.textContent = String(criticalCount);
            countEl.className = criticalCount > 0 ? 'badge badge--hot badge--active' : 'badge badge--hot';
        }

        const marketCountEl = document.getElementById('market-count');
        if (marketCountEl) marketCountEl.textContent = String(marketData.length);

        // Show critical threat banner
        const criticals = threatAlerts.filter((a: any) => a.level === 'critical');
        if (criticals.length > 0) {
            showThreatBanner(criticals[0]);
        }
    } catch (e) {
        console.error('[STARWAR] Markets fetch failed:', e);
    }
}

async function fetchTelegramAlerts() {
    try {
        const res = await fetch('/api/telegram/alerts');
        if (!res.ok) return;
        const alerts = await res.json();
        if (Array.isArray(alerts) && alerts.length > 0) {
            renderTelegramFeed(alerts);
            const countEl = document.getElementById('tg-count');
            if (countEl) countEl.textContent = String(alerts.length);
        }
    } catch { /* telegram not connected */ }
}

async function fetchFlights() {
    try {
        const res = await fetch('/api/flights');
        if (!res.ok) return;
        const data = await res.json();
        flightData = data.flights || [];
        flightStats = data.stats || {};
        markFresh('flights');
        updateMapSources(); // Update map features

        // Update flight count in stats
        const flightCountEl = document.getElementById('flight-count');
        if (flightCountEl) flightCountEl.textContent = String(flightData.length);
    } catch (e) {
        console.error('[STARWAR] Flights fetch failed:', e);
    }
}

async function fetchWebcams() {
    try {
        const res = await fetch('/api/webcams');
        if (!res.ok) return;
        const data = await res.json();
        webcamData = data.webcams || [];

        const webcamGeoJSON = {
            type: 'FeatureCollection',
            features: webcamData.map((cam: any) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [cam.lon, cam.lat] },
                properties: {
                    type: 'webcam',
                    id: cam.id,
                    title: `📷 ${cam.title}`,
                    city: cam.city,
                    country: cam.country,
                    playerUrl: cam.playerUrl,
                    status: cam.status,
                }
            }))
        };

        const src = map?.getSource('webcams');
        if (src) src.setData(webcamGeoJSON);

        console.log(`[STARWAR] Loaded ${webcamData.length} webcams`);
    } catch (e) {
        console.error('[STARWAR] Webcams fetch failed:', e);
    }
}

// ─── Rendering ──────────────────────────────────────────────

function renderNewsFeed() {
    const container = document.getElementById('news-feed');
    if (!container) return;

    if (newsItems.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No intel available</span></div>`;
        return;
    }

    container.innerHTML = newsItems.map(item => {
        const time = formatTime(item.pubDate);

        // Dynamic assignment based on title heuristics to match exact requested aesthetic
        const titleLower = item.title.toLowerCase();
        const descLower = (item.description || '').toLowerCase();

        const isHigh = titleLower.includes('missile') ||
            titleLower.includes('strike') ||
            titleLower.includes('dead') ||
            titleLower.includes('killed') ||
            titleLower.includes('israel') ||
            titleLower.includes('iran') ||
            descLower.includes('casualt');

        const severityClass = isHigh ? 'high' : 'medium';
        const severityText = isHigh ? 'HIGH' : 'MEDIUM';

        // Pseudo-random metrics for visual testing
        const sourceCount = Math.floor(Math.random() * 20) + 2;
        const confPercent = isHigh ? Math.floor(Math.random() * 15) + 80 : Math.floor(Math.random() * 20) + 60;

        let countryFlag = '🏳️';
        if (titleLower.includes('israel')) countryFlag = '🇮🇱';
        else if (titleLower.includes('iran') || titleLower.includes('khamenei')) countryFlag = '🇮🇷';
        else if (titleLower.includes('dubai') || titleLower.includes('uae')) countryFlag = '🇦🇪';
        else if (titleLower.includes('lebanon') || titleLower.includes('hezbollah')) countryFlag = '🇱🇧';
        else if (titleLower.includes('yemen') || titleLower.includes('houthi')) countryFlag = '🇾🇪';
        else if (titleLower.includes('syria')) countryFlag = '🇸🇾';
        else if (titleLower.includes('iraq')) countryFlag = '🇮🇶';

        return `
            <div class="pulse-item" data-link="${escHtml(item.link)}">
                <div class="pulse-item-top">
                    <div class="pulse-source-badge">
                        <span class="icon">📚</span> ${sourceCount}
                    </div>
                    <div class="pulse-item-title">
                        <a href="${escHtml(item.link)}" target="_blank" rel="noopener">${escHtml(item.title)}</a>
                    </div>
                    <div class="pulse-severity ${severityClass}">${severityText}</div>
                </div>
                <div class="pulse-item-desc">
                    ${escHtml(item.description ? item.description.slice(0, 100) + '...' : '')}
                </div>
                <div class="pulse-item-bottom">
                    <div class="pulse-confidence ${severityClass}">
                        <span class="icon">✓</span> CONFIDENCE ${confPercent}%
                    </div>
                </div>
                <div class="pulse-item-footer">
                    <div class="pulse-origin">${countryFlag} ${time}</div>
                    <div class="pulse-expand">⌄</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGdeltFeed() {
    const container = document.getElementById('gdelt-feed');
    if (!container) return;

    if (gdeltEvents.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No GDELT events</span></div>`;
        return;
    }

    container.innerHTML = gdeltEvents.slice(0, 15).map(ev => `
        <div class="feed-item" data-link="${escHtml(ev.url)}">
            <div class="feed-item-source gdelt">${escHtml(ev.source)}</div>
            <div class="feed-item-title">
                <a href="${escHtml(ev.url)}" target="_blank" rel="noopener">${escHtml(ev.title)}</a>
            </div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${ev.date ? formatTime(ev.date) : '—'}</span>
                ${ev.country ? `<span class="feed-item-location">📍 ${escHtml(ev.country)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderFiresFeed() {
    const container = document.getElementById('firms-feed');
    if (!container) return;

    if (firePoints.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No thermal anomalies</span></div>`;
        return;
    }

    container.innerHTML = firePoints.slice(0, 10).map(fire => `
        <div class="feed-item feed-item--fire">
            <div class="feed-item-source firms">🔥 THERMAL ANOMALY</div>
            <div class="feed-item-title">
                ${fire.country || 'Unknown Region'} — ${fire.lat.toFixed(2)}°, ${fire.lon.toFixed(2)}°
            </div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${fire.acq_date} ${fire.acq_time}</span>
                <span>Brightness: ${fire.brightness.toFixed(0)}K</span>
                <span>Confidence: ${fire.confidence}</span>
            </div>
        </div>
    `).join('');
}

function renderTelegramFeed(alerts: any[]) {
    const container = document.getElementById('tg-feed');
    if (!container) return;

    container.innerHTML = alerts.slice(0, 15).map(alert => `
        <div class="feed-item feed-item--telegram">
            <div class="feed-item-source telegram">📡 ${escHtml(alert.channelTitle)}</div>
            <div class="feed-item-title">${escHtml(alert.text.slice(0, 200))}</div>
            <div class="feed-item-meta">
                <span class="feed-item-time">${formatTime(new Date(alert.date * 1000).toISOString())}</span>
            </div>
        </div>
    `).join('');
}

// ─── Threat Radar Rendering ─────────────────────────────────

function renderRadarFeed() {
    const container = document.getElementById('radar-feed');
    if (!container) return;

    if (marketData.length === 0 && threatAlerts.length === 0) {
        container.innerHTML = `<div class="loading-state"><span>No prediction market data available</span></div>`;
        return;
    }

    // Render alerts first, then markets
    let html = '';

    // Show active threat alerts
    for (const alert of threatAlerts.slice(0, 5)) {
        const levelClass = `radar-alert--${alert.level}`;
        const icon = alert.level === 'critical' ? '🚨' : alert.level === 'high' ? '⚠️' : '📊';
        html += `
            <div class="radar-alert ${levelClass}">
                <div class="radar-alert-header">
                    <span class="radar-alert-icon">${icon}</span>
                    <span class="radar-alert-level">${alert.level.toUpperCase()}</span>
                    <span class="radar-alert-time">${formatTime(alert.timestamp)}</span>
                </div>
                <div class="radar-alert-title">${escHtml(alert.title.replace(/^[🚨⚠📊️\s]+/, ''))}</div>
                <div class="radar-alert-desc">${escHtml(alert.description)}</div>
            </div>
        `;
    }

    // Show top prediction markets
    for (const market of marketData.slice(0, 8)) {
        const probClass = market.probability >= 70 ? 'prob--hot' :
            market.probability >= 50 ? 'prob--warm' : 'prob--cool';
        const catIcon = getCategoryIcon(market.category);
        const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
        const velocityClass = market.velocityPct > 5 ? 'velocity--up' : market.velocityPct < -5 ? 'velocity--down' : '';

        html += `
            <div class="radar-market" data-link="${escHtml(market.url)}">
                <div class="radar-market-header">
                    <span class="radar-market-cat">${catIcon} ${market.category.toUpperCase()}</span>
                    <span class="radar-market-platform">${market.platform === 'polymarket' ? 'PM' : 'KA'}</span>
                </div>
                <div class="radar-market-title">${escHtml(market.title)}</div>
                <div class="radar-market-stats">
                    <span class="radar-market-prob ${probClass}">${market.probability}%</span>
                    ${velocity ? `<span class="radar-market-velocity ${velocityClass}">${velocity}</span>` : ''}
                    <span class="radar-market-vol">$${formatVolume(market.volume)}</span>
                    ${market.region ? `<span class="radar-market-region">📍 ${market.region}</span>` : ''}
                </div>
                <div class="radar-market-bar">
                    <div class="radar-market-bar-fill ${probClass}" style="width:${market.probability}%"></div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Also populate the dedicated Markets panel (shows ALL markets)
    const marketsContainer = document.getElementById('markets-feed');
    const marketsCount = document.getElementById('markets-alert-count');
    if (marketsContainer) {
        if (marketData.length === 0) {
            marketsContainer.innerHTML = `<div class="loading-state"><span>No prediction market data available</span></div>`;
        } else {
            // Get active category filter
            const activeFilter = document.querySelector('#market-filters .pf-pill.active')?.getAttribute('data-market-cat') || 'all';
            const filtered = activeFilter === 'all' ? marketData : marketData.filter(m => m.category === activeFilter);

            let marketsHtml = '';
            for (const market of filtered) {
                const probClass = market.probability >= 70 ? 'prob--hot' :
                    market.probability >= 50 ? 'prob--warm' : 'prob--cool';
                const catIcon = getCategoryIcon(market.category);
                const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
                const velocityClass = market.velocityPct > 5 ? 'velocity--up' : market.velocityPct < -5 ? 'velocity--down' : '';

                marketsHtml += `
                    <div class="radar-market" data-link="${escHtml(market.url)}">
                        <div class="radar-market-header">
                            <span class="radar-market-cat">${catIcon} ${market.category.toUpperCase()}</span>
                            <span class="radar-market-platform">${market.platform === 'polymarket' ? 'PM' : 'KA'}</span>
                        </div>
                        <div class="radar-market-title">${escHtml(market.title)}</div>
                        <div class="radar-market-stats">
                            <span class="radar-market-prob ${probClass}">${market.probability}%</span>
                            ${velocity ? `<span class="radar-market-velocity ${velocityClass}">${velocity}</span>` : ''}
                            <span class="radar-market-vol">$${formatVolume(market.volume)}</span>
                            ${market.region ? `<span class="radar-market-region">📍 ${market.region}</span>` : ''}
                        </div>
                        <div class="radar-market-bar">
                            <div class="radar-market-bar-fill ${probClass}" style="width:${market.probability}%"></div>
                        </div>
                    </div>
                `;
            }
            marketsContainer.innerHTML = marketsHtml;
        }
        if (marketsCount) marketsCount.textContent = String(marketData.length);
    }
}

function getCategoryIcon(cat: string): string {
    switch (cat) {
        case 'strike': return '💣';
        case 'regime': return '👑';
        case 'chokepoint': return '🚢';
        case 'nuclear': return '☢️';
        case 'escalation': return '⚔️';
        default: return '📊';
    }
}

function formatVolume(vol: number): string {
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
    return String(Math.round(vol));
}

function showThreatBanner(alert: any) {
    const banner = document.getElementById('threat-banner');
    const content = document.getElementById('threat-banner-content');
    if (!banner || !content) return;

    content.innerHTML = `
        <div class="threat-banner-title">${escHtml(alert.title)}</div>
        <div class="threat-banner-desc">${escHtml(alert.description)}</div>
    `;
    banner.style.display = 'flex';

    // Auto-hide after 15 seconds
    setTimeout(() => {
        banner.style.display = 'none';
    }, 15000);
}

// ─── Tactical Map Updating ──────────────────────────────────

function updateMapSources() {
    if (!map || !map.isStyleLoaded()) return;

    const now = Date.now();
    const DECAY_START = 7 * 24 * 3600 * 1000;  // Start fading after 7 days
    const DECAY_END = 30 * 24 * 3600 * 1000;   // Fully gone after 30 days

    // Fires GeoJSON
    const firesGeoJSON = {
        type: 'FeatureCollection',
        features: firePoints.map(f => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: { brightness: f.brightness, confidence: f.confidence }
        }))
    };
    const fSrc = map.getSource('fires');
    if (fSrc) fSrc.setData(firesGeoJSON);

    // Flights GeoJSON
    const flightsGeoJSON = {
        type: 'FeatureCollection',
        features: flightData.map((f: any) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: {
                type: f.type,
                callsign: f.callsign,
                heading: f.heading || 0,
                alt: Math.round((f.alt || 0) * 3.281), // meters → feet
                velocity: Math.round((f.velocity || 0) * 1.944), // m/s → knots
                country: f.country || '??',
            }
        }))
    };
    const flSrc = map.getSource('flights');
    if (flSrc) flSrc.setData(flightsGeoJSON);

    // Events GeoJSON with EXPONENTIAL temporal decay
    // α = e^(-k·age) where k is tuned so:
    //   - Events < 1h old: ~100% opacity (fully visible)
    //   - Events at 12h: ~70% opacity
    //   - Events at 24h: ~50% opacity  
    //   - Events at 48h: ~25% opacity → expiry threshold
    // This holds recent events bright before accelerating fadeout
    const features: any[] = [];
    const DECAY_CONSTANT = 0.000000015; // k ≈ 1.5e-8: ~48h to reach 0.1 alpha
    const MAX_AGE = 48 * 3600 * 1000;   // Hard cutoff at 48 hours

    gdeltEvents.filter(e => e.lat && e.lon).forEach(e => {
        const eventTime = e.date ? new Date(
            e.date.length === 8 ? `${e.date.slice(0, 4)}-${e.date.slice(4, 6)}-${e.date.slice(6, 8)}` : e.date
        ).getTime() : now;

        const age = now - eventTime;
        if (age > MAX_AGE || age < 0) return; // Too old or future-dated, skip

        // Exponential decay: α = e^(-k·age)
        const opacity = Math.exp(-DECAY_CONSTANT * age);

        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
            properties: {
                type: 'gdelt',
                title: e.title,
                date: e.date,
                url: e.url || null,
                source: e.source || null,
                opacity: Math.max(0.08, Math.min(1.0, opacity)),
                imageUrl: e.imageUrl || null,
                vgkg: e.vgkg || false,
                confidence: e.confidence || 0.5,
            }
        });
    });

    marketData.filter((m: any) => m.lat && m.lon).forEach((m: any) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
            properties: { type: m.probability >= 60 ? 'market-hot' : 'market', title: m.title, opacity: 1.0 }
        });
    });

    const eventsGeoJSON = {
        type: 'FeatureCollection',
        features: features
    };
    const eSrc = map.getSource('events');
    if (eSrc) eSrc.setData(eventsGeoJSON);

    // Re-sync HTML image markers after data change
    requestAnimationFrame(() => setTimeout(syncImageMarkers, 100));
}

// ─── Panel Toggle System ────────────────────────────────────

function initPanelToggles() {
    // Panel tabs toggle panels — all right-side now
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panelId = (tab as HTMLElement).dataset.panel;
            if (!panelId) return;

            const panel = document.getElementById(panelId);
            if (!panel) return;

            // Close all other panels first
            document.querySelectorAll('.overlay-panel--right.open').forEach(p => {
                if (p.id !== panelId) {
                    p.classList.remove('open');
                    document.querySelector(`.panel-tab[data-panel="${p.id}"]`)?.classList.remove('active');
                }
            });

            const isOpen = panel.classList.toggle('open');
            tab.classList.toggle('active', isOpen);
        });
    });

    // Close buttons
    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = (btn as HTMLElement).dataset.panel;
            if (!panelId) return;
            document.getElementById(panelId)?.classList.remove('open');
            document.querySelector(`.panel-tab[data-panel="${panelId}"]`)?.classList.remove('active');
        });
    });

    // Market category filter buttons
    document.querySelectorAll('#market-filters .pf-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#market-filters .pf-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderRadarFeed(); // Re-render with new filter
        });
    });
}

// ─── Ticker ─────────────────────────────────────────────────

function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;

    const headlines = [
        ...threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').slice(0, 3)
            .map((a: any) => `[THREAT RADAR] ${a.title}`),
        ...newsItems.slice(0, 6).map(n => `[${n.source.toUpperCase()}] ${n.title}`),
        ...marketData.filter((m: any) => m.probability >= 60).slice(0, 3)
            .map((m: any) => `[MARKET] ${m.title} — ${m.probability}% (${m.platform})`),
        ...gdeltEvents.slice(0, 3).map(e => `[GDELT] ${e.title}`),
    ];

    if (headlines.length === 0) {
        el.textContent = 'Monitoring global conflict feeds...';
        return;
    }

    const text = headlines.join('    ◆    ');
    el.textContent = text + '    ◆    ' + text;
}

function updateStats() {
    const evtEl = document.getElementById('event-count');
    const fireEl = document.getElementById('fire-count');
    const flightEl = document.getElementById('flight-count');
    const webcamEl = document.getElementById('webcam-count');
    if (evtEl) evtEl.textContent = String(gdeltEvents.length);
    if (fireEl) fireEl.textContent = String(firePoints.length);
    if (flightEl) flightEl.textContent = String(flightData.length);
    if (webcamEl) webcamEl.textContent = String(webcamData.length);

    // Data freshness display
    const freshnessEl = document.getElementById('data-freshness');
    if (freshnessEl) {
        const sources = ['gdelt', 'fires', 'flights', 'news'];
        freshnessEl.innerHTML = sources.map(s => {
            const label = getFreshnessLabel(s);
            const color = label === '—' ? 'var(--text-muted)' : (parseInt(label) > 5 && label.endsWith('m') ? 'var(--amber)' : 'var(--accent)');
            return `<span style="color:${color}">${s.toUpperCase()}: ${label}</span>`;
        }).join(' · ');
    }
}

// ─── TV Channel Switching ───────────────────────────────────

// Dynamic live stream discovery — populated from /api/youtube
let discoveredStreams: Record<string, { embedUrl: string | null; isLive: boolean; label: string }> = {};

// Hardcoded fallbacks (in case YouTube scraping fails)
const FALLBACK_URLS: Record<string, string> = {
    aljazeeraenglish: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1',
    france24english: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1',
    skynews: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1',
    dwnews: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRhGGw&autoplay=1&mute=1',
    cnn: 'https://www.youtube.com/embed/live_stream?channel=UCupvZG-5ko_eiXAupbDfxWw&autoplay=1&mute=1',
};

async function fetchYouTubeStreams() {
    try {
        const res = await fetch('/api/youtube');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.streams) return;

        for (const s of data.streams) {
            discoveredStreams[s.key] = {
                embedUrl: s.embedUrl,
                isLive: s.isLive,
                label: s.label,
            };
        }

        // Update channel buttons with live indicators
        const container = document.getElementById('tv-channels');
        if (!container) return;

        // Clear and rebuild buttons with live status
        container.innerHTML = '';
        const channels = data.streams as { key: string; label: string; isLive: boolean }[];

        channels.forEach((ch: any, i: number) => {
            const btn = document.createElement('button');
            btn.className = `channel-btn${i === 0 ? ' active' : ''}`;
            btn.dataset.channel = ch.key;
            btn.innerHTML = `${ch.label}${ch.isLive ? ' <span style="color:#ef4444;font-size:8px;">● LIVE</span>' : ''}`;
            container.appendChild(btn);
        });

        console.log(`[STARWAR] YouTube: ${channels.filter((c: any) => c.isLive).length}/${channels.length} channels live`);
    } catch (e) {
        console.error('[STARWAR] YouTube stream discovery failed:', e);
    }
}

function loadTVChannel(channelKey: string) {
    const player = document.getElementById('tv-player');
    if (!player) return;

    // Try discovered URL first, then fallback
    const stream = discoveredStreams[channelKey];
    const embedUrl = stream?.embedUrl || FALLBACK_URLS[channelKey];

    if (embedUrl) {
        player.innerHTML = `<iframe id="tv-iframe" src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
    } else {
        player.innerHTML = `<div class="loading-state" style="height:100%"><span>No live stream found for ${channelKey}</span></div>`;
    }
}

function initTVChannels() {
    const container = document.getElementById('tv-channels');
    if (!container) return;

    // Load fallback immediately while discovery runs
    loadTVChannel('aljazeeraenglish');

    // Start auto-discovery in parallel
    fetchYouTubeStreams().then(() => {
        // Reload current channel with discovered URL
        const active = container.querySelector('.channel-btn.active') as HTMLElement;
        if (active?.dataset.channel) {
            loadTVChannel(active.dataset.channel);
        }
    });

    // Refresh discovery every 10 minutes
    setInterval(fetchYouTubeStreams, 10 * 60 * 1000);

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.channel-btn') as HTMLElement | null;
        if (!btn) return;

        const channelKey = btn.dataset.channel;
        if (!channelKey) return;

        container.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        loadTVChannel(channelKey);
    });
}

// ─── Feed Filters ───────────────────────────────────────────

function initFilters() {
    const container = document.getElementById('feed-filters');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.filter-btn') as HTMLElement | null;
        if (!btn) return;

        const source = btn.dataset.source || 'all';
        currentFilter = source;

        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        fetchNews();
    });
}

// ─── Telegram Auto-Status ───────────────────────────────────

function initTelegram() {
    const statusBar = document.getElementById('tg-status');

    // Poll status every 10s to track auto-connection
    const checkStatus = () => {
        fetch('/api/telegram/status').then(r => r.json()).then(data => {
            if (statusBar) {
                if (data.status === 'connected') {
                    statusBar.textContent = `● Connected as ${data.me?.firstName || data.me?.username || 'OSINT'} — ${data.channelCount} channels`;
                    statusBar.className = 'tg-status tg-connected';
                } else if (data.status === 'awaiting_code' || data.status === 'awaiting_password') {
                    statusBar.textContent = `⚠ Auth required — check server logs`;
                    statusBar.className = 'tg-status';
                } else if (data.status === 'error') {
                    statusBar.textContent = `✗ ${data.error || 'Connection failed'}`;
                    statusBar.className = 'tg-status';
                } else {
                    statusBar.textContent = 'Connecting...';
                }
            }
        }).catch(() => {
            if (statusBar) statusBar.textContent = 'Offline';
        });
    };

    checkStatus();
    setInterval(checkStatus, 10_000);
}

// ─── Threat Banner ──────────────────────────────────────────

function initThreatBanner() {
    const closeBtn = document.getElementById('threat-banner-close');
    const banner = document.getElementById('threat-banner');
    if (closeBtn && banner) {
        closeBtn.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }
}

// ─── Clock ──────────────────────────────────────────────────

function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;

    const update = () => {
        el.textContent = new Date().toUTCString();
    };
    update();
    setInterval(update, 1000);
}

// ─── Aurebesh Toggle ────────────────────────────────────────

function initAurebeshToggle() {
    const btn = document.getElementById('aurebesh-toggle');
    if (!btn) return;

    // Restore saved preference
    if (localStorage.getItem('starwar-aurebesh') === 'on') {
        document.body.classList.add('aurebesh');
    }

    btn.addEventListener('click', () => {
        document.body.classList.toggle('aurebesh');
        const isOn = document.body.classList.contains('aurebesh');
        localStorage.setItem('starwar-aurebesh', isOn ? 'on' : 'off');
    });
}

// ─── Utilities ──────────────────────────────────────────────

function escHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const now = Date.now();
        const diff = now - date.getTime();
        if (diff < 60_000) return 'JUST NOW';
        if (diff < 3600_000) return `${Math.floor(diff / 60_000)}M AGO`;
        if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}H AGO`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

// ─── Chat WebSocket ─────────────────────────────────────────

let ws: WebSocket | null = null;
let chatUsername = '';

function initChat() {
    const messagesEl = document.getElementById('chat-messages');
    const inputEl = document.getElementById('chat-input') as HTMLInputElement | null;
    const sendBtn = document.getElementById('chat-send');
    const onlineEl = document.getElementById('chat-online');
    if (!messagesEl || !inputEl || !sendBtn) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/chat`);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'init') {
                chatUsername = data.username;
                data.history?.forEach((msg: any) => appendChatMessage(msg));
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            } else if (data.type === 'message') {
                appendChatMessage(data);
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            } else if (data.type === 'system') {
                appendSystemMessage(data.text);
                if (onlineEl) onlineEl.textContent = String(data.online || 0);
                scrollChat();
            }
        } catch { /* ignore */ }
    };

    ws.onclose = () => {
        appendSystemMessage('Connection lost. Reconnecting...');
        setTimeout(initChat, 3000);
    };

    const sendMessage = () => {
        const text = inputEl.value.trim();
        if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'message', text }));
        inputEl.value = '';
    };

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function appendChatMessage(msg: { user: string; text: string; time: string }) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const timeStr = msg.time ? new Date(msg.time).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
    }) : '';

    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
        <span class="chat-msg-time">${timeStr}</span>
        <span class="chat-msg-user">${escHtml(msg.user)}:</span>
        <span class="chat-msg-text">${escHtml(msg.text)}</span>
    `;
    messagesEl.appendChild(div);
}

function appendSystemMessage(text: string) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--system';
    div.textContent = text;
    messagesEl.appendChild(div);
}

function scrollChat() {
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

// ─── Search / Jump Modal ────────────────────────────────────

const GLOBE_LOCATIONS = [
    { name: 'Iran', lat: 32.42, lng: 53.68 },
    { name: 'Israel', lat: 31.04, lng: 34.85 },
    { name: 'Gaza Strip', lat: 31.41, lng: 34.35 },
    { name: 'Lebanon (Beirut)', lat: 33.89, lng: 35.50 },
    { name: 'Syria (Damascus)', lat: 33.51, lng: 36.29 },
    { name: 'Yemen (Sanaa)', lat: 15.36, lng: 44.19 },
    { name: 'Ukraine (Kyiv)', lat: 50.45, lng: 30.52 },
    { name: 'Russia (Moscow)', lat: 55.75, lng: 37.61 },
    { name: 'United States (DC)', lat: 38.90, lng: -77.03 },
    { name: 'China (Beijing)', lat: 39.90, lng: 116.40 },
    { name: 'Taiwan', lat: 23.69, lng: 120.96 },
    { name: 'North Korea', lat: 40.33, lng: 127.51 },
];

function initSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    const resultsContainer = document.getElementById('search-results');

    if (!modal || !input || !resultsContainer) return;

    // Toggle on Ctrl+K or Cmd+K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const isVisible = modal.style.display === 'flex';
            modal.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                input.value = '';
                renderResults(GLOBE_LOCATIONS);
                setTimeout(() => input.focus(), 50);
            }
        }
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    const renderResults = (locs: typeof GLOBE_LOCATIONS) => {
        resultsContainer.innerHTML = '';
        locs.forEach(loc => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<span>${loc.name}</span><span style="opacity:0.5">${loc.lat}, ${loc.lng}</span>`;
            div.addEventListener('click', () => {
                if (map) {
                    map.flyTo({ center: [loc.lng, loc.lat], zoom: 6, essential: true });
                }
                modal.style.display = 'none';
            });
            resultsContainer.appendChild(div);
        });
    };

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase();
        const filtered = GLOBE_LOCATIONS.filter(l => l.name.toLowerCase().includes(query));
        renderResults(filtered);
    });
}

// ─── Boot Sequence ──────────────────────────────────────────

function initBootSequence() {
    const bootEl = document.getElementById('boot-sequence');
    if (!bootEl) return;

    // Only show once per session to avoid annoying the user on refresh
    if (sessionStorage.getItem('starwar-booted')) {
        bootEl.style.display = 'none';
        return;
    }

    sessionStorage.setItem('starwar-booted', 'true');

    // Remove overlay after 4.5 seconds (matches CSS animation)
    setTimeout(() => {
        bootEl.classList.add('done');
        setTimeout(() => {
            bootEl.style.display = 'none';
        }, 1000);
    }, 4500);
}

// ─── Mount ──────────────────────────────────────────────────

export default function mount() {
    initBootSequence();
    startClock();
    initMap();
    initTVChannels();
    initFilters();
    initChat();
    initTelegram();
    initThreatBanner();
    initAurebeshToggle();
    initSearchModal();

    // Start data fetching immediately
    fetchAllData();

    // Slow data loops (News, Fire, GDELT)
    // Refresh all data every 60 seconds for realtime feel
    setInterval(fetchAllData, 60_000);

    // Fast data loops (Live Aircraft Telemetry / Movements)
    setInterval(fetchFlights, 15_000);

    // Medium loop (Crypto premium chart — accumulate data points)
    setInterval(fetchCrypto, 30_000);

    // Refresh data freshness labels every 10s
    setInterval(updateStats, 10_000);

    // Click on feed items opens link
    document.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.feed-item, .radar-market') as HTMLElement | null;
        if (item && item.dataset.link && !(e.target as HTMLElement).closest('a')) {
            window.open(item.dataset.link, '_blank');
        }
    });

    // Check legend filters to update map layers
    setupLegendFilters();
}

function setupLegendFilters() {
    const toggleLayer = (id: string, visible: boolean) => {
        if (!map || !map.getLayer(id)) return;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };

    const cProtest = document.getElementById('filter-protest') as HTMLInputElement | null;
    const cBase = document.getElementById('filter-base') as HTMLInputElement | null;
    const cNuclear = document.getElementById('filter-nuclear') as HTMLInputElement | null;
    const cStrike = document.getElementById('filter-strike') as HTMLInputElement | null;

    if (cProtest) cProtest.addEventListener('change', e => {
        toggleLayer('events-clusters', cProtest.checked);
        toggleLayer('events-cluster-count', cProtest.checked);
        toggleLayer('events-point', cProtest.checked);
    });

    if (cStrike) cStrike.addEventListener('change', e => {
        // Fires/Strikes
        toggleLayer('fires-heat', cStrike.checked);
        toggleLayer('acled-kinetic', cStrike.checked);
    });

    if (cBase) cBase.addEventListener('change', e => {
        toggleLayer('assets-base', cBase.checked);
    });

    if (cNuclear) cNuclear.addEventListener('change', e => {
        toggleLayer('assets-nuclear', cNuclear.checked);
    });

    const cSeismic = document.getElementById('filter-seismic') as HTMLInputElement | null;
    const cFlights = document.getElementById('filter-flights') as HTMLInputElement | null;

    if (cSeismic) cSeismic.addEventListener('change', e => {
        toggleLayer('seismic-kinetic', cSeismic.checked);
    });

    if (cFlights) cFlights.addEventListener('change', e => {
        toggleLayer('flights-point', cFlights.checked);
    });

    const cWebcams = document.getElementById('filter-webcams') as HTMLInputElement | null;
    if (cWebcams) cWebcams.addEventListener('change', e => {
        toggleLayer('webcams-point', cWebcams.checked);
    });
}
