/**
 * STARWAR Database — persistent storage for all intelligence data
 * 
 * Tables:
 * - market_snapshots: Polymarket/Kalshi market data over time (velocity detection)
 * - threat_alerts: Generated threat radar alerts 
 * - news_cache: Cached RSS news items
 * - gdelt_events: GDELT conflict events
 * - fire_points: NASA FIRMS thermal anomalies
 * - chat_messages: Global chat history
 * - telegram_alerts: OSINT from Telegram channels
 */
import { Database, z } from 'sqlite-zod-orm';
import path from 'path';

const dbPath = path.join(import.meta.dir, '..', 'starwar.db');

export const db = new Database(dbPath, {
    market_snapshots: z.object({
        market_id: z.string(),              // pm-xxx or kalshi-xxx
        title: z.string(),
        platform: z.string(),               // polymarket | kalshi
        probability: z.number(),            // 0-100
        volume: z.number(),                 // USD
        category: z.string(),               // strike | regime | chokepoint | escalation | nuclear
        url: z.string().default(''),
        region: z.string().optional(),
        lat: z.number().optional(),
        lon: z.number().optional(),
        captured_at: z.string().default(() => new Date().toISOString()),
    }),

    threat_alerts: z.object({
        alert_id: z.string(),               // unique per alert
        level: z.string(),                   // low | medium | high | critical
        title: z.string(),
        description: z.string(),
        signals: z.string().default('[]'),   // JSON array
        region: z.string().optional(),
        lat: z.number().optional(),
        lon: z.number().optional(),
        market_ids: z.string().default('[]'), // JSON array of related market_ids
        created_at: z.string().default(() => new Date().toISOString()),
    }),

    news_cache: z.object({
        source: z.string(),                  // reuters | bbc | aljazeera
        title: z.string(),
        link: z.string(),
        pub_date: z.string(),
        description: z.string().default(''),
        cached_at: z.string().default(() => new Date().toISOString()),
    }),

    gdelt_events: z.object({
        gdelt_id: z.string().default(''),
        title: z.string(),
        url: z.string().default(''),
        source: z.string().default(''),
        country: z.string().default(''),
        lat: z.number().optional(),
        lon: z.number().optional(),
        event_date: z.string().default(''),
        tone: z.number().default(0),
        goldstein: z.number().default(0),
        cached_at: z.string().default(() => new Date().toISOString()),
    }),

    fire_points: z.object({
        lat: z.number(),
        lon: z.number(),
        brightness: z.number().default(300),
        confidence: z.string().default(''),
        country: z.string().default(''),
        acq_date: z.string().default(''),
        acq_time: z.string().default(''),
        cached_at: z.string().default(() => new Date().toISOString()),
    }),

    chat_messages: z.object({
        username: z.string(),
        text: z.string(),
        sent_at: z.string().default(() => new Date().toISOString()),
    }),

    telegram_messages: z.object({
        channel_title: z.string(),
        channel_id: z.string().default(''),
        message_text: z.string(),
        message_date: z.number().default(0),  // unix timestamp
        cached_at: z.string().default(() => new Date().toISOString()),
    }),
}, {
    indexes: {
        market_snapshots: ['market_id', 'captured_at', 'platform', 'category'],
        threat_alerts: ['level', 'created_at', 'alert_id'],
        news_cache: ['source', 'cached_at'],
        gdelt_events: ['country', 'cached_at'],
        fire_points: ['country', 'cached_at'],
        chat_messages: ['sent_at'],
        telegram_messages: ['channel_id', 'cached_at'],
    },
});

console.log(`[db] STARWAR database initialized at ${dbPath}`);

// ─── Helper functions ────────────────────────────────────────

/**
 * Record a market snapshot for velocity detection.
 * Returns the velocity (probability change) vs the previous snapshot.
 */
