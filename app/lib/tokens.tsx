/**
 * tokens.tsx — Pump.fun conflict token markers & feed
 */

import { render } from 'melina/client';
import maplibregl from 'maplibre-gl';
import { map, pumpfunTokens, gdeltEvents, TOKEN_MARKERS, connectedWallet } from './state';
import { ImgWithFallback, proxyImg, escHtml, formatTime } from './utils';

export function updateTokenMapSource() {
    if (!map) return;
    for (const [, m] of TOKEN_MARKERS) m.remove();
    TOKEN_MARKERS.clear();

    for (const token of pumpfunTokens) {
        if (!token.imageUrl) continue;
        let placeLat = parseFloat(token.lat);
        let placeLon = parseFloat(token.lng);
        const keywords = (token.matchedKeywords || []).map((k: string) => k.toLowerCase());

        if (keywords.length > 0 && gdeltEvents.length > 0) {
            const match = gdeltEvents.find((ev: any) => {
                const evText = ((ev.title || '') + ' ' + (ev.country || '')).toLowerCase();
                return keywords.some((kw: string) => evText.includes(kw));
            });
            if (match && match.lat && (match.lon || match.lng)) {
                placeLat = parseFloat(match.lat) + (Math.random() - 0.5) * 2;
                placeLon = parseFloat(match.lon || match.lng) + (Math.random() - 0.5) * 3;
            }
        }

        if (isNaN(placeLat) || isNaN(placeLon) ||
            placeLat < -90 || placeLat > 90 || placeLon < -180 || placeLon > 180) continue;

        const el = document.createElement('div');
        el.className = 'map-token-marker';
        const symbol = (token.symbol || '??').slice(0, 10);
        render(<><ImgWithFallback url={token.imageUrl} fallbackText={symbol} /><div className="map-token-marker__label">{symbol}</div></>, el);
        el.addEventListener('click', () => openTokenDetailModal(token));

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([placeLon, placeLat]).addTo(map);
        TOKEN_MARKERS.set(token.symbol + '-' + token.name, marker);
    }
}

