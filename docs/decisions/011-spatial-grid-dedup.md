# ADR-011: Spatial Grid Deduplication for Image Markers

## Status
**Accepted** — 2026-03-01

## Context

The GDELT VGKG pipeline produces ~250 events with 97% having associated images, but the previous coordinate-based deduplication key (`lon.toFixed(1) + lat.toFixed(1) + title.slice(0,20)`) was collapsing events from the same geographic region. Many VGKG events share similar coordinates (e.g., all Iran events cluster around a few major cities) and have generic titles like `[source] KILL` or `[source] ARMEDCONFLICT` where the first 20 characters overlap. This resulted in only ~15 markers rendering from 250+ events.

## Decision

Replace coordinate+title dedup with a **spatial grid partitioning** approach:

### Algorithm
1. Divide the viewport into grid cells sized proportional to zoom level:
   ```
   cellSize = max(0.02, 5 / pow(2, zoom - 3))
   ```
   - Zoom 3 (world): ~5° cells → ~10 markers
   - Zoom 6 (continent): ~1° cells → ~40 markers  
   - Zoom 10 (city): ~0.05° cells → many markers

2. For each event, compute its cell: `floor(lon/cellSize), floor(lat/cellSize)`

3. Only allow one marker per cell (first-to-claim wins)

4. **Breaking events bypass the grid** — always rendered regardless of cell occupancy

### Sorting Priority
Events are sorted before grid assignment:
1. Breaking events first
2. VGKG events second (higher geolocation confidence)
3. DOC API events last

### Jitter
Coordinate jitter scales with cell size: `jitter = random * cellSize * 0.6`

## Consequences

### Positive
- ~45 markers rendered at global zoom (up from ~15)
- More markers appear automatically when zooming in (cells shrink)
- Breaking events always visible regardless of density
- Natural spatial distribution — no visual overlap
- VGKG events (higher quality) prioritized over DOC API events

### Negative
- Some events may be hidden by cell occupancy (acceptable trade-off)
- Markers shuffle position on each render (due to jitter randomization)

## References
- ADR-006: Image Marker Rendering Strategy
- Deck.gl spatial indexing patterns
