/**
 * betting.ts — Market modal & native SOL betting
 */

import { connectedWallet, TREASURY_WALLET } from './state';
import { escHtml, formatVolume, getCategoryIcon } from './utils';

export function openMarketModal(market: any) {
    document.querySelector('.article-modal-overlay')?.remove();

    const probClass = market.probability >= 70 ? 'prob--hot' :
        market.probability >= 50 ? 'prob--warm' : 'prob--cool';
    const noPct = 100 - market.probability;
    const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
    const catIcon = getCategoryIcon(market.category);

    const overlay = document.createElement('div');
    overlay.className = 'article-modal-overlay';

    overlay.innerHTML = `
        <div class="article-modal market-modal" onclick="event.stopPropagation()">
            <div class="article-modal__header">
                <div class="article-modal__title">${escHtml(market.title)}</div>
                <button class="article-modal__close" title="Close">×</button>
            </div>

            <div class="market-modal__gauge">
                <div class="market-modal__gauge-bar">
                    <div class="market-modal__gauge-yes ${probClass}" style="width:${market.probability}%">
                        <span>YES ${market.probability}%</span>
                    </div>
                    <div class="market-modal__gauge-no" style="width:${noPct}%">
                        <span>NO ${noPct}%</span>
                    </div>
                </div>
            </div>

            <div class="article-modal__meta">
                <span>${catIcon} ${escHtml(market.category.toUpperCase())}</span>
                <span>◆ WARMAPS</span>
                <span>💰 $${formatVolume(market.volume)} volume</span>
                ${velocity ? `<span class="market-velocity-badge">${velocity}</span>` : ''}
                ${market.region ? `<span>📍 ${escHtml(market.region)}</span>` : ''}
            </div>

            <div class="market-modal__body">
                <p>Current intelligence suggests a <strong>${market.probability}%</strong> probability of YES.</p>
                ${market.velocityPct && Math.abs(market.velocityPct) > 2 ?
            `<p class="market-velocity-note">${market.velocityPct > 0 ? '📈' : '📉'} Odds shifted <strong>${velocity}</strong> in 15 min — ${market.velocityPct > 0 ? 'smart money inflow detected' : 'sentiment reversing'}.</p>` : ''}
            </div>

            <div class="market-modal__bet-section">
                <div class="bet-amount-row">
                    <label>WAGER (SOL)</label>
                    <div class="bet-amount-input-wrap">
                        <input type="number" id="bet-amount" class="bet-amount-input" value="0.1" min="0.01" max="100" step="0.01" />
                        <div class="bet-presets">
                            <button class="bet-preset" data-amt="0.1">0.1</button>
                            <button class="bet-preset" data-amt="0.5">0.5</button>
                            <button class="bet-preset" data-amt="1">1</button>
                            <button class="bet-preset" data-amt="5">5</button>
                        </div>
                    </div>
                </div>
                <div class="market-modal__actions">
                    <button class="market-modal__bet market-modal__bet--yes" id="bet-yes-btn">
                        BET YES — ${market.probability}%
                    </button>
                    <button class="market-modal__bet market-modal__bet--no" id="bet-no-btn">
                        BET NO — ${noPct}%
                    </button>
                </div>
                <div id="bet-status" class="bet-status"></div>
            </div>

            <div id="market-pool-stats" class="market-pool-stats"></div>
            <div id="my-positions" class="my-positions"></div>

            <div class="market-modal__footer">
                ◆ WARMAPS Prediction Markets — Powered by Solana
            </div>
        </div>
    `;

    // Close handlers
    overlay.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.article-modal__close')?.addEventListener('click', () => overlay.remove());
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);

    // Preset amount buttons
    overlay.querySelectorAll('.bet-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = overlay.querySelector('#bet-amount') as HTMLInputElement;
            if (input) input.value = (btn as HTMLElement).dataset.amt || '0.1';
        });
    });

    // BET YES / BET NO handlers
    overlay.querySelector('#bet-yes-btn')?.addEventListener('click', () => placeSolanaBet(market, 'yes', overlay));
    overlay.querySelector('#bet-no-btn')?.addEventListener('click', () => placeSolanaBet(market, 'no', overlay));

    // Load pool stats and user's positions
    loadMarketPositions(market, overlay);
}

