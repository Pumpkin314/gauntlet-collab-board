# Honest Assessment Quick Reference

## What We'd Change in v2
- **Backend proxy for API keys** — Anthropic key is client-side (VITE_ANTHROPIC_API_KEY)
- **Delta sync** — Full Yjs state snapshots to Firestore; delta sync needed for >500 objects
- **Pan performance** — ~24 FPS at 100 objects (target: 60). Bottleneck is Konva redraw, not React
- **Per-user confidence** — Single explorer state per board; no per-user overlays yet
- **Server-side rate limiting** — Currently in-memory only (resets on refresh)

## Known Tech Debt
- Canvas.tsx is ~749 LOC (monolithic event loop). Would extract tool manager at scale
- Base64 encoding adds ~33% storage overhead on Firestore snapshots
- Inactivity timeout is hardcoded at 4 minutes (not configurable per role)
- KG data fully loaded into memory Maps — not practical for 10k+ nodes
- Quiz format "Challenge me!" override UI was deferred

## Failure Modes

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Firebase down | P2P sync continues; edits not persisted | Snapshot restored on reconnect |
| WebRTC fails | Falls back to Firestore sync (10-100ms) | ICE config supports TURN relay |
| Both down | Board freezes; local edits possible | Edits may be lost (MVP acceptable) |
| Claude API fails | Quiz fails | Error shown, "Skip" offered |
| Refresh during quiz | State persisted to Firestore | Resumes where left off |

## Stubbed Features
- `INTERACTIVE_LESSON` state — defined, no transitions
- `fr-visual` quiz format — not implemented
- `createConnector()` — in spec schema, not in agent
- Post-MVP: Dagre auto-layout, band boundaries, question dedup, multiplayer overlays

## Performance Baselines
- P2P sync: <10ms (WebRTC connected)
- Firestore fallback: ~500ms debounced writes
- Pan FPS at 100 objects: ~24 (needs WebGL or aggressive culling)
- Multi-select: drops at 5-10+ selected objects
- Unit tests: 27 passing (Vitest)