export function recordMarketSnapshot(market: {
    id: string;
    title: string;
    platform: string;
    probability: number;
    volume: number;
    category: string;
    url: string;
    region?: string;
    lat?: number;
    lon?: number;
}): { velocityPct: number; volumeSpike: number } {
    // Get the latest snapshot for this market
    const previous = db.market_snapshots.select()
        .where({ market_id: market.id })
        .orderBy('captured_at', 'desc')
        .limit(1)
        .get();

    // Insert new snapshot
    db.market_snapshots.insert({
        market_id: market.id,
        title: market.title,
        platform: market.platform,
        probability: market.probability,
        volume: market.volume,
        category: market.category,
        url: market.url,
        region: market.region,
        lat: market.lat,
        lon: market.lon,
    });

    if (!previous) {
        return { velocityPct: 0, volumeSpike: 0 };
    }

    // Calculate velocity since last snapshot
    const velocityPct = market.probability - previous.probability;
    const volumeSpike = market.volume - previous.volume;

    return { velocityPct, volumeSpike };
}

/**
 * Get market history (last N snapshots) for a given market_id.
 */
export function getMarketHistory(marketId: string, limit = 60) {
    return db.market_snapshots.select()
        .where({ market_id: marketId })
        .orderBy('captured_at', 'desc')
        .limit(limit)
        .all();
}

/**
 * Get the 15-minute velocity for a market (compares current to ~15min ago snapshot).
 */
export function getVelocity15m(marketId: string, currentProb: number, currentVol: number) {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Get closest snapshot to 15min ago
    const oldSnapshot = db.market_snapshots.select()
        .where({ market_id: marketId, captured_at: { $lt: fifteenMinsAgo } })
        .orderBy('captured_at', 'desc')
        .limit(1)
        .get();

    if (!oldSnapshot) {
        return { velocityPct: 0, volumeSpike: 0 };
    }

    return {
        velocityPct: currentProb - oldSnapshot.probability,
        volumeSpike: currentVol - oldSnapshot.volume,
    };
}

/**
 * Save a threat alert to the database.
 */
export function saveAlert(alert: {
    id: string;
    level: string;
    title: string;
    description: string;
    signals: string[];
    region?: string;
    lat?: number;
    lon?: number;
    marketIds?: string[];
}) {
    db.threat_alerts.insert({
        alert_id: alert.id,
        level: alert.level,
        title: alert.title,
        description: alert.description,
        signals: JSON.stringify(alert.signals),
        region: alert.region,
        lat: alert.lat,
        lon: alert.lon,
        market_ids: JSON.stringify(alert.marketIds || []),
    });
}

/**
 * Get recent alerts (for API response).
 */
export function getRecentAlerts(limit = 20) {
    return db.threat_alerts.select()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .all()
        .map(a => ({
            ...a,
            signals: JSON.parse(a.signals),
            market_ids: JSON.parse(a.market_ids),
        }));
}

/**
 * Cache news items. Deduplicates by link.
 */
export function cacheNewsItems(items: { source: string; title: string; link: string; pubDate: string; description?: string }[]) {
    for (const item of items) {
        // Check if already cached
        const exists = db.news_cache.select()
            .where({ link: item.link })
            .count();
        if (exists > 0) continue;

        db.news_cache.insert({
            source: item.source,
            title: item.title,
            link: item.link,
            pub_date: item.pubDate,
            description: item.description || '',
        });
    }
}

/**
 * Get cached news items.
 */
export function getCachedNews(source?: string, limit = 50) {
    let query = db.news_cache.select().orderBy('cached_at', 'desc').limit(limit);
    if (source && source !== 'all') {
        query = query.where({ source });
    }
    return query.all();
}

/**
 * Save a chat message.
 */
export function saveChatMessage(username: string, text: string) {
    return db.chat_messages.insert({ username, text });
}

/**
 * Get chat history.
 */
export function getChatHistory(limit = 100) {
    return db.chat_messages.select()
        .orderBy('sent_at', 'desc')
        .limit(limit)
        .all()
        .reverse();  // oldest first for display
}

/**
 * Cleanup old data (run periodically).
 */
export function cleanupOldData(daysToKeep = 7) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    // Delete old market snapshots (keep recent for velocity)
    db.market_snapshots.delete().where({ captured_at: { $lt: cutoff } }).exec();
    db.news_cache.delete().where({ cached_at: { $lt: cutoff } }).exec();
    db.gdelt_events.delete().where({ cached_at: { $lt: cutoff } }).exec();
    db.fire_points.delete().where({ cached_at: { $lt: cutoff } }).exec();
    db.telegram_messages.delete().where({ cached_at: { $lt: cutoff } }).exec();

    console.log(`[db] Cleaned up data older than ${daysToKeep} days`);
}
