## Appendix B: Relevant indexed parts of the codebase

The coding agent should NOT blindly take these @'s to mean it should load them into context. Only use this as an indexed starting place to understand the codebase. Only when absolutely necessary should you onboard one of these files into your context.

1) Generally include this minimal core
Use for almost any non-trivial task:

@CODEBASE-MAP.md
@src/types/board.ts
@src/utils/shapeRegistry.ts

Why: this gives the agent routing guidance, the canonical board schema, and shape registration mechanics. 

2) Canvas / interaction changes
For pan/zoom, pointer behavior, selection, tool UX, overlays:

@src/components/Canvas.tsx
@src/components/Canvas/**
@src/contexts/SelectionContext.tsx

plus minimal core above

This matches the project’s own routing guidance and repomix canvas scope. 

3) Shapes / rendering changes
For new shape behavior, renderer, sizing defaults, transform behavior:

@src/components/shapes/**
@src/components/Canvas/ObjectRenderer.tsx
@src/types/board.ts
@src/utils/shapeRegistry.ts
plus @CODEBASE-MAP.md

This is the exact “shape work” slice documented in the repo maps/config. 

4) Real-time sync / CRDT / presence
For Yjs, Firestore fallback, awareness, provider lifecycle:

@src/contexts/BoardContext.tsx
@src/contexts/firestoreYjsProvider.ts
@src/contexts/webrtcProvider.ts
@src/types/board.ts
plus @CODEBASE-MAP.md

BoardContext is explicitly the sync hub and should be the mutation path anchor. 

5) Auth / session / top-level app flow
For login/logout, inactivity timeout, app wiring:

@src/contexts/AuthContext.tsx
@src/App.tsx
@src/main.tsx
@src/components/Login.tsx
@src/components/InactivityWarningModal.tsx

This mirrors the auth repomix scope. 

6) Testing / selector updates / E2E additions
For Playwright test work and test selector alignment:

@tests/**
@src/components/Canvas.tsx
@src/types/board.ts
@CODEBASE-MAP.md

---