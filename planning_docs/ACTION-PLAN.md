# CollabBoard — Action Plan

**Generated:** 2026-02-21
**Based on:** AUDIT.md (same date)
**Target:** Final Submission (Sunday 10:59 PM CT)

---

## Executive Summary

This plan addresses all 20 issues from the audit across 6 EPICs, ordered by descending priority. The total estimated effort is **12–16 hours** of focused work, well within the remaining window before Sunday's deadline.

| Priority | Issues | Est. Effort | Impact |
|---|---|---|---|
| HIGH (P0) | BUG-1, H1, H2, M8 | 4–5 hrs | Functional correctness, security, spec compliance |
| MEDIUM (P1) | H3, M1–M7, BUG-2, BUG-4, M2 | 4–6 hrs | Quality, performance, maintainability |
| LOW (P2) | L1–L6, BUG-3, BUG-5, BUG-6 | 2–3 hrs | Polish, cleanup |
| DOCS (P1) | Missing deliverables | 2–3 hrs | Submission requirements |

**Critical path:** EPIC 1 (security + bugs) → EPIC 2 (connector feature) → EPIC 5 (deliverable docs) → everything else.

---

## EPIC 1: Critical Bugs & Security

> Fixes that affect correctness, security, or would cause a failing grade if unaddressed.

### Branch: `bugfix/critical-paste-id`

**Related issues:** BUG-1 (HIGH), M7

**Problem:** Paste and duplicate spread the original object's `id`, `createdBy`, `createdByName`, and `zIndex` into the override object passed to `createObject`. Because `createObject` spreads `...overrides` after setting `id`, the old ID overwrites the new one, creating a Yjs key → object ID mismatch.

#### Commit 1: Strip identity fields from paste/duplicate overrides

**Sub-tasks:**
1. In `src/components/Canvas.tsx`, locate the paste handler (~line 352–363). Change:
   ```typescript
   // BEFORE
   const items = clipboardRef.current.map(({ type, x, y, ...rest }) => ({
     type, x: x + 20, y: y + 20, ...rest,
   }));
   ```
   to:
   ```typescript
   // AFTER
   const items = clipboardRef.current.map(
     ({ type, x, y, id: _, createdBy: _1, createdByName: _2, zIndex: _3, ...rest }) => ({
       type, x: x + 20, y: y + 20, ...rest,
     })
   );
   ```
2. Apply the identical fix to the duplicate handler (~line 365–373).
3. **Defense-in-depth** — In `src/contexts/BoardContext.tsx` `createObject`, ensure the generated `id` is always authoritative by placing it *after* the overrides spread:
   ```typescript
   const obj: BoardObject = {
     type, x, y,
     width: 200, height: 200, rotation: 0,
     color: '#FFE66D', zIndex: Date.now(),
     createdBy: user.uid,
     createdByName: user.displayName || 'Anonymous',
     ...SHAPE_DEFAULTS[type],
     ...overrides,
     id,  // <-- MUST come last to guarantee new UUID
   };
   ```
   This follows the **Open-Closed Principle**: callers can extend via overrides, but the invariant (unique ID) is enforced by the base.

**Testing:**
- Manual: Create an object, Ctrl+C, Ctrl+V. Verify the pasted object can be selected, moved, deleted independently.
- Add a unit test `src/__tests__/createObject.test.ts` asserting that `createObject` always returns a UUID that matches the object's `.id` field, even when overrides include an `id`.

---

### Branch: `bugfix/api-key-proxy`

**Related issues:** H1 (HIGH)

**Problem:** `VITE_ANTHROPIC_API_KEY` is bundled into the client-side build. Anyone with browser DevTools can extract it.

#### Commit 1: Create a serverless proxy function

