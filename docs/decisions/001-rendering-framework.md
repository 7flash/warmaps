# ADR-001: Map Rendering Framework — MapLibre GL JS (Phase 1), Deck.gl (Phase 2)

**Date:** 2026-03-01  
**Status:** Active  
**Supersedes:** N/A

## Context

The dashboard must render photographic image markers at geographic coordinates on an interactive map. Three frameworks were evaluated:

| Framework | Architecture | Perf Limit | Dynamic Image URLs | Use Case |
|---|---|---|---|---|
| **Leaflet** | DOM (HTML/CSS) | ~500 markers | Excellent (native src) | Simple dashboards, limited data |
| **Mapbox GL JS** | WebGL (Texture Atlas) | 10,000+ static symbols | Poor (manual loadImage) | Vector tiles, static icons |
| **Deck.gl** | WebGL2 (Reactive Buffers) | 100,000+ points | Excellent (auto-packing) | Massive dynamic media |

### Why NOT Leaflet
Leaflet appends `<img>` elements to the DOM. At hundreds of markers, the browser chokes on CSS layout recalculations, compositing, and paint operations during pan/zoom. Performance degrades catastrophically with dynamic markers.

### Why NOT Mapbox GL JS (directly)
Mapbox requires manual `map.loadImage()` → `map.addImage()` → assign to sprite sheet before any icon can render. This "texture atlas bottleneck" makes it unsuitable for streaming hundreds of unpredictable image URLs. Continuous atlas rebuilding causes race conditions and GPU stalls.

### Why MapLibre GL JS (Phase 1 — Current)
MapLibre is an open-source fork of Mapbox GL v2. We use it because:
- No API key required (Mapbox requires a paid token)
- Identical WebGL rendering pipeline for vector tiles and symbol layers
- Our image markers are rendered as **HTML DOM elements** (via `maplibregl.Marker`), NOT symbol layers
- With our current cap of **≤60 markers**, DOM-based rendering is acceptable
- CSS filter chains for holographic treatment work with DOM elements

### Why Deck.gl (Phase 2 — Planned Migration)
When marker count exceeds ~200, we MUST migrate to Deck.gl:
- **IconLayer auto-packing**: Dynamically fetches image URLs, generates texture atlases on-the-fly without manual sprite sheet management
- **`sizeUnits: 'meters'`**: Images scale geometrically with zoom, anchored to terrain
- **`sizeMinPixels` / `sizeMaxPixels`**: Prevents markers from vanishing at global zoom or becoming enormous at street level
- **`updateTriggers`**: Efficient temporal decay — only alpha channel updates are pushed to GPU shaders
- **GLSL fragment shaders**: Holographic effects (cyan tint, scanlines, bloom) rendered on GPU instead of CSS filters
- **`MapboxOverlay` with `interleaved: true`**: Deck.gl layers inject directly into MapLibre's WebGL context

### Migration Path
1. Keep MapLibre as the basemap provider (tiles, labels, boundaries)
2. Add Deck.gl as an overlay layer for image markers only
3. Move holographic filter from CSS to GLSL fragment shader
4. Move temporal decay from JS to GPU uniform buffer
5. Remove HTML markers entirely

## Decision
**Phase 1 (current):** MapLibre GL JS with HTML DOM markers (≤60). CSS filters for holographic effects.  
**Phase 2 (when scaling):** Add Deck.gl IconLayer overlay. Move all visual effects to GPU shaders.

## Consequences
- Phase 1 has a hard performance ceiling at ~200 DOM markers
- CSS filter chains (`sepia → hue-rotate → brightness`) add composite overhead per marker
- Phase 2 migration requires adding `@deck.gl/core` and `@deck.gl/layers` as dependencies (~150KB gzipped)
