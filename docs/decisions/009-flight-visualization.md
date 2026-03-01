# ADR-009: Flight Visualization — Airplane Icons with Heading Rotation

**Date:** 2026-03-01  
**Status:** Active (pending OpenSky API reliability)

## Context

The dashboard tracks aircraft via the OpenSky Network API. Original implementation used generic colored circles. Required upgrade to proper airplane silhouettes with heading rotation and interactive popups.

## Implementation

### Airplane Icon
- Custom SDF (Signed Distance Field) airplane icon drawn on Canvas
- Points upward (north = 0°), rotated by actual `heading` from ADS-B data
- Used as MapLibre symbol layer icon: `map.addImage('airplane-icon', imageData, { sdf: true })`
- SDF mode allows dynamic color tinting from layer paint properties

### Color Classification
| Type | Color | Examples |
|---|---|---|
| Military | Red `#ef4444` | KC-135, B-52, C-17, F-16 |
| SIGINT | Purple `#a855f7` | RC-135, EP-3, FORTE (RQ-4) |
| Government | Amber `#f59e0b` | SAM, EXEC, GLEX |
| Civilian | Cyan `#22d3ee` | All others |

Classification is callsign-based using prefix matching against known military designations.

### Interactive Popups
Click on flight marker → popup with:
- Callsign, country flag
- Altitude (converted meters → feet)
- Velocity (converted m/s → knots)
- Aircraft type classification
- Cursor changes to pointer on hover (`mouseenter`/`mouseleave` events)

### MapLibre Layer Configuration
```ts
type: 'symbol',
layout: {
    'icon-image': 'airplane-icon',
    'icon-size': ['match', ['get', 'type'], 'military', 0.6, 'sigint', 0.55, 0.45],
    'icon-rotate': ['get', 'heading'],
    'icon-allow-overlap': true,
}
```

## Blocker
OpenSky Network API (`https://opensky-network.org/api/states/all`) is unreliable:
- Anonymous access is heavily rate-limited
- API frequently returns 500 errors
- Need authenticated access (free registration) for stable data

## Decision
SDF airplane icons with heading rotation and color-coded classification. Popups on click.

## Consequences
- Icon quality is good but not photorealistic (silhouette only)
- Classification is heuristic (callsign-based, may misclassify)
- API reliability is the main blocker, not rendering
