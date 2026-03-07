# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Telegram OSINT**~~ — ✅ Session configured with phone number in `.config.toml`. Auto-connects on startup, polling 23 OSINT channels.
- [x] ~~**Flights data**~~ — ✅ DONE. Switched primary source to ADSB.lol (free, no rate limits). OpenSky kept as fallback with exponential backoff. Added enhanced military classification (aircraft type codes + registration-based country detection).
- [x] ~~**Canvas container overflow clipping**~~ — ✅ DONE. Fixed CSS flexbox cascading limits on `.wm-container-body` and explicitly applied `min-height: 0` and `min-width: 0` along with `flex-shrink: 0` on static header components to permit proper containment scaling per widget.
- [x] ~~**Mobile canvas**~~ — ✅ DONE. Touch event handlers for single-finger pan and pinch-to-zoom. Container drag via header on touch. Layout saves on touch end.
- [x] ~~**Map zoom vs Canvas zoom conflict**~~ — ✅ DONE. Canvas wheel handler now checks if target is inside `.maplibregl-map` and skips `preventDefault()`, letting MapLibre handle its own zoom. Same for mousedown — canvas pan no longer triggers when clicking/dragging inside map widgets. Also added smart scroll passthrough for scrollable feed containers.
- [x] ~~**Image markers cluttering map**~~ — ✅ DONE. Disabled `FF.imageMarkers` by default. Streaming news images no longer float over the global map. Can be re-enabled via `window.FF.imageMarkers = true` in console.
- [x] ~~**Widget tray redesign**~~ — ✅ DONE. Complete visual overhaul: 64px height, frosted glass gradient background, pill-shaped category buttons with active state, rounded widget cards with hover lift effect, hidden scrollbar, subtle MULTI badges, premium typography.

## 🔴 Priority: Fix
- [x] ~~**Empty default canvas**~~ — ✅ DONE. First-time users got a blank canvas with no widgets. Fixed: `getDefaultInstances()` now returns a "Command Center" preset with 6 widgets (global map, news feed, Intel Slava telegram, intel panel, AI analyst, Al Jazeera TV). Existing users unaffected (their layout is in localStorage).
- [x] ~~**Feed health indicators**~~ — ✅ DONE. Green/yellow/red/gray status dots on every data widget header. `markFresh()` calls on all 12+ data fetchers. Auto-updates every 10s. Widget type → data source mapping in `WIDGET_DATA_SOURCE`.
- [x] ~~**Data freshness timestamps**~~ — ✅ DONE. "⟳ Updated 23s ago" footer bar at the bottom of every data widget. Color-coded (green=live, yellow=stale, red=dead). Auto-updates with the health dots.
- [x] ~~**Guided first-run onboarding**~~ — ✅ DONE. 3-step tooltip tour: (1) drag widgets, (2) add from tray, (3) configure with gear. Spotlight highlights target element with pulsing green border. Prev/Next navigation. Persisted to `warmaps:onboarded` in localStorage.
- [x] ~~**Performance**~~ — ✅ `page.client.tsx` split from 3400 lines → ~150-line orchestrator + 14 modules in `app/lib/` (state, utils, perf, map, data, feeds, markers, tokens, modals, panels, tv, chat, ai, betting, spotlight)
- [x] ~~**Token detail view**~~ — ✅ DONE. DexScreener live chart embed, token details, action buttons.
- [x] ~~**Mobile responsive**~~ — ✅ DONE. 4 breakpoints, bottom-sheet panels, touch targets.
- [x] ~~**ACLED data enrichment**~~ — ✅ DONE. Cross-references ACLED with GDELT.
- [x] ~~**Canvas Rewrite**~~ — ✅ DONE. Transformed from fixed map+sidebar layout into infinite canvas dashboard. 10 draggable/resizable containers. Canvas engine (`app/lib/canvas.ts`) with pan/zoom/drag/resize. Minimap with color-coded indicators. Layout persistence via localStorage.
- [x] ~~**Container collapse/minimize**~~ — ✅ DONE. Double-click container header to toggle collapse. Collapsed containers show only their title bar with a ▸ indicator. State persisted in layout.
- [x] ~~**Container z-order management**~~ — ✅ DONE. Clicking or dragging a container brings it to front. Incrementing z-index counter.
- [x] ~~**Container snap-to-grid**~~ — ✅ DONE. Hold Shift while dragging to snap to 20px grid. Grid lines shown while snapping.

