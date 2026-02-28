/**
 * /api/youtube — Live Stream Auto-Discovery
 *
 * Scrapes YouTube channel pages to find currently active live stream video IDs.
 * No API key required — uses the public channel /live endpoint.
 * Caches results for 10 minutes to avoid hammering YouTube.
 */

interface ChannelConfig {
    key: string;
    label: string;
    handle: string;        // YouTube @handle
    channelId?: string;    // UCxxxx channel ID (fallback)
}

const CHANNELS: ChannelConfig[] = [
    { key: 'aljazeeraenglish', label: 'AL JAZEERA', handle: 'aljaborsenglish', channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
    { key: 'france24english', label: 'FRANCE 24', handle: 'FRANCE24English', channelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
    { key: 'skynews', label: 'SKY NEWS', handle: 'SkyNews', channelId: 'UCoMdktPbSTixAyNGwb-UYkQ' },
    { key: 'dwnews', label: 'DW NEWS', handle: 'DWNews', channelId: 'UCknLrEdhRCp1aegoMqRhGGw' },
    { key: 'cnn', label: 'CNN', handle: 'CNN', channelId: 'UCupvZG-5ko_eiXAupbDfxWw' },
    { key: 'wion', label: 'WION', handle: 'WIONews', channelId: 'UC_gUM8rL-Lrg6O3adPW9K1g' },
    { key: 'trt', label: 'TRT WORLD', handle: 'taborseworld', channelId: 'UC7fWeaHhqgM4Lba7TSKO5gQ' },
    { key: 'ndtv', label: 'NDTV', handle: 'ndtv', channelId: 'UCmhtl-HeUMwRiGFLeQS_-AA' },
];

interface LiveStream {
    key: string;
    label: string;
    videoId: string | null;
    embedUrl: string | null;
    isLive: boolean;
}

let cache: { streams: LiveStream[]; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
    // Return cache if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        return Response.json({ streams: cache.streams, cached: true });
    }

    console.log('[youtube] Discovering live streams...');

    const streams = await Promise.all(
        CHANNELS.map(channel => discoverLiveStream(channel))
    );

    cache = { streams, ts: Date.now() };

    const liveCount = streams.filter(s => s.isLive).length;
    console.log(`[youtube] Found ${liveCount}/${streams.length} live streams`);

    return Response.json({ streams, cached: false });
}

async function discoverLiveStream(channel: ChannelConfig): Promise<LiveStream> {
    const base = { key: channel.key, label: channel.label };

    try {
        // Strategy 1: Fetch the channel's /live page and extract the video ID
        const url = `https://www.youtube.com/@${channel.handle}/live`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });

        if (!res.ok) {
            return { ...base, videoId: null, embedUrl: null, isLive: false };
        }

        const html = await res.text();

        // Extract canonical video URL — YouTube embeds it in the page
        // Pattern: "videoId":"XXXXXXXXXXX" or /watch?v=XXXXXXXXXXX
        const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!videoIdMatch) {
            return { ...base, videoId: null, embedUrl: null, isLive: false };
        }

        const videoId = videoIdMatch[1];

        // Check if it's actually live (look for "isLive":true or "isLiveNow":true)
        const isLive = html.includes('"isLive":true') ||
            html.includes('"isLiveNow":true') ||
            html.includes('"style":"LIVE"') ||
            html.includes('"liveBadge"');

        return {
            ...base,
            videoId,
            embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`,
            isLive,
        };
    } catch (e: any) {
        console.error(`[youtube] Failed to discover ${channel.key}:`, e.message);

        // Fallback: use channel embed (works for some channels)
        if (channel.channelId) {
            return {
                ...base,
                videoId: null,
                embedUrl: `https://www.youtube.com/embed/live_stream?channel=${channel.channelId}&autoplay=1&mute=1`,
                isLive: false, // Unknown
            };
        }

        return { ...base, videoId: null, embedUrl: null, isLive: false };
    }
}
