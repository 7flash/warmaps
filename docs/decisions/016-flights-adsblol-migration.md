# ADR-016: Switch Flight Data Source from OpenSky to ADSB.lol

## Status
**Accepted** — 2026-03-03

## Context
The WARMAPS flights layer displays real-time aircraft positions over the Middle East (lat 20-42, lon 25-65). We were using **OpenSky Network** as the sole data source.

OpenSky's free tier aggressively rate-limits: anonymous requests are capped at 1 req/10s, and even with backoff (60s → 300s), we were consistently hitting 429 errors. The flights layer was frequently empty for users, degrading the experience.

## Options Evaluated

| Source | Rate Limits | Coverage | Data Richness | Cost |
|--------|------------|----------|---------------|------|
| **OpenSky Network** | 1 req/10s anonymous, 1 req/5s authenticated | Good, academic network | Callsign, lat/lon, alt, speed, heading | Free |
| **ADSB.lol** | No hard limits, community-policed | Global, community-sourced | Callsign + aircraft type, registration, squawk, IAS/TAS, roll, track rate | Free |
| **ADS-B Exchange** | Paid API ($10/mo personal) | Excellent, largest network | Full readsb data | Paid |
| **Airplanes.live** | Free but shifting toward feeder-only | Good | Similar to ADSB.lol | Free (for now) |
| **FlightAware Firehose** | Enterprise-grade | Best | Full flight plan + ATC | Expensive |
| **Aviationstack** | 100 req/month free | Good | Flight status, airports | Freemium |

## Decision
**ADSB.lol as primary, OpenSky as fallback.**

Reasons:
1. **No rate limits** — ADSB.lol doesn't enforce hard rate limits for reasonable usage. We can refresh every 15s vs 60-300s with OpenSky.
2. **Richer data** — includes aircraft type code (`t`: B738, F16, C130), registration (`r`: N12345), and ICAO category. This enables better military classification.
3. **Same format quality** — JSON API, center-point + radius query (`/v2/lat/31/lon/45/dist/1500`), well-documented.
4. **Free and community-driven** — no API key required for basic use.
5. **OpenSky kept as fallback** — if ADSB.lol goes down, we seamlessly fall back to OpenSky with its existing backoff logic.

## Consequences

### Positive
- Flights layer refreshes 4-20x faster (15s vs 60-300s)
- Military aircraft detection dramatically improved (aircraft type codes like F16, C130, MQ9 instead of callsign-only heuristics)
- Country detection from registration prefix (40+ countries supported)
- No more empty flights layer from 429 errors

### Negative/Risks
- ADSB.lol is community-run — could change terms or require API keys in the future
- ADSB.lol radius query returns aircraft outside our bounding box (we filter to lat 20-42, lon 25-65 client-side)
- Data staleness: community feeders may have gaps in remote areas — OpenSky's academic network may have better coverage in some regions

### Migration Notes
- Response format changed: OpenSky uses position arrays (`state[5]` = lon), ADSB.lol uses named fields (`ac[].lon`)
- Altitude in ADSB.lol is feet (converted to meters for consistency)
- Speed in ADSB.lol is knots ground speed (converted to m/s)
- The `/api/flights` route abstracts this — client-side code unchanged