## 🟢 Priority: Features
- [x] ~~**Heatmap mode**~~ — ✅ Already implemented
- [x] ~~**Timeline scrubber**~~ — ✅ DONE
- [x] ~~**Alert system**~~ — ✅ DONE
- [x] ~~**User accounts**~~ — ✅ DONE. GitHub OAuth.
- [x] ~~**Country profiles**~~ — ✅ DONE
- [x] ~~**Widget catalog**~~ — ✅ DONE. 13 widget types across 6 categories (map, feed, data, social, media, ai). ＋ button opens slide-out catalog panel with category filtering. Add/remove widgets. MULTI badge for multi-instance widgets. `app/lib/widgets.ts` registry.
- [x] ~~**Share layout links**~~ — ✅ DONE. 🔗 button encodes widget layout as base64 URL parameter, copies to clipboard. Toast notification on success.
- [x] ~~**Widget config per-instance**~~ — ✅ DONE. Each widget instance has a config panel (gears icon) to select data source, filters, and channels which instantly map to rendered datasets. Config persists to localStorage.
- [x] ~~**Saved canvas layouts**~~ — ✅ DONE. Let users save/load multiple layout presets (e.g., "Monitoring", "Trading Desk", "Analysis"). Store in localStorage. Added Top-right dropdown menu.
- [x] ~~**Container linking**~~ — ✅ DONE. Added an SVG-based linking system allowing users to drag connection lines between containers, feed items, and map points. State is persisted to localStorage.
- [x] ~~**Detachable containers**~~ — ✅ DONE. Allow containers to be "popped out" into separate browser windows for multi-monitor setups.
- [x] ~~**Widget synchronization mode**~~ — ✅ DONE. Added a lock/unlock toggle directly in the toolbar (`🔓`/`🔒`) that links the underlying MapLibre states across all initialized map widgets in the canvas simultaneously via move/zoom/pitch/bearing events.
- [x] ~~**Widget layout auto-arrange (Tiling)**~~ — ✅ DONE. Added the `▦` button to the canvas toolbar which automatically tiles overlapping container widgets side-by-side using masonry/grid sorting techniques for better visibility.
- [x] ~~**Data layer WebWorkers**~~ — ✅ DONE. `data.tsx` dynamically spins up an off-thread Blob Worker to chew through tens of thousands of features for Flights, Fires, and GDELT data mapping them into GeoJSON without blocking the compositor.

## 🟢 Priority: Next Pipeline Features
- [x] ~~**3D Terrain Rendering**~~ — ✅ DONE. Toolbar toggle (🏔️/🌋) enables MapLibre 3D terrain using official `demotiles.maplibre.org` DEM tiles. `toggle3DTerrain()` in `lib/map.tsx` applies terrain + hillshade + sky across all map instances. Separate hillshade source for render quality. 1.5x exaggeration, cinematic 60° pitch ease, auto-flatten on disable. CSS `.top-btn.active` glow state.
- [x] ~~**Data caching / Offline Mode**~~ — ✅ DONE. IndexedDB cache layer (`lib/cache.ts`) with `cachedFetch()` wrapper. Cache-first strategy: returns cached data instantly (5-11ms) on boot, then fetches fresh data in background. 30min TTL for most feeds, 15min for markets/pumpfun, 5min for flights. All 12 data sources wrapped. Stale-while-revalidate pattern. Zero dependencies.
- [x] ~~**Collaborative Dashboarding**~~ — ✅ DONE. Native Bun WebSocket sync via `/ws/sync`. Room-based pub/sub (`sync:<room>`). Broadcasts layout state (widget X/Y/size/collapsed) to all connected peers on drag/resize. Colored peer cursors with name labels. Join/leave toast notifications. Peer count badge (👥 N) on toolbar button. Auto-reconnect on disconnect. `lib/sync.ts` client module, `server.ts` /ws/sync handler. CSS: `.sync-peer-cursor`, `.sync-badge`, `.sync-toast`.

