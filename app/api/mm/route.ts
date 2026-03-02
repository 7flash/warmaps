/**
 * /api/mm — Market Maker Status API
 * 
 * Returns current market maker state from mm_state.json
 * Used by the WARMAPS dashboard to show MM positions.
 */

import fs from 'fs';
import path from 'path';

const MM_STATE_PATHS = [
    path.join(import.meta.dir, '..', '..', 'mm_state.json'),     // /opt/starwar/mm_state.json on prod
    'C:/Code/geeksy-pumpfun-plugin/mm_state.json',               // local dev
    path.join(import.meta.dir, '..', '..', 'geeksy-pumpfun-plugin', 'mm_state.json'),
    '/opt/geeksy-pumpfun-plugin/mm_state.json',
    '/opt/starwar/mm_state.json',
];

function loadMmState(): any | null {
    for (const p of MM_STATE_PATHS) {
        try {
            if (fs.existsSync(p)) {
                return JSON.parse(fs.readFileSync(p, 'utf-8'));
            }
        } catch { }
    }
    return null;
}

export async function GET() {
    const state = loadMmState();
    if (!state) {
        return Response.json({ error: 'MM state not available', running: false });
    }

    // Calculate summary stats
    const activeBuckets = (state.buckets || []).filter((b: any) => !b.sold && b.totalTokens > 0);
    const totalTokens = activeBuckets.reduce((sum: number, b: any) => sum + b.totalTokens, 0);
    const totalInvested = activeBuckets.reduce((sum: number, b: any) => sum + b.totalSolSpent, 0);
    const currentValue = totalTokens * state.currentPrice;
    const unrealizedPnl = currentValue - totalInvested;
    const pnlPct = totalInvested > 0 ? ((currentValue / totalInvested - 1) * 100) : 0;

    return Response.json({
        running: true,
        mint: state.mint,
        updatedAt: state.updatedAt,
        price: state.currentPrice,
        totalBuys: state.totalBuys,
        totalSells: state.totalSells,
        activeBuckets: activeBuckets.length,
        totalBuckets: (state.buckets || []).length,
        totalTokens,
        totalInvested,
        currentValue,
        unrealizedPnl,
        pnlPct,
        buckets: (state.buckets || []).map((b: any, i: number) => ({
            id: i,
            tokens: b.totalTokens,
            pnl: b.entryPriceSol > 0 ? ((state.currentPrice / b.entryPriceSol - 1) * 100) : 0,
            buyCount: b.buyCount,
            sold: b.sold,
        })),
    });
}
