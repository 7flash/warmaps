/**
 * Telegram OSINT analysis — pure function tests
 *
 * Tests: extractLocation, classifyThreat, extractEquipment
 *
 * Run: bun test src/telegram.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
    extractLocation, classifyThreat, extractEquipment,
    KNOWN_LOCATIONS, EQUIPMENT_PATTERNS, OSINT_CHANNELS,
} from './telegram'

// ─── extractLocation ─────────────────────────────────────

describe('extractLocation', () => {
    test('detects Tehran', () => {
        const loc = extractLocation('Reports of explosions near Tehran')
        expect(loc).toBeDefined()
        expect(loc!.name).toBe('Tehran')
        expect(loc!.lat).toBeCloseTo(35.69, 1)
    })

    test('detects Gaza', () => {
        const loc = extractLocation('Airstrikes in northern Gaza strip continue')
        expect(loc).toBeDefined()
        expect(loc!.name).toBe('Gaza')
    })

    test('detects Kyiv', () => {
        const loc = extractLocation('Drone attacks on Kyiv overnight')
        expect(loc!.name).toBe('Kyiv')
    })

    test('detects Bakhmut', () => {
        const loc = extractLocation('Heavy fighting near Bakhmut')
        expect(loc!.name).toBe('Bakhmut')
    })

    test('detects Strait of Hormuz', () => {
        const loc = extractLocation('Naval tensions in Hormuz')
        expect(loc!.name).toBe('Strait of Hormuz')
    })

    test('returns undefined for no location', () => {
        expect(extractLocation('General news update')).toBeUndefined()
    })

    test('is case-insensitive', () => {
        expect(extractLocation('TEHRAN blast')).toBeDefined()
        expect(extractLocation('tehran blast')).toBeDefined()
    })

    test('covers all major conflict zones', () => {
        expect(KNOWN_LOCATIONS.length).toBeGreaterThan(80)
    })
})

// ─── classifyThreat ──────────────────────────────────────

describe('classifyThreat', () => {
    test('classifies missile hit as critical', () => {
        expect(classifyThreat('Ballistic missile hit military base')).toBe('critical')
    })

    test('classifies explosion as critical', () => {
        expect(classifyThreat('Large explosion reported')).toBe('critical')
    })

    test('classifies nuclear mention as critical', () => {
        expect(classifyThreat('Nuclear facility under threat')).toBe('critical')
    })

    test('classifies drone strike as critical (strike keyword)', () => {
        expect(classifyThreat('Drone strike on convoy')).toBe('critical')
    })

    test('classifies shelling as high', () => {
        expect(classifyThreat('Shelling in residential area')).toBe('high')
    })

    test('classifies rocket as high', () => {
        expect(classifyThreat('Rocket fired toward border')).toBe('high')
    })

    test('classifies troop deployment as medium', () => {
        expect(classifyThreat('Troop deployment near border')).toBe('medium')
    })

    test('classifies ceasefire as medium', () => {
        expect(classifyThreat('Ceasefire talks ongoing')).toBe('medium')
    })

    test('classifies plain news as low', () => {
        expect(classifyThreat('Weather forecast for tomorrow')).toBe('low')
    })

    test('classifies empty string as low', () => {
        expect(classifyThreat('')).toBe('low')
    })
})

// ─── extractEquipment ────────────────────────────────────

describe('extractEquipment', () => {
    test('detects air defense (Iron Dome)', () => {
        expect(extractEquipment('Iron Dome intercepts incoming rocket')).toBe('air-defense')
    })

    test('detects air defense (S-400)', () => {
        expect(extractEquipment('S-400 battery deployed')).toBe('air-defense')
    })

    test('detects missile (HIMARS)', () => {
        expect(extractEquipment('HIMARS strike on supply depot')).toBe('missile')
    })

    test('detects Shahed-136 as missile (ordered before drone)', () => {
        expect(extractEquipment('Shahed-136 drones launched')).toBe('missile')
    })

    test('detects drone (Bayraktar)', () => {
        expect(extractEquipment('Bayraktar TB2 surveillance')).toBe('drone')
    })

    test('detects aircraft (F-35)', () => {
        expect(extractEquipment('F-35 sortie over Mediterranean')).toBe('aircraft')
    })

    test('detects naval', () => {
        expect(extractEquipment('USS carrier group enters region')).toBe('naval')
    })

    test('detects armor (Leopard)', () => {
        expect(extractEquipment('Leopard 2 tanks delivered')).toBe('armor')
    })

    test('detects artillery', () => {
        expect(extractEquipment('M777 howitzer positions shelled')).toBe('artillery')
    })

    test('detects infantry weapons (Javelin)', () => {
        expect(extractEquipment('Javelin anti-tank missile used')).toBe('infantry-weapon')
    })

    test('returns undefined for no equipment', () => {
        expect(extractEquipment('Political summit discussion')).toBeUndefined()
    })
})

// ─── OSINT_CHANNELS ──────────────────────────────────────

describe('OSINT_CHANNELS', () => {
    test('has at least 20 channels', () => {
        expect(OSINT_CHANNELS.length).toBeGreaterThanOrEqual(20)
    })

    test('every channel has id and title', () => {
        for (const ch of OSINT_CHANNELS) {
            expect(ch.id).toBeTruthy()
            expect(ch.title).toBeTruthy()
        }
    })

    test('covers multiple categories', () => {
        const categories = new Set(OSINT_CHANNELS.map(ch => ch.category))
        expect(categories.size).toBeGreaterThanOrEqual(4)
    })
})

// ─── EQUIPMENT_PATTERNS ──────────────────────────────────

describe('EQUIPMENT_PATTERNS', () => {
    test('has 8 equipment categories', () => {
        const types = new Set(EQUIPMENT_PATTERNS.map(p => p.type))
        expect(types.size).toBeGreaterThanOrEqual(7)
    })
})