## 🟡 Priority: Deploy
- [x] ~~**Deploy canvas rewrite to production**~~ — ✅ DONE. Push latest canvas changes to `root@202.155.132.139:/opt/starwar/`. Test container dragging, minimap, and layout persistence on production.
- [x] ~~**Deploy user accounts to production**~~ — ✅ Removed. Wallet connection handles identity; GitHub auth no longer needed.

## 🟡 Priority: Improve
- [x] ~~**Intel panel categorization**~~ — ✅ DONE. Refactored intel panel from flat mixed list into 4 collapsible sections: 🚨 Threats (critical/high alerts), 📊 Predictions (market cards), 🌍 Seismic (earthquakes), 🔥 Hotspots (fires). Each section has icon + title + count badge + chevron. Color-coded accent borders (red/cyan/amber/orange). Collapse state tracked per container.
- [x] ~~**Widget tray scroll arrows**~~ — ✅ DONE. Added ‹/› arrow buttons to both category row and widget grid. Auto-show/hide based on overflow detection (scroll + resize events). Smooth 200px scroll per click. Frosted glass styling.
- [x] ~~**Map layer toggle persistence**~~ — ✅ DONE. Layer filter checkboxes save checked state to `warmaps:layers:{filterId}` in localStorage. Restored on page load with 2s delayed map layer apply.
- [x] ~~**Widget snap guidelines**~~ — ✅ DONE. Blue dashed SVG alignment guides appear when dragging a container within 8px of another container's edge (left/right/top/bottom/center). Snaps to aligned position, multiple simultaneous guides. Disabled during Shift+grid snap mode.
- [x] ~~**Performance: virtualize long feeds**~~ — ✅ DONE. Created `createVirtualFeed()` utility (`app/lib/virtual-feed.tsx`). Fixed-height items, scroll+rAF, sentinel spacers. News feed capacity 40→200, telegram 20→100. Only ~15 DOM nodes rendered at a time. Auto-engages at 20+ items; below that uses direct render. WeakMap-tracked instances for leak-free cleanup.

## 🔴 Priority: Modular Widgets Pipeline
- [x] ~~**Game-engine style widget folder**~~ — ✅ DONE. At the bottom of the screen, instead of a news feed, implement a "folder" or "tray" of boilerplate widgets that can be dragged and dropped onto the canvas.
- [x] ~~**Declutter Default Map**~~ — ✅ DONE. Removed the cluttered default map with streaming images. Map is now just a boilerplate widget.
- [x] ~~**Configurable Map Widgets**~~ — ✅ DONE. Added multi-instance support to MapLibre initialization, added layers config drop-down.
- [x] ~~**Isolated News Feed Widgets**~~ — ✅ DONE. Re-wired reRenderWidget for news to support multiple containers.
- [x] ~~**Isolated Telegram Widgets**~~ — ✅ DONE. Telegram channels split into individual widgets, configured per channel via config gear.
- [x] ~~**Widget Drag & Drop from Tray**~~ — ✅ DONE. Widgets can now be dragged from the bottom tray and dropped at any position on the canvas. Screen-to-canvas coordinate conversion for accurate placement.
- [x] ~~**Widget Right-Click Context Menu**~~ — ✅ DONE. Right-click on any widget shows glassmorphism popup: Configure, Duplicate, Detach to Window, Remove. Menu auto-repositions to stay in viewport.

