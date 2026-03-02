/**
 * /api/bet — Native Solana Prediction Market Betting
 * 
 * POST /api/bet — Place a bet (record after SOL transfer)
 * POST /api/bet?action=close — Close a position (withdraw SOL from treasury)
 * GET  /api/bet?market_id=xxx — Get pool data for a market
 * GET  /api/bet?wallet=xxx — Get a wallet's bet history
 */
import { placeBet, getMarketPool, getMarketBets, getWalletBets, updateBetStatus, db } from '../../../src/db';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import path from 'path';
import bs58 from 'bs58';

// ─── Load treasury wallet from config ────────────────────────

let TREASURY_KEYPAIR: Keypair | null = null;
let TREASURY_PUBKEY = '';
let RPC_URL = 'https://api.mainnet-beta.solana.com';

function loadTreasuryConfig() {
    if (TREASURY_KEYPAIR) return;

    // Load RPC from geeksy config
    const configPaths = [
        path.join(import.meta.dir, '../../../geeksy-pumpfun-plugin/.config.toml'),
        'C:/Code/geeksy-pumpfun-plugin/.config.toml',
        '/opt/geeksy-pumpfun-plugin/.config.toml',
    ];

    for (const p of configPaths) {
        try {
            if (!fs.existsSync(p)) continue;
            const content = fs.readFileSync(p, 'utf-8');

            // Get RPC
            const rpcMatch = content.match(/endpoint\s*=\s*"([^"]+)"/);
            if (rpcMatch) RPC_URL = rpcMatch[1];

            // Use wallet 0 as treasury (wave3 group — lowest value wallets)
            const walletMatch = content.match(/\[group\.wave3\.wallets\]\s*\n0\s*=\s*"([^"]+)"/);
            if (walletMatch) {
                const secretKey = bs58.decode(walletMatch[1]);
                TREASURY_KEYPAIR = Keypair.fromSecretKey(secretKey);
                TREASURY_PUBKEY = TREASURY_KEYPAIR.publicKey.toString();
                console.log(`[bet] Treasury loaded: ${TREASURY_PUBKEY.slice(0, 8)}...`);
            }
            break;
        } catch (err) {
            console.error(`[bet] Config load error from ${p}:`, err);
        }
    }

    if (!TREASURY_KEYPAIR) {
        console.error('[bet] WARNING: No treasury keypair loaded — withdrawals disabled');
    }
}

// Load on import
loadTreasuryConfig();

export async function POST(req: Request) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'close') {
        return handleCloseBet(req);
    }

    try {
        const body = await req.json();
        const { marketId, marketTitle, wallet, side, amountSol, oddsAtBet, txSignature } = body;

        if (!marketId || !wallet || !side || !amountSol || !txSignature) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (side !== 'yes' && side !== 'no') {
            return Response.json({ error: 'Side must be "yes" or "no"' }, { status: 400 });
        }

        if (amountSol < 0.01) {
            return Response.json({ error: 'Minimum bet is 0.01 SOL' }, { status: 400 });
        }

        const betId = placeBet({
            marketId,
            marketTitle: marketTitle || 'Unknown Market',
            wallet,
            side,
            amountSol,
            oddsAtBet: oddsAtBet || 50,
            txSignature,
        });

        const pool = getMarketPool(marketId);

        console.log(`[bet] ${wallet.slice(0, 8)}... bet ${amountSol} SOL on ${side.toUpperCase()} — ${marketTitle?.slice(0, 50)}`);

        return Response.json({
            success: true,
            betId,
            pool,
            treasury: TREASURY_PUBKEY,
        });
    } catch (err: any) {
        console.error('[bet] Error:', err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}

async function handleCloseBet(req: Request) {
    try {
        const body = await req.json();
        const { betId, wallet } = body;

        if (!betId || !wallet) {
            return Response.json({ error: 'Missing betId or wallet' }, { status: 400 });
        }

        if (!TREASURY_KEYPAIR) {
            return Response.json({ error: 'Withdrawal not available — treasury not configured' }, { status: 503 });
        }

        // Find the bet
        const bet = db.bets.select().where({ bet_id: betId }).get();
        if (!bet) {
            return Response.json({ error: 'Bet not found' }, { status: 404 });
        }

        if (bet.wallet !== wallet) {
            return Response.json({ error: 'Wallet mismatch' }, { status: 403 });
        }

        if (bet.status !== 'confirmed') {
            return Response.json({ error: `Bet already ${bet.status}` }, { status: 400 });
        }

        // Calculate payout based on current pool odds
        const pool = getMarketPool(bet.market_id);
        const userSide = bet.side;
        const userPool = userSide === 'yes' ? pool.yesPool : pool.noPool;
        const otherPool = userSide === 'yes' ? pool.noPool : pool.yesPool;

        // Simple proportional payout: user gets back their share
        // If they're closing early (before resolution), they get their original amount minus 5% fee
        const refundAmount = bet.amount_sol * 0.95; // 5% exit fee
        const lamports = Math.round(refundAmount * 1e9);

        // Send SOL back from treasury to user
        const connection = new Connection(RPC_URL, 'confirmed');
        const toPubkey = new PublicKey(wallet);

        // Check treasury balance first
        const treasuryBalance = await connection.getBalance(TREASURY_KEYPAIR.publicKey);
        if (treasuryBalance < lamports + 10000) { // include tx fee buffer
            return Response.json({ error: 'Insufficient treasury balance for withdrawal' }, { status: 503 });
        }

        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: TREASURY_KEYPAIR.publicKey,
                toPubkey,
                lamports,
            })
        );

        const signature = await sendAndConfirmTransaction(connection, tx, [TREASURY_KEYPAIR]);

        // Mark bet as settled
        updateBetStatus(betId, 'settled');

        console.log(`[bet] CLOSE: ${wallet.slice(0, 8)}... withdrew ${refundAmount.toFixed(4)} SOL (bet: ${betId}) tx: ${signature.slice(0, 16)}...`);

        return Response.json({
            success: true,
            refundAmount,
            txSignature: signature,
        });
    } catch (err: any) {
        console.error('[bet] Close error:', err);
        return Response.json({ error: err.message || 'Withdrawal failed' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const marketId = url.searchParams.get('market_id');
    const wallet = url.searchParams.get('wallet');

    if (wallet) {
        const bets = getWalletBets(wallet);
        return Response.json({ bets, treasury: TREASURY_PUBKEY });
    }

    if (marketId) {
        const pool = getMarketPool(marketId);
        const bets = getMarketBets(marketId);
        return Response.json({ pool, bets, treasury: TREASURY_PUBKEY });
    }

    return Response.json({ error: 'Provide market_id or wallet' }, { status: 400 });
}
