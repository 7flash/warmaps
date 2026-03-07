# ADR-010: Country Flag-Colored Territory Fills

## Status
**Accepted** — 2026-03-01

## Context

The STARWAR dashboard used Carto Dark Matter as its base map style—an intentionally subdued, near-black cartographic base ideal for overlaying bright tactical data. However, at the global zoom level, the map appeared visually monotonous: all countries were the same dark grey shade, making it difficult to instantly identify geographic regions and diminishing the visual impact of the dashboard.

The user specifically requested making the map "more bright and colorful like covered in texture of flag each country territory." This aligns with the DeepStateMap paradigm, where territorial control is communicated through color-coded polygons.

### Options Considered

1. **Full flag texture overlays** — Using actual flag images as fill-pattern textures via MapLibre's `fill-pattern` paint property. This would produce stunning visuals but requires preparing ~200 flag tile images and managing WebGL texture atlas memory.

2. **Dominant flag color fills** — Using the single most representative color from each nation's flag as a semi-transparent `fill-color`. Lightweight, data-driven, and achievable with a simple lookup table.

3. **Geopolitical classification fills** — Coloring countries by alliance blocks (NATO blue, BRICS red, etc.) or conflict status rather than national identity.

4. **Custom vector tile style** — Modifying the Carto Dark Matter style JSON directly to include country fills in the base tileset.

## Decision

**Option 2: Dominant flag color fills** at very low opacity (12%) with matched border lines at 25% opacity.

### Implementation
- **Data Source**: Natural Earth `countries-110m.json` TopoJSON from `world-atlas@2` CDN (~900KB simplified boundaries)
- **Conversion**: Inline TopoJSON→GeoJSON decoder (no external library dependency)
- **Color Mapping**: 60+ manually curated ISO3→hex color mappings covering all major geopolitical actors
- **ID Resolution**: Numeric country ID → ISO3 lookup table for the Natural Earth dataset
- **Layer Ordering**: Inserted below all data layers (`fires-heat`) so country fills serve as backdrop, not foreground

### Visual Parameters
```
fill-opacity: 0.12  — subtle tint, not overwhelming
line-width: 0.8     — thin but visible borders
line-opacity: 0.25  — slightly more visible than fills
```

### Color Selection Rationale
Colors were selected as the **most distinctive single color** from each flag:
- Iran 🇮🇷 → Green (#00a651)
- Turkey 🇹🇷 → Red (#e30a17)
- Ukraine 🇺🇦 → Blue (#0057b7)
- Russia 🇷🇺 → Red (#d52b1e)
- USA 🇺🇸 → Navy (#3c3b6e)
- China 🇨🇳 → Red (#de2910)
- India 🇮🇳 → Saffron (#ff9933)
- Germany 🇩🇪 → Gold (#ffcc00)
- Countries without explicit mapping → Slate (#334155)

## Consequences

### Positive
- **Instant geographic orientation** — Users can immediately identify countries by their flag-representative color
- **Visual richness** — The map feels alive and colorful instead of uniformly dark
- **Geopolitical context** — Color boundaries create implicit understanding of national territories
- **Zero performance impact** — Single GeoJSON source with simple fill/line layers, rendered efficiently by MapLibre's WebGL pipeline
- **Maintains tactical aesthetic** — 12% opacity preserves the dark operations feel while adding color

### Negative
- **CDN dependency** — Relies on jsdelivr CDN for country boundaries; should be self-hosted in production
- **Simplified boundaries** — 110m resolution means small island nations and coastal details are approximate
- **Static colors** — No dynamic conflict-status coloring (future enhancement with territory control polygons)
- **Cultural sensitivity** — Flag colors are inherently political; neutral classification might be preferred in some contexts

### Future Evolution
1. **Territory control polygons** — Overlay DeepStateMap-style control zones (liberated, occupied, disputed) with distinct hatching patterns
2. **Conflict zone highlighting** — Increase opacity for countries with active ACLED events
3. **Flag texture fills** — Upgrade to actual flag pattern fills using `fill-pattern` when Deck.gl migration provides texture atlas management
4. **Dynamic geopolitical coloring** — Color countries by alliance, sanctions status, or threat level based on real-time data

## References
- DeepStateMap.Live territorial control visualization methodology
- Natural Earth country boundaries dataset (public domain)
- MapLibre GL JS fill/line layer documentation
- world-atlas npm package for TopoJSON country data
