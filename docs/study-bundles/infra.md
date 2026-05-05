# Infrastructure Quick Reference

## Deploy Pipeline
- **Build**: `vite build` → `dist/` (static SPA)
- **Host**: Vercel (configured via `vercel.json`)
- **Routing**: SPA fallback — all routes serve `index.html`
- **No server**: Entirely client-side (Firebase + WebRTC + Claude API direct)

## Dev Setup
```bash
npm install
npm run dev          # Vite dev server on :3000
npm run dev:signal   # y-webrtc signaling server on :4445
npm run dev:all      # Both in parallel
```

## Testing Commands
```bash
npm run test                      # Vitest unit (27 tests) — always run
npm run test:perf                 # Playwright single-user perf
npm run test:perf:multiplayer     # Playwright multi-client sync
npm run test:perf:all             # Full perf suite → JSON report
```

## Firebase Setup
- **Auth**: Google OAuth provider
- **Firestore**: 3 collections (boards, boardMembers, boardSnapshots) + explorer subcollection
- **Rules**: `firestore.rules` — owner/editor/viewer role-based access
- **No Firebase Functions** — all logic is client-side

## WebRTC Configuration
- **Signaling**: y-webrtc built-in server (`y-webrtc/bin/server.js`)
- **ICE**: Google STUN by default; TURN configurable via `VITE_ICE_SERVERS`
- **Transport**: `all` (direct + relay) or `relay` (TURN only)
- **Multiple signaling servers**: comma-separated in `VITE_SIGNALING_SERVERS`

## Observability
- **Langfuse**: Optional tracing for LLM calls
- **PerfBridge**: `window.__perfBridge` exposes render/sync metrics to console
- **DebugOverlay**: Canvas overlay showing live perf stats (isolated context)

## Security Concerns (MVP)
- Anthropic API key is client-side (needs backend proxy for production)
- Firebase auth tokens managed client-side
- Rate limiting is in-memory only (20 req/min, resets on refresh)
- Firestore rules enforce board-level access control

## Monitoring
- No APM integration (would add Sentry/DataDog for production)
- Langfuse traces LLM calls when configured
- Playwright perf tests establish baseline metrics
