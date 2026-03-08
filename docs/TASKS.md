# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Empty State Handling**~~ — ✅ DONE. `perf.tsx` now tracks consecutive failed pings to the `/api/ping` endpoint every 5 seconds. If the backend drops (2 fails), it gracefully captures the screen with a frosted glass full-screen `CONNECTION LOST` boundary overlay, which dissipates once the connection restores.
- [x] ~~**Canvas event passthrough broken**~~ — ✅ DONE. Map zoom triggered canvas zoom, feed scroll didn't work. Root cause: GalaxyDraw engine's `consumesWheel`/`consumesMouse` only looked for `.gd-card` elements, but WARMAPS containers are `.wm-container`. Fix: (1) engine now also checks `[data-card-type]` attribute, (2) warmaps-canvas.ts stamps `data-card-type` on containers. Published `galaxydraw@0.2.0` and deployed.
- [x] ~~**SEO references wrong domain**~~ — ✅ DONE. All OG/Twitter/canonical/sitemap/robots.txt references changed from `warmaps.live` → `warmaps.xyz`.
- [x] ~~**Telegram verification code**~~ — ✅ DONE. AUTH_KEY_DUPLICATED resolved. Reconnect API added at `POST /api/telegram/connect` with `{retry:true}`. Added click handlers on the Telegram status bar to open prompts for verification code and 2FA password, posting to `/api/telegram/verify` and `/api/telegram/password`.

## 🟡 Priority: Improve
- [x] ~~**Widget Resize Polish**~~ — ✅ DONE. Resizing a widget previously required hovering an invisible bounding box. Increased hit area and set `.wm-resize-handle` to uniformly render at 0.5 opacity with a bright 0.8 green chevron that scales up identically alongside full opacity on hover.
- [x] ~~**MapLibre Layers Control**~~ — ✅ DONE. Extracted the dropdown layer config from the global map widget into its own dedicated `layer-control` widget block. Added a new rendering loop in `feeds.tsx` that spawns dual-bound HTML5 range sliders, allowing discrete 0-100 opacity control directly against the underlying `mapInstances` paint properties (heatmap, symbol, and circle opacities) while maintaining live updates without blocking the UI.
- [x] ~~**Consolidate domain choice**~~ — ✅ DONE. `warmaps.xyz` is the established canonical domain. Confirmed no remaining references to `.org` or `.live` in the codebase.
- [x] ~~**Heap exceeding allocation**~~ — ✅ DONE. Added `--smol` flag to `package.json` scripts (`npm start` and `npm run dev`) to enforce a lower memory heap limit.
- [x] ~~**TASKS.md was 140 lines**~~ — ✅ DONE. Legacy tasks archived.

## 🟢 Priority: Features
- [x] ~~**On-chain Geo-Pin Chat**~~ — ✅ DONE. Right-click map → "Post Geo-Pin ⛓️" prompts for a message, signs a Solana Memo transaction via Phantom, records the pin on the server, and renders it as a 💬 marker with hover tooltip showing sender (truncated pubkey), message, timestamp, and solscan tx link. Server API at `/api/geo-pins` provides GET (list) and POST (record). Uses compact `GEOPIN|lat|lng|msg|ts` memo format. Cached with 30s TTL.
- [x] ~~**Map Context Menu Shortcuts**~~ — ✅ DONE. Right-click on any MapLibre map opens a glassmorphism context menu with: Copy Coordinates (clipboard), Drop Pin (animated marker, click to remove), Zoom Here (flyTo), and What's Here? (reverse geocoding via Nominatim). Coordinates shown at bottom. Auto-attaches to all map instances including lazy-loaded ones.
- [x] ~~**Widget Z-Index Stacking Logic**~~ — ✅ DONE. Developed a `bringToFront` Z-Index manager synced automatically with dragging and layout persistence. Any mousedown or touchstart events inside a `.wm-container` automatically push the active widget to the front. Z-indexes track a continuous monotonic counter, and their relative hierarchies serialize down into the `warmaps:layout` local storage buffer and gracefully restore, preventing overlap starvation on dense dense telemetry dashboards.
- [x] ~~**Lottery Rewards System**~~ — ✅ DONE. Created `app/rewards/page.tsx` as a standalone Melina route for users to claim SOL rewards based on accumulated Luck. Added a promotional banner to the main WARMAPS canvas that appears upon Phantom wallet connection.
- [x] ~~**Offline-first resilience**~~ — ✅ DONE. `sw.js` endpoint was added, and the service worker is now properly registered in the client (`app/page.client.tsx`). This allows the app to load from the cache when offline.
- [x] ~~**Dashboard screenshots for README**~~ — ✅ DONE. Captured an actual live screenshot of `https://warmaps.xyz` using a headless Puppeteer script running within the `bun` runtime. The screenshot is now saved as `banner.png` in the repository root for the README.
- [x] ~~**Mobile Touch Optimization**~~ — ✅ DONE. Added `viewport-fit=cover` and `user-scalable=no` to the viewport meta tag, along with `touch-action: none` and `overscroll-behavior: none` to the CSS body. This prevents native double-tap zoom and elastic scroll-bouncing, allowing the canvas engine to perfectly capture native pinches and pans.
- [x] ~~**Data Export**~~ — ✅ DONE. Added "Export Layout JSON" (📥) and "Import Layout JSON" (📤) buttons to the top right toolbar. This allows users to save and load their exact multi-widget canvas setup locally as a `.json` file.