/** Full-screen token detail modal with DexScreener chart embed */
export function openTokenDetailModal(token: any) {
    // Remove existing modal
    document.querySelector('.token-detail-overlay')?.remove();

    // Fly to token on map
    if (map && token.lat && token.lng) {
        map.flyTo({ center: [token.lng, token.lat], zoom: Math.max(map.getZoom(), 6), duration: 800 });
    }

    const symbol = escHtml(token.symbol || '???');
    const name = escHtml(token.name || 'Unknown');
    const imgSrc = token.imageUrl ? proxyImg(token.imageUrl) : '';
    const tokenAddr = token.tokenAddress || token.mint || '';
    const pfUrl = token.url || `https://pump.fun/coin/${tokenAddr}`;
    const dexUrl = `https://dexscreener.com/solana/${tokenAddr}`;
    const chartEmbedUrl = `https://dexscreener.com/solana/${tokenAddr}?embed=1&theme=dark&trades=0&info=0`;

    // Nearby conflict events
    const nearbyEvents = gdeltEvents.filter(ev => {
        if (!ev.lat || !ev.lon) return false;
        return Math.abs(ev.lat - token.lat) < 5 && Math.abs(ev.lon - token.lng) < 5;
    }).slice(0, 8);

    const keywords = (token.matchedKeywords || []).map((k: string) =>
        `<span class="token-detail__keyword">${escHtml(k)}</span>`
    ).join('');

    const eventsHtml = nearbyEvents.length > 0
        ? nearbyEvents.map(ev => `
            <a class="token-detail__event" href="${escHtml(ev.url || '#')}" target="_blank" rel="noopener">
                <span class="token-detail__event-title">${escHtml((ev.title || '').slice(0, 80))}</span>
                <span class="token-detail__event-meta">
                    ${ev.source ? `<span>${escHtml(ev.source)}</span>` : ''}
                    ${ev.date ? `<span>${formatTime(ev.date)}</span>` : ''}
                </span>
            </a>
        `).join('')
        : '<div class="token-detail__no-events">No nearby conflict events detected</div>';

    const overlay = document.createElement('div');
    overlay.className = 'token-detail-overlay';

    overlay.innerHTML = `
        <div class="token-detail" onclick="event.stopPropagation()">
            <button class="token-detail__close" title="Close">×</button>

            <div class="token-detail__header">
                ${imgSrc ? `<img class="token-detail__img" src="${escHtml(imgSrc)}" onerror="this.style.display='none'" />` : '<div class="token-detail__img-placeholder">💰</div>'}
                <div class="token-detail__title-wrap">
                    <div class="token-detail__symbol">$${symbol}</div>
                    <div class="token-detail__name">${name}</div>
                    <div class="token-detail__meta-row">
                        ${token.country ? `<span class="token-detail__badge">📍 ${escHtml(token.country)}</span>` : ''}
                        ${token.boostAmount ? `<span class="token-detail__badge token-detail__badge--boost">🚀 ${token.boostAmount} SOL boost</span>` : ''}
                    </div>
                </div>
            </div>

            ${keywords ? `<div class="token-detail__keywords">${keywords}</div>` : ''}

            <div class="token-detail__chart-section">
                <div class="token-detail__chart-header">
                    <span>📊 LIVE CHART</span>
                    <a href="${escHtml(dexUrl)}" target="_blank" rel="noopener" class="token-detail__chart-link">Open on DexScreener ↗</a>
                </div>
                ${tokenAddr
            ? `<div class="token-detail__chart-wrap">
                        <iframe src="${escHtml(chartEmbedUrl)}" frameborder="0" allowfullscreen loading="lazy"></iframe>
                    </div>`
            : '<div class="token-detail__no-chart">No chart available — token address unknown</div>'
        }
            </div>

            <div class="token-detail__events-section">
                <div class="token-detail__events-header">⚡ NEARBY CONFLICT EVENTS (${nearbyEvents.length})</div>
                <div class="token-detail__events">${eventsHtml}</div>
            </div>

            ${tokenAddr ? `<div class="token-trade">
                <div class="token-trade__header">
                    <span>⚡ TRADE $${symbol}</span>
                    <span class="token-trade__price" id="trade-price">Loading...</span>
                </div>
                <div class="token-trade__tabs">
                    <button class="token-trade__tab token-trade__tab--buy active" id="trade-tab-buy">BUY</button>
                    <button class="token-trade__tab token-trade__tab--sell" id="trade-tab-sell">SELL</button>
                </div>
                <div class="token-trade__body">
                    <div class="token-trade__input-row">
                        <label id="trade-input-label">Amount (SOL)</label>
                        <input type="number" id="trade-amount" class="token-trade__input" value="0.1" min="0.001" step="0.01" />
                    </div>
                    <div class="token-trade__presets">
                        <button class="token-trade__preset" data-amt="0.05">0.05</button>
                        <button class="token-trade__preset" data-amt="0.1">0.1</button>
                        <button class="token-trade__preset" data-amt="0.5">0.5</button>
                        <button class="token-trade__preset" data-amt="1">1.0</button>
                        <button class="token-trade__preset" data-amt="5">5.0</button>
                    </div>
                    <div class="token-trade__estimate" id="trade-estimate"></div>
                    <button class="token-trade__exec token-trade__exec--buy" id="trade-exec-btn">
                        🔥 BUY $${symbol}
                    </button>
                    <div class="token-trade__status" id="trade-status"></div>
                </div>
            </div>` : ''}

            <div class="token-detail__actions">
                <a href="${escHtml(pfUrl)}" target="_blank" rel="noopener" class="token-detail__cta token-detail__cta--pump">
                    🔥 View on Pump.fun
                </a>
                <a href="${escHtml(dexUrl)}" target="_blank" rel="noopener" class="token-detail__cta token-detail__cta--dex">
                    📈 DexScreener
                </a>
                ${tokenAddr ? `<button class="token-detail__cta token-detail__cta--copy" onclick="navigator.clipboard.writeText('${escHtml(tokenAddr)}').then(()=>{this.textContent='✅ Copied!'})">
                    📋 Copy CA
                </button>` : ''}
            </div>
        </div>
    `;

    // Close handlers
    overlay.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.token-detail__close')?.addEventListener('click', () => overlay.remove());

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);

    // ── Trading widget logic ─────────────────────────────────
    if (tokenAddr) {
        let tradeSide: 'buy' | 'sell' = 'buy';
        let currentPrice = 0;

        const tabBuy = overlay.querySelector('#trade-tab-buy') as HTMLElement;
        const tabSell = overlay.querySelector('#trade-tab-sell') as HTMLElement;
        const amtInput = overlay.querySelector('#trade-amount') as HTMLInputElement;
        const inputLabel = overlay.querySelector('#trade-input-label') as HTMLElement;
        const estimateEl = overlay.querySelector('#trade-estimate') as HTMLElement;
        const execBtn = overlay.querySelector('#trade-exec-btn') as HTMLButtonElement;
        const statusEl = overlay.querySelector('#trade-status') as HTMLElement;
        const priceEl = overlay.querySelector('#trade-price') as HTMLElement;

        // Tab switching
        tabBuy?.addEventListener('click', () => {
            tradeSide = 'buy';
            tabBuy.classList.add('active');
            tabSell?.classList.remove('active');
            inputLabel.textContent = 'Amount (SOL)';
            execBtn.textContent = '🔥 BUY $' + symbol;
            execBtn.className = 'token-trade__exec token-trade__exec--buy';
            updateEstimate();
        });
        tabSell?.addEventListener('click', () => {
            tradeSide = 'sell';
            tabSell.classList.add('active');
            tabBuy?.classList.remove('active');
            inputLabel.textContent = 'Amount (tokens)';
            execBtn.textContent = '💰 SELL $' + symbol;
            execBtn.className = 'token-trade__exec token-trade__exec--sell';
            updateEstimate();
        });

        // Preset buttons
        overlay.querySelectorAll('.token-trade__preset').forEach(btn => {
            btn.addEventListener('click', () => {
                if (amtInput) amtInput.value = (btn as HTMLElement).dataset.amt || '0.1';
                updateEstimate();
            });
        });

        // Estimate updates
        amtInput?.addEventListener('input', () => updateEstimate());

        function updateEstimate() {
            if (!currentPrice || !estimateEl) return;
            const amt = parseFloat(amtInput?.value || '0');
            if (!amt || amt <= 0) { estimateEl.textContent = ''; return; }
            if (tradeSide === 'buy') {
                const tokens = amt / currentPrice;
                estimateEl.textContent = '≈ ' + formatTokens(tokens) + ' tokens';
            } else {
                const sol = amt * currentPrice;
                estimateEl.textContent = '≈ ' + sol.toFixed(6) + ' SOL';
            }
        }

        function formatTokens(n: number): string {
            if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return n.toFixed(0);
        }

        // Fetch initial price
        fetch('/api/swap?mint=' + tokenAddr)
            .then(r => r.json())
            .then(d => {
                if (d.price) {
                    currentPrice = d.price;
                    const mcapUsd = d.mcapSol * 150; // rough SOL/USD
                    priceEl.textContent = mcapUsd >= 1000 ? '$' + (mcapUsd / 1000).toFixed(1) + 'K mcap' : '$' + mcapUsd.toFixed(0) + ' mcap';
                    updateEstimate();
                }
            })
            .catch(() => { priceEl.textContent = 'Price unavailable'; });

        // Execute trade
        execBtn?.addEventListener('click', async () => {
            const amt = parseFloat(amtInput?.value || '0');
            if (!amt || amt <= 0) {
                statusEl.innerHTML = '<span style="color:#ef4444">Enter an amount</span>';
                return;
            }
            if (!connectedWallet) {
                statusEl.innerHTML = '<span style="color:#ef4444">🔗 Connect wallet first (top bar)</span>';
                const walletBtn = document.getElementById('wallet-btn');
                walletBtn?.classList.add('wallet-btn--flash');
                setTimeout(() => walletBtn?.classList.remove('wallet-btn--flash'), 2000);
                return;
            }
            const solana = (window as any).solana;
            if (!solana?.isPhantom) {
                statusEl.innerHTML = '<span style="color:#ef4444">Phantom wallet required</span>';
                return;
            }

            execBtn.disabled = true;
            statusEl.innerHTML = '<span style="color:#fbbf24">⏳ Building transaction...</span>';

            try {
                // 1. Get unsigned tx from server
                const res = await fetch('/api/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mint: tokenAddr,
                        side: tradeSide,
                        amount: amt,
                        wallet: connectedWallet,
                    }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                // 2. Deserialize and sign with Phantom
                statusEl.innerHTML = '<span style="color:#fbbf24">⏳ Confirm in Phantom...</span>';

                const { Transaction: SolTx } = await import('@solana/web3.js');
                const txBuf = Buffer.from(data.tx, 'base64');
                const tx = SolTx.from(txBuf);

                const { signature } = await solana.signAndSendTransaction(tx);

                // 3. Show success
                const outLabel = tradeSide === 'buy'
                    ? formatTokens(data.estimatedOutput) + ' tokens'
                    : data.estimatedOutput.toFixed(4) + ' SOL';
                statusEl.innerHTML = `<span style="color:#22c55e">✅ ${tradeSide === 'buy' ? 'Bought' : 'Sold'} ~${outLabel}</span><br/><a href="https://solscan.io/tx/${signature}" target="_blank" style="color:#3b82f6;font-size:10px">${signature.slice(0, 16)}...</a>`;

                // Refresh price
                setTimeout(() => {
                    fetch('/api/swap?mint=' + tokenAddr)
                        .then(r => r.json())
                        .then(d => { if (d.price) { currentPrice = d.price; updateEstimate(); } })
                        .catch(() => { });
                }, 3000);
            } catch (err: any) {
                if (err.message?.includes('User rejected')) {
                    statusEl.innerHTML = '<span style="color:#94a3b8">Transaction cancelled</span>';
                } else {
                    statusEl.innerHTML = `<span style="color:#ef4444">❌ ${err.message || 'Failed'}</span>`;
                }
            } finally {
                execBtn.disabled = false;
            }
        });
    }
}

