/**
 * /api/news — RSS Feed Aggregator
 * 
 * Fetches and parses RSS feeds from major news outlets,
 * extracts conflict-related articles.
 */
import { cacheNewsItems } from '../../../src/db';

interface NewsItem {
    id: string;
    title: string;
    link: string;
    source: string;
    pubDate: string;
    description: string;
    category?: string;
}

const RSS_FEEDS: Record<string, string[]> = {
    reuters: [
        'https://feeds.reuters.com/Reuters/worldNews',
    ],
    bbc: [
        'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
    aljazeera: [
        'https://www.aljazeera.com/xml/rss/all.xml',
    ],
};

// Simple XML tag extractor (no parser dependency)
function extractTag(xml: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, 'i');
    const match = xml.match(re);
    return match ? match[1].trim() : '';
}

function extractItems(xml: string): string[] {
    const items: string[] = [];
    let pos = 0;
    while (true) {
        const start = xml.indexOf('<item', pos);
        if (start === -1) break;
        const end = xml.indexOf('</item>', start);
        if (end === -1) break;
        items.push(xml.slice(start, end + 7));
        pos = end + 7;
    }
    return items;
}

async function fetchFeed(source: string, url: string): Promise<NewsItem[]> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'STARWAR/1.0 (Global Conflict Monitor)' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];
        const xml = await res.text();

        return extractItems(xml).slice(0, 15).map((itemXml, idx) => {
            const title = extractTag(itemXml, 'title');
            const link = extractTag(itemXml, 'link');
            const pubDate = extractTag(itemXml, 'pubDate');
            const description = extractTag(itemXml, 'description')
                .replace(/<[^>]*>/g, '')
                .slice(0, 200);

            return {
                id: `${source}-${idx}-${Date.now()}`,
                title,
                link,
                source,
                pubDate,
                description,
            };
        }).filter(item => item.title);
    } catch {
        return [];
    }
}

// Cache with 2-minute TTL
let cache: { data: NewsItem[]; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function GET(req: Request) {
    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'all';

    // Check cache
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
        const filtered = source === 'all'
            ? cache.data
            : cache.data.filter(item => item.source === source);
        return Response.json({ items: filtered, cached: true });
    }

    // Fetch all feeds in parallel
    const feedPromises: Promise<NewsItem[]>[] = [];
    for (const [name, urls] of Object.entries(RSS_FEEDS)) {
        for (const feedUrl of urls) {
            feedPromises.push(fetchFeed(name, feedUrl));
        }
    }

    const results = await Promise.all(feedPromises);
    const allItems = results.flat().sort((a, b) => {
        const da = new Date(a.pubDate).getTime() || 0;
        const db = new Date(b.pubDate).getTime() || 0;
        return db - da;
    });

    cache = { data: allItems, ts: Date.now() };

    // Persist to database
    cacheNewsItems(allItems);

    const filtered = source === 'all'
        ? allItems
        : allItems.filter(item => item.source === source);

    return Response.json({ items: filtered, cached: false });
}
