# Fix: Frame Child Jump/Glitch During Drag

## Context
When a selected frame is dragged, its children jump/glitch because Konva's Transformer intercepts the drag and accumulates its own x/y offset. Children are flat siblings in the scene graph, so they don't receive the Transformer's offset. The imperative code in `handleDragMove` computes delta from `node.x()`, which doesn't account for the Transformer's visual contribution. 7 fix approaches have already been tried and failed (documented in `feature-wishlist.md`).

## Root Cause
When a frame is selected, the Transformer attaches to it. Dragging moves the **Transformer** (changing `tr.x()`/`tr.y()`), not the node directly. This creates a mismatch: `handleDragMove` reads `node.x()` which doesn't reflect the Transformer's offset, so children get incorrect deltas. React reconciliation also resets children to Yjs data mid-drag.

## Approach: Disable Transformer Drag When Frame Is Selected

Prevent the Transformer from handling drag when the selection includes a frame. Instead, let the frame node's own `draggable` prop handle movement directly. This means `node.x()`/`node.y()` change directly during drag, and the existing `handleDragMove` child-movement code works correctly without Transformer interference.

### Changes

**File: `src/components/Canvas.tsx`**

1. **Make Transformer non-draggable when a frame is selected**
   - Compute a boolean: `const selectionContainsFrame = [...selectedIds].some(id => objectsRef.current.find(o => o.id === id)?.type === 'frame')`
   - Pass `draggable={!selectionContainsFrame}` to the `<Transformer>` JSX (~line 1191)
   - This lets the frame's own `draggable` Group handle the drag, so `node.x()` updates directly

2. **Suppress React re-renders of children during frame drag**
   - In the shape rendering/ObjectRenderer, skip updating children positions from Yjs data while `frameDragStartRef.current` is set (frame drag is active)
   - OR: use a ref flag (`isFrameDraggingRef`) that BaseShape checks before applying `x={data.x}` props
   - This prevents React reconciliation from resetting imperative child positions mid-drag

3. **Ensure handleTransformerDragEnd still works for non-frame selections**
   - The existing `handleTransformerDragEnd` handles line position commits — this path is only reached when Transformer is draggable (non-frame selections), so no change needed

### Key Files
- `src/components/Canvas.tsx` — Transformer JSX, drag handlers, child movement logic
- `src/components/Canvas/ObjectRenderer.tsx` — shape rendering (may need drag-active check)
- `src/components/shapes/BaseShape.tsx` — position prop application

### Edge Cases
- **Multi-select with frame + non-frame objects**: Deferred — single-frame-drag only for now
- **Nested frames**: `getDescendantIds` already handles recursion, should work
- **Frame resize via Transformer**: Unaffected — `onTransform`/`onTransformEnd` handlers are separate from drag

## Verification
1. Select a frame containing children → drag it → children should move smoothly without jumping
2. Deselect frame → drag it → should still work (no Transformer involved)
3. Multi-select frame + sticky → drag → both should move together
4. Select frame → resize via Transformer handles → should work as before
5. Run `npm run test:perf` to check no perf regression