## 🟢 Priority: Intelligence Pipeline (March 2026)
- [x] ~~**Telegram channel health check**~~ — ✅ DONE. Audited all 22 OSINT channels, updated 8 stale usernames, removed 3 dead channels, added verified alternatives.
- [x] ~~**Geolocation database expansion**~~ — ✅ DONE. Expanded KNOWN_LOCATIONS from 28 → 95 across 10 theaters: Iran (14), Israel/Palestine (16), Lebanon (7), Syria (8), Iraq (6), Ukraine (17), Russia (5), Yemen/Red Sea (7), Sudan (3), Libya (2), East Asia (4).
- [x] ~~**Equipment type detection**~~ — ✅ DONE. New `extractEquipment()` function identifies military hardware in OSINT alerts: air-defense, missile, drone, aircraft, helicopter, naval, armor, artillery, infantry-weapon. 8 regex pattern groups covering 80+ weapon systems.
- [x] ~~**Enhanced threat classification**~~ — ✅ DONE. Improved `classifyThreat()` with contextual regex (e.g. "missile hit" not just "missile", "drone strike" not just "drone"). Reduced false positives on medium-level alerts.
- [x] ~~**Telegram alerts on map**~~ — ✅ DONE. Full pipeline: channel → extractLocation() → GeoJSON features → MapLibre markers. Color-coded by threat level (red=critical, amber=high, cyan=default). Hover popup shows channel, equipment badge, and alert text. Previously alerts with locations were extracted but never rendered.
- [x] ~~**Equipment badges in feed**~~ — ✅ DONE. Telegram feed items now show styled equipment type badges (🚀 MISSILE, 🛡️ AIR-DEFENSE, 🤖 DRONE, etc.) alongside threat level badges.
- [x] ~~**Telegram auto-reconnect**~~ — ✅ DONE. Server auto-restores Telegram session on boot via `TG_APP_ID`, `TG_APP_HASH`, `TG_PHONE` env vars. Session file on production.
- [x] ~~**galaxydraw npm migration**~~ — ✅ DONE. Published `galaxydraw@0.1.0` to npm (31KB, zero deps). Switched starwar dependency from fragile `file:` path to npm package.
- [x] ~~**AI analyst Telegram context**~~ — ✅ DONE. `gatherLiveContext()` in `ai.tsx` now feeds latest 15 Telegram alerts (with locations, equipment, threat levels) to the Gemini AI. Updated system prompt to reference Telegram OSINT, equipment identification, and 22 monitored channels.
- [x] ~~**Keyboard shortcuts**~~ — ✅ DONE. `F`=fit, `A`=arrange, `R`=reset zoom, `0`=origin, `?`=help overlay, `Esc`=close all. Glassmorphism help panel. Disabled when typing in inputs.
- [x] ~~**Command palette (Ctrl+K)**~~ — ✅ DONE. VS Code-style command palette with fuzzy search. 15 commands: 4 canvas controls + 10 conflict zone fly-to locations + help. Arrow/Enter navigation. Auto-focus search input.
- [x] ~~**Spotlight auto-camera OSINT**~~ — ✅ DONE. `cycleSpotlight()` now interleaves Telegram OSINT alerts with GDELT events. Critical/high threats prioritized (60% camera time). Equipment type shown in data flash. Threat-colored emoji prefix.
- [x] ~~**Breaking news ticker OSINT**~~ — ✅ DONE. Telegram critical/high alerts appear first in ticker as `[OSINT] channel: text [EQUIPMENT]`. Stats bar shows `telegram-count`. Freshness indicator includes telegram source.
- [x] ~~**.gitignore security fix**~~ — ✅ DONE. Removed dangerous blanket ignores (`docs/`, `*.txt`). Recovered 8 hidden ADR docs. Fixed `_.log` → `*.log`. Added explicit secret patterns.
- [x] ~~**PWA installable**~~ — ✅ DONE. Web App Manifest at `/api/manifest.json`. Standalone display, theme-color, apple-mobile-web-app-capable. Installable on mobile and desktop.
- [x] ~~**SEO suite**~~ — ✅ DONE. `robots.txt`, `sitemap.xml`, JSON-LD (WebApplication schema), canonical URL, OG/Twitter social cards with banner image via `/api/og-image`.
- [x] ~~**Health endpoint**~~ — ✅ DONE. `/api/health` returns uptime, memory (RSS/heap), Telegram status, channel count, alert count, version. For uptime monitoring.
- [x] ~~**Cinematic boot sequence**~~ — ✅ DONE. Terminal-style animated status lines: canvas → MapLibre → OSINT → data feeds → AI → ready. Each line slides in, flips ▸→✓ with green color. Progress bar fills in sync. Once per session.
- [x] ~~**Shortcut discovery badges**~~ — ✅ DONE. Tiny green `F`/`A` badges on toolbar buttons. Hidden by default, fade in on hover. `.shortcut-badge` CSS class reusable.
- [x] ~~**SVG favicon**~~ — ✅ DONE. Inline SVG green ◆ diamond on dark background. Zero external files. Matches WARMAPS branding.
- [x] ~~**Command palette extraction**~~ — ✅ DONE. Extracted `command-palette.ts` (131 lines) from `warmaps-canvas.ts` (966→718 lines). Dependency injection via `registerCanvasActions()`. Clean module boundary.
- [x] ~~**TypeScript zero errors**~~ — ✅ DONE. Fixed 18 errors across 4 packages: measure-fn@3.10.0, melina@2.3.2, jsx-ai@0.1.1, sqlite-zod-orm@3.26.1. All published to npm. `npx tsc --noEmit` = clean.
- [x] ~~**Global error boundary**~~ — ✅ DONE. `window.error` + `unhandledrejection` listeners show a styled crash overlay (bottom-right toast) with error message, Reload and Dismiss buttons. Prevents blank white screen on uncaught exceptions.
- [x] ~~**Command palette expansion**~~ — ✅ DONE. Expanded from 10 to 19 conflict zones: added World Overview, Myanmar, Ethiopia, Sahel, Libya, DR Congo, South China Sea, Somalia, Afghanistan. Added 🔧 Utilities category with Clear Session Cache.
- [x] ~~**Cross-repo type health**~~ — ✅ DONE. Achieved zero TypeScript errors across all 7 repos (543 total errors fixed): starwar, galaxy-canvas, bgr, melina.js, ments-utils, jsx-ai, geeksy-pumpfun-plugin.

