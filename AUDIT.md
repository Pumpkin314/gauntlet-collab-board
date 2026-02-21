# CollabBoard — Code Audit Report

**Audit Date:** 2026-02-21
**Submission Stage:** Early Submission (Friday deadline)
**Auditor:** Claude Opus 4.6

---

## Executive Summary

CollabBoard is a real-time collaborative whiteboard built with React 18, Konva.js, Yjs (CRDTs), y-webrtc, and Firebase. It implements an AI agent ("Boardie") powered by Claude Haiku/Sonnet for natural-language board manipulation.

**Overall Score: 7.5 / 10**

The project demonstrates strong architectural decisions — particularly the Yjs CRDT-backed sync, the split BoardData/BoardActions context pattern, and the ref-first performance approach for cursors and panning. The AI agent is well-structured with proper guardrails, multi-turn support, and a planner delegation pattern.

Key gaps: missing `createConnector` tool (spec requirement), API key exposed client-side, no unit tests, some edge-case bugs in frame containment and selection, and several code quality issues.

---

## Completeness Against Requirements

### MVP Requirements (24 Hours) — All Pass

| Requirement | Status | Notes |
|---|---|---|
| Infinite board with pan/zoom | **PASS** | Smooth zoom (0.1×–5×), Space-to-pan, DotGrid background |
| Sticky notes with editable text | **PASS** | Double-click inline editing, color picker |
| At least one shape type | **PASS** | Rectangle, circle, line, text, frame |
| Create, move, edit objects | **PASS** | Full CRUD via Yjs transactions |
| Real-time sync between 2+ users | **PASS** | y-webrtc P2P + Firestore persistence backup |
| Multiplayer cursors with name labels | **PASS** | RAF-driven lerp interpolation, cursorStore bypass |
| Presence awareness | **PASS** | Firestore presence + WebRTC awareness dual-path |
| User authentication | **PASS** | Google OAuth via Firebase Auth |
| Deployed and publicly accessible | **NEEDS VERIFICATION** | Deployment config exists (DEPLOYMENT.md) |

### Core Board Features

| Feature | Status | Notes |
|---|---|---|
| Sticky Notes | **PASS** | Create, edit, color change |
| Shapes (rect, circle, line) | **PASS** | All three implemented with proper rendering |
| Connectors (lines/arrows between objects) | **PARTIAL** | Lines with arrows exist; `connector` type defined in schema but no actual connector-between-objects behavior (snap-to-anchor) |
| Text elements | **PASS** | Standalone text with inline editing |
| Frames | **PASS** | Group/organize with containment, drag children |
| Transforms (move, resize, rotate) | **PASS** | Konva Transformer with min-size bounds |
| Selection (single + multi) | **PASS** | Shift-click, box-select, Ctrl+A |
| Operations (delete, duplicate, copy/paste) | **PASS** | Ctrl+C/V/D, Delete/Backspace |

### Real-Time Collaboration

| Feature | Status | Notes |
|---|---|---|
| Multiplayer cursors | **PASS** | Dual-path: awareness + Yjs doc-backed presence |
| Object sync | **PASS** | Yjs CRDT with diff-based React updates |
| Presence indicator | **PASS** | Top-bar presence list + count badge |
| Conflict handling | **PASS** | Yjs CRDT = automatic merge, documented |
| Disconnect/reconnect | **PASS** | Firestore persistence backup, presence heartbeat |
| State persistence | **PASS** | Firestore snapshot (500ms debounce) |

### AI Board Agent

| Feature | Status | Notes |
|---|---|---|
| createStickyNote | **PASS** | With text, position, color |
| createShape | **PASS** | rect and circle |
| createFrame | **PASS** | With title, dimensions |
| createConnector(fromId, toId, style) | **MISSING** | Spec requires this; not implemented |
| moveObject | **PASS** | By ID + coordinates |
| resizeObject | **PASS** | By ID + dimensions |
| updateText | **PASS** | By ID + content |
| changeColor | **PASS** | By ID + color (named or hex) |
| getBoardState | **PASS** | `requestBoardState` with filtering |
| 6+ command types | **PASS** | 10+ tools defined |
| Templates (SWOT, etc.) | **PASS** | 6 templates: swot, retro, kanban, journey_map, pros_cons, matrix_2x2 |
| Multi-step commands | **PASS** | delegateToPlanner → Sonnet for complex layouts |
| Shared AI state | **PASS** | AI creates via same Yjs path = auto-synced |

