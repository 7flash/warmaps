# ADR-007: UI Architecture — Right-Side Tabbed Interface

**Date:** 2026-03-01  
**Status:** Active  
**Supersedes:** Dual-panel layout (left + right panels)

## Context

The original dashboard had panels on both left and right sides of the map. This occluded too much of the map area and created a cluttered, difficult-to-read interface. Users couldn't see image markers behind overlapping panels.

## Decision

All panels consolidated into a single tabbed interface on the RIGHT side:

| Tab | Icon | Content |
|---|---|---|
| PULSE | 📡 | News feed (RSS sources) with urgency badges |
| INTEL | 🎯 | Threat radar + Polymarket predictions + Panic Economy chart |
| SIGNAL | 💬 | Telegram OSINT feed (full-height scroll) |
| LIVE | 📺 | Live TV stream embeds |
| DATA | 📊 | Event stats, data feed freshness indicators |
| LAYERS | 🗺️ | Map layer toggles (events, fires, flights) |

### Tab Bar Design
- Vertical tab bar pinned to far-right edge of viewport
- Emoji icons for instant recognition
- Active tab highlighted with accent color
- Only one panel open at a time (clicking a tab closes others)
- Clicking active tab closes all panels (map goes full-width)

### Panel Design
- Glassmorphic floating panels with `backdrop-filter: blur()`
- `position: fixed` with right offset
- Fixed height with overflow scroll
- Panel close button (×) in top-right corner

## Why NOT Left Panel
- Map is the primary interface — must maximize visible area
- Left panel competed with right panel for attention
- Narrowing the map from both sides made markers unreadable
- Single-side panel provides clean cognitive flow: map → detail

## Consequences
- All content accessible but only one panel at a time (deliberate constraint)
- Map now occupies full viewport width when no panel is open
- Mobile: tab bar may need horizontal layout at bottom (not yet implemented)
- Telegram feed now has full panel height (removed `feed-list--short` class)
