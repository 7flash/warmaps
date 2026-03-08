// app/lib/pin-stats.ts
// Renders the Pin Statistics Dashboard with metrics, charts, export, and a density heatmap.

import maplibregl from 'maplibre-gl';
import type { GeoPin } from './geo-pins';

export async function showPinStatsDashboard(mapRef: any) {
    const existing = document.getElementById('wm-pin-stats-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wm-pin-stats-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(8, 8, 12, 0.6); backdrop-filter: blur(12px);
        font-family: 'Inter', sans-serif; opacity: 0; transition: opacity 0.2s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(20, 20, 30, 0.85); border: 1px solid rgba(128, 90, 255, 0.3);
        border-radius: 16px; width: 900px; max-width: 95vw; max-height: 90vh;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6); display: flex; flex-direction: column;
        overflow: hidden; backdrop-filter: blur(20px); transform: translateY(15px);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Header
    modal.innerHTML = `
        <div style="padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 18px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px;">
                <span>📊</span> Pin Statistics Dashboard
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <button id="wm-stats-export-btn" class="wm-c-action" style="padding: 6px 14px; font-size: 13px; border-radius: 6px; background: rgba(128,90,255,0.15); border: 1px solid rgba(128,90,255,0.3); color: #fff; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                    📄 Export Report
                </button>
                <button id="wm-stats-close-btn" style="background:none; border:none; color: #666; font-size: 24px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
            </div>
        </div>
        <div id="wm-stats-body" style="padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 24px;">
            <div style="text-align:center; color:#888; padding: 40px 0;">Loading pin data...</div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Initial animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'translateY(0)';
    });

    const close = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'translateY(10px)';
        setTimeout(() => overlay.remove(), 250);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    modal.querySelector('#wm-stats-close-btn')?.addEventListener('click', close);

    // Fetch geo-pins
    try {
        const res = await fetch('/api/geo-pins?limit=5000');
        const data = await res.json();
        const pins: GeoPin[] = data.pins || [];

        renderStatsBody(modal.querySelector('#wm-stats-body') as HTMLElement, pins);

        const exportBtn = modal.querySelector('#wm-stats-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => exportDataCSV(pins));
        }

    } catch (e) {
        const body = modal.querySelector('#wm-stats-body');
        if (body) body.innerHTML = '<div style="color:#ef4444; padding:20px;">Failed to load data.</div>';
    }
}

function renderStatsBody(container: HTMLElement, pins: GeoPin[]) {
    if (!pins.length) {
        container.innerHTML = '<div style="color:#888;">No geo-pins found.</div>';
        return;
    }

    // Calculations
    const totalPins = pins.length;
    const senders = new Set(pins.map(p => p.sender));
    const now = Date.now();
    const pins24h = pins.filter(p => now - p.timestamp < 86400000).length;
    const pins7d = pins.filter(p => now - p.timestamp < 604800000).length;

    // Sender frequency
    const senderCounts: Record<string, number> = {};
    for (const p of pins) senderCounts[p.sender] = (senderCounts[p.sender] || 0) + 1;
    const topSenders = Object.entries(senderCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Categories
    const categories: Record<string, number> = {};
    for (const p of pins) {
        const c = p.category || 'general';
        categories[c] = (categories[c] || 0) + 1;
    }

    container.innerHTML = `
        <!-- Top Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px;">
                <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">TOTAL PINS</div>
                <div style="color: #fff; font-size: 32px; font-weight: 300;">${totalPins}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px;">
                <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">UNIQUE SENDERS</div>
                <div style="color: #a78bfa; font-size: 32px; font-weight: 300;">${senders.size}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px;">
                <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">LAST 24 HOURS</div>
                <div style="color: #22c55e; font-size: 32px; font-weight: 300;">${pins24h}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px;">
                <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">LAST 7 DAYS</div>
                <div style="color: #3b82f6; font-size: 32px; font-weight: 300;">${pins7d}</div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; height: 320px;">
            <!-- Density Heatmap -->
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; position: relative;">
                <div style="position: absolute; top: 12px; left: 16px; z-index: 10; font-size: 11px; font-weight: 600; letter-spacing: 1px; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.8);">📍 PIN DENSITY HEATMAP</div>
                <div id="stats-mini-map" style="width: 100%; height: 100%;"></div>
            </div>

            <!-- Top Senders & Categories -->
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <!-- Top Senders -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; flex: 1;">
                    <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 16px;">TOP SENDERS</div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${topSenders.map(([sender, count]) => {
        const pct = Math.round((count / totalPins) * 100);
        const short = sender.slice(0, 4) + '...' + sender.slice(-4);
        return `
                                <div>
                                    <div style="display: flex; justify-content: space-between; font-family: monospace; font-size: 12px; margin-bottom: 4px; color: #ccc;">
                                        <span>${short}</span><span>${count} (${pct}%)</span>
                                    </div>
                                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                                        <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #3b82f6); border-radius: 3px;"></div>
                                    </div>
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>

                <!-- Categories -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px;">
                    <div style="color: #888; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 12px;">CATEGORIES</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
        // Assign arbitrary colors based on hash length or switch map
        let color = '#94a3b8';
        if (cat === 'intel') color = '#60a5fa';
        if (cat === 'threat') color = '#ef4444';
        if (cat === 'friendly') color = '#4ade80';
        if (cat === 'logistics') color = '#fbbf24';

        return `<div style="font-size: 11px; padding: 4px 10px; border-radius: 12px; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">
                                ${cat.toUpperCase()} (${count})
                            </div>`;
    }).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize MapLibre Mini Heatmap
    setTimeout(() => {
        const miniMap = new maplibregl.Map({
            container: 'stats-mini-map',
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: [0, 20],
            zoom: 1,
            attributionControl: false,
            interactive: false,
        });

        miniMap.on('load', () => {
            const geojson = {
                type: 'FeatureCollection',
                features: pins.map(p => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
                }))
            };

            miniMap.addSource('pin-stats', {
                type: 'geojson',
                data: geojson as any
            });

            miniMap.addLayer({
                id: 'pin-stats-heat',
                type: 'heatmap',
                source: 'pin-stats',
                paint: {
                    'heatmap-weight': 1,
                    // Linear intensity mapped to blue > purple > red
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0, 'rgba(0,0,0,0)',
                        0.2, '#3b82f6',
                        0.5, '#a855f7',
                        1, '#ef4444'
                    ],
                    'heatmap-radius': 12,
                    'heatmap-opacity': 0.8
                }
            });

            // Fit bounds to points
            if (pins.length > 0) {
                const bounds = new maplibregl.LngLatBounds(
                    [pins[0].lng, pins[0].lat],
                    [pins[0].lng, pins[0].lat]
                );
                for (const p of pins) bounds.extend([p.lng, p.lat]);
                miniMap.fitBounds(bounds, { padding: 30, duration: 0 });
            }
        });
    }, 50);
}

function exportDataCSV(pins: GeoPin[]) {
    // Escape quotes and format as CSV
    const rows = [['Date', 'Lat', 'Lng', 'Sender', 'Category', 'Message']];
    for (const p of pins) {
        const msg = p.message.replace(/"/g, '""');
        const dt = new Date(p.timestamp).toISOString();
        const cat = p.category || 'general';
        rows.push([dt, p.lat.toFixed(6), p.lng.toFixed(6), p.sender, cat, `"${msg}"`]);
    }

    const csvContent = rows.map(r => r.join(',')).join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('alert');
    const a = document.createElement('a');
    a.href = url;
    a.download = `warmaps_pin_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
