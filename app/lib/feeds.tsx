/**
 * feeds.tsx — Feed rendering (news, GDELT, fires, markets, telegram, radar, ticker, stats)
 */

import { render } from 'melina/client';
import { map, newsItems, gdeltEvents, firePoints, marketData, threatAlerts, webcamData, flightData, seismicData, getFreshnessLabel, isWithinTimeline, timelineHours } from './state';
import { formatTime, formatVolume, getCategoryIcon, proxyImg, decodeEntities } from './utils';
import { updatePerfDisplay } from './perf';
import { openArticleModal } from './modals';
import { openMarketModal } from './betting';

// ─── News Feed ──────────────────────────────────────────────

export function renderNewsFeed() {
    const containers = Array.from(document.querySelectorAll('.wm-container[data-widget-type="news"]'));
    if (containers.length === 0) return;

    const baseEvents = gdeltEvents
        .filter((ev: any) => ev.imageUrl && ev.lat && (ev.lon || ev.lng))
        .filter((ev: any) => isWithinTimeline(ev.date || ''));

    const flyToEv = (lat: number, lon: number) => {
        if (!map || isNaN(lat) || isNaN(lon)) return;
        map.flyTo({ center: [lon, lat], zoom: 6, speed: 1.5, curve: 1.2 });
    };

    containers.forEach(container => {
        const h = container as HTMLElement;
        const body = (h.querySelector('.pulse-list') || h.querySelector('.wm-container-body')) as HTMLElement;
        if (!body) return;

        const cfgFilter = h.dataset.cfgfilter || 'all';
        const cfgSource = h.dataset.cfgsource || 'all';
        const cfgSearch = (h.dataset.cfgsearch || '').toLowerCase().trim();

        const ESCALATION_THEMES = ['kill', 'terror', 'armedconflict', 'wound', 'wmd'];
        const now = Date.now();
        const DAY_MS = 86400_000;

        let filtered = baseEvents.filter((ev: any) => {
            const tone = parseFloat(ev.tone || '0');
            const themes = (ev.themes || []).join(',').toLowerCase();
            const date = ev.date || '';

            let passFilter = true;
            if (cfgFilter === 'intense') passFilter = tone < -3;
            else if (cfgFilter === 'recent') {
                if (date) { const t = new Date(date).getTime(); passFilter = !isNaN(t) && (now - t) < DAY_MS; }
            } else if (cfgFilter === 'escalation') passFilter = ESCALATION_THEMES.some(t => themes.includes(t));

            let passSource = true;
            if (cfgSource === 'mideast') passSource = (ev.lat > 12 && ev.lat < 42 && ev.lon > 26 && ev.lon < 64);
            else if (cfgSource === 'europe') passSource = (ev.lat > 35 && ev.lat < 70 && ev.lon > -10 && ev.lon < 40);
            else if (cfgSource === 'asia') passSource = (ev.lat > -10 && ev.lat < 55 && ev.lon > 60 && ev.lon < 150);
            else if (cfgSource === 'africa') passSource = (ev.lat > -35 && ev.lat < 35 && ev.lon > -20 && ev.lon < 50);

            let passSearch = true;
            if (cfgSearch) {
                const text = ((ev.title || '') + ' ' + (ev.source || '')).toLowerCase();
                passSearch = text.includes(cfgSearch);
            }

            return passFilter && passSource && passSearch;
        }).slice(0, 40);

        if (filtered.length === 0 && newsItems.length === 0) {
            render(<div className="loading-state"><span className="spinner"></span><span>Establishing secure feed...</span></div>, body);
            return;
        }

        if (filtered.length === 0) {
            render(
                <>{newsItems.slice(0, 15).map((item: any) =>
                    <div className="pulse-card">
                        <div className="pulse-card__title">{item.title}</div>
                        <div className="pulse-card__meta">{item.source || ''} · {formatTime(item.pubDate)}</div>
                    </div>
                )}</>,
                body
            );
            return;
        }

        const cards = filtered.map((ev: any, idx: number) => {
            const lat = ev.lat;
            const lon = ev.lon || ev.lng;
            const source = ev.source || ev.domain || '';
            const time = ev.date ? formatTime(ev.date) : '';
            const title = (ev.title || '').slice(0, 80);
            const imgUrl = proxyImg(ev.imageUrl);
            return (
                <div id={`gdelt-${ev.url ? ev.url.replace(/[^a-zA-Z0-9]/g, '') : idx}`} className="pulse-card" data-tone={String(ev.tone || 0)} data-themes={(ev.themes || []).join(',').toLowerCase()} data-date={ev.date || ''}>
                    <img className="pulse-card__img" onClick={() => { flyToEv(lat, lon); openArticleModal(ev); }} src={imgUrl} onError={(e: any) => e.currentTarget.style.display = 'none'} alt="" loading="lazy" />
                    <div className="pulse-card__body">
                        <div className="pulse-card__title">
                            <span onClick={() => { flyToEv(lat, lon); openArticleModal(ev); }}>{title}</span>
                            <button className="wm-link-handle wm-c-link-handle" style={{ float: 'right', margin: '0 0 4px 4px', fontSize: '12px' }} title="Drag to link">🔗</button>
                        </div>
                        <div className="pulse-card__meta">{source} · {time}</div>
                    </div>
                </div>
            );
        });

        const listContainer = document.createElement('div');
        listContainer.className = 'pulse-list';
        listContainer.style.padding = '10px';
        render(<>{cards}</>, listContainer);

        body.innerHTML = '';
        body.appendChild(listContainer);
    });
}

