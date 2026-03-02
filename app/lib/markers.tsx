/**
 * markers.tsx — Real-time image marker system
 * 
 * Handles the staggered appearance of GDELT news images on the map
 * with rank-based opacity fading.
 */

import { render } from 'melina/client';
import maplibregl from 'maplibre-gl';
import {
    map, IMAGE_MARKERS, IMAGE_MARKER_ORDER, eventArrivalTime,
    eventQueue, queueDrainTimer, setQueueDrainTimer,
    MAX_VISIBLE_IMAGES, FADE_PER_RANK, IMAGE_APPEAR_INTERVAL,
    dataPaused,
} from './state';
import { ImgWithFallback, formatTime } from './utils';
import { openArticleModal } from './modals';

/** Queue new events that we haven't seen before for staggered appearance */
export function queueNewEvents(events: any[]) {
    const eventsWithImages = events.filter(e => {
        if (!e.lat || !e.lon || !e.imageUrl) return false;
        return e.lat >= -90 && e.lat <= 90 && e.lon >= -180 && e.lon <= 180;
    });
    for (const ev of eventsWithImages) {
        const eid = ev.id || ev.url || `${ev.lat}-${ev.lon}`;
        if (!eventArrivalTime.has(eid) && !IMAGE_MARKERS.has(eid)) {
            if (!eventQueue.some(q => (q.id || q.url || `${q.lat}-${q.lon}`) === eid)) {
                eventQueue.push(ev);
            }
        }
    }

    if (!queueDrainTimer && eventQueue.length > 0) {
        drainOneEvent();
        setQueueDrainTimer(setInterval(drainOneEvent, IMAGE_APPEAR_INTERVAL));
    }
}

/** Place one event from the queue onto the map as a floating image */
export function drainOneEvent() {
    if (!map || dataPaused) return;

    const ev = eventQueue.shift();
    if (!ev) {
        if (queueDrainTimer) {
            clearInterval(queueDrainTimer);
            setQueueDrainTimer(null);
        }
        return;
    }

    const eid = ev.id || ev.url || `${ev.lat}-${ev.lon}`;
    spawnImageMarker(ev, eid);
}

/** Create a floating image marker and recompute all opacities by rank */
export function spawnImageMarker(ev: any, eid: string) {
    if (!map || !ev.imageUrl) return;

    const lat = ev.lat;
    const lon = ev.lon || ev.lng;
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        isNaN(lat) || isNaN(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return;
    }

    const arrivedAt = Date.now();
    eventArrivalTime.set(eid, arrivedAt);

    // Simple geo-jitter to prevent exact overlaps
    let finalLon = lon;
    let finalLat = lat;
    const GEO_MIN_DIST = 0.3;

    for (let attempt = 0; attempt < 4; attempt++) {
        let tooClose = false;
        for (const [, data] of IMAGE_MARKERS) {
            const other = data.marker.getLngLat();
            if (Math.abs(finalLat - other.lat) < GEO_MIN_DIST && Math.abs(finalLon - other.lng) < GEO_MIN_DIST) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) break;
        finalLon = lon + (Math.random() - 0.5) * GEO_MIN_DIST * 2;
        finalLat = lat + (Math.random() - 0.5) * GEO_MIN_DIST * 2;
        finalLat = Math.max(-80, Math.min(80, finalLat));
    }

    const el = document.createElement('div');
    el.className = 'map-image-marker';
    const title = (ev.title || '').slice(0, 60);
    const source = ev.source || ev.domain || '';
    const time = ev.date ? formatTime(ev.date) : 'LIVE';
    render(
        <>
            <ImgWithFallback url={ev.imageUrl} fallbackText={ev.source || ev.title || ''} />
            <div className="map-image-marker__time">{time}</div>
            <div className="map-image-marker__tooltip">
                <div className="map-image-marker__tooltip-title">{title}</div>
                <div className="map-image-marker__tooltip-meta">{source}{time ? ` · ${time}` : ''}</div>
            </div>
        </>,
        el
    );

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([finalLon, finalLat])
        .addTo(map);

    // Click to open article modal + fly to location
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        map?.flyTo({ center: [lon, lat], zoom: 6, speed: 1.5, curve: 1.2 });
        openArticleModal(ev);
    });

    IMAGE_MARKERS.set(eid, { marker, el, ev });
    IMAGE_MARKER_ORDER.push(eid);

    requestAnimationFrame(() => {
        el.classList.add('map-image-marker--visible');
    });

    updateImageMarkerRanks();
}

/**
 * Rank-based opacity: newest image = 1.0, each older image loses FADE_PER_RANK.
 * When an image's opacity hits 0, remove it from the map.
 */
export function updateImageMarkerRanks() {
    const total = IMAGE_MARKER_ORDER.length;

    for (let i = total - 1; i >= 0; i--) {
        const eid = IMAGE_MARKER_ORDER[i];
        const data = IMAGE_MARKERS.get(eid);
        if (!data) continue;

        const rank = total - 1 - i;
        const opacity = Math.max(0, 1.0 - rank * FADE_PER_RANK);
        const scale = 0.7 + 0.3 * opacity;

        data.el.style.opacity = String(opacity);
        data.el.style.scale = String(scale);

        if (opacity <= 0 || rank >= MAX_VISIBLE_IMAGES) {
            data.marker.remove();
            IMAGE_MARKERS.delete(eid);
            IMAGE_MARKER_ORDER.splice(i, 1);
            eventArrivalTime.delete(eid);
        }
    }
}
