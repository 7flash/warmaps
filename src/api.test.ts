/**
 * API endpoint tests for WARMAPS
 *
 * Tests REST API routes against the production server.
 * These are live integration tests — they hit real endpoints.
 *
 * Run: bun test src/api.test.ts
 */
import { describe, expect, test } from 'bun:test'

const BASE = 'http://202.155.132.139:4444'

// ─── Health ─────────────────────────────────────────────

describe('/api/health', () => {
    test('returns 200 with status ok', async () => {
        const res = await fetch(`${BASE}/api/health`)
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.status).toBe('ok')
    })

    test('includes uptime and memory', async () => {
        const data = await fetch(`${BASE}/api/health`).then(r => r.json()) as any
        expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0)
        expect(data.memory.rss).toMatch(/\d+MB/)
        expect(data.memory.heap).toMatch(/\d+\/\d+MB/)
    })

    test('includes version', async () => {
        const data = await fetch(`${BASE}/api/health`).then(r => r.json()) as any
        expect(data.version).toBe('2.0.0')
    })

    test('includes timestamp as ISO string', async () => {
        const data = await fetch(`${BASE}/api/health`).then(r => r.json()) as any
        expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('has no-cache header', async () => {
        const res = await fetch(`${BASE}/api/health`)
        expect(res.headers.get('cache-control')).toBe('no-cache')
    })
})

// ─── Ping ───────────────────────────────────────────────

describe('/api/ping', () => {
    test('returns 200 with timestamp', async () => {
        const before = Date.now()
        const res = await fetch(`${BASE}/api/ping`)
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.t).toBeGreaterThanOrEqual(before - 5000) // within 5s
    })

    test('has no-store cache policy', async () => {
        const res = await fetch(`${BASE}/api/ping`)
        expect(res.headers.get('cache-control')).toBe('no-store')
    })
})

// ─── PWA Manifest ───────────────────────────────────────

describe('/api/manifest.json', () => {
    test('returns valid manifest', async () => {
        const res = await fetch(`${BASE}/api/manifest.json`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('manifest+json')
    })

    test('has correct app name', async () => {
        const data = await fetch(`${BASE}/api/manifest.json`).then(r => r.json()) as any
        expect(data.short_name).toBe('WARMAPS')
        expect(data.display).toBe('standalone')
    })
})

// ─── SEO Routes ─────────────────────────────────────────

describe('/api/robots.txt', () => {
    test('returns 200 with text content', async () => {
        const res = await fetch(`${BASE}/api/robots.txt`)
        expect(res.status).toBe(200)
        const text = await res.text()
        expect(text).toContain('User-agent')
    })
})

describe('/api/sitemap.xml', () => {
    test('returns 200 with XML content', async () => {
        const res = await fetch(`${BASE}/api/sitemap.xml`)
        expect(res.status).toBe(200)
        const text = await res.text()
        expect(text).toContain('<?xml')
    })
})

// ─── Data Feeds ─────────────────────────────────────────

describe('/api/gdelt', () => {
    test('returns 200 with events array', async () => {
        const res = await fetch(`${BASE}/api/gdelt`)
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(Array.isArray(data.events)).toBe(true)
    })
})

describe('/api/seismic', () => {
    test('returns 200 with earthquake data', async () => {
        const res = await fetch(`${BASE}/api/seismic`)
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data).toBeDefined()
    })
})

// ─── Page Routes ────────────────────────────────────────

describe('/ (homepage)', () => {
    test('returns 200 with HTML', async () => {
        const res = await fetch(`${BASE}/`)
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('</html>')
    })

    test('includes client-side mount script', async () => {
        const res = await fetch(`${BASE}/`)
        const html = await res.text()
        expect(html).toContain('.client-')
    })
})
