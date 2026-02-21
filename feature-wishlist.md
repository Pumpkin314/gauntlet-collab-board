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

### Magnetic endpoint snapping
When dragging a line endpoint near another object's boundary, it should magnetize/snap to the nearest edge point within a zoom-dependent threshold. Holding Shift bypasses snapping and uses exact cursor position. This lets lines act as visual connectors between objects.

### Lines in group selection should move with the group
Lines that belong to a multi-select group (or frame children) currently stay put when the rest of the group is moved. They should translate their points along with the group delta.

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

### Keyboard Shortcuts
- Delete selected object (Backspace/Delete key)
- Duplicate selected object (Ctrl+D)
- Copy/paste (Ctrl+C / Ctrl+V)
- Select all (Ctrl+A)

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

## 🐛 Bugs

### Frame z-index edge case with intersecting nested stacks
Two independent frame hierarchies (A→B→C and D→E→F) that partially overlap may produce ambiguous render order when objects from both stacks occupy the same screen region. The depth-based sort treats each chain independently, so cross-stack ordering relies solely on zIndex tiebreaking, which may not match user intent.

---

### Frame resize doesn't recompute child containment
After resizing a frame, children that are no longer within the frame's bounds should be released (parentId cleared). Currently containment is only checked on object drag end, not on frame resize end.

---

### Frame rotation causes children to jump position
Rotating a frame causes child objects to snap to incorrect x/y positions. The AABB-based containment and delta-based child movement don't account for the frame's rotation transform.

---

### Removing a child glitches sibling positions during frame drag
After a child is removed from a frame (e.g. dragged out), remaining children visually glitch when the frame is subsequently dragged, then snap back to correct positions on drag end. Likely caused by stale cached node refs/origins from a previous drag session.

---

### Frame children jump/glitch after repositioning within frame
After objects are manually repositioned inside a frame, subsequent frame movement causes the children to jump or glitch before settling. Likely a stale-origin or delta-accumulation issue in the imperative frame-drag child movement logic.

---

### Duplicated objects share identity
Duplicated objects (Ctrl+D, Ctrl+V) behave as linked copies — actions on one affect the other. They should be fully independent entities with unique IDs and no shared state.

---

**Last Updated:** February 21, 2026