**Sub-tasks:**
1. Create `functions/agent-proxy.ts` (or `api/agent.ts` for Vercel):
   ```typescript
   // Vercel Edge Function example: api/agent.ts
   import type { VercelRequest, VercelResponse } from '@vercel/node';

   export default async function handler(req: VercelRequest, res: VercelResponse) {
     if (req.method !== 'POST') return res.status(405).end();

     const apiKey = process.env.ANTHROPIC_API_KEY; // server-side only
     if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

     // Forward the request body to Anthropic
     const response = await fetch('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-api-key': apiKey,
         'anthropic-version': '2023-06-01',
       },
       body: JSON.stringify(req.body),
     });

     const data = await response.json();
     return res.status(response.status).json(data);
   }
   ```
2. Add server-side rate limiting (e.g., by Firebase UID from the auth token).
3. Validate the request body shape server-side (model, max_tokens, system, messages, tools fields).

#### Commit 2: Update `apiClient.ts` to use the proxy

**Sub-tasks:**
1. Replace the direct Anthropic URL with the proxy URL:
   ```typescript
   const API_URL = import.meta.env.PROD
     ? '/api/agent'   // proxy in production
     : 'https://api.anthropic.com/v1/messages'; // direct in dev
   ```
2. In production, remove the `x-api-key` header from the client request. Instead, include the Firebase ID token for authentication:
   ```typescript
   const idToken = await auth.currentUser?.getIdToken();
   headers['Authorization'] = `Bearer ${idToken}`;
   ```
3. Remove `VITE_ANTHROPIC_API_KEY` from `.env.production` and `.env.example`.
4. Delete the `console.warn` about production API keys (no longer applicable).

**SOLID alignment:**
- **Dependency Inversion**: `apiClient.ts` depends on an abstract "AI endpoint" URL, not on the concrete Anthropic API. The proxy is an implementation detail.
- **Single Responsibility**: The proxy handles auth validation and key management; the client handles request formatting.

**Testing:**
- Deploy to staging and verify Boardie still works.
- Verify `VITE_ANTHROPIC_API_KEY` does not appear in the production JS bundle (`grep` the build output).

---

### Branch: `bugfix/error-boundary`

**Related issues:** M8 (MEDIUM, but quick high-value fix)

#### Commit 1: Add ErrorBoundary component

**Sub-tasks:**
1. Create `src/components/ErrorBoundary.tsx`:
   ```typescript
   import { Component } from 'react';
   import type { ReactNode, ErrorInfo } from 'react';

   interface Props { children: ReactNode; }
   interface State { hasError: boolean; error: Error | null; }

   export default class ErrorBoundary extends Component<Props, State> {
     state: State = { hasError: false, error: null };

     static getDerivedStateFromError(error: Error): State {
       return { hasError: true, error };
     }

     componentDidCatch(error: Error, info: ErrorInfo) {
       console.error('[ErrorBoundary]', error, info.componentStack);
     }

     render() {
       if (this.state.hasError) {
         return (
           <div style={{ padding: 40, textAlign: 'center' }}>
             <h2>Something went wrong</h2>
             <p style={{ color: '#666' }}>{this.state.error?.message}</p>
             <button onClick={() => window.location.reload()}
               style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}>
               Reload
             </button>
           </div>
         );
       }
       return this.props.children;
     }
   }
   ```
2. Wrap `<Canvas />` in `App.tsx`:
   ```typescript
   <ErrorBoundary>
     <Canvas />
   </ErrorBoundary>
   ```

**SOLID alignment:**
- **Single Responsibility**: ErrorBoundary handles only crash recovery; Canvas handles only board rendering.
- **Open-Closed**: Adding error boundaries to new components doesn't modify existing ones.

---

## EPIC 2: Spec Compliance — Connector Feature

> Implements the missing `createConnector(fromId, toId, style)` requirement.

### Branch: `feature/connectors`

**Related issues:** H2 (HIGH)

#### Commit 1: Create `ConnectorShape` component

