# Codebase Map

Read this file first. It tells you which repomix config to use, what each chunk contains, and points to detailed per-domain context files in `.claude/context/`.

## Quick Stats

- **38 source files** across `src/` (4,318 LoC total)
- Largest files: `BoardContext.tsx` (945), `Canvas.tsx` (749), `DebugOverlay.tsx` (268)
- React 18 + Konva.js (canvas) + Yjs (CRDT) + y-webrtc (P2P) + Firebase (auth + Firestore)

## Routing: Task → Config

| Task | Command | Key files included |
|---|---|---|
| Add or modify a shape | `npx repomix --config repomix.shapes.json` | `shapes/**`, `BaseShape.tsx`, `ObjectRenderer.tsx`, core types |
| Canvas interactions, pan/zoom, overlays, grid | `npx repomix --config repomix.canvas.json` | `Canvas.tsx`, `Canvas/**`, `SelectionContext.tsx`, core types |
| Real-time sync, presence, Yjs, Firestore | `npx repomix --config repomix.sync.json` | `BoardContext.tsx`, `firestoreYjsProvider.ts`, `webrtcProvider.ts`, core types |
| Auth, routing, inactivity, login UI | `npx repomix --config repomix.auth.json` | `AuthContext.tsx`, `App.tsx`, `Login.tsx`, `InactivityWarningModal.tsx` |
| Write or modify E2E tests | `npx repomix --config repomix.tests.json` | `tests/**`, `Canvas.tsx` (for selector reference) |

## Detailed Context Files

For deeper understanding of each domain, see:

| Domain | Context file | Covers |
|---|---|---|
| Sync & P2P | `.claude/context/sync.md` | Yjs CRDT, WebRTC awareness, Firestore persistence, cursor sync |
| Auth & Session | `.claude/context/auth.md` | Firebase Auth, inactivity timers, login UI |
| Canvas & Interaction | `.claude/context/canvas.md` | Viewport, pan/zoom, selection, tools, keyboard shortcuts |
| Shapes | `.claude/context/shapes.md` | Shape registry, BaseShape, all 6 shape types |
| Debug & Testing | `.claude/context/debug-testing.md` | DebugOverlay, perf bridge, test infrastructure |

## Source Dependency Tiers

```
Tier 0: firebase.ts                                          (22 LoC)
Tier 1: types/board.ts, utils/shapeRegistry.ts               (103 LoC)
Tier 2: contexts/AuthContext.tsx, contexts/SelectionContext.tsx,
        contexts/DebugContext.tsx,
        contexts/webrtcProvider.ts, contexts/firestoreYjsProvider.ts
Tier 3: contexts/BoardContext.tsx  (depends on Tier 0–2)      (945 LoC)
Tier 4: shapes/BaseShape.tsx, components/Cursor.tsx,
        utils/cursorStore.ts
Tier 5: shapes/*.tsx  (5 shape files, each wraps BaseShape;
        LineShape.tsx is standalone)
Tier 6: Canvas/ObjectRenderer.tsx, Canvas/Toolbar.tsx,
        Canvas/DotGrid.tsx, Canvas/ColorPicker.tsx,
        Canvas/EditModal.tsx, Canvas/InfoOverlay.tsx,
        Canvas/DebugOverlay.tsx, Canvas/SelectionRect.tsx,
        Canvas/LinePreview.tsx
Tier 7: components/Canvas.tsx  (749 LoC, depends on everything above)
Tier 8: App.tsx, main.tsx
```

Always-needed core (Tier 0–1): `firebase.ts` + `types/board.ts` + `shapeRegistry.ts` ≈ 125 lines.

## Architectural Facts

- **Shape registry pattern** — shapes self-register in `shapeRegistry.ts`; `ObjectRenderer.tsx` looks up the renderer by type at render time. Adding a shape = new file + one `register()` call, no switch statements.
- **BoardContext as sync hub** — `BoardContext.tsx` owns the Yjs `Y.Doc`, wires both the Firestore persistence provider and the WebRTC awareness provider, and exposes the shared map to all consumers. Do not bypass it to write directly to Yjs.
- **Canvas.tsx as event loop** — all pointer events, keyboard shortcuts, tool-mode state, and viewport transforms live in `Canvas.tsx`. It is intentionally large (~749 lines); splitting it further would scatter tightly coupled handler logic. Implements viewport culling to unmount off-screen objects.
- **SelectionContext is Canvas-local** — it tracks which object IDs are selected; nothing outside `Canvas.tsx` and its children reads it.
- **DebugContext is isolated** — extracted from BoardContext to prevent debug metric updates from causing data re-renders. Only `DebugOverlay.tsx` consumes it.
- **Cursor sync is renderless** — `cursorStore.ts` is a plain Map; awareness writes to it, `Cursor.tsx` reads via RAF loop. No React re-renders for cursor movement.
- **Diff-based Yjs→React sync** — `BoardContext` uses `makeDiffSync()` to only update React state when Yjs map contents actually change, not on every observe event.
- **Split context pattern** — `BoardDataContext` (data, triggers re-renders) + `BoardActionsContext` (stable action refs, no re-renders). `useBoard()` combines both for backward compat; `useBoardActions()` is the perf-safe hook.
- **Skills/agent docs are excluded from every repomix chunk** — load them on demand via the skills system (`.claude/skills/`, `.agents/skills/`).