## 🔴 Priority: Fix
- [ ] **DNS warmaps.org** — A record still points to Squarespace. Needs registrar login to set A → `202.155.132.139`.
- [x] ~~**Telegram auto-reconnect on deploy**~~ — ✅ DONE. Added heartbeat that checks connection every 5m via `getMe()`, auto-reconnects if session drops. Deployed to production.

## 🟡 Priority: Improve
- [x] ~~**Container resize extraction**~~ — ✅ DONE. Extracted the 40-line resize logic from warmaps-canvas.ts into `container-resize.ts` for consistency with other extracted modules.
- [x] ~~**E2E browser tests**~~ — ✅ DONE. Added Playwright tests for critical user flows, aligned with accurate WARMAPS canvas DOM locators.
- [x] ~~**Performance monitoring**~~ — ✅ DONE. Added a `/api/metrics` endpoint exposing response times per route, active WebSocket connections, and Telegram feed health as Prometheus-compatible metrics.
- [x] ~~**Melina compiled output**~~ — ✅ DONE. Published `melina@2.3.5` with `.d.ts` declarations so downstream consumers (gxai) don't get 45 node_modules type errors from raw `.ts` source.
- [x] ~~**Global Search Hotkey**~~ — ✅ DONE. Added `/` as an alternative hotkey for the Command Palette (like GitHub). Updated `keyboard-shortcuts.ts` and the help overlay to reflect this new hotkey.
- [x] ~~**Debounce Canvas State Save**~~ — ✅ Already handled. Canvas state save uses `cancelAnimationFrame`/`requestAnimationFrame` debounce in the `subscribe` callback. `saveLayout()` only fires on drag-end, resize-end, collapse, and auto-arrange — not per-frame.
- [x] ~~**Widget Config UI Polish**~~ — ✅ DONE. Unified all container header action buttons (.wm-c-actions) with glassmorphism hover effects: green (gear), red (remove), cyan (detach), amber (export), purple (link). backdrop-filter blur(12px), inset glow box-shadows, scale bounce on active.
- [x] ~~**Invalid LngLat runtime error**~~ — ✅ DONE. Added `isValidCoord()` guard to all GeoJSON coordinate builder paths (GDELT, markets, telegram, seismic, webcams, flights, fires). Filters out lat/lon outside MapLibre's accepted range.
- [ ] **VirtualFeed renderSlice TypeError** — "Cannot set properties of undefined (setting 'height')" in `createVirtualFeed` → `renderSlice` during news/GDELT feed rendering. Likely a race condition where the feed container is destroyed before the rAF render callback fires.

