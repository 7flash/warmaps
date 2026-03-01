# ADR-003: Temporal Opacity Decay — Exponential Model

**Date:** 2026-03-01  
**Status:** Active  
**Supersedes:** Linear decay (7-day start, 30-day expiry)

## Context

The dashboard requires images to "slowly disappear" over time. The decay model controls how quickly an event marker fades to transparent.

### Linear Decay (REJECTED)

```
α = 1 - ((T_current - T_event) / D_max)
```

- Decreases at constant rate from moment of event
- A critical photo fades to 50% opacity at the midpoint, reducing visibility before analysts process it
- Mathematically simple but visually inadequate for intelligence monitoring

### Exponential Decay (CHOSEN)

```
α = e^(-k · (T_current - T_event))
```

- Holds image at HIGH visibility for a sustained period
- Rapid drop-off as event approaches expiration
- Mimics natural phenomena: radioactive decay, thermal signatures, holographic transmission fade
- Recent events remain bold and highly visible

### Tuning Parameters

Our decay constant `k = 1.5e-8` produces:

| Event Age | Opacity (α) | Visual Effect |
|---|---|---|
| < 1 hour | ~100% | Fully bright |
| 6 hours | ~85% | Slightly dimmed |
| 12 hours | ~70% | Noticeable fade |
| 24 hours | ~50% | Half brightness |
| 36 hours | ~32% | Significantly faded |
| 48 hours | ~10% | Nearly invisible → hard cutoff |

### Implementation

**Current (Phase 1 — MapLibre HTML markers):**
- Decay calculated in `updateMapSources()` JavaScript function
- Applied as `opacity` property in GeoJSON features
- MapLibre reads `opacity` via data-driven style expression
- Image markers apply opacity via inline style on sync
- `requestAnimationFrame` or `setInterval` not needed — recalculated on each data refresh (every 60-90 seconds)

**Future (Phase 2 — Deck.gl):**
- `getColor` accessor returns `[255, 255, 255, alpha]` where alpha = exponential decay
- `updateTriggers: { getColor: currentTime }` — only alpha channel pushed to GPU
- For maximum performance: push `currentTime` as GLSL uniform, compute decay entirely on GPU:
  ```glsl
  uniform float uCurrentTime;
  // In fragment shader:
  float age = uCurrentTime - eventTimestamp;
  float alpha = exp(-k * age);
  ```

## Decision
Exponential decay with k=1.5e-8. Hard cutoff at 48 hours. Minimum opacity floor at 0.08 (never fully invisible — analyst can still spot it).

## Consequences
- Recent events dominate the visual field (intended)
- Older events visible but subdued (good for temporal context)
- 48-hour cutoff means events from 3+ days ago are not shown
- Refresh interval of 60-90s is sufficient — exponential curve changes slowly enough
