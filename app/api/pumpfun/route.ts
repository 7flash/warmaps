/**
 * /api/pumpfun — Conflict Memecoin Tracker
 * 
 * Scans DexScreener for Solana tokens related to geopolitical conflicts.
 * Filters by country-specific keywords and geocodes tokens for map placement.
 * 
 * Cache: 2 minutes (tokens don't change that fast)
 */

// ─── Types ───────────────────────────────────────────────────

interface ConflictToken {
    id: string;
    name: string;
    symbol: string;
    description: string;
    url: string;
    imageUrl: string;
    chainId: string;
    tokenAddress: string;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    matchedKeywords: string[];
    boostAmount: number;
    createdAt: string;
}

// ─── Geocoding Data ──────────────────────────────────────────

const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number; name: string }> = {
    IRN: { lat: 32.42, lng: 53.68, name: 'Iran' },
    ISR: { lat: 31.05, lng: 34.85, name: 'Israel' },
    RUS: { lat: 61.52, lng: 105.32, name: 'Russia' },
    UKR: { lat: 48.38, lng: 31.16, name: 'Ukraine' },
    USA: { lat: 37.09, lng: -95.71, name: 'United States' },
    CHN: { lat: 35.86, lng: 104.20, name: 'China' },
    PRK: { lat: 40.34, lng: 127.51, name: 'North Korea' },
    SYR: { lat: 34.80, lng: 38.99, name: 'Syria' },
    IRQ: { lat: 33.22, lng: 43.68, name: 'Iraq' },
    YEM: { lat: 15.55, lng: 48.52, name: 'Yemen' },
    PSE: { lat: 31.95, lng: 35.23, name: 'Palestine' },
    LBN: { lat: 33.85, lng: 35.86, name: 'Lebanon' },
    AFG: { lat: 33.94, lng: 67.71, name: 'Afghanistan' },
    TWN: { lat: 23.70, lng: 120.96, name: 'Taiwan' },
    SAU: { lat: 23.89, lng: 45.08, name: 'Saudi Arabia' },
    TUR: { lat: 38.96, lng: 35.24, name: 'Turkey' },
};

const TOKEN_GEO_KEYWORDS: Record<string, string[]> = {
    IRN: ['iran', 'iranian', 'khamenei', 'tehran', 'persian', 'irgc', 'ayatollah', 'quds', 'isfahan', 'natanz'],
    ISR: ['israel', 'israeli', 'netanyahu', 'idf', 'tel aviv', 'zion', 'mossad'],
    PSE: ['palestine', 'palestinian', 'gaza', 'west bank', 'hamas', 'intifada'],
    RUS: ['russia', 'russian', 'putin', 'moscow', 'kremlin', 'wagner', 'donbas'],
    UKR: ['ukraine', 'ukrainian', 'zelensky', 'kyiv', 'kiev', 'azov'],
    USA: ['trump', 'biden', 'pentagon', 'cia', 'america', 'centcom'],
    CHN: ['china', 'chinese', 'beijing', 'xi jinping', 'pla', 'ccp'],
    PRK: ['north korea', 'kim jong', 'pyongyang', 'dprk'],
    SYR: ['syria', 'syrian', 'assad', 'damascus'],
    IRQ: ['iraq', 'iraqi', 'baghdad'],
    YEM: ['yemen', 'yemeni', 'houthi', 'sanaa'],
    LBN: ['lebanon', 'lebanese', 'beirut', 'nasrallah'],
    AFG: ['afghan', 'kabul', 'taliban'],
    TWN: ['taiwan', 'taipei', 'formosa'],
    SAU: ['saudi', 'riyadh', 'mbs'],
    TUR: ['turkey', 'turkish', 'erdogan'],
};

const CONFLICT_KEYWORDS = [
    'war', 'missile', 'strike', 'bomb', 'nuke', 'nuclear',
    'invasion', 'conflict', 'military', 'attack', 'defense',
    'drone', 'airstrike', 'ceasefire', 'peace', 'ww3', 'worldwar',
    'sanction', 'red line', 'escalation', 'retaliation',
    'killed', 'martyr', 'resistance', 'frontline',
];

// ─── Cache ───────────────────────────────────────────────────

