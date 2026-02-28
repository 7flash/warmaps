/**
 * /api/markets — Prediction Markets Threat Radar
 * 
 * Aggregates betting odds from Polymarket (crypto/Polygon)
 * and Kalshi (US-regulated) for conflict-related markets.
 * 
 * Monitors:
 * - Regime stability (Khamenei, leadership changes)
 * - Military strike timelines (Israel/Iran/US)
 * - Chokepoint risks (Strait of Hormuz)
 * - Geopolitical escalation bets
 * 
 * Implements velocity detection for "smart money" alerts.
 */

interface MarketData {
    id: string;
    title: string;
    platform: 'polymarket' | 'kalshi';
    probability: number;         // 0-100
    volume: number;              // USD
    previousProbability?: number;  // for velocity calc
    previousVolume?: number;
    velocityPct?: number;        // probability change rate
    volumeSpike?: number;        // volume change in USD
    category: 'strike' | 'regime' | 'chokepoint' | 'escalation' | 'nuclear';
    url: string;
    lastUpdated: string;
    region?: string;
    lat?: number;
    lon?: number;
}

interface ThreatAlert {
    id: string;
    level: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    signals: string[];
    timestamp: string;
    markets: MarketData[];
    region?: string;
    lat?: number;
    lon?: number;
}

// ─── Polymarket CLOB API ─────────────────────────────────────

const POLYMARKET_GAMMA = 'https://gamma-api.polymarket.com';

// Known conflict-related event slugs on Polymarket
const CONFLICT_EVENT_SLUGS = [
    'iran',
    'israel',
    'ukraine',
    'war',
    'khamenei',
    'hormuz',
    'military',
    'strike',
    'nuclear',
    'missile',
    'invasion',
    'nato',
    'taiwan',
    'china',
    'conflict',
    'attack',
];