export function TokenCard({ token, idx, onFly }: { token: any; idx: number; onFly: (t: any) => void }) {
    const keywords = (token.matchedKeywords || []).slice(0, 4);
    const pfUrl = token.url || `https://pump.fun/coin/${token.mint || ''}`;
    const imgSrc = token.imageUrl ? proxyImg(token.imageUrl) : '';
    const handleClick = (e: any) => {
        if ((e.target as HTMLElement).closest('.token-card__link')) return;
        onFly(token);
    };
    return (
        <div className="token-card" onClick={handleClick}>
            <div className="token-card__header">
                {imgSrc
                    ? <img className="token-card__thumb" src={imgSrc} onError={(e: any) => e.currentTarget.style.display = 'none'} />
                    : <div className="token-card__icon">💰</div>}
                <div className="token-card__info">
                    <div className="token-card__symbol">{(token.symbol || '???').slice(0, 12)}</div>
                    <div className="token-card__name">{(token.name || 'Unknown').slice(0, 30)}</div>
                </div>
                <a href={pfUrl} target="_blank" rel="noopener" className="token-card__link" title="Open on DexScreener">↗</a>
            </div>
            <div className="token-card__meta">
                {token.country && <span className="token-card__country">📍 {token.country}</span>}
                {token.boostAmount && <span className="token-card__boost">🚀 {token.boostAmount} SOL</span>}
            </div>
            {keywords.length > 0 && <div className="token-card__keywords">
                {keywords.map((k: string) => <span className="token-card__keyword">{k}</span>)}
            </div>}
        </div>
    );
}

export function renderTokensFeed() {
    const container = document.getElementById('tokens-feed');
    const countEl = document.getElementById('tokens-count');
    if (!container) return;
    if (countEl) countEl.textContent = String(pumpfunTokens.length);

    const flyToToken = (token: any) => {
        openTokenDetailModal(token);
    };

    if (pumpfunTokens.length === 0) {
        render(<div className="loading-state"><span>No conflict tokens found</span></div>, container);
        return;
    }

    render(
        <>{pumpfunTokens.map((token: any, i: number) => <TokenCard token={token} idx={i} onFly={flyToToken} />)}</>,
        container
    );
}