let cache: { tokens: ConflictToken[]; ts: number } | null = null;
const CACHE_TTL = 120_000; // 2 minutes

// ─── Core Logic ──────────────────────────────────────────────

function matchConflictKeywords(text: string): { countryCode: string; keywords: string[] } | null {
    const lower = text.toLowerCase();
    for (const [code, keywords] of Object.entries(TOKEN_GEO_KEYWORDS)) {
        const matched = keywords.filter(kw => lower.includes(kw));
        if (matched.length > 0) return { countryCode: code, keywords: matched };
    }
    const conflictMatch = CONFLICT_KEYWORDS.filter(kw => lower.includes(kw));
    if (conflictMatch.length >= 2) return { countryCode: 'USA', keywords: conflictMatch };
    return null;
}

async function scanTokens(): Promise<ConflictToken[]> {
    const results: ConflictToken[] = [];

    // 1. DexScreener boosted tokens
    try {
        const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
        const data = await res.json() as any[];

        for (const token of data) {
            if (token.chainId !== 'solana') continue;
            const text = `${token.description || ''} ${token.url || ''}`.toLowerCase();
            const match = matchConflictKeywords(text);
            if (!match) continue;

            const centroid = COUNTRY_CENTROIDS[match.countryCode];
            if (!centroid) continue;

            const jitter = () => (Math.random() - 0.5) * 3;
            results.push({
                id: token.tokenAddress,
                name: token.description?.split('\n')[0]?.slice(0, 40) || token.tokenAddress.slice(0, 8),
                symbol: '',
                description: (token.description || '').slice(0, 200),
                url: token.url || '',
                imageUrl: token.icon ? `https://cdn.dexscreener.com/cms/images/${token.icon}` : '',
                chainId: 'solana',
                tokenAddress: token.tokenAddress,
                country: centroid.name,
                countryCode: match.countryCode,
                lat: centroid.lat + jitter(),
                lng: centroid.lng + jitter(),
                matchedKeywords: match.keywords,
                boostAmount: token.totalAmount || 0,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (e) {
        console.error('[PUMPFUN] Boost scan failed:', e);
    }

    // 2. DexScreener keyword searches
    const searchTerms = ['iran', 'trump iran', 'war', 'ww3', 'khamenei', 'missile', 'ukraine', 'israel'];
    for (const term of searchTerms) {
        try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
            const data = await res.json() as any;
            for (const pair of (data.pairs || []).slice(0, 3)) {
                if (pair.chainId !== 'solana') continue;
                if (results.some(r => r.tokenAddress === pair.baseToken?.address)) continue;

                const text = `${pair.baseToken?.name || ''} ${pair.baseToken?.symbol || ''}`.toLowerCase();
                const match = matchConflictKeywords(text);
                if (!match) continue;

                const centroid = COUNTRY_CENTROIDS[match.countryCode];
                if (!centroid) continue;
                const jitter = () => (Math.random() - 0.5) * 3;

                results.push({
                    id: pair.baseToken?.address || pair.pairAddress,
                    name: pair.baseToken?.name || 'Unknown',
                    symbol: pair.baseToken?.symbol || '???',
                    description: `$${pair.baseToken?.symbol} — ${pair.baseToken?.name}`,
                    url: pair.url || '',
                    imageUrl: pair.info?.imageUrl || '',
                    chainId: 'solana',
                    tokenAddress: pair.baseToken?.address || '',
                    country: centroid.name,
                    countryCode: match.countryCode,
                    lat: centroid.lat + jitter(),
                    lng: centroid.lng + jitter(),
                    matchedKeywords: match.keywords,
                    boostAmount: 0,
                    createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : new Date().toISOString(),
                });
            }
            // Rate limit between searches
            await new Promise(r => setTimeout(r, 300));
        } catch (e) { /* ignore individual search failures */ }
    }

    console.log(`[PUMPFUN] Scanned ${results.length} conflict tokens`);
    return results;
}

// ─── Route Handler ───────────────────────────────────────────

export async function GET() {
    // Return cached if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        return Response.json({ tokens: cache.tokens, cached: true, count: cache.tokens.length });
    }

    const tokens = await scanTokens();
    cache = { tokens, ts: Date.now() };
    return Response.json({ tokens, cached: false, count: tokens.length });
}
