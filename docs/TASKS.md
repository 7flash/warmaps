# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Telegram OSINT**~~ — ✅ Session configured with phone number in `.config.toml`. Auto-connects on startup, polling 23 OSINT channels.
- [x] ~~**Flights data**~~ — ✅ DONE. Switched primary source to ADSB.lol (free, no rate limits). OpenSky kept as fallback with exponential backoff. Added enhanced military classification (aircraft type codes + registration-based country detection).
- [x] ~~**Canvas container overflow clipping**~~ — ✅ DONE. Fixed CSS flexbox cascading limits on `.wm-container-body` and explicitly applied `min-height: 0` and `min-width: 0` along with `flex-shrink: 0` on static header components to permit proper containment scaling per widget.
- [x] ~~**Mobile canvas**~~ — ✅ DONE. Touch event handlers for single-finger pan and pinch-to-zoom. Container drag via header on touch. Layout saves on touch end.

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
- [ ] **Container linking** — Draw connection lines between containers to show data relationships (similar to GitMaps interwingled files). E.g., connecting an ACLED event marker on the map to a Telegram OSINT message.
- [ ] **Detachable containers** — Allow containers to be "popped out" into separate browser windows for multi-monitor setups.

## 🟡 Priority: Deploy
- [ ] **Deploy canvas rewrite to production** — Push latest canvas changes to `root@202.155.132.139:/opt/starwar/`. Test container dragging, minimap, and layout persistence on production.
- [ ] **Deploy user accounts to production** — Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` env vars on `root@202.155.132.139:/opt/starwar/`. OAuth callback URL must be configured on GitHub as `https://warmaps.live/api/auth/github/callback`. Test login flow on production.

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
