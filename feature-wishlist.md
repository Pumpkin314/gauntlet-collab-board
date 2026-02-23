# Feature Wishlist

Future enhancements and quality-of-life improvements for CollabBoard.

---

## 🎨 Multi-User Selection Highlighting

**Description:**
Show which user is currently selecting/editing an object by highlighting it with that user's assigned color (instead of the default cyan).

**User Experience:**
- When User A selects a sticky note → other users see it highlighted in User A's color
- Show label: "Selected by [User Name]"
- Only the selecting user sees the Transformer (resize handles)
- Other users see just the colored highlight

**Implementation:**
- Add `selectedBy` field to objects in Firestore (or separate selections collection)
- Track which user is selecting which object
- Use user's color for stroke highlight
- Clear selection when user deselects or disconnects
- Handle conflicts when multiple users select same object

**Effort Estimate:** ~1-2 hours

**Benefits:**
- Better awareness of who's working on what
- Prevents conflicts (users can see when someone else is editing)
- More collaborative feel

---

## ⚡ ESC to Cancel Drag

**Description:**
Allow users to press ESC while dragging an object to cancel the drag operation and return the object to its original position.

**User Experience:**
1. User starts dragging a sticky note
2. While still holding mouse button, press ESC
3. Sticky note snaps back to original position
4. Drag is cancelled (no Firestore update)

