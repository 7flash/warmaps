/**
 * feeds.tsx — Feed rendering (news, GDELT, fires, markets, telegram, radar, ticker, stats)
 */

import { render } from 'melina/client';
import { map, newsItems, gdeltEvents, firePoints, marketData, threatAlerts, webcamData, flightData, getFreshnessLabel } from './state';
import { formatTime, formatVolume, getCategoryIcon, proxyImg, decodeEntities } from './utils';
import { updatePerfDisplay } from './perf';
import { openArticleModal } from './modals';
import { openMarketModal } from './betting';

// ─── News Feed ──────────────────────────────────────────────

export function renderNewsFeed() {
    const container = document.getElementById('news-feed');
    if (!container) return;

    const feedEvents = gdeltEvents
        .filter((ev: any) => ev.imageUrl && ev.lat && (ev.lon || ev.lng))
        .slice(0, 40);

    if (feedEvents.length === 0 && newsItems.length === 0) {
        render(<div className="loading-state"><span className="spinner"></span><span>Establishing secure feed...</span></div>, container);
        return;
    }

    if (feedEvents.length === 0) {
        render(
            <>{newsItems.slice(0, 15).map((item: any) =>
                <div className="pulse-card">
                    <div className="pulse-card__title">{item.title}</div>
                    <div className="pulse-card__meta">{item.source || ''} · {formatTime(item.pubDate)}</div>
                </div>
            )}</>,
            container
        );
        return;
    }

    const flyToEv = (lat: number, lon: number) => {
        if (!map || isNaN(lat) || isNaN(lon)) return;
        map.flyTo({ center: [lon, lat], zoom: 6, speed: 1.5, curve: 1.2 });
    };

    const cards = feedEvents.map((ev: any, idx: number) => {
        const lat = ev.lat;
        const lon = ev.lon || ev.lng;
        const source = ev.source || ev.domain || '';
        const time = ev.date ? formatTime(ev.date) : '';
        const title = (ev.title || '').slice(0, 80);
        const imgUrl = proxyImg(ev.imageUrl);
        return (
            <div className="pulse-card" data-tone={String(ev.tone || 0)} data-themes={(ev.themes || []).join(',').toLowerCase()} data-date={ev.date || ''} onClick={() => { flyToEv(lat, lon); openArticleModal(ev); }}>
                <img className="pulse-card__img" src={imgUrl} onError={(e: any) => e.currentTarget.style.display = 'none'} alt="" loading="lazy" />
                <div className="pulse-card__body">
                    <div className="pulse-card__title">{title}</div>
                    <div className="pulse-card__meta">{source} · {time}</div>
                </div>
            </div>
        );
    });

    render(<>{cards}</>, container);

    // Wire up search bar
    const searchInput = document.getElementById('pulse-search-input') as HTMLInputElement;
    if (searchInput) {
        const existingQuery = searchInput.value.toLowerCase().trim();
        if (existingQuery) {
            container.querySelectorAll('.pulse-card').forEach((card: any) => {
                card.style.display = (card.textContent || '').toLowerCase().includes(existingQuery) ? '' : 'none';
            });
        }
        searchInput.oninput = () => {
            const q = searchInput.value.toLowerCase().trim();
            container.querySelectorAll('.pulse-card').forEach((card: any) => {
                card.style.display = !q || (card.textContent || '').toLowerCase().includes(q) ? '' : 'none';
            });
        };
    }

    // Wire up filter pills
    const filterBtns = document.querySelectorAll('#feed-filters .pf-pill');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFeedFilter((btn as HTMLElement).dataset.filter || 'all');
        });
    });

    const activeFilter = document.querySelector('#feed-filters .pf-pill.active') as HTMLElement;
    if (activeFilter && activeFilter.dataset.filter !== 'all') {
        applyFeedFilter(activeFilter.dataset.filter || 'all');
    }
}

export function applyFeedFilter(filter: string) {
    const container = document.getElementById('news-feed');
    if (!container) return;

    const ESCALATION_THEMES = ['kill', 'terror', 'armedconflict', 'wound', 'wmd'];
    const now = Date.now();
    const DAY_MS = 86400_000;

    container.querySelectorAll('.pulse-card').forEach((card: any) => {
        if (filter === 'all') { card.style.display = ''; return; }
        const tone = parseFloat(card.dataset.tone || '0');
        const themes = (card.dataset.themes || '').toLowerCase();
        const date = card.dataset.date || '';
        let show = true;

        if (filter === 'intense') show = tone < -3;
        else if (filter === 'recent') {
            if (date) { const t = new Date(date).getTime(); show = !isNaN(t) && (now - t) < DAY_MS; }
        } else if (filter === 'escalation') show = ESCALATION_THEMES.some(t => themes.includes(t));

        card.style.display = show ? '' : 'none';
    });
}

