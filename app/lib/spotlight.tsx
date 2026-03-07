/**
 * spotlight.ts — Conflict spotlight, radar pings, data flash animations
 */

import { render } from 'melina/client';
import { map, gdeltEvents, IMAGE_MARKERS, telegramAlerts } from './state';

function isValidCoord(lat: number, lon: number): boolean {
    return typeof lat === 'number' && typeof lon === 'number' &&
        !isNaN(lat) && !isNaN(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

let spotlightActive = true;
let spotlightPaused = false;
let spotlightVisited = new Set<string>();
let activeTooltipEl: HTMLElement | null = null;
let spotlightTimer: any = null;

export function startConflictSpotlight() {
    // Add pause/play button to header
    const headerRight = document.querySelector('.header__right');
    if (headerRight) {
        const btn = document.createElement('button');
        btn.id = 'spotlight-toggle';
        btn.className = 'header-btn';
        btn.title = 'Toggle auto-camera';
        render(<span>⏸</span>, btn);
        btn.addEventListener('click', () => {
            spotlightPaused = !spotlightPaused;
            render(<span>{spotlightPaused ? '▶' : '⏸'} </span>, btn);
            btn.title = spotlightPaused ? 'Resume auto-camera' : 'Pause auto-camera';
            if (spotlightPaused) {
                clearActiveTooltip();
            }
        });
        headerRight.insertBefore(btn, headerRight.firstChild);
    }

    // Start cycling after 15s initial delay
    setTimeout(() => {
        cycleSpotlight();
        spotlightTimer = setInterval(cycleSpotlight, 20_000);
    }, 15_000);

    // Pause on user map interaction, resume after 30s idle
    const mapEl = document.getElementById('map-container');
    if (mapEl) {
        let resumeTimer: any;
        const pauseFromInteraction = () => {
            if (spotlightPaused) return;
            spotlightActive = false;
            clearActiveTooltip();
            clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => { spotlightActive = true; }, 30_000);
        };
        mapEl.addEventListener('mousedown', pauseFromInteraction);
        mapEl.addEventListener('wheel', pauseFromInteraction);
        mapEl.addEventListener('touchstart', pauseFromInteraction);
    }
}

function clearActiveTooltip() {
    if (activeTooltipEl) {
        activeTooltipEl.classList.remove('map-image-marker--active');
        activeTooltipEl = null;
    }
}

function cycleSpotlight() {
    if (!map || !spotlightActive || spotlightPaused) return;

    // Alternate between Telegram OSINT (priority) and GDELT events
    // Telegram alerts with locations + critical/high threat get priority
    const tgCandidates = telegramAlerts.filter((a: any) => {
        if (!a.location?.lat || !a.location?.lon) return false;
        if (!isValidCoord(a.location.lat, a.location.lon)) return false;
        const eid = `tg-${a.id}`;
        return !spotlightVisited.has(eid);
    }).sort((a: any, b: any) => {
        // Critical > high > medium > low
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.threatLevel] ?? 3) - (order[b.threatLevel] ?? 3);
    });

    const gdeltCandidates = gdeltEvents.filter((ev: any) => {
        if (!ev.imageUrl || !ev.lat) return false;
        const lon = ev.lon || ev.lng;
        if (!lon) return false;
        if (!isValidCoord(ev.lat, lon)) return false;
        const eid = ev.id || ev.url || `${ev.lat}-${lon}`;
        return !spotlightVisited.has(eid);
    });

    // Prioritize Telegram OSINT 60% of the time if available
    const useTelegram = tgCandidates.length > 0 && (gdeltCandidates.length === 0 || Math.random() < 0.6);

    if (useTelegram) {
        const alert = tgCandidates[0];
        const eid = `tg-${alert.id}`;
        spotlightVisited.add(eid);
        clearActiveTooltip();

        map.flyTo({
            center: [alert.location.lon, alert.location.lat],
            zoom: 7,
            duration: 3000,
            essential: false,
        });

        const prefix = alert.threatLevel === 'critical' ? '🚨' : alert.threatLevel === 'high' ? '⚠️' : '📡';
        const equip = alert.equipmentType ? ` [${alert.equipmentType.toUpperCase()}]` : '';
        showDataFlash(`${prefix} ${alert.channelTitle}: ${alert.text.slice(0, 60)}${equip}`);
        return;
    }

    if (gdeltCandidates.length === 0) {
        spotlightVisited.clear();
        return;
    }

    const ev = gdeltCandidates[0];
    const lon = ev.lon || ev.lng;
    const eid = ev.id || ev.url || `${ev.lat}-${lon}`;
    spotlightVisited.add(eid);

    clearActiveTooltip();

    map.flyTo({
        center: [lon, ev.lat],
        zoom: 6,
        duration: 3000,
        essential: false,
    });

    const source = ev.source || ev.domain || '';
    const title = (ev.title || '').slice(0, 50);
    showDataFlash(`🎯 ${source ? source.toUpperCase() + ': ' : ''}${title}`);

    setTimeout(() => {
        const markerData = IMAGE_MARKERS.get(eid);
        if (markerData?.el) {
            markerData.el.classList.add('map-image-marker--active');
            activeTooltipEl = markerData.el;

            setTimeout(() => {
                if (activeTooltipEl === markerData.el) {
                    clearActiveTooltip();
                }
            }, 12_000);
        }

        const nearby = gdeltEvents.filter((e: any) => {
            const eLat = e.lat;
            const eLng = e.lng || e.lon;
            if (!eLat || !eLng) return false;
            return Math.abs(eLat - ev.lat) < 5 && Math.abs(eLng - lon) < 5;
        });
        if (nearby.length > 0) {
            spawnRadarPings(nearby.slice(0, 6));
        }
    }, 3500);
}

// ─── Live Animation: Radar Pings ────────────────────────────

export function spawnRadarPings(events: any[], color = '') {
    if (!map) return;
    const mapContainer = document.querySelector('.maplibregl-canvas-container') || document.getElementById('map-container');
    if (!mapContainer) return;

    const subset = events.sort(() => Math.random() - 0.5).slice(0, 8);
    for (const evt of subset) {
        const lat = evt.lat || evt.latitude;
        const lng = evt.lng || evt.longitude || evt.lon;
        if (!lat || !lng) continue;
        if (!isValidCoord(lat, lng)) continue;

        try {
            const point = map.project([lng, lat]);
            const ping = document.createElement('div');
            ping.className = `radar-ping ${color}`;
            ping.style.left = `${point.x}px`;
            ping.style.top = `${point.y}px`;
            mapContainer.appendChild(ping);
            setTimeout(() => ping.remove(), 2500);
        } catch (_) { /* point outside viewport */ }
    }
}

export function showDataFlash(message: string) {
    const flash = document.createElement('div');
    flash.className = 'data-flash';
    flash.textContent = message;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 3500);
}