### Performance Targets

| Metric | Target | Status | Notes |
|---|---|---|---|
| Frame rate | 60 FPS | **PARTIAL** | Pan at 100 objects ~24 FPS (known issue); good at lower counts |
| Object sync latency | <100ms | **PASS** | y-webrtc P2P is sub-10ms when connected |
| Cursor sync latency | <50ms | **PASS** | RAF-gated at ~60Hz, P2P path |
| Object capacity | 500+ | **PARTIAL** | Viewport culling helps; shadows disabled at 20+; not stress-tested at 500 |
| Concurrent users | 5+ | **NEEDS TESTING** | Architecture supports it; no load test evidence |

### Missing Deliverables (for Final Submission)

| Deliverable | Status |
|---|---|
| Demo Video (3-5 min) | Not yet required (Early Submission) |
| AI Development Log | Not found in repo |
| AI Cost Analysis | Not found in repo |
| Pre-Search Document | Not found in repo |
| Social Post | Not yet required |

---

## Code Quality and Smells

### HIGH Priority

#### H1. API Key Exposed Client-Side
**File:** `src/agent/apiClient.ts:25`
```typescript
const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
```
The Anthropic API key is bundled into the client-side build. The code logs a `console.warn` in production but proceeds anyway. Anyone can extract the key from the browser and use it to make unlimited API calls billed to your account.

**Fix:** Route AI requests through a backend proxy (Firebase Function, Vercel Edge Function, or similar). The proxy holds the API key server-side and forwards validated requests to Anthropic. This is a ~30-minute fix with a serverless function.

#### H2. Missing `createConnector` Tool (Spec Deviation)
**File:** `src/agent/tools.ts`
The spec explicitly requires `createConnector(fromId, toId, style)` in the tool schema. The `connector` type exists in `board.ts` (with `fromId`, `toId`, `fromAnchor`, `toAnchor` fields) but:
- No `createConnector` tool is defined in the agent
- No connector rendering logic exists (no ConnectorShape component)
- The `SUPPORTED_SHAPE_TYPES` in `capabilities.ts` explicitly excludes `'connector'`

**Fix:** Implement a `ConnectorShape` component that renders a line/arrow between two objects (reading their positions to compute endpoints dynamically), register it in the shape registry, and add a `createConnector` tool to the agent. Estimated: 1-2 hours.

#### H3. `BoardActions` Interface Duplicated Across Files
**Files:** `src/agent/executor.ts:8-13`, `src/agent/pipeline.ts:12-17`
The `BoardActions` interface is defined identically in both `executor.ts` and `pipeline.ts`, and differently from the full interface in `BoardContext.tsx`. This violates DRY and risks drift.

**Fix:** Export `BoardActions` from a single location (e.g., `src/agent/types.ts` or `src/types/board.ts`) and import it everywhere.

### MEDIUM Priority

#### M1. `useBoard()` Causes Unnecessary Re-renders
**File:** `src/components/Canvas.tsx:143`
```typescript
const { objects, presence, createObject, updateObject, ... } = useBoard();
```
Canvas destructures the full combined hook. Every time `presence` changes (cursor movements at 60Hz when Firestore fallback is active), Canvas re-renders. The codebase already has `useBoardActions()` for actions-only, but Canvas still uses the combined hook.

**Fix:** Split into `const { objects, presence, loading } = useBoardData()` and `const actions = useBoardActions()`. This requires exposing a `useBoardData` hook (currently only `BoardDataContext` exists internally). Since Canvas needs both data and actions, the win is limited here, but the presence data could be consumed in a separate child component.

#### M2. Firestore Security Rules Not Visible
**Files:** Not found in repo
No `firestore.rules` or `firebase.json` with security rules was found. If Firestore is deployed with default rules, any authenticated user can read/write any document in any board. Unauthenticated users may also have access depending on defaults.

**Fix:** Add `firestore.rules` that restricts:
- Board read/write to authenticated users
- Presence documents to the owning user
- Ydoc state to authenticated users

