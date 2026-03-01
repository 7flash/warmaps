# ADR-006: Image Marker Rendering — Direct Data Array vs. Cluster Layer Query

**Date:** 2026-03-01  
**Status:** Active

## Context

Image markers need to show actual photographs from news events on the map. Two approaches were evaluated.

### Cluster Layer Query (REJECTED — Original Approach)

Original code queried MapLibre's clustered `events` source to find features:
```ts
const features = map.queryRenderedFeatures(undefined, { layers: ['events-unclustered'] });
```

**Problem:** When events are clustered (at lower zoom levels), `queryRenderedFeatures` returns 0 unclustered features. Image markers only appeared after clicking a cluster to zoom in far enough to de-cluster. This made the dashboard appear empty at default zoom.

### Direct Data Array Rendering (CHOSEN — Current Approach)

New code iterates directly over the `gdeltEvents` in-memory array:
```ts
const eventsWithImages = gdeltEvents.filter(e => {
    if (!e.lat || !e.lon) return false;
    // Check within map bounds
    if (e.lon < bounds.getWest() || e.lon > bounds.getEast()) return false;
    if (e.lat < bounds.getSouth() || e.lat > bounds.getNorth()) return false;
    return e.imageUrl || isBreaking(e.title || '');
});
```

**Advantages:**
- Markers always visible regardless of zoom/clustering
- No dependency on MapLibre's internal cluster state
- Viewport bounds checking for performance (only renders visible markers)
- Breaking news detection via title keyword matching

### Coordinate Deduplication + Jitter

Many GDELT events geolocate to the same coordinates (e.g., "Iran" → 32.4, 53.7). To prevent stacking:
- Dedup key includes 1-decimal lat/lon + title prefix: `${lon.toFixed(1)},${lat.toFixed(1)},${title.slice(0,20)}`
- Small jitter applied: `(Math.random() - 0.5) * 0.3` degrees (~15-30km spread)
- Results in a natural scatter around the geocoded center point

### Breaking News Detection

Events matching urgency keywords get special treatment:
```ts
const BREAKING_KEYWORDS = ['missile', 'strike', 'bomb', 'explosion', 'drone', 'attack', ...];
```
- 62px marker (vs 52px normal)
- Red border with aggressive pulse animation (1.5s interval)
- Higher z-index (50) to appear above other markers

## Decision
Render image markers from in-memory data array with viewport culling, coordinate jitter, and breaking news detection. Cap at 60 markers for DOM performance.

## Consequences
- Markers render immediately on page load (no need to zoom into clusters first)
- Cap of 60 markers means some events may not get a marker (prioritized by array order)
- Jitter means markers don't represent exact coordinates (acceptable at global scale)
- Breaking detection is keyword-based (may have false positives/negatives)