## 🟢 Priority: Features
- [x] ~~**Widget templates**~~ — ✅ DONE. Let users save a container's config as a reusable template via the '⭐ Save Template' gear button. Stores config payload in localStorage `warmaps:templates`. Renders dynamically within the '⭐ Saved' and 'All' views in the widget tray catalog with a custom ⭐ badge filter.
- [x] ~~**Multi-user cursor colors**~~ — ✅ DONE. When collaborative dashboarding is active, peers are assigned a unique color from the static curated `SYNC_COLORS` palette in `server.ts` rather than random generation.
- [x] ~~**Data export**~~ — ✅ DONE. Added a 📥 export button in the `.wm-c-actions` container header bar. Downloads a JSON file injected with the resolved state array (gdeltEvents, firePoints, marketData, flightData, telegramAlerts, etc.) directly mapped by its `widgetType`.

## 📝 Architecture Notes
- **Production**: `root@202.155.132.139:/opt/starwar/`
- **Deploy**: `git push && ssh pull + restart bun server`
- **HTTPS**: Caddy reverse proxy on port 443 → localhost:4444
- **TypeScript**: Zero errors (`npx tsc --noEmit` = clean)
- **Tests**: 59 passing (db integration + canvas modules + API endpoints). CI via GitHub Actions.
- **Map**: MapLibre GL with GeoJSON sources (fires, flights, events, assets, acled, webcams, seismic, crypto, telegram)
- **Canvas engine**: `app/lib/warmaps-canvas.ts` (328 lines) — GalaxyDraw adapter + thin orchestrator.
- **Container drag**: `app/lib/container-drag.ts` (~145 lines) — Mouse + touch drag with DragContext interface.
- **Canvas layout**: `app/lib/canvas-layout.ts` (~180 lines) — Minimap, fit-all, auto-arrange, bounds helpers.
- **Keyboard shortcuts**: `app/lib/keyboard-shortcuts.ts` (~136 lines) — Extracted with dependency injection.
- **Snap guidelines**: `app/lib/snap-guidelines.ts` (~120 lines) — SVG alignment guides for container dragging.
- **Command palette**: `app/lib/command-palette.ts` (~165 lines) — Ctrl+K launcher with 19 conflict zones, canvas commands, utilities.
- **Telegram OSINT**: `src/telegram.ts` — 22 channels, 95 location patterns, 8 equipment categories, auto-reconnect.
- **Widget system**: `app/lib/widgets.ts` — 13 widget types, instance management, share link encoding
- **Client**: `app/page.client.tsx` → thin orchestrator importing 17 modules from `app/lib/`
- **API routes**: `/api/gdelt`, `/api/acled`, `/api/fires`, `/api/flights`, `/api/telegram/*`, `/api/mm`, `/api/bet`, `/api/image-proxy`, `/api/swap`, `/api/health`, `/api/manifest.json`, `/api/robots.txt`, `/api/sitemap.xml`, `/api/og-image`, `/api/ping`
- **AI Chat**: Gemini streaming via `/api/ai`
- **Betting**: Native SOL wagers via Phantom wallet
- **Trading**: Native pump.fun token swaps via Phantom wallet (`/api/swap` + PumpSwap SDK)

## ⚠️ Security Reminders
- **NO wallet data on public site** — MM panel removed, `/api/mm` returns `running: false`
- **Commit messages**: Never mention wallets, MM, security fixes in public commit messages
- Git history was squashed to remove incriminating messages (force-pushed)
- `.config.toml` and `mm_state*.json` are gitignored