#### M3. `isSelected` Callback Captures Stale Closure
**File:** `src/contexts/SelectionContext.tsx:42`
```typescript
const isSelected = useCallback(
  (id: string) => selectedIds.has(id),
  [selectedIds]
);
```
This creates a new function reference on every selection change, which can cause unnecessary re-renders in consumers that depend on `isSelected` identity. However, since `ObjectRenderer` receives `selectedIds` as a Set directly, the impact is minimal.

**Fix:** Use a ref-based pattern: `const selectedIdsRef = useRef(selectedIds); selectedIdsRef.current = selectedIds;` and `isSelected = useCallback((id) => selectedIdsRef.current.has(id), [])`.

#### M4. No Input Validation on `moveObject`/`resizeObject`/`deleteObject`
**File:** `src/agent/executor.ts:94-126`
The agent executor calls `updateObject` and `deleteObject` with IDs from the LLM without verifying the object exists. If the LLM hallucinates an object ID, the Yjs map silently ignores it (no error feedback).

**Fix:** Before dispatching, check `yObjectsRef.current?.get(id)` exists. If not, return `{ success: false, error: 'Object not found' }`.

#### M5. `any` Type Assertions
**Files:** Multiple
- `src/components/Canvas.tsx:254,327,635`: `{ parentId: '' as any }` — the `parentId` field is `string | undefined` in `BoardObject`, but `''` is used as a sentinel for "no parent". This is semantically wrong.
- `src/utils/shapeRegistry.ts:14`: `component: ComponentType<any>` — loses type safety.
- `src/agent/apiClient.ts` — `AnthropicResponse` types use broad unions.

**Fix:** For parentId, change the type to `string` (empty string = no parent) or `string | null`, and remove the `as any` casts. For the shape registry, use `ComponentType<ShapeProps>`.

#### M6. DebugContext Provider Value Not Memoized
**File:** `src/contexts/DebugContext.tsx:106-119`
The `value` object is recreated on every render of `DebugProvider`. Since `updateDebug` calls `setDebugInfo` (which triggers re-render), this creates a new context value object on every debug update, forcing all consumers to re-render.

**Fix:** Wrap `value` in `useMemo`:
```typescript
const value = useMemo(() => ({
  debugInfo, yjsLatencyMs, yjsReceiveGapMs, ...
}), [debugInfo, yjsLatencyMs, yjsReceiveGapMs, ...]);
```

#### M7. Copy/Paste Preserves `id` Field
**File:** `src/components/Canvas.tsx:354-356`
```typescript
const items = clipboardRef.current.map(({ type, x, y, ...rest }) => ({
  type, x: x + 20, y: y + 20, ...rest,
}));
```
The `...rest` spread includes the original object's `id`, `createdBy`, `createdByName`, `zIndex`, and other metadata. While `createObject` in `BoardContext` generates a new UUID for the Yjs map key, the `id` field inside the object data may conflict if the old ID is spread into the Yjs map entry.

**Fix:** Explicitly destructure and exclude `id`, `createdBy`, `createdByName`, `zIndex`:
```typescript
const items = clipboardRef.current.map(({ type, x, y, id, createdBy, createdByName, zIndex, ...rest }) => ({
  type, x: x + 20, y: y + 20, ...rest,
}));
```

#### M8. No Error Boundary
**Files:** `src/main.tsx`, `src/App.tsx`
A Konva rendering error or unhandled promise rejection in the sync layer will crash the entire app with no recovery path.

**Fix:** Add a React Error Boundary wrapping `<Canvas />` that shows a "Something went wrong" message with a reload button. ~15 minutes.

### LOW Priority

#### L1. `EditModal.tsx` Is Dead Code
**File:** `src/components/Canvas/EditModal.tsx`
This component is never imported or used anywhere. Inline editing is handled directly in `Canvas.tsx` via a `<textarea>` overlay.

**Fix:** Delete the file.

#### L2. `TestSync.tsx` Is Debug-Only Dead Code
**File:** `src/components/TestSync.tsx`
This component is never imported. It was likely used for early Firestore testing.

**Fix:** Delete or move to a `__debug__` directory.

