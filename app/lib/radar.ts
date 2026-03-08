import maplibregl from 'maplibre-gl';
import { showToast } from './map-context-menu';

let activeRadarMarker: maplibregl.Marker | null = null;
let radarInterval: number | null = null;

export function startRadarSweep(lat: number, lng: number, map: maplibregl.Map) {
    if (activeRadarMarker) {
        activeRadarMarker.remove();
        if (radarInterval) clearInterval(radarInterval);
    }

    const size = 600; // Large 600px radar

    const el = document.createElement('div');
    el.className = 'wm-radar-container';
    el.style.cssText = `
        width: ${size}px; height: ${size}px;
        position: relative; pointer-events: none;
        border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(128,90,255,0.4), inset 0 0 0 1px rgba(128,90,255,0.2), 0 0 60px rgba(128,90,255,0.1);
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle, rgba(128,90,255,0.05) 0%, rgba(128,90,255,0) 70%);
        backdrop-filter: blur(1px);
        transform-origin: center center;
    `;

    // Crosshairs
    const hLine = document.createElement('div');
    hLine.style.cssText = `position: absolute; width: 100%; height: 1px; background: rgba(128,90,255,0.3);`;
    const vLine = document.createElement('div');
    vLine.style.cssText = `position: absolute; width: 1px; height: 100%; background: rgba(128,90,255,0.3);`;

    // Rings
    const ring1 = document.createElement('div');
    ring1.style.cssText = `position: absolute; width: 33%; height: 33%; border-radius: 50%; border: 1px solid rgba(128,90,255,0.15);`;
    const ring2 = document.createElement('div');
    ring2.style.cssText = `position: absolute; width: 66%; height: 66%; border-radius: 50%; border: 1px solid rgba(128,90,255,0.15);`;

    // Center dot
    const centerDot = document.createElement('div');
    centerDot.style.cssText = `position: absolute; width: 6px; height: 6px; background: #fff; border-radius: 50%; box-shadow: 0 0 10px #8b5cf6, 0 0 20px #8b5cf6;`;

    // Sweeping cone
    const sweeper = document.createElement('div');
    sweeper.style.cssText = `
        position: absolute;
        width: 50%; height: 50%;
        top: 0; right: 0;
        transform-origin: bottom left;
        background: conic-gradient(from 90deg, rgba(128,90,255,0) 0%, rgba(128,90,255,0.05) 75%, rgba(128,90,255,0.8) 100%);
        border-right: 2px solid rgba(167,139,250,0.9);
        animation: wm-radar-spin 3s linear infinite;
        border-top-right-radius: 100%;
        mask-image: radial-gradient(circle at bottom left, black 0%, black 100%);
        -webkit-mask-image: radial-gradient(circle at bottom left, black 0%, black 100%);
    `;

    // CSS Keyframes and cleanup
    const style = document.createElement('style');
    style.id = 'wm-radar-styles';
    style.textContent = `
        @keyframes wm-radar-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @keyframes wm-radar-pulse {
            0% { transform: scale(0); opacity: 1; }
            100% { transform: scale(1); opacity: 0; }
        }
        .wm-radar-blip {
            position: absolute; width: 4px; height: 4px; background: #4ade80; border-radius: 50%;
            box-shadow: 0 0 8px #4ade80; z-index: 10;
            opacity: 0;
        }
    `;
    if (!document.getElementById('wm-radar-styles')) {
        document.head.appendChild(style);
    }

    // Ping animations
    const pulse = document.createElement('div');
    pulse.style.cssText = `
        position: absolute; width: 100%; height: 100%; border-radius: 50%;
        border: 2px solid rgba(128,90,255,0.6); box-shadow: 0 0 20px rgba(128,90,255,0.4);
        animation: wm-radar-pulse 3s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
    `;

    el.appendChild(hLine);
    el.appendChild(vLine);
    el.appendChild(ring1);
    el.appendChild(ring2);
    el.appendChild(centerDot);
    el.appendChild(pulse);
    el.appendChild(sweeper);

    // Simulated blips
    const blips: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
        const blip = document.createElement('div');
        blip.className = 'wm-radar-blip';
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * (size / 2 - 20) + 10;
        const x = Math.cos(angle) * radius + size / 2;
        const y = Math.sin(angle) * radius + size / 2;
        blip.style.left = `${x}px`;
        blip.style.top = `${y}px`;
        // blip angle in deg
        blip.dataset.angle = (angle * 180 / Math.PI + 90).toString();
        blip.dataset.dist = radius.toString();
        el.appendChild(blip);
        blips.push(blip);
    }

    activeRadarMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

    showToast('📡 Radar sweep initiated...', 3000);

    // Optional: detect "hits" as the sweeper passes
    let currentAngle = 0;
    radarInterval = window.setInterval(() => {
        currentAngle = (currentAngle + (360 / (3000 / 50))) % 360;
        for (const blip of blips) {
            let blipAngle = parseFloat(blip.dataset.angle!);
            if (blipAngle < 0) blipAngle += 360;
            const diff = Math.abs(currentAngle - blipAngle);
            if (diff < 15 || diff > 345) {
                blip.style.opacity = '1';
                setTimeout(() => blip.style.opacity = '0.1', 800);
            }
        }
    }, 50);

    // Remove on escape
    const escListener = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            activeRadarMarker?.remove();
            if (radarInterval) clearInterval(radarInterval);
            document.removeEventListener('keydown', escListener);
            activeRadarMarker = null;
        }
    };
    document.addEventListener('keydown', escListener);
}