**Sub-tasks:**
1. Create `src/components/shapes/ConnectorShape.tsx`:
   - Reads `fromId` and `toId` from the `BoardObject` data.
   - Computes endpoint positions by looking up the connected objects' center or anchor points.
   - Renders a Konva `Arrow` or `Line` between the two endpoints.
   - Recalculates endpoints on each render (connected objects may have moved).
   - Accepts `fromAnchor`/`toAnchor` props (`'top' | 'right' | 'bottom' | 'left'`) to pick the connection point on each shape.
   ```typescript
   import { memo } from 'react';
   import { Arrow, Line } from 'react-konva';
   import type { ShapeProps, BoardObject } from '../../types/board';

   interface ConnectorProps extends ShapeProps {
     allObjects: BoardObject[];
   }

   function getAnchorPoint(obj: BoardObject, anchor?: string): { x: number; y: number } {
     const cx = obj.x + (obj.width ?? 0) / 2;
     const cy = obj.y + (obj.height ?? 0) / 2;
     switch (anchor) {
       case 'top':    return { x: cx, y: obj.y };
       case 'bottom': return { x: cx, y: obj.y + (obj.height ?? 0) };
       case 'left':   return { x: obj.x, y: cy };
       case 'right':  return { x: obj.x + (obj.width ?? 0), y: cy };
       default:       return { x: cx, y: cy }; // center
     }
   }

   export default memo(function ConnectorShape({ data, allObjects, isSelected, onSelect }: ConnectorProps) {
     const fromObj = allObjects.find(o => o.id === data.fromId);
     const toObj   = allObjects.find(o => o.id === data.toId);
     if (!fromObj || !toObj) return null; // connected objects deleted

     const from = getAnchorPoint(fromObj, data.fromAnchor);
     const to   = getAnchorPoint(toObj, data.toAnchor);
     const points = [from.x, from.y, to.x, to.y];

     const ShapeComponent = data.arrowEnd ? Arrow : Line;
     return (
       <ShapeComponent
         id={`note-${data.id}`}
         points={points}
         stroke={data.color ?? '#666'}
         strokeWidth={data.strokeWidth ?? 2}
         hitStrokeWidth={12}
         dash={isSelected ? [8, 4] : undefined}
         onClick={(e) => onSelect(data.id, e)}
       />
     );
   });
   ```
2. Register in `Canvas.tsx`:
   ```typescript
   registerShape('connector', {
     component: ConnectorShape,
     defaults: { width: 0, height: 0, color: '#666666', strokeWidth: 2 },
     minWidth: 0, minHeight: 0,
   });
   ```
3. Update `ObjectRenderer.tsx` to pass `allObjects` as a prop to ConnectorShape (needed for endpoint lookups). This requires a conditional prop injection for the `connector` type.

#### Commit 2: Add `createConnector` agent tool

**Sub-tasks:**
1. In `src/agent/tools.ts`, add a Zod schema:
   ```typescript
   createConnector: z.object({
     from_id: z.string().describe('ID of the source object'),
     to_id:   z.string().describe('ID of the target object'),
     style:   z.enum(['line', 'arrow', 'dashed']).optional().default('arrow'),
     color:   z.string().optional(),
   }),
   ```
2. Add to `TOOL_DEFINITIONS`:
   ```typescript
   {
     name: 'createConnector',
     description: 'Create a connector line/arrow between two existing objects',
     input_schema: { ... }
   }
   ```
3. In `src/agent/executor.ts`, add a `case 'createConnector'` in `dispatchSingleAction`:
   ```typescript
   case 'createConnector': {
     const color = input.color ? resolveColor(input.color as string) : undefined;
     const style = input.style as string;
     const id = actions.createObject('connector', 0, 0, {
       fromId:    input.from_id as string,
       toId:      input.to_id   as string,
       arrowEnd:  style === 'arrow',
       strokeWidth: style === 'dashed' ? 1 : 2,
       ...(color ? { color } : {}),
     });
     return { success: true, objectId: id };
   }
   ```
4. In `src/agent/capabilities.ts`, add `'connector'` to `SUPPORTED_SHAPE_TYPES`.
5. Update `systemPrompt.ts` to document the `createConnector` tool and usage examples.

#### Commit 3: Add connector tool to planner

**Sub-tasks:**
1. Add `createConnector` to `PLANNER_TOOL_DEFINITIONS` in `tools.ts`.
2. Update `plannerPrompt.ts` to include connector examples.

