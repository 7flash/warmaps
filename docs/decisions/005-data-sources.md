# ADR-005: Multi-Source Intelligence Pipeline — Data Sources & Integration

**Date:** 2026-03-01  
**Status:** Active (partial implementation)

## Context

The dashboard aggregates intelligence from multiple data sources. Each source has different strengths, data quality, and access requirements.

## Source Inventory

### Implemented ✅

| Source | Endpoint | Data Type | Geo Precision | Images | Update Cadence |
|---|---|---|---|---|---|
| **GDELT GKG** | `/api/gdelt` | Conflict events | High (Cloud Vision) | ✅ SharingImage + RelatedImages | 15 min |
| **GDELT DOC API** | `/api/gdelt` | News articles | Low (title parsing) | ✅ socialimage | ~Real-time |
| **NASA FIRMS** | `/api/fires` | Thermal anomalies | High (satellite) | ❌ (IR signatures, not photos) | 15 min |
| **OpenSky Network** | `/api/flights` | Aircraft tracks | Exact (ADS-B) | ❌ (position data only) | 10-15 sec |
| **RSS News Feeds** | `/api/news` | News articles | ❌ None | ✅ media:content/enclosure | Varies |
| **Telegram OSINT** | client-side | Channel messages | ❌ None | ✅ (when present) | Real-time |
| **Polymarket** | `/api/markets` | Prediction odds | N/A | ❌ | 30 sec |

### Planned / Evaluated 🔄

| Source | Status | Why | Blockers |
|---|---|---|---|
| **ACLED** | Mock data only | Highest-quality conflict locations, fatality counts, actor data | Requires API key (free for researchers) |
| **Liveuamap** | Not started | GeoJSON with media links, verified by human analysts | Requires paid API subscription |
| **Mapillary** | Not started | Street-level imagery for geolocation verification | Requires Facebook/Meta API access |
| **Google Cloud Vision** | Indirect (via GDELT) | Image classification, landmark recognition | We get this FOR FREE via GDELT VGKG |

## Architectural Patterns

### 1. FIRMS → Social Media Correlation (Planned)
When FIRMS detects a thermal anomaly in a known conflict zone:
1. Calculate geo-fence around thermal coordinates (1km radius)
2. Query Telegram channels for messages with media near that location
3. If match found: attach ground-level photo to the thermal marker
4. Result: IR data + optical confirmation on same map point

### 2. ACLED → Image Enrichment (Planned)
When ACLED reports a kinetic event:
1. Extract precise lat/lon + timestamp from ACLED record
2. Query social media APIs (X/Twitter, Telegram) within geo-fence + time window
3. Retrieve user-generated imagery from that location/time
4. Attach enriched imagery to the ACLED data point

### 3. Geolocation Verification Pipeline (Future)
For images without EXIF GPS data:
1. Upload to reverse geolocation service (or local ML model)
2. Cross-reference visual indicators (architecture, terrain, signs) against street-level databases
3. Assign confidence score (0-1)
4. Only forward images above threshold (e.g., 0.7) to frontend

## ACLED Integration Notes

Currently serving 7 realistic mock events from `/api/acled/route.ts`:
- Events are structured as GeoJSON FeatureCollection
- Include `sub_type`, `actor1`, `actor2`, `fatalities`, `confidence`
- Real ACLED API endpoint: `https://api.acleddata.com/acled/read/`
- Requires registration for API key (free for researchers/journalists)
- Returns CSV or JSON with lat/lon, event_type, sub_event_type, fatalities

## Decision
Multi-source architecture where each API contributes its strongest signal:
- GDELT for global event imagery (volume)
- ACLED for conflict precision (quality, when implemented)
- FIRMS for thermal anomalies (satellite intel)
- OpenSky for airspace monitoring
- Telegram/RSS for raw OSINT

## Consequences
- Each source has different failure modes (rate limits, downtime, API changes)
- Stale cache strategy applied uniformly: return last good data on failure
- Source reliability displayed in "data freshness" HUD
- ACLED and Liveuamap require API keys for production deployment