export function renderGdeltFeed() { renderNewsFeed(); }

// ─── Fires Feed ─────────────────────────────────────────────

export function renderFiresFeed() {
    const container = document.getElementById('firms-feed');
    if (!container) return;

    if (firePoints.length === 0) {
        render(<div className="loading-state"><span>No thermal anomalies</span></div>, container);
        return;
    }

    render(
        <>{firePoints.slice(0, 10).map((fire: any) =>
            <div className="feed-item feed-item--fire">
                <div className="feed-item-source firms">🔥 THERMAL ANOMALY</div>
                <div className="feed-item-title">{fire.country || 'Unknown Region'} — {fire.lat.toFixed(2)}°, {fire.lon.toFixed(2)}°</div>
                <div className="feed-item-meta">
                    <span className="feed-item-time">{fire.acq_date} {fire.acq_time}</span>
                    <span>Brightness: {fire.brightness.toFixed(0)}K</span>
                    <span>Confidence: {fire.confidence}</span>
                </div>
            </div>
        )}</>,
        container
    );
}

// ─── Market Cards ───────────────────────────────────────────

export function renderMarketCards(markets: any[]) {
    return markets.map((market: any) => {
        const probClass = market.probability >= 70 ? 'prob--hot' : market.probability >= 50 ? 'prob--warm' : 'prob--cool';
        const catIcon = getCategoryIcon(market.category);
        const velocity = market.velocityPct ? (market.velocityPct > 0 ? `▲${market.velocityPct.toFixed(1)}%` : `▼${Math.abs(market.velocityPct).toFixed(1)}%`) : '';
        const velocityClass = market.velocityPct > 5 ? 'velocity--up' : market.velocityPct < -5 ? 'velocity--down' : '';
        return (
            <div className="radar-market" onClick={() => openMarketModal(market)}>
                <div className="radar-market-header">
                    <span className="radar-market-cat">{catIcon} {market.category.toUpperCase()}</span>
                    <span className="radar-market-platform">WM</span>
                </div>
                <div className="radar-market-title">{market.title}</div>
                <div className="radar-market-stats">
                    <span className={`radar-market-prob ${probClass}`}>{market.probability}%</span>
                    {velocity && <span className={`radar-market-velocity ${velocityClass}`}>{velocity}</span>}
                    <span className="radar-market-vol">${formatVolume(market.volume)}</span>
                    {market.region && <span className="radar-market-region">📍 {market.region}</span>}
                </div>
                <div className="radar-market-bar">
                    <div className={`radar-market-bar-fill ${probClass}`} style={{ width: `${market.probability}%` }}></div>
                </div>
                <div className="radar-market-actions">
                    <button className="market-bet-btn market-bet-btn--yes" onClick={(e: any) => { e.stopPropagation(); openMarketModal(market); }}>YES {market.probability}%</button>
                    <button className="market-bet-btn market-bet-btn--no" onClick={(e: any) => { e.stopPropagation(); openMarketModal(market); }}>NO {100 - market.probability}%</button>
                </div>
            </div>
        );
    });
}

// ─── Telegram Feed ──────────────────────────────────────────

export function renderTelegramFeed(alerts: any[]) {
    const container = document.getElementById('tg-feed');
    if (!container) return;
    render(
        <>{alerts.slice(0, 15).map((alert: any) => {
            const tgUrl = `https://t.me/${alert.channel}`;
            const time = formatTime(new Date(alert.date * 1000).toISOString());
            const loc = alert.location ? `📍 ${alert.location.name}` : '';
            return (
                <div className="feed-item feed-item--telegram" onClick={() => window.open(tgUrl, '_blank')} style={{ cursor: 'pointer' }}>
                    <div className="feed-item-source telegram">📡 {alert.channelTitle}</div>
                    <div className="feed-item-title">{alert.text.slice(0, 200)}</div>
                    <div className="feed-item-meta">
                        <span className="feed-item-time">{time}</span>
                        {loc && <span>{loc}</span>}
                        {alert.threatLevel && alert.threatLevel !== 'low' && <span className={`tg-threat tg-threat--${alert.threatLevel}`}>{alert.threatLevel.toUpperCase()}</span>}
                    </div>
                </div>
            );
        })}</>,
        container
    );
}

