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

### Layers/Z-Index
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

## 🐛 Bugs

### Duplicated objects share identity
Duplicated objects (Ctrl+D, Ctrl+V) behave as linked copies — actions on one affect the other. They should be fully independent entities with unique IDs and no shared state.

---

**Last Updated:** February 20, 2026