#### L3. Shape Registration at Module Scope
**File:** `src/components/Canvas.tsx:26-55`
`registerShape()` calls execute at module evaluation time (top of Canvas.tsx). If Canvas.tsx is imported multiple times (HMR, code-splitting), shapes get re-registered. The current implementation silently overwrites, but it's fragile.

**Fix:** Guard with a check: `if (!getShapeEntry('sticky')) registerShape(...)` or use a module-level flag.

#### L4. Magic Numbers
**File:** `src/components/Canvas.tsx:84`
```typescript
newBox.width < 40 || newBox.height < 40
```
**File:** `src/agent/guardrails.ts`
```typescript
const MAX_INPUT_LENGTH = 500;
const RATE_LIMIT_MAX = 10;
```
These are reasonable defaults but should be named constants in a shared config for discoverability.

#### L5. Inactivity Timeout May Be Aggressive
**File:** `src/contexts/AuthContext.tsx`
The 4-minute warn / 5-minute logout timer resets on `mousemove`, `mousedown`, `keydown`, `touchstart`, `wheel`. In a collaborative whiteboard, a user may be watching others' work passively for >5 minutes. The `wheel` and `mousemove` events help, but if the user is on a different tab watching a video call while the board is visible on another monitor, they'll get logged out.

**Fix:** Consider adding `visibilitychange` as a reset event, or increasing the timeout to 15 minutes for a whiteboard context.

#### L6. Console Statements in Production
**Files:** `src/contexts/BoardContext.tsx`, `src/agent/pipeline.ts`
Multiple `console.log`, `console.debug`, and `console.warn` statements will appear in the production console. While not harmful, it's noisy.

**Fix:** Use a conditional logger that no-ops in production, or rely on a build step to strip `console.debug`.

---

## Identified Bugs and Fixes

### BUG-1 (HIGH): Duplicate Object IDs from Paste/Duplicate
**File:** `src/components/Canvas.tsx:354-370`
**Impact:** When pasting or duplicating, the spread `...rest` includes the original `id`. The `createObject` function in `BoardContext.tsx:354` generates a new UUID for the Yjs map key, but sets the `id` field inside the object to this new UUID *after* spreading. Wait — examining `createObject` more carefully:
```typescript
const obj: BoardObject = {
  id,        // new UUID
  type, x, y, ...
  ...SHAPE_DEFAULTS[type],
  ...overrides,  // overrides may contain old `id`!
};
```
If `overrides` contains an `id` field (from the spread), it overwrites the newly generated `id`. The Yjs map key will be the new UUID, but the `id` property inside the object will be the **old** UUID. This causes a mismatch: `yObjects.get(newId)` contains an object whose `.id` is the old ID.

**Severity:** HIGH — breaks `getObjectById`, selection, and any ID-based lookup for pasted objects.

**Fix in `Canvas.tsx` (paste handler, ~line 354):**
```typescript
const items = clipboardRef.current.map(({ type, x, y, id: _id, createdBy: _cb, createdByName: _cbn, zIndex: _z, ...rest }) => ({
  type, x: x + 20, y: y + 20, ...rest,
}));
```
Same fix needed for duplicate handler (~line 367).

### BUG-2 (MEDIUM): Selection Action Menu Position Wrong for Rotated Objects
**File:** `src/components/Canvas.tsx:911-915`
```typescript
const canvasTCX = selObj.x + (selObj.width / 2) * Math.cos(r);
const canvasTCY = selObj.y + (selObj.width / 2) * Math.sin(r);
```
This computes the top-center position using only `width/2` rotated — it should include `height` (0 at the top edge). The formula computes a point at `(x + width/2, y)` rotated around `(x, y)`, but `(x, y)` is the top-left corner before rotation. The actual rotation pivot in Konva defaults to `(0, 0)` of the node (top-left), so the geometry is approximately correct for the horizontal midpoint of the top edge, but the button will drift for significantly rotated objects.

**Severity:** MEDIUM — cosmetic issue, buttons may float away from shape at high rotation angles.

**Fix:** Use Konva's `node.getClientRect()` to get the bounding box in screen space, then position the menu above the bounding box center.

