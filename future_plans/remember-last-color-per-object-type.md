# Plan: Remember Last-Used Color Per Object Type

## Context
When creating new objects, they always get the hardcoded default color. Users who prefer a different color must recolor every new object. This feature remembers the last color chosen for each object type and uses it as the default for subsequent creations.

## Approach

### 1. Add `lastColorByType` state in `Canvas.tsx`
- New `useState<Record<string, string>>({})` — maps shape type → last used color
- Initialize from `localStorage` key (e.g. `collab-board:lastColors`) so it persists across sessions
- Write back to `localStorage` on change

### 2. Update color change handler (`handleColorChange`, ~line 871 in Canvas.tsx)
- When user changes an object's color, also update `lastColorByType[object.type]`
- Persist to localStorage

### 3. Pass last color as override during object creation (~line 749)
- `createObject(activeTool, x, y, { color: lastColorByType[activeTool] })` (only if entry exists)
- Same for line creation (~line 736): spread the color override

## Files to modify
- `src/components/Canvas.tsx` — state, color change handler, creation calls (~3 small edits)

## Verification
- Create a sticky → change its color to red → create another sticky → should be red
- Refresh page → create sticky → should still be red (localStorage)
- Repeat for rect, circle, text, line
- Confirm objects with no prior color usage still get their normal defaults
