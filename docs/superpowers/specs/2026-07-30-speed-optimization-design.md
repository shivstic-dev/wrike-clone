# OpenWork Hub — Speed Optimization Design

**Date:** 2026-07-30 · **Repo:** Shivstic-hell/wrike-clone@main · **Stack:** Vite/React (Vercel) → NestJS (Railway) → Postgres (Supabase)

## Goal

Make the deployed app feel fast without adding any paid services. "Fast" = login page interactive in <2s on a mid-tier phone, and no silent hangs when the Railway backend is cold.

## Verified findings (measured 2026-07-30)

1. First page load downloads **~840KB JS** before the login form can render. The `monitoring` chunk (`@sentry/react`) is **306,256 bytes — 36% of everything** — and is force-preloaded by `main.tsx:initSentry()` before React mounts. React+router (`vendor`) is only 42KB.
2. Railway free tier idles; health probes return in 0.7–1.1s while waking, which presents as a dead spinner in the UI.
3. React Query `staleTime: 30_000` re-hits the API on every route change for data older than 30s. 
4. `apiClient` sends `withCredentials: true` on **every** request even though only `/auth/refresh` needs the cookie. Each cross-origin cookie request adds preflight overhead.
5. DB indexes already exist (migration `019_search_and_hot_path_indexes.ts`: GIN trigram on title, composite `(tenant, project, status, due)` etc.). **No new blind indexes** — P4 is an audit script for slow plans instead.
6. Bundle hygiene is otherwise good: per-route `lazy()` in App.tsx, hashed assets served `immutable, max-age=1y`, CSP present. We exploit this good setup, not rebuild it.

## Scope

Out of scope (per user choice): UI/UX redesign, new features, paid tiers (Sentry paid, Redis cache upgrades, Railway always-on). Only free levers.

## Changes

### P1 — Decouple Sentry from initial render (biggest win: −306KB from critical path)
- Remove the `monitoring: ['@sentry/react']` `manualChunks` entry in `vite.config.ts` so the chunk stops being preloaded in `index.html`.
- Convert `initSentry()` to dynamic-import `@sentry/react` lazily: kick off after first paint (`requestIdleCallback` with 2s timeout, fallback `setTimeout 0`).
- ErrorBoundary: keep a plain React boundary class; swap its fallback UI to current `ErrorFallback` JSX. No functional loss — init still runs, DSN still read, errors still report once it loads.

### P2 — Query & API client tuning
- Per-resource `staleTime`: reference/static data 5 min, lists 2 min, notifications 30s (unchanged via per-query override where already set).
- Remove `withCredentials: true` from the default axios instance; add it only to the single `/auth/refresh` call (`api/client.ts` `refreshAccessToken`). Same-Site already handled by backend CORS config.
- Keep the lazy Sentry wiring consistent: `onError` in axios interceptor stays as-is (it's already console-only).

### P3 — Railway cold-start UX shield
- `main.tsx`: on app start, fire-and-forget `GET {API}/health` in parallel; two parallel probes measured because `/health` is 404 on this deploy — probe `/{config.apiPrefix}/health` once correct path confirmed from backend `health.controller.ts`.
- Axios response interceptor: if a request has been pending >1500ms with no response, show a `react-hot-toast` "Waking up the workspace…" once per cold episode (dismiss on first success). Perceived "broken" becomes "loading on purpose."
- `railway.toml`: add `healthcheckPath`+`healthcheckTimeout` so Railway restarts don't serve traffic while Nest is still booting (status stays 502 → warm, instead of 500 spinner).

### P4 — DB audit (no new assumptions)
- Ship `scripts/db-health.sql`: plain `EXPLAIN (ANALYZE, BUFFERS)` wrappers on the exact hot queries backend runs (task list by project, kanban ordering, unread notifications, global search). Run once in Supabase SQL editor, paste output; we add a targeted index only if a query shows >50ms or seq-scan on production volume.

### P5 — Micro-perf sweep
- `index.html`: `<link rel="preconnect" href="https://wrike-clone-production-9894.up.railway.app" crossorigin>` so the API TLS handshake starts before React boots.
- Ensure Google fonts use `display=swap` (already self-hosted via `@fontsource`, verify no render-blocking external stylesheet).
- Dead-code check: `react-is` pinned at top level in package.json but only needed by `react-grid-layout` peer — verify it's not duplicated in vendor chunk; leave dependency in place if tree-shaking is correct.

## Architecture

No new services, no schema changes, no new deps. All frontend changes are lazy-loading and config-level; backend changes are `railway.toml` + optional `main.ts` health route (already exists at `health/` — expose correct prefix). Rollback is `git revert` per phase.

## Testing

- **Build:** `npm run build` — assert `monitoring-*.js` either absent from `index.html` preload list or moved to on-demand only. Assert total JS transferred on `/login` drops ≥250KB (expected: index+vendor+query ≈ 490KB vs 840KB today).
- **Frontend:** `npm run test -w packages/frontend` — existing DashboardPage/LoginPage/etc. specs must pass unchanged (no behavioral changes).
- **Backend:** `npm run test -w packages/backend` — no-op, confirms no Nest bootstrap breakage.
- **Manual smoke:** load `/login` with devtools network throttled to "Fast 3G": login form must paint before Sentry chunk finishes; clear cookies, wait 5 min (backend sleep), click login → toast appears ≤1.5s.

## Deployment

1. Branch `speed/p1-p5` → PR to `main`. 
2. Merge → Vercel auto-deploys frontend, Railway auto-deploys backend (railway.toml change is in-repo).
3. You run `scripts/db-health.sql` in Supabase SQL editor once, paste output if anything >50ms — otherwise P4 closes as "measured, no action needed."
