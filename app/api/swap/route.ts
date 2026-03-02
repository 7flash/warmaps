/**
 * /api/swap — PumpSwap AMM token swap endpoint
 * 
 * Builds an unsigned swap transaction using PumpSwap AMM SDK.
 * The client signs it with Phantom wallet and broadcasts.
 * 
 * POST: { mint, side: 'buy'|'sell', amount, wallet, slippage? }
 * Returns: { tx: base64-serialized-unsigned-transaction, estimatedOutput, price }
 * 
 * GET: { mint } — returns current price + pool info
 */

import {
    Connection,
    PublicKey,
    Transaction,
    ComputeBudgetProgram,
} from '@solana/web3.js';
import {
    OnlinePumpAmmSdk,
    PUMP_AMM_SDK,
    canonicalPumpPoolPda,
} from '@pump-fun/pump-swap-sdk';
import BN from 'bn.js';
import * as fs from 'fs';
import path from 'path';

// ── Load RPC ─────────────────────────────────────────────────
let RPC_URL = 'https://api.mainnet-beta.solana.com';
const configPaths = [
    path.join(import.meta.dir, '../../../.config.toml'),
    'C:/Code/geeksy-pumpfun-plugin/.config.toml',
    '/opt/geeksy-pumpfun-plugin/.config.toml',
];
for (const p of configPaths) {
    try {
        if (!fs.existsSync(p)) continue;
        const content = fs.readFileSync(p, 'utf-8');
        const rpcMatch = content.match(/endpoint\s*=\s*"([^"]+)"/);
        if (rpcMatch) { RPC_URL = rpcMatch[1]; break; }
    } catch { }
}

const connection = new Connection(RPC_URL, 'confirmed');
const pumpAmmOnline = new OnlinePumpAmmSdk(connection);
const PRIORITY_FEE = 5000;

function getPoolKey(mint: string): PublicKey {
    return canonicalPumpPoolPda(new PublicKey(mint));
}

// GET: /api/swap?mint=xxx — fetch price info
export async function GET(req: Request) {
    const url = new URL(req.url);
    const mint = url.searchParams.get('mint');

    if (!mint) {
        return Response.json({ error: 'mint required' }, { status: 400 });
    }

    try {
        const poolKey = getPoolKey(mint);
        // We need a dummy pubkey for swapSolanaState
        const dummyPk = new PublicKey('11111111111111111111111111111111');
        const swapState = await pumpAmmOnline.swapSolanaState(poolKey, dummyPk);

        const quoteSol = Number(swapState.poolQuoteAmount) / 1e9;
        const baseTokens = Number(swapState.poolBaseAmount) / 1e6;
        const price = baseTokens > 0 ? quoteSol / baseTokens : 0;

        // Market cap: price per token * 1B total supply
        const mcapSol = price * 1e9;

        return Response.json({
            mint,
            price,
            mcapSol,
            poolQuoteSol: quoteSol,
            poolBaseTokens: baseTokens,
        });
    } catch (err: any) {
        console.error('[swap] GET error:', err.message?.slice(0, 120));
        return Response.json({ error: err.message }, { status: 500 });
    }
}

// POST: /api/swap — build unsigned swap tx
export async function POST(req: Request) {
    try {
        const body = await req.json() as {
            mint: string;
            side: 'buy' | 'sell';
            amount: number; // SOL amount for buy, token amount for sell
            wallet: string;
            slippage?: number;
        };

        if (!body.mint || !body.side || !body.amount || !body.wallet) {
            return Response.json({ error: 'mint, side, amount, wallet required' }, { status: 400 });
        }

        const { mint, side, amount, wallet, slippage = 5 } = body;
        const poolKey = getPoolKey(mint);
        const walletPk = new PublicKey(wallet);

        // Get pool state
        const swapState = await pumpAmmOnline.swapSolanaState(poolKey, walletPk);

        const quoteSol = Number(swapState.poolQuoteAmount) / 1e9;
        const baseTokens = Number(swapState.poolBaseAmount) / 1e6;
        const price = baseTokens > 0 ? quoteSol / baseTokens : 0;

        let instructions: any[];
        let estimatedOutput: number;

        if (side === 'buy') {
            // Buy: user sends SOL, gets tokens
            const quoteLamports = new BN(Math.round(amount * 1e9));
            instructions = PUMP_AMM_SDK.buyQuoteInput(swapState, quoteLamports, slippage);
            estimatedOutput = price > 0 ? amount / price : 0;
        } else {
            // Sell: user sends tokens, gets SOL
            const tokenRaw = new BN(Math.round(amount * 1e6));
            instructions = PUMP_AMM_SDK.sellBaseInput(swapState, tokenRaw, slippage);
            estimatedOutput = amount * price;
        }

        if (!instructions || instructions.length === 0) {
            return Response.json({ error: 'Failed to build swap instructions' }, { status: 500 });
        }

        // Build transaction
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

        const tx = new Transaction();
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
        tx.add(...instructions);
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletPk;

        // Serialize as unsigned (Phantom will sign)
        const serialized = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return Response.json({
            tx: Buffer.from(serialized).toString('base64'),
            estimatedOutput,
            price,
            mcapSol: price * 1e9,
            side,
            amount,
            lastValidBlockHeight,
        });
    } catch (err: any) {
        console.error('[swap] POST error:', err.message?.slice(0, 200));
        return Response.json({ error: err.message }, { status: 500 });
    }
}