### BUG-3 (MEDIUM): Frame Containment Check Ignores Rotation
**File:** `src/components/Canvas.tsx:113-122`
```typescript
function isFullyInside(child: BoardObject, frame: BoardObject): boolean {
  return child.x >= frame.x && child.y >= frame.y && ...
```
This uses AABB coordinates and ignores rotation entirely. A rotated child may appear outside the frame visually but still pass the containment check (or vice versa).

**Severity:** MEDIUM — frame containment behavior is unpredictable for rotated objects.

**Fix:** For the early submission, document this as a known limitation. For the final submission, either disable rotation for frames or compute the oriented bounding box.

### BUG-4 (MEDIUM): `handleWheel` Is Not Wrapped in `useCallback`
**File:** `src/components/Canvas.tsx:459`
```typescript
const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
```
This is a plain function (not `useCallback`), so it's recreated on every render and causes the `<Stage>` to receive a new `onWheel` prop each time. For a high-frequency event handler, this may cause subtle issues with React's event system.

**Severity:** LOW-MEDIUM — may cause extra Stage reconciliation.

**Fix:** Wrap in `useCallback` with dependencies `[]` (it reads from refs).

### BUG-5 (LOW): `clearTimeout(null)` Called Harmlessly
**File:** `src/contexts/AuthContext.tsx:92`
```typescript
clearTimeout(warnTimerRef.current ?? undefined);
```
`clearTimeout(undefined)` is harmless per spec, but the `?? undefined` is unnecessary — `clearTimeout(null)` is also a no-op in all browsers. Not a bug, just unnecessary noise.

### BUG-6 (LOW): Viewport Culling Margin Is Fixed
**File:** `src/components/Canvas.tsx:268`
```typescript
const margin = 200;
```
The margin is in screen pixels, not canvas units. At high zoom (5×), the culling margin in canvas space is only 40 units — a 200×200 sticky note partially off-screen could be culled prematurely. At low zoom (0.1×), the margin is 2000 canvas units — unnecessarily wide.

**Fix:** Scale the margin: `const margin = 200 / stageScale;`

---

## Recommendations for Improvements

### Short-Term (Before Final Submission)

1. **Implement `createConnector`** — Required by spec. Add a ConnectorShape that renders a path between two objects by reading their positions, and register a `createConnector` agent tool.

2. **Fix paste/duplicate ID bug (BUG-1)** — Critical for correct behavior. 5-minute fix.

3. **Add backend proxy for Anthropic API** — Security requirement for any deployed app. Use a Firebase Cloud Function or Vercel Edge Function.

4. **Add Error Boundary** — Prevents white-screen crashes. 15-minute fix.

5. **Write deliverable documents** — AI Development Log, Cost Analysis, Pre-Search Document are all required for final submission.

### Medium-Term (Polish)

6. **Add unit tests** — Currently zero `*.test.ts` files. The agent pipeline, executor, guardrails, and geometry helpers are all pure functions that are easy to unit test.

7. **Extract `BoardActions` interface** — Single source of truth for type definitions.

8. **Memoize DebugContext value** — Prevents unnecessary re-renders in DebugOverlay.

9. **Scale viewport culling margin** — Fix BUG-6 for better culling at extreme zoom levels.

10. **Add Firestore security rules** — Essential for production deployment.

### Long-Term (Post-Submission)

11. **Move to WebSocket signaling server** — The default `y-webrtc` signaling at `localhost:4445` won't work in production without a deployed signaling server.

12. **Add undo/redo** — Yjs has built-in `UndoManager` support.

13. **Performance: investigate pan FPS** — The ~24 FPS at 100 objects during pan is a known bottleneck in Konva canvas redraw.

---

## Overall Score

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Completeness vs. Requirements | 8/10 | 30% | 2.4 |
| Code Quality & Architecture | 8/10 | 25% | 2.0 |
| Bug Severity | 7/10 | 20% | 1.4 |
| Real-Time Sync & Collab | 9/10 | 15% | 1.35 |
| AI Agent | 7/10 | 10% | 0.7 |
| **Total** | | | **7.85/10** |

**Rounded: 7.5/10** — Strong foundation with excellent sync architecture. The missing connector tool, client-side API key exposure, and paste ID bug are the most impactful issues to address before final submission.
