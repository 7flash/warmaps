# ADR-008: Zoom-Responsive Spatial Scaling

**Date:** 2026-03-01  
**Status:** Partially implemented

## Context

Image markers must scale based on zoom level: larger when zoomed in (detail), smaller when zoomed out (overview). The implementation differs fundamentally between MapLibre HTML markers and Deck.gl IconLayer.

## Phase 1: MapLibre HTML Markers (Current)

HTML markers have fixed pixel dimensions set by CSS:
- Normal: 52×52px
- Breaking: 62×62px
- Fallback (no image): 14×14px
- Hover: `transform: scale(1.8)` (93px equivalent)

**Limitation:** Markers do NOT currently scale with zoom. They are fixed-pixel elements. This is acceptable because:
- At global zoom, markers are small enough to not occlude
- At close zoom, markers are large enough to be visible
- Hover scale (1.8x) provides detail on demand

### Potential Enhancement (without Deck.gl)
Could add zoom-responsive sizing via MapLibre `map.on('zoom')` listener:
```ts
map.on('zoom', () => {
    const z = map.getZoom();
    const size = Math.max(24, Math.min(120, z * 8));
    markers.forEach(m => m.getElement().style.width = `${size}px`);
});
```
**Not implemented** because the recalculation on pan/zoom would add jank with 60 DOM markers.

## Phase 2: Deck.gl IconLayer (Planned)

Deck.gl provides the correct solution:

```ts
new IconLayer({
    sizeUnits: 'meters',      // Images scale with terrain
    sizeMinPixels: 10,         // Never smaller than 10px (always visible at global)
    sizeMaxPixels: 200,        // Never larger than 200px (prevent occlusion)
    getSize: d => 500,         // 500 meters of ground coverage
});
```

### MapLibre Expressions (Alternative)
If staying with MapLibre symbol layers (not HTML markers):
```json
["interpolate", ["linear"], ["zoom"], 5, 0.2, 15, 2.0]
```
Applied to `icon-size` layout property. Runs on GPU. But symbol layers require pre-loaded sprite sheets (the texture atlas bottleneck from ADR-001).

## Decision
Phase 1: Fixed pixel sizes with hover scale. No zoom-responsive sizing.
Phase 2: Deck.gl `sizeUnits: 'meters'` with `sizeMinPixels`/`sizeMaxPixels` constraints.

## Consequences
- Phase 1: At very high zoom, markers appear same size (not geo-anchored)
- Phase 2: Markers will feel "embedded in terrain" and scale naturally
- `sizeMinPixels: 10` guarantees visibility at any zoom level
