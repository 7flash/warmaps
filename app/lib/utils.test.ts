/**
 * Utils unit tests — pure functions only (no DOM deps)
 * Run with: bun test app/lib/utils.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { haversine, formatVolume } from './utils'

describe('haversine', () => {
    test('same point returns 0', () => {
        expect(haversine(0, 0, 0, 0)).toBe(0)
    })

    test('known distance: London to Paris ≈ 344 km', () => {
        const dist = haversine(51.5074, -0.1278, 48.8566, 2.3522)
        expect(dist).toBeGreaterThan(330)
        expect(dist).toBeLessThan(360)
    })

    test('known distance: New York to Los Angeles ≈ 3944 km', () => {
        const dist = haversine(40.7128, -74.006, 34.0522, -118.2437)
        expect(dist).toBeGreaterThan(3900)
        expect(dist).toBeLessThan(4000)
    })

    test('antipodal points ≈ half earth circumference', () => {
        const dist = haversine(0, 0, 0, 180)
        // Half circumference ≈ 20015 km
        expect(dist).toBeGreaterThan(20000)
        expect(dist).toBeLessThan(20100)
    })

    test('symmetry: distance A→B equals B→A', () => {
        const ab = haversine(35, 45, 50, 10)
        const ba = haversine(50, 10, 35, 45)
        expect(Math.abs(ab - ba)).toBeLessThan(0.001)
    })

    test('short distance: ~1 km', () => {
        // 0.01 degrees latitude ≈ 1.11 km
        const dist = haversine(0, 0, 0.01, 0)
        expect(dist).toBeGreaterThan(1.0)
        expect(dist).toBeLessThan(1.2)
    })

    test('cross-equator distance', () => {
        const dist = haversine(-10, 30, 10, 30)
        // 20 degrees latitude ≈ 2224 km
        expect(dist).toBeGreaterThan(2200)
        expect(dist).toBeLessThan(2250)
    })

    test('cross-dateline distance', () => {
        const dist = haversine(0, 179, 0, -179)
        // 2 degrees longitude at equator ≈ 222 km
        expect(dist).toBeGreaterThan(200)
        expect(dist).toBeLessThan(250)
    })
})

describe('formatVolume', () => {
    test('formats millions', () => {
        expect(formatVolume(1_500_000)).toBe('1.5M')
        expect(formatVolume(10_000_000)).toBe('10.0M')
    })

    test('formats exact million', () => {
        expect(formatVolume(1_000_000)).toBe('1.0M')
    })

    test('formats thousands', () => {
        expect(formatVolume(5_000)).toBe('5K')
        expect(formatVolume(42_500)).toBe('43K')
    })

    test('formats exact thousand', () => {
        expect(formatVolume(1_000)).toBe('1K')
    })

    test('formats small numbers', () => {
        expect(formatVolume(42)).toBe('42')
        expect(formatVolume(999)).toBe('999')
    })

    test('formats zero', () => {
        expect(formatVolume(0)).toBe('0')
    })

    test('formats decimal numbers', () => {
        expect(formatVolume(42.7)).toBe('43')
    })

    test('boundary: 999,999', () => {
        expect(formatVolume(999_999)).toBe('1000K')
    })
})
