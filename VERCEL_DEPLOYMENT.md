# Vercel frontend deployment

Vercel serves only the Vite frontend. The API remains a persistent Railway
service; do not configure Vercel Functions, backend builds, or `/api` rewrites.

## Production endpoints

- Frontend: `https://wrike-clone-three.vercel.app`
- Railway API: `https://wrike-clone-production-9894.up.railway.app/api/v1`
- Railway WebSocket: `wss://wrike-clone-production-9894.up.railway.app`

## Vercel project settings

Import the repository as one Vercel project with these settings:

- Root Directory: `packages/frontend`
- Framework Preset: Vite
- Install Command: `cd ../.. && npm ci`
- Build Command: `cd ../.. && npm run build -w @wrike-clone/shared && npm run build -w @wrike-clone/frontend`
- Output Directory: `dist`

The install command deliberately runs `npm ci` against the repository lockfile.
`packages/frontend/vercel.json` contains the equivalent build configuration,
security headers, and the SPA rewrite.

## Environment variables

Set these for Preview and Production:

```env
VITE_API_URL=https://wrike-clone-production-9894.up.railway.app/api/v1
VITE_WS_URL=wss://wrike-clone-production-9894.up.railway.app
```

These are build-time Vite variables. A change requires a Vercel redeploy.
Backend secrets, database credentials, JWT keys, and `CORS_ORIGINS` belong in
Railway, not Vercel. Railway production must allow the exact origin
`https://wrike-clone-three.vercel.app`.

## Content Security Policy

The frontend CSP in `packages/frontend/vercel.json` permits connections only to
the Railway production API and WebSocket host above. If the Railway hostname
changes, update `VITE_API_URL`, `VITE_WS_URL`, and that CSP together before
deploying.

## Verify after a deployment

1. Open `https://wrike-clone-three.vercel.app`.
2. Confirm browser requests target the Railway API URL, not the Vercel domain.
3. Check `https://wrike-clone-production-9894.up.railway.app/api/v1/health`.
4. Confirm Railway CORS permits `https://wrike-clone-three.vercel.app`.
