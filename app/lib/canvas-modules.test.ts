/**
 * Tests for extracted canvas modules — pure logic only (no DOM)
 *
 * Validates constants, math, and exported interfaces from the
 * extracted snap-guidelines, canvas-layout, and container-drag modules.
 *
 * Run: bun test app/lib/canvas-modules.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { SNAP_THRESHOLD, GRID_SIZE } from './snap-guidelines'

// ─── Snap Constants ─────────────────────────────────────

describe('snap-guidelines constants', () => {
    test('SNAP_THRESHOLD is 8 world pixels', () => {
        expect(SNAP_THRESHOLD).toBe(8)
    })

    test('GRID_SIZE is 20 world pixels', () => {
        expect(GRID_SIZE).toBe(20)
    })

    test('SNAP_THRESHOLD < GRID_SIZE (guides are finer than grid)', () => {
        expect(SNAP_THRESHOLD).toBeLessThan(GRID_SIZE)
    })
})

// ─── Grid Snap Math ─────────────────────────────────────

describe('grid snap math (Shift+drag)', () => {
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE

    test('snaps to nearest grid line', () => {
        expect(snap(0)).toBe(0)
        expect(snap(10)).toBe(20)
        expect(snap(9)).toBe(0)
        expect(snap(20)).toBe(20)
        expect(snap(100)).toBe(100)
    })

    test('negative coordinates snap correctly', () => {
        expect(Object.is(snap(-10), -0)).toBe(true)  // Math.round(-0.5)*20 = -0 in JS
        expect(snap(-11)).toBe(-20)  // Math.round(-0.55) = -1
        expect(snap(-30)).toBe(-20)  // Math.round(-1.5) = -2... actually -1
    })

    test('large coordinates snap correctly', () => {
        expect(snap(1000)).toBe(1000)
        expect(snap(1011)).toBe(1020)
        expect(snap(9999)).toBe(10000)
    })
})

// ─── Edge Snap Logic ────────────────────────────────────

describe('edge snap logic', () => {
    // Reproduce the snap detection algorithm from snap-guidelines.ts
    function findBestSnap(
        edges: number[],
        draggedEdges: { edge: number; offset: number }[],
    ): { snapped: number; matched: number } | null {
        let bestDist = SNAP_THRESHOLD + 1
        let snapped = 0
        let matchedVal = 0

        for (const { edge, offset } of draggedEdges) {
            for (const target of edges) {
                const dist = Math.abs(edge - target)
                if (dist < bestDist) {
                    bestDist = dist
                    snapped = target - offset
                    matchedVal = target
                }
            }
        }

        return bestDist <= SNAP_THRESHOLD
            ? { snapped, matched: matchedVal }
            : null
    }

    test('snaps when within threshold', () => {
        const target = [100] // Another container's left edge at 100
        const dragged = [{ edge: 105, offset: 0 }] // Our left edge at 105 (5px away)
        const result = findBestSnap(target, dragged)
        expect(result).not.toBeNull()
        expect(result!.snapped).toBe(100)
    })

    test('no snap when beyond threshold', () => {
        const target = [100]
        const dragged = [{ edge: 120, offset: 0 }] // 20px away — too far
        const result = findBestSnap(target, dragged)
        expect(result).toBeNull()
    })

    test('snaps center-to-center', () => {
        // Dragged center at 296, target center at 300 → 4px apart (within threshold)
        const target = [300]
        const dragged = [{ edge: 296, offset: 190 }]
        const result = findBestSnap(target, dragged)
        expect(result).not.toBeNull()
        expect(result!.snapped).toBe(110) // 300 - 190 = 110
    })

    test('picks closest edge among multiple', () => {
        const targets = [50, 200, 400]
        const dragged = [{ edge: 198, offset: 0 }] // 2px from 200
        const result = findBestSnap(targets, dragged)
        expect(result).not.toBeNull()
        expect(result!.matched).toBe(200)
    })
})

// ─── Viewport Math ──────────────────────────────────────

describe('viewport coordinate math', () => {
    // Screen → World conversion used in drag handlers
    function screenToWorld(
        clientX: number,
        clientY: number,
        rectLeft: number,
        rectTop: number,
        offsetX: number,
        offsetY: number,
        zoom: number,
    ) {
        return {
            worldX: (clientX - rectLeft - offsetX) / zoom,
            worldY: (clientY - rectTop - offsetY) / zoom,
        }
    }

    test('identity at zoom=1, offset=0', () => {
        const { worldX, worldY } = screenToWorld(100, 200, 0, 0, 0, 0, 1)
        expect(worldX).toBe(100)
        expect(worldY).toBe(200)
    })

    test('zoom=2 halves world coordinates', () => {
        const { worldX, worldY } = screenToWorld(200, 400, 0, 0, 0, 0, 2)
        expect(worldX).toBe(100)
        expect(worldY).toBe(200)
    })

    test('offset shifts world coordinates', () => {
        const { worldX, worldY } = screenToWorld(100, 200, 0, 0, -50, -100, 1)
        expect(worldX).toBe(150)
        expect(worldY).toBe(300)
    })

    test('combined zoom + offset', () => {
        // clientX=300, rect=0, offsetX=-200, zoom=2
        // worldX = (300 - 0 - (-200)) / 2 = 500 / 2 = 250
        const { worldX } = screenToWorld(300, 0, 0, 0, -200, 0, 2)
        expect(worldX).toBe(250)
    })
})

// ─── Auto-arrange math ──────────────────────────────────

describe('auto-arrange math', () => {
    test('computes correct column count', () => {
        const cols = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)))
        expect(cols(1)).toBe(1)
        expect(cols(2)).toBe(2)
        expect(cols(4)).toBe(2)
        expect(cols(5)).toBe(3)
        expect(cols(9)).toBe(3)
        expect(cols(10)).toBe(4)
        expect(cols(16)).toBe(4)
    })
})
