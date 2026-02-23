# Line Tool Fixes: Connections, Live Drag, Custom Cursor

## Context
Three line-related issues to fix:
1. **Group drag clears connections** — when objects + line are selected and dragged/rotated via Transformer, `fromId`/`toId` get cleared. They should always be preserved.
2. **No live connector update during drag** — dragging a node with connected lines only shows the update on mouse release. Lines should follow the node in real-time.
3. **Line tool needs custom cursor + hover magnetism** — when line tool is active, cursor should be a small filled circle (like a line endpoint node), and it should snap to nearby objects' corners/midpoints/edges while hovering (with snap indicator visible).

## Files to modify
- `src/components/Canvas.tsx` — all three fixes
- `src/components/Canvas/LinePreview.tsx` — snap indicator during line preview

---

## Fix 1: Preserve connections during Transformer group drag

**`src/components/Canvas.tsx`** — `handleTransformerDragEnd` (~line 964)

Remove the `fromId: '', toId: '', fromAnchor: '', toAnchor: ''` clearing from line updates. Just translate points without touching connection fields:

```ts
// Line 963-964: change from
changes: { points: newPts, x: newPts[0], y: newPts[1], fromId: '', toId: '', fromAnchor: '' as any, toAnchor: '' as any },
// to
changes: { points: newPts, x: newPts[0], y: newPts[1] },
```

Also in `LineShape.tsx` `handleSegmentDragEnd` (~line 140-148), remove the same clearing — dragging a line body shouldn't disconnect it either.

---

## Fix 2: Live connector update during Transformer drag

The Transformer has `onDragStart`/`onDragEnd` but no `onDragMove`. Need to add one.

**`src/components/Canvas.tsx`:**

1. In `handleTransformerDragStart` (~line 940), cache external connectors (same pattern as `handleTransformerTransformStart`):
   - For each `selectedId`, find connected lines where the line is NOT itself selected
   - Cache `{ lineId, lineNode, endpoint, connectedObjId, origPoints }` into `transformConnectorCacheRef`

2. Add `handleTransformerDragMove` callback:
   - Compute `dx`/`dy` from Transformer's current position vs `trDragStartPosRef`
   - For each cached connector entry, offset the connected endpoint by `dx`/`dy` from `origPoints`
   - Imperatively update Line/Arrow points + Circle positions (same pattern as `handleTransformerTransform`)
   - Call `layerRef.current?.batchDraw()`

3. In `handleTransformerDragEnd`, also persist connector point updates (using same dx/dy logic) via `batchUpdate`, and clear `transformConnectorCacheRef`.

4. Wire `onDragMove={handleTransformerDragMove}` on the `<Transformer>` element (~line 1116).

Reuse existing: `transformConnectorCacheRef`, `TransformConnectorEntry` interface, `resolveEndpoint` from `anchorResolve.ts`, `getConnectedLines` from `connectorIndex.ts`.

---

## Fix 3: Line tool custom cursor + hover magnetism

### 3a: Custom cursor
**`src/components/Canvas.tsx`** — Stage `style` (~line 1070):

Change cursor logic to handle line tool:
```ts
style={{ cursor: activeTool === 'line' ? 'none' : isDraggable ? 'grab' : 'crosshair' }}
```

Render a Konva `Circle` on the canvas layer that follows cursor position (using `cursorPosRef`) when `activeTool === 'line'`. Small filled teal circle (radius ~5, fill `#4ECDC4`), `listening={false}`. This replaces the native cursor.

### 3b: Hover magnetism
**`src/components/Canvas.tsx`** — `handleMouseMove` (~line 675):

When `activeTool === 'line'`, after computing `cx`/`cy`:
1. Call `findSnapTarget(cx, cy, candidates, excludeIds, SNAP_THRESHOLD_PX, scale)` using `visibleObjects` (same as `LineShape` does)
2. If snapped, store the snapped position in a ref/state for the cursor circle to use
3. Show the snap indicator circle (radius 14, translucent teal) at the snap point
4. When `pendingLineStart` is set, also snap the LinePreview endpoint to the snapped position

Need a new state: `lineToolSnap` with `{ x, y, snapped: boolean }` to drive both the cursor dot position and snap indicator.

### 3c: Snap on line placement
In `handleDblClick`, when `activeTool === 'line'`:
- Use the current snap result to set the actual placement point (snapped coords)
- On first click: if snapped, set `pendingLineStart` to snapped position and store `fromId`/`fromAnchor`
- On second click: if snapped, include `toId`/`toAnchor` in the created line

---

## Verification
1. **Group drag connections**: Select 2 objects + connecting line → drag group → verify `fromId`/`toId` remain set (check via debug overlay or re-drag endpoints)
2. **Live drag**: Connect a line to an object → drag the object → line endpoint should follow smoothly in real-time
3. **Line cursor**: Select line tool → cursor becomes small teal dot → hover near object edge → dot snaps to anchor point with indicator circle → shift bypasses snap
4. **Line placement snap**: With line tool, click near object edge → start point snaps → click near another object → line is created with `fromId`/`toId` set