async function fetchPolymarketMarkets(): Promise<MarketData[]> {
    const markets: MarketData[] = [];
    const seenIds = new Set<string>();

    // Strategy 1: Fetch top-volume events and filter for conflict-related
    try {
        const res = await fetch(`${POLYMARKET_GAMMA}/events?closed=false&limit=50&active=true&order=volume&ascending=false`, {
            signal: AbortSignal.timeout(15000),
            headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
            const events = await res.json();
            console.log(`[markets] Polymarket top events: ${events.length}`);

            for (const event of events) {
                const title = (event.title || '').toLowerCase();
                const slug = (event.slug || '').toLowerCase();
                const description = (event.description || '').toLowerCase();
                const combined = `${title} ${slug} ${description}`;

                // Check if event is conflict-related
                const isConflict = CONFLICT_EVENT_SLUGS.some(term => combined.includes(term));
                if (!isConflict) continue;

                // Fetch individual markets within this event
                const eventMarkets = event.markets || [];
                for (const m of eventMarkets) {
                    if (seenIds.has(m.id)) continue;
                    seenIds.add(m.id);

                    let probability = 50;
                    try {
                        const prices = JSON.parse(m.outcomePrices || '[]');
                        if (prices.length > 0) {
                            probability = Math.round(parseFloat(prices[0]) * 100);
                        }
                    } catch { }

                    const cat = categorizeMarket(m.question || event.title || '');
                    if (!cat) continue;
                    const loc = getMarketLocation(m.question || event.title || '');

                    markets.push({
                        id: `pm-${m.id}`,
                        title: m.question || event.title,
                        platform: 'polymarket',
                        probability,
                        volume: parseFloat(m.volume || m.volumeNum || '0'),
                        category: cat,
                        url: `https://polymarket.com/event/${event.slug || event.id}`,
                        lastUpdated: m.updatedAt || new Date().toISOString(),
                        region: loc?.name,
                        lat: loc?.lat,
                        lon: loc?.lon,
                    });
                }
            }
        }
    } catch (err) {
        console.error('[markets] Polymarket events fetch failed:', err);
    }

    // Strategy 2: Direct market search for specific terms
    for (const query of ['iran strike', 'israel attack', 'hormuz', 'khamenei', 'ukraine war', 'nuclear iran']) {
        try {
            const res = await fetch(`${POLYMARKET_GAMMA}/markets?closed=false&limit=5&active=true&archived=false&order=volume&ascending=false&_q=${encodeURIComponent(query)}`, {
                signal: AbortSignal.timeout(8000),
                headers: { 'Accept': 'application/json' },
            });

            if (!res.ok) continue;
            const data = await res.json();
            if (!Array.isArray(data)) continue;

            for (const market of data) {
                if (!market.question || seenIds.has(market.id)) continue;

                const cat = categorizeMarket(market.question);
                if (!cat) continue;
                seenIds.add(market.id);

                let probability = 50;
                try {
                    const prices = JSON.parse(market.outcomePrices || '[]');
                    if (prices.length > 0) {
                        probability = Math.round(parseFloat(prices[0]) * 100);
                    }
                } catch { }

                const loc = getMarketLocation(market.question);
                markets.push({
                    id: `pm-${market.id}`,
                    title: market.question,
                    platform: 'polymarket',
                    probability,
                    volume: parseFloat(market.volume || '0'),
                    category: cat,
                    url: `https://polymarket.com/event/${market.slug || market.id}`,
                    lastUpdated: market.updatedAt || new Date().toISOString(),
                    region: loc?.name,
                    lat: loc?.lat,
                    lon: loc?.lon,
                });
            }
        } catch { }
    }

    console.log(`[markets] Total Polymarket conflict markets found: ${markets.length}`);
    return deduplicateMarkets(markets);
}

// ─── Kalshi API ──────────────────────────────────────────────

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

async function fetchKalshiMarkets(): Promise<MarketData[]> {
    const markets: MarketData[] = [];

    try {
        // Kalshi events endpoint — search for conflict terms
        for (const query of ['iran', 'israel', 'war', 'military', 'nuclear', 'hormuz']) {
            try {
                const res = await fetch(`${KALSHI_API}/events?status=open&limit=10&with_nested_markets=true`, {
                    signal: AbortSignal.timeout(8000),
                    headers: { 'Accept': 'application/json' },
                });

                if (!res.ok) continue;
                const data = await res.json();
                const events = data.events || [];

                for (const event of events) {
                    const title = (event.title || '').toLowerCase();
                    if (!title.includes(query)) continue;

                    for (const market of (event.markets || [])) {
                        const cat = categorizeMarket(market.title || event.title || '');
                        if (!cat) continue;
                        const loc = getMarketLocation(market.title || event.title || '');

                        markets.push({
                            id: `kalshi-${market.ticker}`,
                            title: market.title || event.title,
                            platform: 'kalshi',
                            probability: Math.round((market.yes_ask || market.last_price || 0.5) * 100),
                            volume: market.volume || 0,
                            category: cat,
                            url: `https://kalshi.com/markets/${event.series_ticker}`,
                            lastUpdated: market.close_time || new Date().toISOString(),
                            region: loc?.name,
                            lat: loc?.lat,
                            lon: loc?.lon,
                        });
                    }
                }
                break; // Only need one successful fetch for events
            } catch { }
        }
    } catch (err) {
        console.error('[markets] Kalshi fetch failed:', err);
    }

    return markets;
}

// ─── Market Classification ──────────────────────────────────

function categorizeMarket(title: string): MarketData['category'] | null {
    const lower = title.toLowerCase();

    if (lower.match(/strike|bomb|attack|military action|airstrike|operation|air strike|airstrikes/))
        return 'strike';
    if (lower.match(/khamenei|supreme leader|regime|out of power|president.*removed|coup|leader.*removed|overthrow/))
        return 'regime';
    if (lower.match(/hormuz|strait|blockade|shipping.*iran|oil.*choke|shipping lane/))
        return 'chokepoint';
    if (lower.match(/nuclear|atomic|enrichment|warhead|nuke|weapon.*mass/))
        return 'nuclear';
    if (lower.match(/war|escalat|conflict|invade|invasion|world war|troops|deploy|sanction|military|missile|drone|territory|ceasefire|peace|frontline|annex|occupy/))
        return 'escalation';

    return null;
}

// ─── Geo-mapping for markets ─────────────────────────────────

const MARKET_LOCATIONS: Record<string, { name: string; lat: number; lon: number }> = {
    'iran': { name: 'Iran', lat: 32.4, lon: 53.7 },
    'tehran': { name: 'Tehran', lat: 35.69, lon: 51.39 },
    'isfahan': { name: 'Isfahan', lat: 32.65, lon: 51.68 },
    'hormuz': { name: 'Strait of Hormuz', lat: 26.56, lon: 56.25 },
    'israel': { name: 'Israel', lat: 31.05, lon: 34.85 },
    'ukraine': { name: 'Ukraine', lat: 49.0, lon: 32.0 },
    'russia': { name: 'Russia', lat: 55.75, lon: 37.62 },
    'taiwan': { name: 'Taiwan', lat: 23.7, lon: 120.96 },
    'china': { name: 'China', lat: 35.86, lon: 104.2 },
    'north korea': { name: 'North Korea', lat: 40.0, lon: 127.0 },
    'syria': { name: 'Syria', lat: 34.8, lon: 38.99 },
    'yemen': { name: 'Yemen', lat: 15.55, lon: 48.52 },
    'gaza': { name: 'Gaza', lat: 31.35, lon: 34.31 },
    'lebanon': { name: 'Lebanon', lat: 33.85, lon: 35.86 },
    'khamenei': { name: 'Iran', lat: 35.69, lon: 51.39 },
    'crimea': { name: 'Crimea', lat: 44.95, lon: 34.10 },
    'kyiv': { name: 'Kyiv', lat: 50.45, lon: 30.52 },
};

function getMarketLocation(title: string): { name: string; lat: number; lon: number } | null {
    const lower = title.toLowerCase();
    for (const [keyword, loc] of Object.entries(MARKET_LOCATIONS)) {
        if (lower.includes(keyword)) return loc;
    }
    return null;
}

function deduplicateMarkets(markets: MarketData[]): MarketData[] {
    const seen = new Map<string, MarketData>();
    for (const m of markets) {
        const key = m.title.toLowerCase().slice(0, 60);
        const existing = seen.get(key);
        if (!existing || m.volume > existing.volume) {
            seen.set(key, m);
        }
    }
    return Array.from(seen.values());
}

// ─── Velocity Detection (Smart Money Alerts) ────────────────

interface MarketSnapshot {
    probability: number;
    volume: number;
    timestamp: number;
}

const marketHistory = new Map<string, MarketSnapshot[]>();
const MAX_HISTORY = 60;

function recordSnapshot(market: MarketData) {
    const history = marketHistory.get(market.id) || [];
    history.push({
        probability: market.probability,
        volume: market.volume,
        timestamp: Date.now(),
    });
    if (history.length > MAX_HISTORY) history.shift();
    marketHistory.set(market.id, history);
}

function detectVelocity(market: MarketData): { velocityPct: number; volumeSpike: number } {
    const history = marketHistory.get(market.id);
    if (!history || history.length < 2) return { velocityPct: 0, volumeSpike: 0 };

    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
    const recentStart = history.find(s => s.timestamp >= fifteenMinsAgo) || history[0];

    const velocityPct = market.probability - recentStart.probability;
    const volumeSpike = market.volume - recentStart.volume;

    return { velocityPct, volumeSpike };
}

// ─── Threat Alert Generation ─────────────────────────────────

const activeAlerts: ThreatAlert[] = [];
const MAX_ALERTS = 20;

function generateAlerts(markets: MarketData[]): ThreatAlert[] {
    const newAlerts: ThreatAlert[] = [];

    for (const market of markets) {
        recordSnapshot(market);
        const { velocityPct, volumeSpike } = detectVelocity(market);

        market.velocityPct = velocityPct;
        market.volumeSpike = volumeSpike;

        // CRITICAL: Volume spike > $50k AND probability jump > 15%
        if (volumeSpike > 50000 && velocityPct > 15) {
            newAlerts.push({
                id: `alert-${market.id}-${Date.now()}`,
                level: 'critical',
                title: `🚨 CRITICAL ANOMALY: ${market.title}`,
                description: `Smart money detected. $${(volumeSpike / 1000).toFixed(0)}k wagered in 15 min. Probability +${velocityPct.toFixed(1)}%.`,
                signals: [
                    `Volume spike: $${volumeSpike.toLocaleString()} in 15 minutes`,
                    `Probability surge: +${velocityPct.toFixed(1)}%`,
                    `Current odds: ${market.probability}% YES`,
                ],
                timestamp: new Date().toISOString(),
                markets: [market],
                region: market.region,
                lat: market.lat,
                lon: market.lon,
            });
        }
        // HIGH: Probability > 70% and rising
        else if (market.probability > 70 && velocityPct > 5) {
            newAlerts.push({
                id: `alert-${market.id}-${Date.now()}`,
                level: 'high',
                title: `⚠ HIGH PROBABILITY: ${market.title}`,
                description: `Market pricing ${market.probability}% chance, rising +${velocityPct.toFixed(1)}% in 15 min.`,
                signals: [
                    `Current probability: ${market.probability}%`,
                    `Rising: +${velocityPct.toFixed(1)}%`,
                    `Volume: $${market.volume.toLocaleString()}`,
                ],
                timestamp: new Date().toISOString(),
                markets: [market],
                region: market.region,
                lat: market.lat,
                lon: market.lon,
            });
        }
        // MEDIUM: Any significant probability (>50%) on conflict markets
        else if (market.probability > 50) {
            newAlerts.push({
                id: `alert-${market.id}-${Date.now()}`,
                level: 'medium',
                title: `📊 ELEVATED: ${market.title}`,
                description: `Market pricing ${market.probability}% chance. Volume: $${market.volume.toLocaleString()}.`,
                signals: [
                    `Current probability: ${market.probability}%`,
                    `Total volume: $${market.volume.toLocaleString()}`,
                ],
                timestamp: new Date().toISOString(),
                markets: [market],
                region: market.region,
                lat: market.lat,
                lon: market.lon,
            });
        }
    }

    // Store alerts
    for (const alert of newAlerts) {
        activeAlerts.unshift(alert);
    }
    while (activeAlerts.length > MAX_ALERTS) activeAlerts.pop();

    return newAlerts;
}

// ─── Cache + Handler ─────────────────────────────────────────

let cache: { markets: MarketData[]; alerts: ThreatAlert[]; ts: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1 minute

export async function GET(req: Request) {
    const url = new URL(req.url);
    const format = url.searchParams.get('format');

    if (format === 'alerts') {
        return Response.json({ alerts: activeAlerts });
    }

    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        return Response.json({
            markets: cache.markets,
            alerts: cache.alerts,
            cached: true,
            lastUpdated: new Date(cache.ts).toISOString(),
        });
    }

    console.log('[markets] Fetching prediction market data...');

    const [polymarketData, kalshiData] = await Promise.all([
        fetchPolymarketMarkets().catch(err => {
            console.error('[markets] Polymarket failed:', err);
            return [] as MarketData[];
        }),
        fetchKalshiMarkets().catch(err => {
            console.error('[markets] Kalshi failed:', err);
            return [] as MarketData[];
        }),
    ]);

    const allMarkets = [...polymarketData, ...kalshiData]
        .sort((a, b) => b.volume - a.volume);

    console.log(`[markets] Got ${polymarketData.length} Polymarket + ${kalshiData.length} Kalshi = ${allMarkets.length} total conflict markets`);

    const newAlerts = generateAlerts(allMarkets);

    cache = {
        markets: allMarkets,
        alerts: activeAlerts,
        ts: Date.now(),
    };

    return Response.json({
        markets: allMarkets,
        alerts: activeAlerts,
        newAlerts: newAlerts.length,
        cached: false,
        lastUpdated: new Date().toISOString(),
    });
}
