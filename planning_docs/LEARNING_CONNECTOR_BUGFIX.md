# Learning Explorer — Connector Edge Bug Investigation

**Branch:** `feature/bf-3-gap-expansion` (and main)
**Status:** Active bug — edges placed by agent are visually misaligned or missing
**Filed:** 2026-02-27

---

## What "broken" means in practice

Agent-placed KG edges (arrows connecting prerequisite nodes to target nodes) appear to:

1. **Start/end inside the node** instead of at the boundary
2. **Miss the node entirely** when the connection is drawn same-batch as placement
3. **Appear correct initially then drift** if the handover description of `autoConnectKgEdges` was expected but never landed

---

## Full data flow: how an edge gets created

### Path A — LLM calls `connectKnowledgeNodes` directly

```
runAgentCommand()
  └─ executeToolCalls(executableCalls, actions, ..., currentObjects, kgNodeMap)
       └─ [for each tc where tc.name === 'connectKnowledgeNodes']
            dispatchSingleAction('connectKnowledgeNodes', input, liveActions, liveObjects, kgNodeMap)
```

Inside `dispatchSingleAction` (`executor.ts:221–244`):

```typescript
const fromObj = findBoardObjectByKgNodeId(fromKgNodeId, allObjects)
              ?? allObjects?.find(o => o.id === fromKgNodeId);
const toObj   = findBoardObjectByKgNodeId(toKgNodeId, allObjects)
              ?? allObjects?.find(o => o.id === toKgNodeId);

const toPt   = resolveEndpoint(toObj, undefined,
                 { x: fromObj.x + fromObj.width / 2,
                   y: fromObj.y + fromObj.height / 2 });
const fromPt = resolveEndpoint(fromObj, undefined, toPt);

actions.createObject('line', fromPt.x, fromPt.y, {
  points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
  fromId: fromObj.id,
  toId:   toObj.id,
  arrowEnd: true,
  color: '#999999',
  strokeWidth: 2,
});
```

`resolveEndpoint` (`anchorResolve.ts`) takes an object's `x, y, width, height, rotation`
and projects the "other point" onto the nearest edge of the bounding box.

### Path B — BF-3 gap expansion (pipeline.ts, post-step-7)

```
runAgentCommand()
  └─ [after step 7 executeToolCalls completes]
     └─ gap expansion block:
          postExecObjects = getAllObjects() ← real board state
          gapObj = postExecObjects.find(o => o.kgNodeId === gapKgNodeId)
          prereqs = kgGetPrerequisites(gapKgNodeId)
          build placeKnowledgeNode calls at { x: gapObj.x, y: gapObj.y + 200 }
          build connectKnowledgeNodes calls
          executeToolCalls(expansionCalls, actions, ..., postExecObjects, kgNodeMap)
            └─ dispatchSingleAction('connectKnowledgeNodes', ...)
                 uses postExecObjects as allObjects
```

### Path C — `autoConnectKgEdges` (described in handover, NOT in codebase)

The BF-1/BF-2 handover described a function `autoConnectKgEdges()` that was supposed to:
- Run deterministically after mutations in both the early-return (clarification) path
  and the normal execution path
- Draw edges from KG edge data without an LLM call
- Deduplicate against existing lines

**This function does not exist anywhere in the codebase.** `grep -r autoConnectKgEdges` returns no results.
The handover's description of this work may have been aspirational or from a branch that was squashed incompletely.

---

## Every variable in the chain that affects endpoint coordinates

| Variable | Source | Correct value for kg-node |
|----------|--------|--------------------------|
| `fromObj.x`, `fromObj.y` | `allObjects` / `liveObjects` at time of connect call | Actual canvas coords — correct |
| `fromObj.width` | `allObjects` / `liveObjects` at time of connect call | **220** (see below) |
| `fromObj.height` | `allObjects` / `liveObjects` at time of connect call | 80 |
| `toObj.x`, `toObj.y` | same | Actual canvas coords — correct |
| `toObj.width` | same | **220** (see below) |
| `toObj.height` | same | 80 |
| `fromObj.rotation` | `allObjects` / `liveObjects` | 0 (agents never rotate KG nodes) |

