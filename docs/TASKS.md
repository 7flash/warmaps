# WARMAPS Tasks & Ideas

## 🔴 Priority: Fix
- [ ] **DNS: both domains dead** — Neither `warmaps.org` (A record still Squarespace) nor `warmaps.live` (no DNS) resolve. Production only reachable via `202.155.132.139:4444`. Need registrar access to set A records → `202.155.132.139`. Once DNS works, Caddy will auto-provision HTTPS.
- [ ] **SEO references `warmaps.live`** — Layout, sitemap, OG tags, canonical, JSON-LD all reference `warmaps.live`. Once DNS is resolved, update all references to the chosen canonical domain in `app/layout.tsx`, `app/api/sitemap.xml/route.ts`.

## 🟡 Priority: Improve
- [ ] **Consolidate domain choice** — Decide on one canonical domain (`warmaps.org` vs `warmaps.live`). Configure the other as a 301 redirect in Caddy. Update all code references.
- [ ] **Heap exceeding allocation** — Production health shows `heap: 75/59MB` (heap used > heap allocated). Monitor for memory leaks with extended uptime. Consider `--smol` flag or heap limit.
- [ ] **TASKS.md was 140 lines** — Archived 90+ completed tasks. If historical task reference is needed, check git history.

## 🟢 Priority: Features
- [ ] **Dashboard screenshots for README** — Capture live WARMAPS screenshots for the GitHub repo README. Current repo has no visuals showing the actual product.
- [ ] **Offline-first resilience** — IndexedDB cache exists (`lib/cache.ts`) but service worker isn't implemented. Add SW for true offline capability.

## 📝 Architecture Notes
- **Production**: `root@202.155.132.139:/opt/starwar/`
- **Deploy**: `git push && ssh pull + restart bun server`
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
