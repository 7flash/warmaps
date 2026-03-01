/**
 * /api/mcap — Fetch $WARMAPS market cap from DexScreener
 * Returns { mcap, price, symbol } or { mcap: null } if not found
 */

const CACHE: { data: any; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 30_000; // 30 seconds

export async function GET(req: Request) {
    const ca = process.env.WARMAPS_CA;

    if (!ca) {
        return Response.json({ mcap: null, error: 'WARMAPS_CA not set' });
    }

    // Check cache
    if (CACHE.data && Date.now() - CACHE.ts < CACHE_TTL) {
        return Response.json(CACHE.data);
    }

    try {
        // Try DexScreener API
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, {
            signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
            const data = await res.json();
            const pair = data.pairs?.[0];

            if (pair) {
                const result = {
                    mcap: pair.marketCap || pair.fdv || null,
                    price: pair.priceUsd || null,
                    symbol: pair.baseToken?.symbol || 'WARMAPS',
                    priceChange24h: pair.priceChange?.h24 || null,
                    volume24h: pair.volume?.h24 || null,
                    liquidity: pair.liquidity?.usd || null,
                };
                CACHE.data = result;
                CACHE.ts = Date.now();
                return Response.json(result);
            }
        }

        // Fallback: try pump.fun API
        const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${ca}`, {
            signal: AbortSignal.timeout(5000),
        });

        if (pfRes.ok) {
            const pfData = await pfRes.json();
            const result = {
                mcap: pfData.usd_market_cap || null,
                price: pfData.usd_price || null,
                symbol: pfData.symbol || 'WARMAPS',
                priceChange24h: null,
                volume24h: null,
                liquidity: null,
            };
            CACHE.data = result;
            CACHE.ts = Date.now();
            return Response.json(result);
        }

        return Response.json({ mcap: null, error: 'Token not found on any DEX' });
    } catch (e: any) {
        console.error('[MCAP] Fetch failed:', e.message);
        return Response.json({ mcap: null, error: e.message });
    }
}
