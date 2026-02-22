# Sync & P2P Domain

## Overview

Real-time collaboration is built on three layers: **Yjs CRDT** (conflict-free state), **y-webrtc** (P2P mesh for low-latency sync), and **Firestore** (durable persistence + presence fallback).

## Key Files

| File | LoC | Role |
|---|---|---|
| `src/contexts/BoardContext.tsx` | 945 | Central hub: owns Y.Doc, wires providers, exposes React state |
| `src/contexts/firestoreYjsProvider.ts` | 141 | Persists full Yjs state snapshots to Firestore (~500ms debounce) |
| `src/contexts/webrtcProvider.ts` | 70 | Factory for y-webrtc provider with ICE config from env vars |
| `src/utils/cursorStore.ts` | 31 | Module-level Map for cursor positions (no React) |
| `src/types/board.ts` | 68 | `BoardObject`, `PresenceUser`, `ShapeType` types |

## Architecture

### Yjs Document Structure
- Single `Y.Map<string>` keyed by object ID, values are JSON-serialized `BoardObject`s
- BoardContext observes the map and diff-syncs changes into React state via `makeDiffSync()`
- All mutations go through BoardContext actions (`createObject`, `updateObject`, `deleteObject`, `batchCreate`, `deleteAllObjects`)

### Sync Flow
```
User action → BoardContext action → Y.Map.set()
  → y-webrtc broadcasts to peers (immediate)
  → FirestoreYjsProvider debounce-persists snapshot (500ms)
```

### Presence System (dual-path)
1. **WebRTC awareness** (primary): each peer broadcasts `{userId, displayName, color}` via y-webrtc awareness protocol. BoardContext listens to awareness changes and updates `presenceUsers` state.
2. **Firestore fallback**: presence doc written on connect, cleaned up on disconnect. Used when WebRTC peers haven't connected yet.

### Cursor Sync
- Local cursor position sent via awareness on pointermove (throttled)
- Remote cursors stored in `cursorStore.ts` (plain Map, not React state)
- `Cursor.tsx` reads from cursorStore via RAF loop and lerps to target position
- This avoids React re-renders entirely for cursor movement

### Diff-Based React Sync
`makeDiffSync()` compares previous and next Yjs map state and only calls `setObjects()` when actual content differs. This eliminated render cascades during pan/drag (Phase 1 optimization).

### Split Context Pattern
- `BoardDataContext`: `objects`, `presenceUsers`, `isConnected`, `isSynced` — triggers re-renders
- `BoardActionsContext`: `createObject`, `updateObject`, etc. — stable refs, never triggers re-renders
- `useBoard()` = both combined (backward compat)
- `useBoardActions()` = actions only (use this in components that don't need data)

## Environment Variables
- `VITE_WEBRTC_SIGNALING` — signaling server URL(s) for y-webrtc
- `VITE_ICE_SERVERS` — TURN/STUN server config (JSON)
- `VITE_ICE_TRANSPORT_POLICY` — `all` or `relay`
