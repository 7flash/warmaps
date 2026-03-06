/**
 * cache.ts — IndexedDB data cache for instant boot
 * 
 * Provides a simple key-value IndexedDB cache with TTL.
 * Each API response is stored under its endpoint key.
 * On next boot, cached data is returned instantly while
 * fresh data is fetched in the background.
 */

const DB_NAME = 'warmaps-cache';
const DB_VERSION = 1;
const STORE_NAME = 'api-cache';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.warn('[WARMAPS cache] IndexedDB open failed:', request.error);
            reject(request.error);
        };
    });

    return dbPromise;
}

interface CacheEntry {
    key: string;
    data: any;
    timestamp: number;
}

/**
 * Get a cached API response.
 * Returns null if not cached or if older than maxAgeMs.
 */
export async function getCached(key: string, maxAgeMs: number = 30 * 60 * 1000): Promise<any | null> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const entry = request.result as CacheEntry | undefined;
                if (!entry) {
                    resolve(null);
                    return;
                }

                // Check TTL
                if (Date.now() - entry.timestamp > maxAgeMs) {
                    resolve(null);
                    return;
                }

                resolve(entry.data);
            };

            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Store an API response in the cache.
 */
export async function setCache(key: string, data: any): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const entry: CacheEntry = {
            key,
            data,
            timestamp: Date.now(),
        };

        store.put(entry);
    } catch {
        // Cache writes are best-effort
    }
}

/**
 * Fetch with cache-first strategy.
 * 
 * 1. Check IndexedDB for cached response
 * 2. If cached, call onData immediately with cached data
 * 3. Fetch fresh data from network in background
 * 4. If fresh data arrives, call onData again with updated data
 * 5. Store fresh data in cache
 * 
 * @param url - API endpoint to fetch
 * @param cacheKey - Key for storing in IndexedDB
 * @param onData - Callback that processes the data (called 1-2 times)
 * @param opts - Optional: maxAge (default 30min), parseAs ('json' | 'text')
 */
export async function cachedFetch(
    url: string,
    cacheKey: string,
    onData: (data: any, fromCache: boolean) => void,
    opts: { maxAgeMs?: number; parseAs?: 'json' | 'text' } = {}
): Promise<void> {
    const { maxAgeMs = 30 * 60 * 1000, parseAs = 'json' } = opts;

    // Step 1: Try cache first for instant boot
    let hadCache = false;
    try {
        const cached = await getCached(cacheKey, maxAgeMs);
        if (cached !== null) {
            hadCache = true;
            onData(cached, true);
            console.log(`[cache] HIT: ${cacheKey}`);
        }
    } catch { /* cache miss */ }

    // Step 2: Fetch fresh data in background
    try {
        const res = await fetch(url);
        if (!res.ok) return;

        const data = parseAs === 'text' ? await res.text() : await res.json();

        // Store in cache for next boot
        await setCache(cacheKey, data);

        // Only call onData if we had cache (otherwise this is the first call)
        // or always call it since we need the data
        onData(data, false);
        if (!hadCache) {
            console.log(`[cache] MISS: ${cacheKey} (fetched fresh)`);
        } else {
            console.log(`[cache] REFRESH: ${cacheKey}`);
        }
    } catch (e) {
        if (!hadCache) {
            console.error(`[cache] ${cacheKey} fetch failed and no cache:`, e);
        }
        // If we had cache, we already rendered — silent failure is fine
    }
}

/**
 * Clear all cached data (for debugging or user-triggered reset).
 */
export async function clearCache(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        console.log('[cache] Cleared all cached data');
    } catch {
        // best-effort
    }
}
