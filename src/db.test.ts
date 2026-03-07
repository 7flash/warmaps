/**
 * WARMAPS DB integration tests
 *
 * Uses the real sqlite-zod-orm Database with an in-memory/temp DB.
 * Tests market velocity detection, news caching, bet pools, and cleanup.
 *
 * Run: bun test src/db.test.ts
 */
import { describe, expect, test, beforeEach } from 'bun:test'
import {
    db,
    recordMarketSnapshot,
    getMarketHistory,
    saveAlert,
    getRecentAlerts,
    cacheNewsItems,
    getCachedNews,
    saveChatMessage,
    getChatHistory,
    placeBet,
    getMarketPool,
    getMarketBets,
    getWalletBets,
    updateBetStatus,
    cleanupOldData,
} from './db'

// ─── Market Snapshots ───────────────────────────────────

describe('recordMarketSnapshot', () => {
    test('first snapshot returns zero velocity', () => {
        const uid = `test-${Date.now()}-${Math.random()}`
        const result = recordMarketSnapshot({
            id: uid,
            title: 'Test Market',
            platform: 'polymarket',
            probability: 65,
            volume: 1000,
            category: 'politics',
            url: 'https://example.com',
        })
        expect(result.velocityPct).toBe(0)
        expect(result.volumeSpike).toBe(0)
    })

    test('second snapshot returns velocity delta', () => {
        const uid = `test-velocity-${Date.now()}-${Math.random()}`
        recordMarketSnapshot({
            id: uid, title: 'Test Market', platform: 'polymarket',
            probability: 50, volume: 1000, category: 'test', url: '',
        })
        const result = recordMarketSnapshot({
            id: uid, title: 'Test Market', platform: 'polymarket',
            probability: 65, volume: 1500, category: 'test', url: '',
        })
        expect(result.velocityPct).toBe(15) // 65 - 50
        expect(result.volumeSpike).toBe(500) // 1500 - 1000
    })

    test('negative velocity when probability drops', () => {
        const uid = `test-neg-${Date.now()}-${Math.random()}`
        recordMarketSnapshot({
            id: uid, title: 'Drop Market', platform: 'kalshi',
            probability: 80, volume: 5000, category: 'test', url: '',
        })
        const result = recordMarketSnapshot({
            id: uid, title: 'Drop Market', platform: 'kalshi',
            probability: 60, volume: 5000, category: 'test', url: '',
        })
        expect(result.velocityPct).toBe(-20)
        expect(result.volumeSpike).toBe(0)
    })
})

describe('getMarketHistory', () => {
    test('returns snapshots in desc order', () => {
        const uid = `test-history-${Date.now()}-${Math.random()}`
        for (let i = 0; i < 5; i++) {
            recordMarketSnapshot({
                id: uid, title: 'History Market', platform: 'polymarket',
                probability: 50 + i * 5, volume: 1000 + i * 100, category: 'test', url: '',
            })
        }
        const history = getMarketHistory(uid, 3)
        expect(history.length).toBe(3)
        // Most recent first (highest probability)
        expect(history[0].probability).toBeGreaterThanOrEqual(history[1].probability)
    })
})

// ─── Alerts ─────────────────────────────────────────────

describe('saveAlert', () => {
    test('saves and retrieves alerts', () => {
        const uid = `alert-${Date.now()}-${Math.random()}`
        saveAlert({
            id: uid,
            level: 'critical',
            title: 'Test Alert',
            description: 'Something happened',
            signals: ['market_velocity', 'osint'],
            region: 'Middle East',
            lat: 33.5,
            lon: 44.3,
        })
        const alerts = getRecentAlerts(10)
        const found = alerts.find((a: any) => a.alert_id === uid)
        expect(found).toBeTruthy()
        expect(found!.level).toBe('critical')
        expect(found!.title).toBe('Test Alert')
    })
})

// ─── News Cache ─────────────────────────────────────────