**Testing:**
- Manual: Use Boardie chat: "Connect the rectangle to the circle with an arrow". Verify a visible arrow appears between the two shapes.
- Manual: Move one of the connected shapes. Verify the connector updates position.
- Unit test: `createConnector` executor dispatches correctly with valid/invalid IDs.

**SOLID alignment:**
- **Open-Closed**: New shape type added without modifying existing shape components.
- **Single Responsibility**: ConnectorShape only handles connector rendering; endpoint computation is isolated in `getAnchorPoint`.
- **Interface Segregation**: ConnectorShape gets the extra `allObjects` prop it needs without forcing other shapes to accept it.

---

## EPIC 3: Type Safety & Architecture

> Eliminates DRY violations, `any` casts, and structural issues that impede maintainability.

### Branch: `refactor/shared-types`

**Related issues:** H3, M5

#### Commit 1: Extract shared `BoardActions` interface

**Sub-tasks:**
1. In `src/types/board.ts`, add:
   ```typescript
   export interface BoardActions {
     createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
     updateObject(id: string, updates: Partial<BoardObject>): void;
     deleteObject(id: string): void;
     batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
     batchUpdate(updates: Array<{ id: string; changes: Partial<BoardObject> }>): void;
     batchDelete(ids: string[]): void;
   }
   ```
2. Delete the local `BoardActions` interfaces in `executor.ts` and `pipeline.ts`. Import from `types/board`.
3. Update `BoardActionsValue` in `BoardContext.tsx` to extend `BoardActions` (add the extra methods like `updateCursorPosition`, `getObjectById`, etc.).

**SOLID alignment:**
- **Interface Segregation**: Agent code imports only `BoardActions` (the subset it needs), not the full `BoardActionsValue` that includes cursor/query methods.
- **Dependency Inversion**: Agent modules depend on an abstract interface, not on the concrete BoardContext implementation.

#### Commit 2: Fix `parentId` type and remove `as any` casts

**Sub-tasks:**
1. In `src/types/board.ts`, change `parentId?: string` to `parentId: string` with default `''` in SHAPE_DEFAULTS, or keep it optional but accept `''` as valid.
2. In `Canvas.tsx`, replace all `{ parentId: '' as any }` with `{ parentId: '' }` (now type-safe).
3. In `shapeRegistry.ts`, change `ComponentType<any>` to `ComponentType<ShapeProps>`.

#### Commit 3: Memoize DebugContext provider value

**Related issues:** M6

**Sub-tasks:**
1. In `src/contexts/DebugContext.tsx`, wrap the `value` object in `useMemo`:
   ```typescript
   const value = useMemo<DebugContextValue>(() => ({
     debugInfo, yjsLatencyMs, yjsReceiveGapMs, yjsLatestSampleMs,
     yjsReceiveRate, yjsSendRate, p2pOnly, localCursorRef,
     debugInfoRef: debugRef, updateDebug,
     setYjsLatencyMs, setYjsReceiveGapMs, setYjsLatestSampleMs,
     setYjsReceiveRate, setYjsSendRate, setP2pOnly,
   }), [debugInfo, yjsLatencyMs, yjsReceiveGapMs, yjsLatestSampleMs,
        yjsReceiveRate, yjsSendRate, p2pOnly, updateDebug]);
   ```
   Note: `localCursorRef`, `debugRef`, and all `set*` functions are stable refs/setState and don't need to be in the dep array.

#### Commit 4: Stabilize `isSelected` callback

**Related issues:** M3

**Sub-tasks:**
1. In `src/contexts/SelectionContext.tsx`:
   ```typescript
   const selectedIdsRef = useRef(selectedIds);
   selectedIdsRef.current = selectedIds;

   const isSelected = useCallback(
     (id: string) => selectedIdsRef.current.has(id),
     []  // stable identity forever
   );
   ```

---

### Branch: `refactor/agent-validation`

**Related issues:** M4

#### Commit 1: Add object existence validation in executor