**Implementation:**
- Store original position on drag start
- Listen for ESC key during drag
- On ESC → reset object position to original
- Cancel drag end event (don't update Firestore)

**Effort Estimate:** ~30 minutes

**Benefits:**
- Undo accidental drags
- Better control during editing
- Familiar UX pattern (Figma, Photoshop, etc.)

---

## ⚡ Multi-Select Performance (5–10+ objects)

**Description:**
When 5–10+ objects are selected simultaneously, FPS drops during pan, drag, and other interactions. Single-object and small selections (3–4) are fine.

**Root Cause (suspected):**
Konva Transformer recalculates bounding boxes for all attached nodes per frame. Bitmap caching is cleared for selected shapes (needed for live transforms), so each selected shape is fully redrawn every frame.

**Potential Approaches:**
- Detach Transformer during pan, re-attach on pan end
- Group-cache multi-selected shapes as a single bitmap during move
- Throttle Transformer bbox recalculation during drag
- Set `listening(false)` on unselected shapes during multi-drag

**Effort Estimate:** ~2-4 hours (investigation + implementation)

**See also:** `PERFORMANCE_SIDENOTES.md` → "Known Issues — Future Work"

---

## 🔗 Line / Arrow Improvements

### Segment drag (move entire line)
Dragging the middle segment of a line/arrow should translate both endpoints in tandem, preserving relative positioning. Currently only endpoint handles are draggable.

### ~~Magnetic endpoint snapping~~ ✅ Fixed
Implemented in PR #31 (smart connectors). Lines snap to object edges with free edge slide during drag.

### ~~Lines in frame children should move with the group~~ ✅ Partially Fixed
Lines that are children of a frame now visually track during frame drag — `frameDragChildPointsRef` caches original points at drag-start and shifts them imperatively in `handleDragMove`. Fixed in PR #33 (`a1a1d4e`). **Remaining:** Lines in multi-select groups (non-frame) may still not move with the group.

---

## 🗺️ Navigation & Onboarding

### Minimap
A small minimap in the bottom corner of the board showing a simplified bird's-eye view of all objects (rendered as dots or simple rectangles, ignoring rotation). Clicking/dragging within the minimap navigates the viewport.

### New-user tutorial
A skippable onboarding flow for new users (or new boards) that highlights core functionality in a few quick steps — tool usage, panning/zooming, collaboration, etc.

---

## 📋 Multi-Board Support

### Per-user board dashboard
Each user should have a boards page listing all boards they own or have access to. Features:
- Create and delete boards from the dashboard
- Boards auto-save updates (already the case per-board)
- Click into/out of a board seamlessly

### Sharing & permissions
- Share button inside a board that manages permissions (view/edit)
- Generates a shareable link (one-click copy)
- Users can join a board via shared link if they have the right perms
- Only authorized users can access a board

---

## 📝 Other Ideas (Brainstorm)

### Undo/Redo
- Global undo/redo stack
- Ctrl+Z / Ctrl+Shift+Z shortcuts
- Track object creation, deletion, moves, edits

### ~~Keyboard Shortcuts~~ ✅ Implemented
Delete, Ctrl+D, Ctrl+C/V, Ctrl+A all implemented.

### Object Grouping
- Multi-select with Shift+Click or drag box
- Group/ungroup objects
- Move groups as a unit

### Layers/Z-Index via Selection Menu
- The three-dots (⋮) button on selected objects should expand into a menu with "Send to Front" / "Send to Back" options alongside the existing color picker
- Bring to front / Send to back
- Z-index management
- Layer panel showing object order

### Export/Import
- Export board as PNG/SVG
- Export board data as JSON
- Import boards from JSON

### Comments/Annotations
- Add comments to specific objects
- Comment threads
- Resolve/unresolve comments

### Templates
- Pre-built sticky note layouts (SWOT, Kanban, etc.)
- Quick insert common patterns

### Accessibility
- Keyboard-only navigation
- Screen reader support
- High contrast mode

---

---

## 🤖 Epic 4 — Structured Agent Dialogue (Interview Loop)

**Description:**
For complex or ambiguous requests, Boardie enters an interview mode instead of immediately delegating to the planner. It asks one targeted clarifying question at a time, offering structured choice buttons alongside free text. Once enough context is gathered (or the user says "just do it"), the planner fires with a much more specific description, reducing generation time and improving layout accuracy.

**User Experience:**
1. User: "I want a solar system diagram"
2. Boardie: "How should I arrange the planets?" → [Up to you] [Flat line] [Circular orbits]
3. User picks "Circular orbits"
4. Boardie: "Should I include orbital rings?" → [Yes] [No] [Just do it with what you have]
5. On "Just do it" or after N rounds → planner fires with full spec

**Implementation sketch:**
- New agent state: `idle | interviewing | executing`
- Haiku gets a new tool: `askClarification(question, options[])` — emits UI choice buttons
- UI renders choice buttons inline in the chat panel (multi-select where appropriate)
- Pipeline accumulates clarification answers and appends them to the planner description
- Haiku decides when enough context exists to call `delegateToPlanner`

**Relationship to existing work:**
- Reduces planner prompt ambiguity → faster Sonnet responses, better layouts
- `timeoutMs: 30_000` on planner calls becomes more comfortable once layout style is pre-specified
- Multi-select button UI can also serve as a general command palette

**Effort Estimate:** ~1 day (agent state machine + UI choice buttons)

---

## 🤖 Agent Pipeline Performance — Interview + Planner Latency

**Description:**
The full interview-then-planner flow (clarification → user answer → delegateToPlanner → Sonnet response) can take a long time for complex requests. The main bottleneck is the Sonnet planner call (up to 30s timeout). The interview loop adds an extra Haiku round-trip per question on top of that.

**Potential Approaches:**
- Sonnet prompt trimming: shorter planner system prompt, fewer examples, to reduce input tokens
- Streaming the planner response and executing tool calls as they arrive (partial execution)
- Cache common planner outputs (e.g. "solar system" is always roughly the same structure)
- Pre-warm the planner call while the user is still answering clarification questions (speculative execution)
- Reduce max_tokens on planner when the clarification narrows scope

**Priority:** Medium — acceptable for now, revisit if user feedback highlights it

---

## 🤖 Planner Board Awareness (Avoid Occluding Existing Content)

**Description:**
When the planner generates a complex diagram, it has no knowledge of existing board objects. This means it can place new objects on top of existing content. The planner should receive a spatial summary of existing objects so it can avoid occupied regions.

**Potential Approaches:**
- Pass a bounding-box summary of existing objects to the planner via the `board_context` field in `delegateToPlanner`
- Haiku could call `requestBoardState` before delegating to gather spatial context
- Compute an "occupied regions" summary (e.g. "objects occupy x:100-800, y:200-600") and include in planner prompt
- Add a system prompt instruction for Haiku to always include board_context when delegating

**Priority:** High — directly impacts usability when board has existing content

---

## 🐛 Bugs

### Frame z-index edge case with intersecting nested stacks
Two independent frame hierarchies (A→B→C and D→E→F) that partially overlap may produce ambiguous render order when objects from both stacks occupy the same screen region. The depth-based sort treats each chain independently, so cross-stack ordering relies solely on zIndex tiebreaking, which may not match user intent.

---

### ~~Frame resize doesn't recompute child containment~~ ✅ Fixed
Fixed in PR #33 (`a1a1d4e`). `handleFrameAwareUpdate` now detects frame resize (width/height changes) and re-checks all children against the new bounds, releasing any that no longer fit.

---

### ~~Frame rotation causes children to jump position~~ ✅ Fixed
Fixed in PR #33 (`a1a1d4e`). `isFullyInside` now computes rotated bounding box corners via `getRotatedCorners()` and transforms them into the frame's local coordinate space. Both child rotation and frame rotation are handled.

---

### ~~Removing a child glitches sibling positions during frame drag~~ ✅ Fixed
Fixed in PR #33 (`d936c8a`). Child origins now read from Yjs data instead of Konva nodes at drag-start, preventing stale imperative positions from prior drag sessions.

---

### ~~Multi-select drag releases children from co-selected frames~~ ✅ Fixed
When multi-selecting a frame + its children and dragging, children were sometimes released because drag-end events fired in non-deterministic order — a child's containment was checked against the frame's old (pre-drag) position. Fixed in PR #33 (`d936c8a`) by skipping containment recheck when a child's parent frame is in the active selection.

---

### Frame children jump/glitch after repositioning within frame
After objects are manually repositioned inside a frame, subsequent frame movement causes the children to jump or glitch before settling. Specifically occurs when only the frame is selected and dragged — positions correct on mouse release (Yjs commit is accurate, imperative drag is not).

**Investigated root causes (ruled out):**
- Konva vs Yjs origin mismatch at drag-start — making both read from Yjs didn't help
- `setIsDraggingShape(true)` triggering re-render that overwrites imperative positions — skipping the re-render for frame drags reduced but didn't eliminate the jump
- `useLayoutEffect` to re-apply imperative positions after React commit — no difference
- Shared mutable `frameDragState` module read by BaseShape to offset `x={data.x + delta}` — no effect
- Detaching Transformer during frame drag — objects disappear
- Resetting `tr.x(0)` each dragMove — Konva re-sets it immediately
- Adding `tr.x()` to child positions — overcompensates, objects fly around
- Computing dx as `(node.x() + tr.x()) - (startX + startTrX)` — same overcompensation

**Confirmed root cause:** The Konva **Transformer** is the culprit. Debug logging proves:
- When frame is NOT selected (no Transformer): drift between expected and actual child position is ~0.
- When frame IS selected (Transformer attached): drift is massive (200-700px).
- The Transformer has `onDragStart`/`onDragEnd` handlers and accumulates its own `x/y` offset during drag. This visually shifts attached nodes (the frame) but children (not attached to Transformer) don't receive the offset. Our imperative `dx = node.x() - start.x` doesn't capture the Transformer's visual contribution.
- Between our imperative `childNode.x(origin + dx)` calls, something resets the child's Konva position — likely react-konva reconciliation triggered by mid-drag re-renders.

**Likely fix direction:** Rearchitect frame-child movement to avoid fighting the Transformer. Options:
1. Make children actual Konva children of the frame Group (nested in scene graph, not flat siblings) so Konva's transform propagation moves them automatically
2. Disable the Transformer's draggable behavior for frames and handle frame drag entirely through the node's own drag system
3. Use Konva's `group.add(child)` / `group.remove(child)` at drag-start/end to temporarily nest children

---

**Last Updated:** February 22, 2026
