# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Telegram OSINT**~~ — ✅ Session configured with phone number in `.config.toml`. Auto-connects on startup, polling 23 OSINT channels.
- [x] ~~**Flights data**~~ — ✅ DONE. Switched primary source to ADSB.lol (free, no rate limits). OpenSky kept as fallback with exponential backoff. Added enhanced military classification (aircraft type codes + registration-based country detection).
- [x] ~~**Canvas container overflow clipping**~~ — ✅ DONE. Fixed CSS flexbox cascading limits on `.wm-container-body` and explicitly applied `min-height: 0` and `min-width: 0` along with `flex-shrink: 0` on static header components to permit proper containment scaling per widget.
- [x] ~~**Mobile canvas**~~ — ✅ DONE. Touch event handlers for single-finger pan and pinch-to-zoom. Container drag via header on touch. Layout saves on touch end.
- [x] ~~**Map zoom vs Canvas zoom conflict**~~ — ✅ DONE. Canvas wheel handler now checks if target is inside `.maplibregl-map` and skips `preventDefault()`, letting MapLibre handle its own zoom. Same for mousedown — canvas pan no longer triggers when clicking/dragging inside map widgets. Also added smart scroll passthrough for scrollable feed containers.
- [x] ~~**Image markers cluttering map**~~ — ✅ DONE. Disabled `FF.imageMarkers` by default. Streaming news images no longer float over the global map. Can be re-enabled via `window.FF.imageMarkers = true` in console.
- [x] ~~**Widget tray redesign**~~ — ✅ DONE. Complete visual overhaul: 64px height, frosted glass gradient background, pill-shaped category buttons with active state, rounded widget cards with hover lift effect, hidden scrollbar, subtle MULTI badges, premium typography.

## 🟡 Priority: Improve
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

## 🔴 Priority: Modular Widgets Pipeline
- [x] ~~**Game-engine style widget folder**~~ — ✅ DONE. At the bottom of the screen, instead of a news feed, implement a "folder" or "tray" of boilerplate widgets that can be dragged and dropped onto the canvas.
- [x] ~~**Declutter Default Map**~~ — ✅ DONE. Removed the cluttered default map with streaming images. Map is now just a boilerplate widget.
- [x] ~~**Configurable Map Widgets**~~ — ✅ DONE. Added multi-instance support to MapLibre initialization, added layers config drop-down.
- [x] ~~**Isolated News Feed Widgets**~~ — ✅ DONE. Re-wired reRenderWidget for news to support multiple containers.
- [x] ~~**Isolated Telegram Widgets**~~ — ✅ DONE. Telegram channels split into individual widgets, configured per channel via config gear.
- [x] ~~**Widget Drag & Drop from Tray**~~ — ✅ DONE. Widgets can now be dragged from the bottom tray and dropped at any position on the canvas. Screen-to-canvas coordinate conversion for accurate placement.
- [x] ~~**Widget Right-Click Context Menu**~~ — ✅ DONE. Right-click on any widget shows glassmorphism popup: Configure, Duplicate, Detach to Window, Remove. Menu auto-repositions to stay in viewport.

## 📝 Architecture Notes
- **Production**: `root@202.155.132.139:/opt/starwar/`
- **Deploy**: `git push && ssh pull + restart bun server`
- **HTTPS**: Caddy reverse proxy on port 443 → localhost:4444
- **Map**: MapLibre GL with GeoJSON sources (fires, flights, events, assets, acled, webcams, seismic, crypto)
- **Canvas engine**: `app/lib/canvas.ts` — pan/zoom/drag/resize/minimap/persistence/snap-grid/touch
- **Widget system**: `app/lib/widgets.ts` — 13 widget types, instance management, share link encoding
- **Client**: `app/page.client.tsx` → thin orchestrator importing 16 modules from `app/lib/` (state, utils, perf, map, data, feeds, markers, tokens, modals, panels, tv, chat, ai, betting, spotlight, canvas, widgets)
- **API routes**: `/api/gdelt`, `/api/acled`, `/api/fires`, `/api/flights`, `/api/telegram/*`, `/api/mm`, `/api/bet`, `/api/image-proxy`
- **AI Chat**: Gemini streaming via `/api/ai`
- **Betting**: Native SOL wagers via Phantom wallet
- **Trading**: Native pump.fun token swaps via Phantom wallet (`/api/swap` + PumpSwap SDK)

## ⚠️ Security Reminders
- **NO wallet data on public site** — MM panel removed, `/api/mm` returns `running: false`
- **Commit messages**: Never mention wallets, MM, security fixes in public commit messages
- Git history was squashed to remove incriminating messages (force-pushed)
- `.config.toml` and `mm_state*.json` are gitignored