**Sub-tasks:**
1. In `src/agent/executor.ts`, for `moveObject`, `resizeObject`, `updateText`, `changeColor`, `deleteObject` cases, add an existence check. This requires passing a `getObjectById` function to `executeToolCalls`:
   ```typescript
   // Add to executeToolCalls signature:
   objectExists?: (id: string) => boolean,

   // In dispatchSingleAction, for mutation tools:
   case 'moveObject': {
     if (objectExists && !objectExists(input.id as string)) {
       return { success: false, error: `Object ${input.id} not found` };
     }
     // ... existing logic
   }
   ```
2. Thread `getObjectById` through from `useAgent.ts` → `pipeline.ts` → `executor.ts`.

**SOLID alignment:**
- **Dependency Inversion**: The executor receives an existence-check function, not a direct dependency on Yjs internals.
- **Single Responsibility**: Validation logic stays in the executor, not scattered across tools.

---

## EPIC 4: Performance & Rendering Fixes

> Addresses re-render issues, culling bugs, and memoization gaps.

### Branch: `fix/canvas-performance`

**Related issues:** M1, BUG-4, BUG-6

#### Commit 1: Wrap `handleWheel` in `useCallback`

**Sub-tasks:**
1. In `src/components/Canvas.tsx`, convert `handleWheel` to use `useCallback` with `[]` deps (it reads only from refs: `stageRef`, `stagePosRef`, `stageScaleRef`, `dotGridRef`):
   ```typescript
   const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
     // existing body unchanged — all reads are from refs
   }, []);
   ```

#### Commit 2: Scale viewport culling margin by zoom

**Sub-tasks:**
1. In the `visibleObjects` useMemo (~line 267):
   ```typescript
   const margin = 200 / stageScale;  // constant screen-space margin
   ```

#### Commit 3: Extract presence rendering to avoid Canvas re-renders

**Related issues:** M1

**Sub-tasks:**
1. Create `src/components/PresenceLayer.tsx` that consumes `presence` from a new `useBoardData()` hook (or directly from `BoardDataContext`).
2. Export `useBoardData` from `BoardContext.tsx` (it already has `BoardDataContext` internally — just expose a hook).
3. In `Canvas.tsx`, stop destructuring `presence` from `useBoard()`. Instead, render `<PresenceLayer />` as a sibling that independently subscribes to presence data.
4. Canvas now only re-renders on `objects` and `loading` changes — not on every cursor position update from Firestore fallback.

---

## EPIC 5: Cleanup & Polish

> Dead code removal, magic number extraction, and minor fixes.

### Branch: `chore/cleanup`

**Related issues:** L1, L2, L3, L4, L5, L6, BUG-5

#### Commit 1: Remove dead code

**Sub-tasks:**
1. Delete `src/components/Canvas/EditModal.tsx`.
2. Delete `src/components/TestSync.tsx`.
3. Verify no imports reference these files.

#### Commit 2: Guard shape registration against re-registration

**Sub-tasks:**
1. In `src/components/Canvas.tsx`, wrap each `registerShape` call:
   ```typescript
   import { registerShape, getShapeEntry } from '../utils/shapeRegistry';

   if (!getShapeEntry('sticky')) {
     registerShape('sticky', { ... });
   }
   // repeat for each shape
   ```
   Or alternatively, add a guard inside `registerShape` itself:
   ```typescript
   export function registerShape(type: ShapeType, entry: ShapeRegistryEntry): void {
     if (registry[type]) return; // already registered
     registry[type] = entry;
   }
   ```
   The second approach is simpler and follows **Open-Closed** — callers don't need to change.

#### Commit 3: Extract magic numbers to constants

**Sub-tasks:**
1. Create `src/utils/constants.ts`:
   ```typescript
   export const MIN_TRANSFORM_SIZE = 40;
   export const ZOOM_MIN = 0.1;
   export const ZOOM_MAX = 5;
   export const ZOOM_STEP = 1.05;
   export const VIEWPORT_CULL_MARGIN_PX = 200;
   export const PAN_THROTTLE_MS = 150;
   export const INACTIVITY_WARN_MS = 4 * 60 * 1000;
   export const INACTIVITY_LOGOUT_MS = 5 * 60 * 1000;
   ```