// ─── Threat Radar ───────────────────────────────────────────

export function renderRadarFeed() {
    const container = document.getElementById('radar-feed');
    if (!container) return;

    if (marketData.length === 0 && threatAlerts.length === 0) {
        render(<div className="loading-state"><span>No prediction market data available</span></div>, container);
        return;
    }

    render(
        <>
            {threatAlerts.slice(0, 5).map((alert: any) => {
                const levelClass = `radar-alert--${alert.level}`;
                const icon = alert.level === 'critical' ? '🚨' : alert.level === 'high' ? '⚠️' : '📊';
                return (
                    <div className={`radar-alert ${levelClass}`}>
                        <div className="radar-alert-header">
                            <span className="radar-alert-icon">{icon}</span>
                            <span className="radar-alert-level">{alert.level.toUpperCase()}</span>
                            <span className="radar-alert-time">{formatTime(alert.timestamp || alert.created_at || '')}</span>
                        </div>
                        <div className="radar-alert-title">{alert.title.replace(/^[🚨⚠📊️\s]+/, '')}</div>
                        <div className="radar-alert-desc">{alert.description}</div>
                    </div>
                );
            })}
            {renderMarketCards(marketData.slice(0, 8))}
        </>,
        container
    );

    const marketsContainer = document.getElementById('markets-feed');
    const marketsCount = document.getElementById('markets-alert-count');
    if (marketsContainer) {
        if (marketData.length === 0) {
            render(<div className="loading-state"><span>No prediction market data available</span></div>, marketsContainer);
        } else {
            const activeFilter = document.querySelector('#market-filters .pf-pill.active')?.getAttribute('data-market-cat') || 'all';
            const filtered = activeFilter === 'all' ? marketData : marketData.filter(m => m.category === activeFilter);
            render(<>{renderMarketCards(filtered)}</>, marketsContainer);
        }
        if (marketsCount) marketsCount.textContent = String(marketData.length);
    }
}

// ─── Threat Banner ──────────────────────────────────────────

export function showThreatBanner(alert: any) {
    const banner = document.getElementById('threat-banner');
    const content = document.getElementById('threat-banner-content');
    if (!banner || !content) return;
    render(
        <>
            <div className="threat-banner-title">{alert.title}</div>
            <div className="threat-banner-desc">{alert.description}</div>
        </>,
        content
    );
    banner.style.display = 'flex';
    setTimeout(() => { banner.style.display = 'none'; }, 15000);
}

// ─── Ticker ─────────────────────────────────────────────────

export function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;
    const headlines = [
        ...threatAlerts.filter((a: any) => a.level === 'critical' || a.level === 'high').slice(0, 3).map((a: any) => `[THREAT RADAR] ${a.title}`),
        ...newsItems.slice(0, 6).map(n => `[${(n.source || 'NEWS').toUpperCase()}] ${n.title}`),
        ...marketData.filter((m: any) => m.probability >= 60).slice(0, 3).map((m: any) => `[MARKET] ${m.title} — ${m.probability}%`),
        ...gdeltEvents.slice(0, 3).map(e => `[GDELT] ${e.title}`),
    ];
    if (headlines.length === 0) { el.textContent = 'Monitoring global conflict feeds...'; return; }
    const text = decodeEntities(headlines.join('    ◆    '));
    el.textContent = text + '    ◆    ' + text;
}

// ─── Stats ──────────────────────────────────────────────────

export function updateStats() {
    const evtEl = document.getElementById('event-count');
    const fireEl = document.getElementById('fire-count');
    const flightEl = document.getElementById('flight-count');
    const webcamEl = document.getElementById('webcam-count');
    if (evtEl) evtEl.textContent = String(gdeltEvents.length);
    if (fireEl) fireEl.textContent = String(firePoints.length);
    if (flightEl) flightEl.textContent = String(flightData.length);
    if (webcamEl) webcamEl.textContent = String(webcamData.length);

    const freshnessEl = document.getElementById('data-freshness');
    if (freshnessEl) {
        const sources = ['gdelt', 'fires', 'flights', 'news'];
        render(
            <>{sources.map((s, i) => {
                const label = getFreshnessLabel(s);
                const color = label === '—' ? 'var(--text-muted)' : (parseInt(label) > 5 && label.endsWith('m') ? 'var(--amber)' : 'var(--accent)');
                return <>{i > 0 && ' · '}<span style={{ color }}>{s.toUpperCase()}: {label}</span></>;
            })}</>,
            freshnessEl
        );
    }
    updatePerfDisplay();
}
