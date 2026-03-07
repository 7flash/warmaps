/**
 * alerts.ts — Event Alert System
 * 
 * Monitors incoming events and fires browser notifications
 * for high-severity activity. Users can define watch regions.
 * 
 * Watch regions are stored in localStorage.
 */

import { gdeltEvents, acledEvents, firePoints, timelineHours } from './state';
import { haversine } from './utils';

// ─── Types ──────────────────────────────────────────────────

interface WatchRegion {
    id: string;
    name: string;
    lat: number;
    lon: number;
    radiusKm: number;
    enabled: boolean;
}

interface FiredAlert {
    id: string;
    timestamp: number;
}

// ─── State ──────────────────────────────────────────────────

const STORAGE_KEY = 'warmaps_watch_regions';
const FIRED_KEY = 'warmaps_fired_alerts';
const COOLDOWN_MS = 300_000; // 5 min cooldown per alert
let notificationsEnabled = false;
let watchRegions: WatchRegion[] = [];
let firedAlerts: FiredAlert[] = [];


// ─── Persistence ────────────────────────────────────────────

function loadWatchRegions(): WatchRegion[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : getDefaultRegions();
    } catch { return getDefaultRegions(); }
}

function saveWatchRegions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchRegions));
}

function loadFiredAlerts(): FiredAlert[] {
    try {
        const raw = localStorage.getItem(FIRED_KEY);
        const alerts: FiredAlert[] = raw ? JSON.parse(raw) : [];
        // Prune old alerts (older than 1 hour)
        const cutoff = Date.now() - 3600_000;
        return alerts.filter(a => a.timestamp > cutoff);
    } catch { return []; }
}

function saveFiredAlerts() {
    localStorage.setItem(FIRED_KEY, JSON.stringify(firedAlerts));
}

function getDefaultRegions(): WatchRegion[] {
    return [
        { id: 'middle-east', name: 'Middle East', lat: 33, lon: 44, radiusKm: 1500, enabled: true },
        { id: 'ukraine', name: 'Ukraine', lat: 49, lon: 32, radiusKm: 800, enabled: true },
        { id: 'east-africa', name: 'East Africa', lat: 5, lon: 38, radiusKm: 1200, enabled: false },
    ];
}

// ─── Alert Check ────────────────────────────────────────────

function wasAlertFired(alertId: string): boolean {
    return firedAlerts.some(a => a.id === alertId && (Date.now() - a.timestamp) < COOLDOWN_MS);
}

function markAlertFired(alertId: string) {
    firedAlerts.push({ id: alertId, timestamp: Date.now() });
    saveFiredAlerts();
}

export function checkAlerts() {
    if (!notificationsEnabled) return;

    const activeRegions = watchRegions.filter(r => r.enabled);
    if (activeRegions.length === 0) return;

    // Check ACLED events
    if (acledEvents?.features) {
        for (const f of acledEvents.features) {
            const p = f.properties;
            if (!p || (p.fatalities || 0) < 1) continue; // Only alert on fatalities

            const [lon, lat] = f.geometry.coordinates;
            for (const region of activeRegions) {
                const dist = haversine(region.lat, region.lon, lat, lon);
                if (dist < region.radiusKm) {
                    const alertId = `acled-${p.location}-${p.sub_type}`;
                    if (!wasAlertFired(alertId)) {
                        fireNotification(
                            `💥 ${p.sub_type || 'Strike'} — ${region.name}`,
                            `${p.actor1} vs ${p.actor2}\n${p.location} · ${p.fatalities} fatalities`,
                            alertId
                        );
                    }
                }
            }
        }
    }

    // Check GDELT for high-tone events (very negative = conflict)
    for (const ev of gdeltEvents) {
        if (!ev.lat || !ev.lon) continue;
        const tone = ev.tone || ev.avgTone || 0;
        if (tone > -5) continue; // Only very negative

        for (const region of activeRegions) {
            const dist = haversine(region.lat, region.lon, ev.lat, ev.lon || ev.lng);
            if (dist < region.radiusKm) {
                const alertId = `gdelt-${(ev.title || '').slice(0, 30)}`;
                if (!wasAlertFired(alertId)) {
                    fireNotification(
                        `📡 High-severity event — ${region.name}`,
                        (ev.title || 'Unknown event').slice(0, 100),
                        alertId
                    );
                }
            }
        }
    }
}

function fireNotification(title: string, body: string, alertId: string) {
    markAlertFired(alertId);

    if (Notification.permission === 'granted') {
        const n = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: alertId,
            silent: false,
        });
        n.onclick = () => { window.focus(); n.close(); };
        // Auto-close after 10s
        setTimeout(() => n.close(), 10_000);
    }

    // Also show in-app toast
    showAlertToast(title, body);
}

// ─── In-App Toast ───────────────────────────────────────────

function showAlertToast(title: string, body: string) {
    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
        <div class="alert-toast-title">${title}</div>
        <div class="alert-toast-body">${body}</div>
    `;
    toast.onclick = () => toast.remove();
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto-remove after 8s
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 8000);
}

// ─── Init ───────────────────────────────────────────────────

export function initAlerts() {
    watchRegions = loadWatchRegions();
    firedAlerts = loadFiredAlerts();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        // Don't request immediately — wait for user interaction
    }

    // Enable if already granted
    if ('Notification' in window && Notification.permission === 'granted') {
        notificationsEnabled = true;
    }

    // Build alert button in map stats
    const mapStats = document.getElementById('map-stats');
    if (mapStats) {
        const btn = document.createElement('button');
        btn.id = 'alert-toggle-btn';
        btn.className = 'alert-toggle-btn';
        btn.title = 'Toggle event alerts';
        btn.textContent = notificationsEnabled ? '🔔' : '🔕';
        btn.addEventListener('click', async () => {
            if (!notificationsEnabled) {
                if ('Notification' in window) {
                    const perm = await Notification.requestPermission();
                    if (perm === 'granted') {
                        notificationsEnabled = true;
                        btn.textContent = '🔔';
                        showAlertToast('🔔 Alerts enabled', `Monitoring ${watchRegions.filter(r => r.enabled).length} watch regions`);
                    }
                }
            } else {
                notificationsEnabled = false;
                btn.textContent = '🔕';
            }
        });
        mapStats.appendChild(btn);
    }

    // Check alerts every 30s
    setInterval(checkAlerts, 30_000);
}

// ─── Public API ─────────────────────────────────────────────

export function getWatchRegions(): WatchRegion[] { return watchRegions; }

export function addWatchRegion(name: string, lat: number, lon: number, radiusKm: number = 500) {
    const region: WatchRegion = {
        id: `custom-${Date.now()}`,
        name,
        lat,
        lon,
        radiusKm,
        enabled: true,
    };
    watchRegions.push(region);
    saveWatchRegions();
    return region;
}

export function removeWatchRegion(id: string) {
    watchRegions = watchRegions.filter(r => r.id !== id);
    saveWatchRegions();
}

export function toggleWatchRegion(id: string) {
    const r = watchRegions.find(r => r.id === id);
    if (r) { r.enabled = !r.enabled; saveWatchRegions(); }
}
