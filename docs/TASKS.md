# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Canvas event passthrough broken**~~ — ✅ DONE. Map zoom triggered canvas zoom, feed scroll didn't work. Root cause: GalaxyDraw engine's `consumesWheel`/`consumesMouse` only looked for `.gd-card` elements, but WARMAPS containers are `.wm-container`. Fix: (1) engine now also checks `[data-card-type]` attribute, (2) warmaps-canvas.ts stamps `data-card-type` on containers. Published `galaxydraw@0.2.0` and deployed.
- [x] ~~**SEO references wrong domain**~~ — ✅ DONE. All OG/Twitter/canonical/sitemap/robots.txt references changed from `warmaps.live` → `warmaps.xyz`.
- [x] ~~**Telegram verification code**~~ — ✅ DONE. AUTH_KEY_DUPLICATED resolved. Reconnect API added at `POST /api/telegram/connect` with `{retry:true}`. Added click handlers on the Telegram status bar to open prompts for verification code and 2FA password, posting to `/api/telegram/verify` and `/api/telegram/password`.

## 🟡 Priority: Improve
- [x] ~~**Consolidate domain choice**~~ — ✅ DONE. `warmaps.xyz` is the established canonical domain. Confirmed no remaining references to `.org` or `.live` in the codebase.
- [x] ~~**Heap exceeding allocation**~~ — ✅ DONE. Added `--smol` flag to `package.json` scripts (`npm start` and `npm run dev`) to enforce a lower memory heap limit.
- [x] ~~**TASKS.md was 140 lines**~~ — ✅ DONE. Legacy tasks archived.

## 🟢 Priority: Features
- [x] ~~**Lottery Rewards System**~~ — ✅ DONE. Created `app/rewards/page.tsx` as a standalone Melina route for users to claim SOL rewards based on accumulated Luck. Added a promotional banner to the main WARMAPS canvas that appears upon Phantom wallet connection.
- [x] ~~**Offline-first resilience**~~ — ✅ DONE. `sw.js` endpoint was added, and the service worker is now properly registered in the client (`app/page.client.tsx`). This allows the app to load from the cache when offline.
- [ ] **Dashboard screenshots for README** — Capture live WARMAPS screenshots for the GitHub repo README. Current repo has no visuals showing the actual product.
- [ ] **Mobile Touch Optimization** — Ensure the canvas drag, zoom, and widget interactability feel native on iOS/Android devices.
- [ ] **Data Export** — Allow users to export the current map state (markers, filters) as a JSON file or shareable link.

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