---

## Bug 1 — `liveObjects` width fallback is wrong for `kg-node` type (confirmed)

### Where it happens

`executor.ts:288–302` — the `liveActions.createObject` wrapper that populates `liveObjects`:

```typescript
const liveActions: BoardActions = {
  ...actions,
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string {
    const id = actions.createObject(type, x, y, overrides);
    liveObjects.push({
      id, type, x, y,
      width:  (overrides?.width  ?? 160) as number,   // ← HARDCODED 160
      height: (overrides?.height ?? 80)  as number,   // ← HARDCODED 80
      zIndex: 0,
      ...overrides,
    } as BoardObject);
    return id;
  },
};
```

`placeKnowledgeNode` never passes `width`/`height` in its overrides (`executor.ts:209–218`):

```typescript
const id = actions.createObject('kg-node', posX, posY, {
  content: input.description as string,
  color,
  kgNodeId,
  kgConfidence: confidence as BoardObject['kgConfidence'],
  ...(input.gradeLevel ? { kgGradeLevel: input.gradeLevel as string } : {}),
  // NO width, NO height
});
```

### The actual stored width

`BoardContext.createObject` applies `SHAPE_DEFAULTS[type]` when writing to Yjs:

```typescript
// BoardContext.tsx:852
...SHAPE_DEFAULTS[type],   // { width: 220, height: 80 } for 'kg-node'
...safeOverrides,
```

`SHAPE_DEFAULTS['kg-node']` (declared in three places, all consistent):
- `BoardContext.tsx:99` → `{ width: 220, height: 80 }`
- `Canvas.tsx:62` → `{ width: 220, height: 80 }`
- `capabilities.ts:14` → `{ width: 220, height: 80 }`

### Effect of the mismatch

When `connectKnowledgeNodes` fires same-batch as `placeKnowledgeNode`:

- `liveObjects` has the node with `width: 160`
- `resolveEndpoint` computes the center-hint as `{ x: node.x + 80, y: node.y + 40 }`
  instead of `{ x: node.x + 110, y: node.y + 40 }`
- The projection target on the connected node is computed from a 160px bounding box
  but the actual rendered node is 220px wide
- **Left/right anchors are off by 30px inward** on each side
- The arrow visually starts/ends inside the node's visible boundary

### When this does NOT apply

When `connectKnowledgeNodes` is called for nodes that were already on the board
before the current batch (pre-existing nodes), the executor receives
`currentObjects = getAllObjects?.() ?? []` — the real Yjs board state, which has
`width: 220` from `SHAPE_DEFAULTS`. Endpoint calculation is correct in this case.

The bug is **strictly a same-batch issue**: only when `placeKnowledgeNode` and
`connectKnowledgeNodes` run in the same `executeToolCalls` call.

---

## Bug 2 — No post-placement re-snap (rendering gap)

After the pipeline finishes and React re-renders:

- `LineShape.tsx` reads `data.points` directly and renders the `<Arrow>` at the stored
  absolute coordinates — no recomputation happens
- The Canvas's drag-based endpoint recomputation (`handleDragStart/Move/End` in `Canvas.tsx`)
  fires only when a **node is moved** by a user drag event
- There is no `useEffect` or observer that re-snaps connected line endpoints when a
  node first appears on the canvas or when `fromId`/`toId` are set

Result: even if Bug 1 were fixed, there is no "settle to correct position" pass after
initial placement. The computed endpoint coordinates from creation time are what you see.

---

## Bug 3 — `resolveEndpoint` receives wrong `otherPt` when computing `toPt`

The connection logic in `connectKnowledgeNodes`:

```typescript
const toPt   = resolveEndpoint(toObj, undefined,
                 { x: fromObj.x + fromObj.width / 2,   // center-of-fromObj
                   y: fromObj.y + fromObj.height / 2 });
```

