/**
 * tokens.tsx — Pump.fun conflict token markers & feed
 */

import { render } from 'melina/client';
import maplibregl from 'maplibre-gl';
import { map, pumpfunTokens, gdeltEvents, TOKEN_MARKERS } from './state';
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
