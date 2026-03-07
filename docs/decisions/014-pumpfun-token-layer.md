# ADR-014: Pump.fun Token Layer — Conflict-Related Memecoins on Map

## Status: Implemented

## Context

War events and geopolitical crises spawn speculative memecoin activity on Pump.fun (Solana).
Tokens like "$IRAN", "$KHAMENEI", "$TRUMP_STRIKE" appear within minutes of breaking news.
Tracking these tokens geographically on the STARWAR map provides a novel intelligence signal.

## Decision

Add a real-time Pump.fun token feed layer to the STARWAR map:

1. **Data Source**: Pump.fun WebSocket API or Helius/Solana RPC indexer
2. **Filter**: Tokens matching conflict keywords (iran, khamenei, missile, war, israel, etc.)
3. **Geolocation**: Map tokens to relevant countries based on name/description keywords
4. **Visualization**: Token markers near relevant countries showing:
   - Token name + ticker
   - Market cap / bonding curve progress
   - Time since creation
   - Price chart sparkline
5. **Integration**: Reuse pattern from geeksy-pumpfun-plugin trading engine

## Marker Design

- 💰 Gold coin icon markers
- Size scales with market cap (bigger = more volume)
- Pulse animation for newly created tokens (< 5 min old)
- Click opens popup with:
  - Token details + chart
  - Link to Pump.fun page
  - "Related events" cross-reference to GDELT data

## Architecture

```
Pump.fun WebSocket → /api/pumpfun → Filter by conflict keywords
                                   → Geocode by token name
                                   → Stream to client
```

## Countries keyword mapping

```typescript
const TOKEN_GEO_KEYWORDS = {
    'IRN': ['iran', 'iranian', 'khamenei', 'tehran', 'persian', 'irgc'],
    'ISR': ['israel', 'israeli', 'netanyahu', 'idf', 'tel aviv', 'zion'],
    'RUS': ['russia', 'russian', 'putin', 'moscow', 'kremlin'],
    'UKR': ['ukraine', 'ukrainian', 'zelensky', 'kyiv', 'kiev'],
    'USA': ['trump', 'biden', 'pentagon', 'cia', 'america'],
    'CHN': ['china', 'chinese', 'beijing', 'xi jinping', 'taiwan invasion'],
    'PRK': ['north korea', 'kim jong', 'pyongyang', 'dprk'],
    // ... more mappings
};
```

## TODO

- [x] Create /api/pumpfun endpoint with WebSocket listener
- [x] Add TOKEN_GEO_KEYWORDS mapping
- [x] Add 💰 marker layer to map
- [x] Add "Tokens" tab to right panel
- [x] Cross-reference with GDELT events for correlation analysis