## 🔮 Ideas / Backlog
- [x] ~~**Geo-Pin SQLite Persistence**~~ — ✅ DONE. Added `geo_pins` table to `starwar_users.db` via sqlite-zod-orm. Pins now persist across server restarts. Indexed by `sender` and `signature` for fast lookups.
- [ ] **Geo-Pin Heatmap Layer** — Aggregate geo-pins into a MapLibre heatmap layer showing areas with high message density as glowing clusters.
- [ ] **Real-time Pin WebSocket** — Broadcast new geo-pins to all connected clients via WebSocket so pins appear live without polling.
- [ ] **Coordinate Ruler Tool** — Measure distance between two points on the map with a line tool that shows km/miles.

## 📝 Architecture Notes
- **Production**: `root@202.155.132.139:/opt/starwar/`
- **Deploy**: `git push && ssh pull + npm start` — **IMPORTANT**: always `pkill -9 -f 'bun run'` before restart to avoid zombie processes. PID file alone is not reliable.
- **HTTPS**: Caddy reverse proxy on port 443 → localhost:4444
- **TypeScript**: Zero errors (`npx tsc --noEmit` = clean)
- **Tests**: 59 passing (db integration + canvas modules + API endpoints). CI via GitHub Actions.
- **Map**: MapLibre GL with GeoJSON sources (fires, flights, events, assets, acled, webcams, seismic, crypto, telegram)
- **Canvas engine**: `app/lib/warmaps-canvas.ts` (328 lines) — GalaxyDraw adapter + thin orchestrator
- **Container drag**: `app/lib/container-drag.ts` (~145 lines) — Mouse + touch drag with DragContext interface
- **Canvas layout**: `app/lib/canvas-layout.ts` (~180 lines) — Minimap, fit-all, auto-arrange, bounds helpers
- **Keyboard shortcuts**: `app/lib/keyboard-shortcuts.ts` (~136 lines) — Extracted with dependency injection
- **Snap guidelines**: `app/lib/snap-guidelines.ts` (~120 lines) — SVG alignment guides for container dragging
- **Command palette**: `app/lib/command-palette.ts` (~165 lines) — Ctrl+K launcher with 19 conflict zones
- **Telegram OSINT**: `src/telegram.ts` — 22 channels, 95 location patterns, 8 equipment categories, auto-reconnect
- **Widget system**: `app/lib/widgets.ts` — 13 widget types, instance management, share link encoding
- **Client**: `app/page.client.tsx` → thin orchestrator importing 17 modules from `app/lib/`
- **API routes**: `/api/gdelt`, `/api/acled`, `/api/fires`, `/api/flights`, `/api/telegram/*`, `/api/mm`, `/api/bet`, `/api/image-proxy`, `/api/swap`, `/api/health`, `/api/manifest.json`, `/api/robots.txt`, `/api/sitemap.xml`, `/api/og-image`, `/api/ping`

## ⚠️ Security Reminders
- **NO wallet data on public site** — MM panel removed, `/api/mm` returns `running: false`
- **Commit messages**: Never mention wallets, MM, security fixes in public commit messages
- Git history was squashed to remove incriminating messages (force-pushed)
- `.config.toml` and `mm_state*.json` are gitignored
