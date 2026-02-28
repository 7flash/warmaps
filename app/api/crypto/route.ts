/**
 * /api/crypto — Panic Economy (USDT/IRT War Premium)
 *
 * Attempts Nobitex (Iranian exchange) for USDT/Rials,
 * falls back to Binance USDT/TRY (Turkish Lira) as regional proxy.
 * Tracks premium history in-memory for chart rendering.
 */

interface PremiumPoint {
    time: string;
    localUSDT: number;
    globalUSD: number;
    premiumPercent: number;
    source: string;
}

let premiumHistory: PremiumPoint[] = [];

export async function GET(request: Request) {
    // Try Nobitex first (Iranian exchange — may be geo-blocked)
    const nobitexResult = await tryNobitex();
    if (nobitexResult) return buildResponse(nobitexResult);

    // Fallback: Binance USDT/TRY as regional war-premium proxy
    const binanceResult = await tryBinance();
    if (binanceResult) return buildResponse(binanceResult);

    // Fallback 2: CoinGecko free API (universally accessible)
    const geckoResult = await tryCoinGecko();
    if (geckoResult) return buildResponse(geckoResult);

    // Last resort: return whatever history we have
    if (premiumHistory.length > 0) {
        return Response.json({
            ok: true,
            source: 'Cache (APIs unavailable)',
            history: premiumHistory,
            currentPremium: premiumHistory[premiumHistory.length - 1].premiumPercent,
            alertStatus: premiumHistory[premiumHistory.length - 1].premiumPercent > 5 ? 'HIGH_PANIC' : 'NORMAL',
        });
    }

    return Response.json({ error: 'All crypto APIs unavailable' }, { status: 504 });
}

async function tryNobitex(): Promise<PremiumPoint | null> {
    try {
        const res = await fetch('https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls', {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;

        const data = await res.json();
        const stats = data?.stats?.['usdt-rls'];
        if (!stats?.latest) return null;

        const priceRials = parseFloat(stats.latest);
        const priceToman = priceRials / 10;
        const baseline = 590000; // approximate fair-value Toman baseline
        const premium = ((priceToman - baseline) / baseline) * 100;

        return {
            time: new Date().toISOString(),
            localUSDT: priceToman,
            globalUSD: baseline,
            premiumPercent: premium,
            source: 'Nobitex',
        };
    } catch {
        return null;
    }
}

async function tryBinance(): Promise<PremiumPoint | null> {
    try {
        // Use Binance 24hr ticker for USDT/TRY as a regional proxy
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=USDTTRY', {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;

        const data = await res.json();
        const lastPrice = parseFloat(data.lastPrice);
        const openPrice = parseFloat(data.openPrice);

        // Calculate 24h premium / panic delta
        const premium = ((lastPrice - openPrice) / openPrice) * 100;

        return {
            time: new Date().toISOString(),
            localUSDT: lastPrice,
            globalUSD: openPrice,
            premiumPercent: premium,
            source: 'Binance (USDT/TRY)',
        };
    } catch {
        return null;
    }
}

async function tryCoinGecko(): Promise<PremiumPoint | null> {
    try {
        // CoinGecko free API — USDT market data with 24h change
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd,try&include_24hr_change=true',
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return null;

        const data = await res.json();
        const usdPrice = data?.tether?.usd || 1;
        const tryPrice = data?.tether?.try || 0;
        const change24h = data?.tether?.try_24h_change || 0;

        if (!tryPrice) return null;

        return {
            time: new Date().toISOString(),
            localUSDT: tryPrice,
            globalUSD: usdPrice,
            premiumPercent: change24h,
            source: 'CoinGecko (USDT/TRY)',
        };
    } catch {
        return null;
    }
}

function buildResponse(point: PremiumPoint) {
    premiumHistory.push(point);
    if (premiumHistory.length > 60) premiumHistory.shift(); // Keep 1hr @ 1min intervals

    return Response.json({
        ok: true,
        source: point.source,
        history: premiumHistory,
        currentPremium: point.premiumPercent,
        alertStatus: Math.abs(point.premiumPercent) > 3 ? 'HIGH_PANIC' : 'NORMAL',
    });
}