2. Import and use in `Canvas.tsx`, `AuthContext.tsx`, etc.

#### Commit 4: Increase inactivity timeout and add `visibilitychange`

**Related issues:** L5

**Sub-tasks:**
1. In `src/contexts/AuthContext.tsx`, increase timeouts to 14 min warn / 15 min logout:
   ```typescript
   const WARN_MS  = 14 * 60 * 1000;
   const IDLE_MS  = 15 * 60 * 1000;
   ```
2. Add `visibilitychange` as a reset event:
   ```typescript
   const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'visibilitychange'] as const;
   ```

#### Commit 5: Strip console statements in production

**Related issues:** L6

**Sub-tasks:**
1. In `vite.config.ts`, add esbuild drop for production:
   ```typescript
   export default defineConfig({
     esbuild: {
       drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
     },
     // ...
   });
   ```
   This strips all `console.*` and `debugger` statements from the production bundle at build time. Zero runtime cost, no code changes needed.

---

### Branch: `fix/selection-menu-rotation`

**Related issues:** BUG-2

#### Commit 1: Use Konva `getClientRect` for selection menu positioning

**Sub-tasks:**
1. In `Canvas.tsx`, replace the manual rotation math (~line 897–916) with:
   ```typescript
   const node = layerRef.current?.findOne(`#note-${selId}`);
   if (!node) return null;
   const rect = node.getClientRect({ relativeTo: stageRef.current });
   const btnScreenX = stagePos.x + (rect.x + rect.width / 2) * stageScale;
   const btnScreenY = stagePos.y + rect.y * stageScale - 28;
   ```
   This correctly handles rotation, scaling, and any transform applied to the node.

---

## EPIC 6: Firestore Security & Testing

> Production hardening and test coverage.

### Branch: `security/firestore-rules`

**Related issues:** M2

#### Commit 1: Add Firestore security rules

**Sub-tasks:**
1. Create `firestore.rules`:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /boards/{boardId}/{document=**} {
         allow read, write: if request.auth != null;
       }
       match /boards/{boardId}/presence/{userId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
2. Add `firebase.json` (or update existing) to reference these rules:
   ```json
   {
     "firestore": {
       "rules": "firestore.rules"
     }
   }
   ```
3. Deploy: `firebase deploy --only firestore:rules`.

---

### Branch: `test/unit-tests`

**Related issues:** Audit recommendation #6

#### Commit 1: Set up test framework

**Sub-tasks:**
1. Install Vitest (works with Vite out of the box):
   ```bash
   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. Add `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       environment: 'jsdom',
       globals: true,
     },
   });
   ```
3. Add script to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

#### Commit 2: Add agent unit tests

**Sub-tasks:**
1. `src/agent/__tests__/guardrails.test.ts`: Test `sanitizeInput`, `checkRateLimit`, `validateActionCount` — pure functions, easy to test.
2. `src/agent/__tests__/executor.test.ts`: Test `dispatchSingleAction` with mock `BoardActions`. Verify each tool name dispatches correctly, unknown tools return error, invalid IDs are caught (after EPIC 3 fix).
3. `src/agent/__tests__/geometryHelpers.test.ts`: Test `gridPositions`, `circlePositions`, `flowPositions`, `fitInside` — pure math, no mocking needed.
4. `src/agent/__tests__/capabilities.test.ts`: Test `resolveColor` with named colors, hex pass-through, and unknown names.

#### Commit 3: Add board logic unit tests

**Sub-tasks:**
1. `src/__tests__/createObject.test.ts`: Verify `id` in the created object always matches the Yjs map key (guards against BUG-1 regression).
2. `src/__tests__/frameContainment.test.ts`: Test `isFullyInside` and `getDescendantIds` with various configurations.

---

## Overall Recommendations

### CI/CD Integration
- Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `npm run build` and `vitest run` on every push. This prevents regressions and ensures the build stays green.
- Add a Playwright smoke test in CI that verifies the app loads and a sticky note can be created.