async function loadMarketPositions(market: any, overlay: HTMLElement) {
    const poolEl = overlay.querySelector('#market-pool-stats') as HTMLElement;
    const posEl = overlay.querySelector('#my-positions') as HTMLElement;

    try {
        const poolRes = await fetch(`/api/bet?market_id=${encodeURIComponent(market.id)}`);
        const poolData = await poolRes.json();

        if (poolData.pool && poolData.pool.total > 0) {
            poolEl.innerHTML = `
                <div class="pool-header">POOL</div>
                <div class="pool-row">
                    <span class="pool-yes">YES: ${poolData.pool.yesPool.toFixed(2)} SOL (${poolData.pool.yesBets} bets)</span>
                    <span class="pool-no">NO: ${poolData.pool.noPool.toFixed(2)} SOL (${poolData.pool.noBets} bets)</span>
                    <span class="pool-total">Total: ${poolData.pool.total.toFixed(2)} SOL</span>
                </div>
            `;
        }

        if (connectedWallet) {
            const userRes = await fetch(`/api/bet?wallet=${connectedWallet}`);
            const userData = await userRes.json();

            const marketBets = (userData.bets || []).filter((b: any) => b.market_id === market.id);

            if (marketBets.length > 0) {
                posEl.innerHTML = `
                    <div class="positions-header">MY POSITIONS</div>
                    ${marketBets.map((b: any) => {
                    const sideClass = b.side === 'yes' ? 'pos-yes' : 'pos-no';
                    const canClose = b.status === 'confirmed';
                    return `
                            <div class="position-row ${sideClass}">
                                <div class="position-info">
                                    <span class="position-side">${b.side.toUpperCase()}</span>
                                    <span class="position-amount">${b.amount_sol} SOL</span>
                                    <span class="position-odds">@ ${b.odds_at_bet}%</span>
                                    <span class="position-status position-status--${b.status}">${b.status.toUpperCase()}</span>
                                </div>
                                ${canClose ? `<button class="position-close-btn" data-bet-id="${b.bet_id}">CLOSE</button>` : ''}
                            </div>
                        `;
                }).join('')}
                `;

                posEl.querySelectorAll('.position-close-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const betId = (btn as HTMLElement).dataset.betId;
                        if (!betId || !connectedWallet) return;

                        (btn as HTMLButtonElement).disabled = true;
                        (btn as HTMLButtonElement).textContent = '⏳...';

                        try {
                            const res = await fetch('/api/bet?action=close', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ betId, wallet: connectedWallet }),
                            });
                            const data = await res.json();

                            if (data.success) {
                                (btn as HTMLButtonElement).textContent = `✅ ${data.refundAmount.toFixed(3)} SOL`;
                                (btn as HTMLElement).closest('.position-row')?.classList.add('position-settled');
                                setTimeout(() => loadMarketPositions(market, overlay), 2000);
                            } else {
                                (btn as HTMLButtonElement).textContent = data.error || 'Failed';
                                (btn as HTMLButtonElement).disabled = false;
                            }
                        } catch (err: any) {
                            (btn as HTMLButtonElement).textContent = 'Error';
                            (btn as HTMLButtonElement).disabled = false;
                        }
                    });
                });
            }
        }
    } catch (err) {
        console.error('[positions] Failed to load:', err);
    }
}

async function placeSolanaBet(market: any, side: 'yes' | 'no', overlay: HTMLElement) {
    const statusEl = overlay.querySelector('#bet-status') as HTMLElement;
    const amountInput = overlay.querySelector('#bet-amount') as HTMLInputElement;
    const amount = parseFloat(amountInput?.value || '0');

    if (!amount || amount < 0.01) {
        statusEl.innerHTML = '<span class="bet-error">⚠ Minimum bet is 0.01 SOL</span>';
        return;
    }

    if (!connectedWallet) {
        statusEl.innerHTML = '<span class="bet-error">🔗 Connect your wallet first (top bar)</span>';
        const walletBtn = document.getElementById('wallet-btn');
        walletBtn?.classList.add('wallet-btn--flash');
        setTimeout(() => walletBtn?.classList.remove('wallet-btn--flash'), 2000);
        return;
    }

    const solana = (window as any).solana;
    if (!solana?.isPhantom) {
        statusEl.innerHTML = '<span class="bet-error">⚠ Phantom wallet required</span>';
        return;
    }

    statusEl.innerHTML = '<span class="bet-pending">⏳ Confirm transaction in Phantom...</span>';

    try {
        const { Connection, PublicKey, Transaction, SystemProgram } = await import('@solana/web3.js');
        const connection = new Connection(window.location.origin + '/api/rpc', 'confirmed');
        const fromPubkey = new PublicKey(connectedWallet);
        const toPubkey = new PublicKey(TREASURY_WALLET);
        const lamports = Math.round(amount * 1e9);

        const tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
        );
        tx.feePayer = fromPubkey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const { signature } = await solana.signAndSendTransaction(tx);

        statusEl.innerHTML = '<span class="bet-pending">⏳ Confirming on Solana...</span>';

        const resp = await fetch('/api/bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                marketId: market.id,
                marketTitle: market.title,
                wallet: connectedWallet,
                side,
                amountSol: amount,
                oddsAtBet: market.probability,
                txSignature: signature,
            }),
        });

        const data = await resp.json();

        if (data.success) {
            const sideLabel = side.toUpperCase();
            const sideColor = side === 'yes' ? '#22c55e' : '#ef4444';
            statusEl.innerHTML = `<span class="bet-success" style="color:${sideColor}">✅ Bet placed! ${amount} SOL on ${sideLabel}<br/><span style="font-size:10px;color:var(--text-dim)">tx: ${signature.slice(0, 16)}...</span></span>`;
            setTimeout(() => loadMarketPositions(market, overlay), 1500);
        } else {
            statusEl.innerHTML = `<span class="bet-error">❌ ${data.error || 'Failed to record bet'}</span>`;
        }
    } catch (err: any) {
        console.error('[bet] Failed:', err);
        if (err.message?.includes('User rejected')) {
            statusEl.innerHTML = '<span class="bet-error">Transaction cancelled</span>';
        } else {
            statusEl.innerHTML = `<span class="bet-error">❌ ${err.message || 'Transaction failed'}</span>`;
        }
    }
}
