# ADR-002: GDELT Visual Intelligence Pipeline — GKG Raw Files + DOC API

**Date:** 2026-03-01  
**Status:** Active  
**Supersedes:** Basic DOC API-only approach

## Context

The dashboard needs geolocated news imagery for conflict events. GDELT offers multiple access methods:

| Method | Update Cadence | Geo Precision | Image Data | Complexity |
|---|---|---|---|---|
| **DOC API** (`mode=artlist`) | ~Real-time | None (needs fallback) | `socialimage` only | Low |
| **GEO API** (`format=GeoJSON`) | ~Real-time | Cloud Vision | `shareimage` | Medium |
| **GKG Raw CSV** (15-min files) | 15 minutes | Cloud Vision V2EnhancedLocations | SharingImage + RelatedImages | High |
| **BigQuery** (`gdeltv2.cloudvision`) | ~Real-time | Full VGKG | Complete Cloud Vision labels | Very High (requires GCP) |

### Why GKG Raw Files (PRIMARY source)
- `V2EnhancedLocations`: Structured format `TYPE#FULLNAME#COUNTRYCODE#ADM1CODE#LAT#LON#FEATUREID` provides Cloud Vision-derived coordinates with much higher precision than title parsing
- `SharingImage` (col 18): The article's primary social sharing image
- `RelatedImages` (col 19): ALL images found in the article body (semicolon-separated)
- `V2EnhancedThemes` (col 8): Cloud Vision topic tags for conflict filtering (`TAX_FNCACT_KILL`, `ARMEDCONFLICT`, `WMD`, etc.)
- 15-minute update cadence is acceptable for a dashboard refreshing every 90 seconds

### Why DOC API (SECONDARY source)
- Provides article **titles** which GKG raw files do not include
- Different query semantics (keyword search vs. theme-based filtering)
- Catches articles that may not appear in the current 15-min GKG window 
- Used as fallback when GKG is unavailable

### Why NOT GEO API
- Returns only `shareimage`, not the full `RelatedImages` set
- Less control over conflict filtering (no theme tags)
- Would be redundant if we already parse GKG which has better data

### Why NOT BigQuery
- Requires Google Cloud Platform service account
- Adds billing dependency (per-query costs)
- Unnecessary for our data volume (15-min CSV is sufficient)

### ZIP Decompression: fflate
- GKG files are distributed as `.csv.zip` (PKZip format, NOT gzip)
- `fflate` chosen over `adm-zip`: 8KB pure JS, works in Bun, handles both ZIP and GZIP containers
- `Bun.gunzipSync()` not usable: ZIP ≠ GZIP (different container format)
- Native `DecompressionStream` web API only handles gzip/deflate, not ZIP containers

### Merge & Dedup Strategy
1. GKG events processed first (higher geo confidence: 0.85)
2. DOC API events processed second (title-based geo: 0.5 confidence)
3. Deduplicated by article URL
4. DOC API events enriched with `KNOWN_LOCATIONS` dictionary fallback

### KNOWN_LOCATIONS Fallback
When GKG V2EnhancedLocations is empty OR for DOC API articles, we extract locations from titles using a 55-entry dictionary of conflict zone coordinates. This is fast (no API call) but imprecise (city-level, not street-level).

## Decision
Three-source architecture: GKG Raw Files (primary, geo-precise) + DOC API (secondary, title-based) → merged and deduplicated.

## Cache Strategy
- **TTL: 90 seconds** — GKG updates every 15 min, but DOC API can return newer articles
- Stale cache returned on fetch failure
- Empty results never cached (preserve last good data)

## Consequences
- First request may take 3-5 seconds (ZIP download + decompress + parse)
- Cached responses are instant
- GKG events may lack readable titles (only source name + theme label)
- Some events will have Cloud Vision geo (VGKG), others will have dictionary geo