describe('cacheNewsItems', () => {
    test('deduplicates by link', () => {
        const link = `https://test.com/article-${Date.now()}-${Math.random()}`
        cacheNewsItems([
            { source: 'reuters', title: 'Article 1', link, pubDate: new Date().toISOString() },
            { source: 'reuters', title: 'Article 1 Dupe', link, pubDate: new Date().toISOString() },
        ])
        const news = getCachedNews('reuters', 100)
        const matching = news.filter((n: any) => n.link === link)
        expect(matching.length).toBe(1) // Only one, not two
    })

    test('getCachedNews filters by source', () => {
        const ts = Date.now()
        cacheNewsItems([
            { source: `src-a-${ts}`, title: 'A', link: `a-${ts}`, pubDate: '' },
            { source: `src-b-${ts}`, title: 'B', link: `b-${ts}`, pubDate: '' },
        ])
        const aNews = getCachedNews(`src-a-${ts}`, 10)
        expect(aNews.length).toBe(1)
        expect(aNews[0].source).toBe(`src-a-${ts}`)
    })
})

// ─── Chat ───────────────────────────────────────────────

describe('chat', () => {
    test('saves and retrieves messages', () => {
        const name = `user-${Date.now()}`
        saveChatMessage(name, 'hello test')
        const history = getChatHistory(10)
        const found = history.find((m: any) => m.username === name)
        expect(found).toBeTruthy()
        expect(found!.text).toBe('hello test')
    })
})

// ─── Betting ────────────────────────────────────────────

describe('betting', () => {
    test('placeBet and getMarketPool', () => {
        const mktId = `mkt-${Date.now()}-${Math.random()}`
        const wallet = `wallet-${Date.now()}`

        placeBet({
            marketId: mktId, marketTitle: 'Will it rain?',
            wallet, side: 'yes', amountSol: 1.5, oddsAtBet: 65, txSignature: 'tx1',
        })
        placeBet({
            marketId: mktId, marketTitle: 'Will it rain?',
            wallet, side: 'no', amountSol: 0.5, oddsAtBet: 35, txSignature: 'tx2',
        })

        const pool = getMarketPool(mktId)
        expect(pool.yesPool).toBe(1.5)
        expect(pool.noPool).toBe(0.5)
        expect(pool.total).toBe(2)
        expect(pool.yesBets).toBe(1)
        expect(pool.noBets).toBe(1)
        expect(pool.yesOdds).toBe(75) // 1.5/2 * 100
        expect(pool.noOdds).toBe(25)  // 0.5/2 * 100
    })

    test('getMarketPool with no bets returns 50/50', () => {
        const pool = getMarketPool(`empty-${Date.now()}`)
        expect(pool.yesOdds).toBe(50)
        expect(pool.noOdds).toBe(50)
        expect(pool.total).toBe(0)
    })

    test('getMarketBets returns bets for market', () => {
        const mktId = `mkt-bets-${Date.now()}-${Math.random()}`
        placeBet({
            marketId: mktId, marketTitle: 'Test', wallet: 'w1',
            side: 'yes', amountSol: 1, oddsAtBet: 50, txSignature: 'tx-x',
        })
        const bets = getMarketBets(mktId)
        expect(bets.length).toBe(1)
        expect(bets[0].side).toBe('yes')
    })

    test('getWalletBets returns bets for wallet', () => {
        const wallet = `test-wallet-${Date.now()}-${Math.random()}`
        placeBet({
            marketId: 'any', marketTitle: 'Test', wallet,
            side: 'no', amountSol: 2, oddsAtBet: 40, txSignature: 'tx-w',
        })
        const bets = getWalletBets(wallet)
        expect(bets.length).toBe(1)
        expect(bets[0].amount_sol).toBe(2)
    })

    test('updateBetStatus changes status', () => {
        const mktId = `mkt-status-${Date.now()}-${Math.random()}`
        placeBet({
            marketId: mktId, marketTitle: 'Status Test', wallet: 'w-st',
            side: 'yes', amountSol: 1, oddsAtBet: 50, txSignature: 'tx-st',
        })
        const bets = getMarketBets(mktId)
        expect(bets[0].status).toBe('confirmed')
        updateBetStatus(bets[0].bet_id, 'settled')
        const updated = getMarketBets(mktId)
        expect(updated[0].status).toBe('settled')
    })
})
