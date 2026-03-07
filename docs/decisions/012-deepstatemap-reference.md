# ADR-012: DeepStateMap Architecture Reference

## Status
**Noted** — 2026-03-01 (Reference architecture, not yet fully implemented)

## Context

DeepStateMap.Live is the gold standard for conflict mapping platforms. Created on February 24, 2022 (day of full-scale invasion) by Roman Pogorely and Ruslan Mikula through the Deep State UA volunteer organization, it provides daily updates on frontline movements, military unit positions, and territory control. Analyzed as a reference architecture for STARWAR.

## Key Architectural Patterns (from analysis)

### 1. Territory Control Polygons
- **Semantic zones**: Liberated (last 2 weeks), fully liberated, disputed/grey zones, occupied
- **Data format**: GeoJSON/WKT polygons with daily/hourly snapshots
- **Historical API**: `https://deepstatemap.live/api/history/` serves archived snapshots
- **Metadata**: Centroid coordinates, area calculations, status tags (e.g., `name: 'Окуповано /// Occupied'`)

### 2. Real-Time Environmental Data Integration
- **NASA FIRMS** thermal anomalies correlated with artillery reports
- **Artillery range projections** (HIMARS, M777, CAESAR ranges) projected as circles on map
- Direct visual correlation between thermal signatures and kinetic events

### 3. Multi-Layer GIS Architecture
- Static layers: HQs, airfields, fleet positions
- Dynamic layers: Current tactical attack vectors
- Environmental: FIRMS fire points
- Temporal: Historical frontline progression

### 4. Performance Architecture
- **WebGL rendering** for 100K+ points without frame drops
- **Vector tiles** (.mbtiles) via Mapbox tippecanoe for geometry simplification
- Client-side style changes without server round-trips
- Support for 3D terrain (line-of-sight analysis)

### 5. Data Pipeline
- External analysts scrape via Python (geopandas, shapely)
- Historical archive essential for temporal analysis
- ~100 volunteers maintaining data quality
- Originally started as Telegram news channel (2021)

## Applicability to STARWAR

### Already Implemented
- ✅ MapLibre GL JS (WebGL rendering)
- ✅ GeoJSON sources for events, fires, flights
- ✅ FIRMS thermal anomaly integration
- ✅ Real-time data refresh (60-second GDELT updates)
- ✅ Country territory fills (ADR-010)

### Planned for Implementation
- 🔲 Territory control polygons (disputed/controlled zones)
- 🔲 Historical snapshot archive API
- 🔲 Tippecanoe vector tile optimization for large datasets
- 🔲 3D terrain for line-of-sight analysis
- 🔲 Artillery/weapon range projection circles
- 🔲 Fill-pattern hatching for disputed territories
- 🔲 Offline caching (PWA support)

### Adaptation for Iran Theater
Unlike Ukraine's conventional frontline warfare, Iran theater requires:
- **Protest mapping**: Nationwide civil demonstrations vs. frontline positions
- **Internet shutdown tracking**: ISP connectivity monitoring
- **Proxy network mapping**: Transnational militia movements (Hezbollah, Houthis, PMF)
- **Cross-border strike vectors**: Covert military operations across borders
- **IRGC deployment tracking**: Republican Guard position monitoring

## Consequences

This ADR serves as a roadmap. The DeepStateMap patterns will be progressively implemented as the platform scales from Phase 1 (MapLibre + DOM markers) to Phase 2 (Deck.gl + WebGL).

## References
- DeepStateMap.Live platform analysis
- Deep State UA volunteer organization
- GeoJSON/TopoJSON standards
- Mapbox tippecanoe for vector tile generation
- NASA FIRMS API documentation
