# Codebase Map

Read this file first. It tells you which repomix config to use and what each chunk contains.

## Routing: Task → Config

| Task | Command | Key files included |
|---|---|---|
| Add or modify a shape | `npx repomix --config repomix.shapes.json` | `shapes/**`, `BaseShape.tsx`, `ObjectRenderer.tsx`, core types |
| Canvas interactions, pan/zoom, overlays, grid | `npx repomix --config repomix.canvas.json` | `Canvas.tsx`, `Canvas/**`, `SelectionContext.tsx`, core types |
| Real-time sync, presence, Yjs, Firestore | `npx repomix --config repomix.sync.json` | `BoardContext.tsx`, `firestoreYjsProvider.ts`, `webrtcProvider.ts`, core types |
| Auth, routing, inactivity, login UI | `npx repomix --config repomix.auth.json` | `AuthContext.tsx`, `App.tsx`, `Login.tsx`, `InactivityWarningModal.tsx` |
| Write or modify E2E tests | `npx repomix --config repomix.tests.json` | `tests/**`, `Canvas.tsx` (for selector reference) |

## Source Dependency Tiers

```
Tier 0: firebase.ts
Tier 1: types/board.ts, utils/shapeRegistry.ts
Tier 2: contexts/AuthContext.tsx, contexts/SelectionContext.tsx,
        contexts/webrtcProvider.ts, contexts/firestoreYjsProvider.ts
Tier 3: contexts/BoardContext.tsx  (depends on all of Tier 0–2)
Tier 4: shapes/BaseShape.tsx, components/Cursor.tsx
Tier 5: shapes/*.tsx  (6 shape files, each extends BaseShape)
Tier 6: Canvas/ObjectRenderer.tsx, Canvas/Toolbar.tsx, Canvas/DotGrid.tsx, Canvas/*.tsx
Tier 7: components/Canvas.tsx  (depends on everything above)
Tier 8: App.tsx, main.tsx
```

Always-needed core (Tier 0–1): `firebase.ts` + `types/board.ts` + `shapeRegistry.ts` ≈ 130 lines.

## Architectural Facts

- **Shape registry pattern** — shapes self-register in `shapeRegistry.ts`; `ObjectRenderer.tsx` looks up the renderer by type at render time. Adding a shape = new file + one `register()` call, no switch statements.
- **BoardContext as sync hub** — `BoardContext.tsx` owns the Yjs `Y.Doc`, wires both the Firestore persistence provider and the WebRTC awareness provider, and exposes the shared map to all consumers. Do not bypass it to write directly to Yjs.
- **Canvas.tsx as event loop** — all pointer events, keyboard shortcuts, tool-mode state, and viewport transforms live in `Canvas.tsx`. It is intentionally large (~659 lines); splitting it further would scatter tightly coupled handler logic.
- **SelectionContext is Canvas-local** — it tracks which object IDs are selected; nothing outside `Canvas.tsx` and its children reads it.
- **Skills/agent docs are excluded from every chunk** — load them on demand via the skills system (`.claude/skills/`, `.agents/skills/`).