export function applyFeedFilter(filter: string) {
    // legacy compatibility for unrendered UI buttons
    renderNewsFeed();
}

export function reRenderWidget(typeId: string) {
    if (typeId === 'news') renderNewsFeed();
    if (typeId === 'intel' || typeId === 'markets') renderRadarFeed();
    if (typeId === 'fires') renderFiresFeed();
    if (typeId === 'seismic') renderSeismicFeed();
    // For telegram, we need alerts fetch. We can re-fetch or skip if cached alerts aren't available globally
    if (typeId === 'telegram') window.dispatchEvent(new Event('refresh-telegram'));
}

export function renderGdeltFeed() { renderNewsFeed(); }

// ─── Fires Feed ─────────────────────────────────────────────

export function renderFiresFeed() {
    const containers = document.querySelectorAll('.wm-container[data-widget-type="fires"]');

    containers.forEach((container: Element) => {
        const body = (container.querySelector('.wm-container-body') || container) as HTMLElement;
        if (firePoints.length === 0) {
            render(<div className="loading-state"><span>No thermal anomalies</span></div>, body);
            return;
        }

        render(
            <>{firePoints.slice(0, 15).map((fire: any) =>
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
            body
        );
    });
}

// ─── Seismic Feed ───────────────────────────────────────────

export function renderSeismicFeed() {
    const containers = document.querySelectorAll('.wm-container[data-widget-type="seismic"]');
    const features = seismicData?.features || [];

    containers.forEach((container: Element) => {
        const body = (container.querySelector('.wm-container-body') || container) as HTMLElement;
        if (features.length === 0) {
            render(<div className="loading-state"><span>No seismic events</span></div>, body);
            return;
        }

        render(
            <>{features.slice(0, 15).map((f: any) => {
                const p = f.properties;
                const [lon, lat] = f.geometry.coordinates;
                const mag = p.mag || 0;
                const depth = p.depth || 0;
                const magColor = mag >= 5 ? '#ef4444' : mag >= 4 ? '#f59e0b' : '#22c55e';
                const depthLabel = depth <= 2 ? '⚠️ SHALLOW' : `${depth.toFixed(1)}km`;
                return (
                    <div className="feed-item feed-item--seismic" style={{ cursor: 'default' }}>
                        <div className="feed-item-source" style={{ color: magColor }}>
                            {p.is_kinetic ? '💥 KINETIC SUSPECT' : '🌍 EARTHQUAKE'} — M{mag.toFixed(1)}
                        </div>
                        <div className="feed-item-title">{p.title}</div>
                        <div className="feed-item-meta">
                            <span>Depth: {depthLabel}</span>
                            <span>{lat.toFixed(2)}°, {lon.toFixed(2)}°</span>
                        </div>
                    </div>
                );
            })}</>,
            body
        );
    });
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
    const containers = document.querySelectorAll('.wm-container[data-widget-type="telegram"]');
    if (containers.length === 0) return;

    containers.forEach((container: Element) => {
        const h = container as HTMLElement;
        const body = (h.querySelector('.wm-container-body') || container) as HTMLElement;
        const cfgChannels = h.dataset.cfgchannels || 'all';

        const filtered = alerts.filter((alert: any) => {
            if (cfgChannels === 'all') return true;
            return alert.category === cfgChannels;
        }).slice(0, 20);

        if (filtered.length === 0) {
            render(<div className="loading-state"><span>No messages in this category</span></div>, body);
            return;
        }

        render(
            <>{filtered.map((alert: any) => {
                const tgUrl = `https://t.me/${alert.channel}`;
                const time = formatTime(new Date(alert.date * 1000).toISOString());
                const loc = alert.location ? `📍 ${alert.location.name}` : '';
                return (
                    <div id={alert.id || `tg-${alert.date}`} className="feed-item feed-item--telegram" style={{ cursor: 'pointer' }}>
                        <div className="feed-item-source telegram">
                            <span onClick={() => window.open(tgUrl, '_blank')}>📡 {alert.channelTitle}</span>
                            <button className="wm-link-handle wm-c-link-handle" style={{ float: 'right' }} title="Drag to link">🔗</button>
                        </div>
                        <div className="feed-item-title" onClick={() => window.open(tgUrl, '_blank')}>{alert.text.slice(0, 200)}</div>
                        <div className="feed-item-meta">
                            <span className="feed-item-time">{time}</span>
                            {loc && <span>{loc}</span>}
                            {alert.threatLevel && alert.threatLevel !== 'low' && <span className={`tg-threat tg-threat--${alert.threatLevel}`}>{alert.threatLevel.toUpperCase()}</span>}
                        </div>
                    </div>
                );
            })}</>,
            body
        );
    });
}

// ─── Threat Radar ───────────────────────────────────────────

export function renderRadarFeed() {
    const radarContainers = document.querySelectorAll('.wm-container[data-widget-type="intel"]');
    radarContainers.forEach((container: Element) => {
        const body = (container.querySelector('.wm-container-body') || container) as HTMLElement;
        if (marketData.length === 0 && threatAlerts.length === 0) {
            render(<div className="loading-state"><span>No prediction market data available</span></div>, body);
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
            body
        );
    });

    const marketContainers = document.querySelectorAll('.wm-container[data-widget-type="markets"]');
    marketContainers.forEach((container: Element) => {
        const body = (container.querySelector('.wm-container-body') || container) as HTMLElement;
        const cfgCategory = (container as HTMLElement).dataset.cfgcategory || 'all';

        if (marketData.length === 0) {
            render(<div className="loading-state"><span>No prediction market data available</span></div>, body);
        } else {
            const filtered = cfgCategory === 'all' ? marketData : marketData.filter((m: any) => m.category === cfgCategory);
            render(<>{renderMarketCards(filtered)}</>, body);
        }
    });

    // legacy header count
    const marketsCount = document.getElementById('markets-alert-count');
    if (marketsCount) marketsCount.textContent = String(marketData.length);
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
    const filteredGdelt = timelineHours > 0 ? gdeltEvents.filter(e => isWithinTimeline(e.date || '')) : gdeltEvents;
    const filteredFires = timelineHours > 0 ? firePoints.filter(f => isWithinTimeline(f.acq_date || '')) : firePoints;
    if (evtEl) evtEl.textContent = String(filteredGdelt.length);
    if (fireEl) fireEl.textContent = String(filteredFires.length);
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
