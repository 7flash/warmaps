/**
 * utils.tsx — Shared utility functions
 */

import { render } from 'melina/client';

// ─── Debounce utility ────────────────────────────────────────
const _debounceTimers: Record<string, any> = {};
export function debounce(key: string, fn: () => void, ms: number) {
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(fn, ms);
}

// Proxy external images through our server to bypass CORS
export function proxyImg(url: string | null | undefined): string {
    if (!url || !url.startsWith('http')) return '';
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

// Build an img tag that tries direct first, then proxy, then fallback
export function ImgWithFallback({ url, fallbackText = '' }: { url: string; fallbackText?: string }) {
    const proxyUrl = proxyImg(url);
    const initials = fallbackText.slice(0, 2).toUpperCase();
    const handleError = (e: any) => {
        const img = e.currentTarget;
        if (!img.dataset.retried) {
            img.dataset.retried = '1';
            img.src = proxyUrl;
        } else {
            img.style.display = 'none';
            const fb = img.parentElement?.querySelector('.map-marker-fb') as HTMLElement;
            if (fb) fb.style.display = 'flex';
        }
    };
    return (
        <>
            <img src={url} onError={handleError} alt="" />
            <div className="map-marker-fb" style={{ display: 'none' }}>{initials}</div>
        </>
    );
}

// ─── Utilities ──────────────────────────────────────────────

export function decodeEntities(str: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

export function escHtml(str: string): string {
    const decoded = decodeEntities(str);
    return decoded
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const now = Date.now();
        const diff = now - date.getTime();
        if (diff < 60_000) return 'JUST NOW';
        if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
        if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

export function formatVolume(vol: number): string {
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
    return String(Math.round(vol));
}

export function getCategoryIcon(cat: string): string {
    switch (cat) {
        case 'strike': return '💣';
        case 'regime': return '👑';
        case 'chokepoint': return '🚢';
        case 'nuclear': return '☢️';
        case 'escalation': return '⚔️';
        default: return '📊';
    }
}
