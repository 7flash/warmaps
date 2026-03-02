/**
 * tv.tsx — TV channel switching & YouTube stream discovery
 */

import { render } from 'melina/client';

let discoveredStreams: Record<string, { embedUrl: string | null; isLive: boolean; label: string }> = {};

const FALLBACK_URLS: Record<string, string> = {
    aljazeeraenglish: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1',
    france24english: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1',
    skynews: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1',
    dwnews: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRhGGw&autoplay=1&mute=1',
    cnn: 'https://www.youtube.com/embed/live_stream?channel=UCupvZG-5ko_eiXAupbDfxWw&autoplay=1&mute=1',
};

async function fetchYouTubeStreams() {
    try {
        const res = await fetch('/api/youtube');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.streams) return;

        for (const s of data.streams) {
            discoveredStreams[s.key] = { embedUrl: s.embedUrl, isLive: s.isLive, label: s.label };
        }

        const container = document.getElementById('tv-channels');
        if (!container) return;

        const channels = data.streams as { key: string; label: string; isLive: boolean }[];
        render(
            <>{channels.map((ch: any, i: number) =>
                <button className={`channel-btn${i === 0 ? ' active' : ''}`} data-channel={ch.key}>
                    {ch.label}{ch.isLive && <span style={{ color: '#ef4444', fontSize: '8px' }}> ● LIVE</span>}
                </button>
            )}</>,
            container
        );

        console.log(`[WARMAPS] YouTube: ${channels.filter((c: any) => c.isLive).length}/${channels.length} channels live`);
    } catch (e) {
        console.error('[WARMAPS] YouTube stream discovery failed:', e);
    }
}

function loadTVChannel(channelKey: string) {
    const player = document.getElementById('tv-player');
    if (!player) return;

    const stream = discoveredStreams[channelKey];
    const embedUrl = stream?.embedUrl || FALLBACK_URLS[channelKey];

    if (embedUrl) {
        render(<iframe id="tv-iframe" src={embedUrl} allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', height: '100%', border: 'none' }} />, player);
    } else {
        render(<div className="loading-state" style={{ height: '100%' }}><span>No live stream found for {channelKey}</span></div>, player);
    }
}

export function initTVChannels() {
    const container = document.getElementById('tv-channels');
    if (!container) return;

    loadTVChannel('aljazeeraenglish');

    fetchYouTubeStreams().then(() => {
        const active = container.querySelector('.channel-btn.active') as HTMLElement;
        if (active?.dataset.channel) loadTVChannel(active.dataset.channel);
    });

    setInterval(fetchYouTubeStreams, 10 * 60 * 1000);

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.channel-btn') as HTMLElement | null;
        if (!btn) return;
        const channelKey = btn.dataset.channel;
        if (!channelKey) return;
        container.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadTVChannel(channelKey);
    });
}
