# ADR-004: Holographic Aesthetic — CSS Filters (Phase 1), WebGL Shaders (Phase 2)

**Date:** 2026-03-01  
**Status:** Active

## Context

The "Star Wars tactical" aesthetic requires transforming raw news photographs into holographic-style imagery: cyan/teal monochrome tint, luminescent glow, horizontal scanlines, and neon border effects.

### CSS Filter Chain (Phase 1 — Current)

Applied directly to `<img>` elements inside `.map-image-marker`:

```css
filter: sepia(100%) hue-rotate(168deg) brightness(1.4) contrast(1.2) saturate(1.3);
```

**Pipeline:**
1. `sepia(100%)` — Converts full-color photo to monochrome brown base
2. `hue-rotate(168deg)` — Shifts brown spectrum into luminescent cyan/teal
3. `brightness(1.4)` — Forces highlights to blow out (hologram projection effect)
4. `contrast(1.2)` — Deepens darks, sharpens light areas
5. `saturate(1.3)` — Intensifies the cyan tint

**Scanlines** via `::after` pseudo-element:
```css
background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
mix-blend-mode: overlay;
```

**Glow** via `box-shadow`:
```css
box-shadow: 0 0 12px rgba(0, 220, 255, 0.3), 0 0 4px rgba(0, 220, 255, 0.15);
```

**Hover behavior:** All filters + scanlines removed on hover, revealing original photograph for analyst inspection.

### Why CSS is acceptable for Phase 1
- We cap at ≤60 markers (well within DOM performance budget)
- Filter chains only recalculate during composite/paint, not layout
- `will-change: transform` implicit from animation helps GPU compositing
- Transition on hover (`filter 0.3s ease`) is smooth

### WebGL Fragment Shaders (Phase 2 — Deck.gl)

When migrating to Deck.gl IconLayer, CSS filters are unavailable. Replace with GLSL:

```glsl
// Color mapping (replaces sepia + hue-rotate)
float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
vec3 tinted = luma * vec3(0.0, 0.86, 1.0); // Cyan tint vector

// Scanlines (replaces CSS pseudo-element)
float scanline = mod(gl_FragCoord.y, 4.0) < 2.0 ? 1.0 : 0.85;
tinted *= scanline;

// Bloom (replaces CSS box-shadow)
// Multi-pass: extract bright pixels → Gaussian blur → additive blend
// Use Deck.gl PostProcessEffect pipeline
```

**Advantages of GPU approach:**
- Zero DOM overhead (runs entirely in fragment shader)
- Scales to 100,000+ markers with no performance penalty
- Scanlines scale correctly with map zoom/pitch
- Bloom responds to 3D camera rotation

## Decision
Phase 1: CSS filter chain (`sepia→hue-rotate→brightness→contrast`) with pseudo-element scanlines. Hover removes all effects for image analysis.
Phase 2: Migrate to GLSL fragment shaders via Deck.gl custom IconLayer subclass.

## Consequences
- Phase 1: Visual quality is good but not pixel-perfect (CSS hue-rotate is not true luminance-based tinting)
- Phase 1: ~60 marker cap before noticeable perf impact from composite recalculations
- Phase 2: Requires writing custom GLSL and understanding Deck.gl shader injection
- Hover-to-reveal is a deliberate UX choice: analysts need unfiltered photos
