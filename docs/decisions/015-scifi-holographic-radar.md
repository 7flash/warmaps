# ADR-015: Sci-Fi Holographic Radar Map — Advanced Visual Design

## Status: In Progress (Partially Implemented)

## Context

The STARWAR map should feel like a futuristic military C4ISR display, not a standard dark-mode web map. The aesthetic reference is drawn from:
- Arwes (sci-fi UI framework)
- Military tactical displays (CRT radar screens)
- Holographic projection effects

## Current Implementation

What's already working:
- ✅ Vivid country fills (conflict-specific color assignments)
- ✅ Neon event markers with cluster counting
- ✅ Dark base map (Stadia Dark style)
- ✅ Gold 💰 token markers for Pump.fun conflict memecoins
- ✅ Radar ping animations on new events
- ✅ Auto-cycling conflict spotlight
- ✅ Real-time data flash notifications
- ✅ Breaking news ticker

## Target Design (from reference doc)

### 1. GPU-Accelerated Custom Map Style
- **Water**: Deep black (#000000)
- **Land**: Desaturated dark grey
- **Borders**: Neon cyan/purple/green thin lines with glow
- **Roads**: Minimal — only major routes, in dim cyan
- **POI**: Removed — no commercial noise
- **Labels**: Monospace font, holographic color scheme

### 2. WebGL Shader Effects
- **Scanline overlay**: Horizontal lines at ~2px intervals, subtle opacity
- **CRT flicker**: Slight random brightness variation per frame
- **Pulsing sectors**: Areas under active conflict glow/pulse
- **Emissive borders**: Disputed territories glow brighter

### 3. 3D Extrusion
- Building height extrusion for urban combat zones
- Terrain elevation for mountainous regions
- Height data from building properties

### 4. Three.js Integration (Future)
- 3D models for ships, air defense systems
- Positioned at real-world coordinates
- Volumetric rendering for missile trajectories

## OSINT Data Sources

| Source | Status | Type | Update Cadence |
|--------|--------|------|----------------|
| GDELT GKG | ✅ Active | Events + Images | 15 min |
| GDELT DOC API | ✅ Active | Article search | Real-time |
| ACLED | ✅ Active | Verified conflicts | Daily |
| NASA FIRMS | ✅ Active | Satellite fires | 6 hours |
| Pump.fun/DexScreener | ✅ Active | Conflict memecoins | 2 min |
| Webcams | ✅ Active | Live video feeds | On demand |
| YouTube Live | ✅ Active | Breaking news | On demand |
| Liveuamap | ❌ Planned | Real-time mapping | ~1 min (paid $150/mo) |
| BigQuery GDELT | ❌ Planned | Historical analysis | Batch query |
| Telegram OSINT | 🔄 Partial | Channel monitoring | Real-time |

## Implementation Plan

### Phase 1: Map Style (Current)
- Switch to custom Mapbox style or apply runtime style mutations
- Override water/land/road/label layers programmatically

### Phase 2: Shader Effects
- Add CSS overlay for scanlines (simpler than WebGL initially)
- Consider canvas-based CRT effect post-processing
- Implement sector pulsing via layer opacity animation

### Phase 3: 3D Features
- Enable building extrusions in conflict cities
- Add terrain hillshading
- Integrate Three.js for volumetric effects

## Technical Notes

- MapLibre GL JS provides WebGL access similar to Mapbox GL JS
- Custom shaders can be added via `map.on('render')` + canvas manipulation
- Three.js can overlay on the same WebGL context or a separate canvas
- Runtime style API: `map.setPaintProperty()`, `map.setLayoutProperty()`