### Code Review Practices
- Require PR reviews before merging to `main` for multi-commit branches.
- Use the audit's priority labels (H/M/L) as commit message prefixes for traceability.

### Documentation
- Ensure `README.md` has a clear setup guide, architecture overview, and deployed link (submission requirement).
- Write the required AI Development Log, Cost Analysis, and Pre-Search Document before Sunday.

---

## Timeline Estimate

| Day | Work | EPICs |
|---|---|---|
| **Friday PM** (2–3 hrs) | Critical bug fixes + error boundary | EPIC 1 (paste ID, error boundary) |
| **Saturday AM** (3–4 hrs) | Connector feature + API proxy | EPIC 2, EPIC 1 (proxy) |
| **Saturday PM** (3–4 hrs) | Type safety refactors + performance | EPIC 3, EPIC 4 |
| **Sunday AM** (2–3 hrs) | Cleanup, tests, Firestore rules | EPIC 5, EPIC 6 |
| **Sunday PM** (2–3 hrs) | Deliverable docs + final testing | Docs, demo video |

**Total: ~12–16 hours**

### Priority if time is short (minimum viable fixes):
1. BUG-1 paste/duplicate ID fix (15 min)
2. Connector feature — Commit 1+2 only (2 hrs)
3. Error Boundary (15 min)
4. Deliverable documents (2 hrs)
5. Firestore rules (30 min)

These 5 items alone (~5 hours) close the most impactful gaps and ensure spec compliance.

---

## Appendix: Cross-Reference with feature-wishlist.md

The `feature-wishlist.md` tracks known bugs and desired enhancements independently of this audit. Here's how the Action Plan overlaps:

### Directly Resolved

| Wishlist Item | Action Plan Fix |
|---|---|
| **Duplicated objects share identity** (Ctrl+D/Ctrl+V copies behave as linked) | EPIC 1, `bugfix/critical-paste-id` — strips `id`, `createdBy`, `createdByName`, `zIndex` from paste/duplicate overrides so each copy gets a fully independent identity. |

### Partially Addressed

| Wishlist Item | Action Plan Coverage | Remaining Gap |
|---|---|---|
| **Frame rotation causes children to jump position** | EPIC 5, `fix/selection-menu-rotation` (BUG-2/BUG-3) acknowledges rotation breaks AABB containment and selection menu positioning. | The containment check itself (`isFullyInside`) is not updated to handle oriented bounding boxes — documented as a known limitation. |
| **Frame resize doesn't recompute child containment** | BUG-3 discussion touches containment logic. | No commit adds a resize-end containment recheck. Would need a `handleTransformEnd` hook on FrameShape to call the same containment logic as drag-end. |
| **Frame children jump/glitch after repositioning** | EPIC 4 touches the imperative frame-drag system. | The stale-origin bug in `frameDragChildOriginsRef` is not directly fixed — would require clearing cached origins when children are repositioned independently. |

### Not Addressed by Action Plan

| Wishlist Item | Category |
|---|---|
| Frame z-index edge case with intersecting nested stacks | Bug |
| Removing a child glitches sibling positions during frame drag | Bug |
| Multi-user selection highlighting | Feature |
| ESC to cancel drag | Feature |
| Multi-select performance (5–10+ objects) | Performance |
| Line/arrow improvements (segment drag, magnetic snapping, group move) | Feature |
| Minimap | Feature |
| New-user tutorial / onboarding | Feature |
| Multi-board support (dashboard, sharing, permissions) | Feature |
| Undo/redo | Feature |
| Layers/z-index management via selection menu | Feature |
| Export/import (PNG, SVG, JSON) | Feature |
| Comments/annotations | Feature |
| Accessibility (keyboard nav, screen reader, high contrast) | Feature |

**Summary:** 1 bug directly fixed, 3 partially addressed, 2 bugs and all feature requests untouched. The duplicate-objects-share-identity fix is the highest-value wishlist item resolved by this plan.