The "other point" passed to `resolveEndpoint` for the `toObj` anchor is the **center of `fromObj`**.
If `fromObj.width` is 160 instead of 220, this center is at `x + 80` instead of `x + 110`.

For nodes placed in a horizontal row this is a 30px x-axis error in the directional hint.
Because `resolveEndpoint` uses this hint to decide which edge of `toObj` to attach to,
a 30px error in the hint usually selects the correct edge but places the anchor point
slightly off the ideal position along that edge.

---

## Bug 4 — Same-x prereq stacking in BF-3 gap expansion

In the BF-3 gap expansion hook (`pipeline.ts`), ALL prerequisites of a gap node are placed at:

```typescript
{ x: gapObj.x, y: gapObj.y + 200 }
```

When a gap node has multiple prerequisites (e.g., 6.RP.A.2 has 4), they all get the same `x` and `y`,
causing them to be stacked exactly on top of each other. The executor's grid layout (`gridPositions`)
does not apply here because the positions are explicitly provided.

`connectKnowledgeNodes` then tries to draw arrows from 4 co-located nodes to the gap node —
all arrows overlap and appear as one.

---

## What the rendering system does correctly (not a bug)

| Mechanism | Status |
|-----------|--------|
| `fromId`/`toId` stored on line | Works — Canvas drag handler uses this to find connected nodes |
| Endpoint recomputation on drag | Works — `handleDragMove` imperatively updates Konva nodes |
| Endpoint persistence on drag end | Works — `batchUpdate` writes to Yjs |
| Dedup against existing board lines (edge dedup in BF-3) | Works — checks `postExecObjects` for existing `fromId`/`toId` match |
| `kgNodeMap` dedup preventing duplicate node placement | Works |
| `liveObjects` same-batch connect (BF-1) | Works — nodes are found; anchor coords are just slightly wrong |
| `resolveEndpoint` rotation handling | Correct for the case of unrotated nodes (agents never rotate) |

---

## Summary: potential fixes to consider

1. **Fix liveObjects width fallback** — type-aware defaults in the `liveActions.createObject` wrapper,
   or always pass explicit `width`/`height` from `placeKnowledgeNode`'s overrides.
   This is the smallest targeted fix for same-batch endpoint accuracy.

2. **Add a re-snap pass after placement** — after the pipeline's `executeToolCalls`, for every
   newly created line with `fromId`/`toId`, look up the connected objects from `getAllObjects()`
   and recompute `points` using the real stored dimensions. Could live in the same gap expansion
   area of `pipeline.ts`, or as a dedicated post-execution step.

3. **Spread prereq nodes on x-axis** — in the BF-3 gap expansion block, offset each prereq by
   `index * 240` on the x-axis (matching the 220px node width + 20px gap) so they don't stack.

4. **Implement `autoConnectKgEdges`** — the function described in the handover. It would take the
   `kgNodeMap`, the current board objects, and the KG edge data from `getEdgesAmong`, then draw
   any KG-graph edges that don't already exist as lines on the board. This would replace the
   LLM's responsibility for calling `connectKnowledgeNodes` and centralize all edge logic in one
   deterministic pipeline function.

---

## Key file references

| File | Lines | Relevance |
|------|-------|-----------|
| `src/agent/executor.ts` | 288–302 | liveObjects width fallback (Bug 1) |
| `src/agent/executor.ts` | 221–244 | `connectKnowledgeNodes` dispatch with `resolveEndpoint` calls |
| `src/agent/pipeline.ts` | ~612–680 | BF-3 gap expansion block (Bug 4 stacking) |
| `src/utils/anchorResolve.ts` | 29–109 | `resolveEndpoint` — uses `obj.width`/`obj.height` |
| `src/contexts/BoardContext.tsx` | 91–99 | `SHAPE_DEFAULTS` — kg-node is width 220, height 80 |
| `src/components/Canvas.tsx` | 60–63 | `registerShape` confirms kg-node width 220 |
| `src/components/shapes/LineShape.tsx` | ~1–235 | Renders from stored `points`; no re-snap on mount |
