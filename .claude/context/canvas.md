# Canvas & Interaction Domain

## Overview

`Canvas.tsx` is the main event loop — all pointer events, keyboard shortcuts, viewport transforms, tool modes, and selection logic live here. It renders a Konva `Stage` with layers for the dot grid, objects, cursors, selection rect, and overlays.

## Key Files

| File | LoC | Role |
|---|---|---|
| `src/components/Canvas.tsx` | 749 | Main stage, event handlers, viewport, tools |
| `src/contexts/SelectionContext.tsx` | 73 | Selected object IDs (Canvas-local) |
| `src/components/Canvas/Toolbar.tsx` | 114 | Tool buttons (cursor, box-select, shapes, line) |
| `src/components/Canvas/DotGrid.tsx` | 114 | CSS dot grid background (3 density tiers) |
| `src/components/Canvas/ColorPicker.tsx` | 55 | Floating color palette for shapes |
| `src/components/Canvas/InfoOverlay.tsx` | 50 | Bottom-left status (zoom, pan, counts) |
| `src/components/Canvas/SelectionRect.tsx` | 24 | Box-select drag rectangle |
| `src/components/Canvas/LinePreview.tsx` | 25 | Ghost line during two-step draw |
| `src/components/Canvas/EditModal.tsx` | 80 | Legacy edit modal (unused; inline textarea now) |

## Architecture

### Viewport & Pan/Zoom
- Konva Stage position tracks pan offset; scale tracks zoom level
- Mouse wheel = zoom (centered on cursor); middle-click drag or space+drag = pan
- DotGrid is a pure CSS overlay updated imperatively via ref (no React re-renders)

### Tool Modes
- **cursor**: select, drag, transform objects
- **box-select**: drag to select multiple objects
- **rect / circle / sticky / text**: click to create shape at pointer position
- **line**: two-step click — first click sets start point (LinePreview shows ghost), second click creates line
- Tools can be **infinite mode** (stays active) or **single-shot** (reverts to cursor after one use); toggled by clicking an already-active tool

### Selection
- `SelectionContext` holds a `Set<string>` of selected IDs
- Click = single select; Shift+click = toggle in/out; box-select = area select
- Ctrl+A = select all; Delete/Backspace = delete selected
- Konva `Transformer` attaches to selected nodes for resize/rotate handles

### Keyboard Shortcuts
- `Ctrl+C/V/D` — copy/paste/duplicate
- `Delete/Backspace` — delete selected
- `Ctrl+A` — select all
- `Escape` — deselect / cancel line draw
- `` ` `` — toggle debug overlay

### Viewport Culling
- Before rendering, Canvas filters `objects` to only those whose bounding box intersects the visible viewport
- Off-screen objects are not mounted as React/Konva nodes
- Implemented in Phase 2 of the performance plan

### Shape Registration
- On mount, Canvas calls `registerShape()` for each shape type
- This populates `shapeRegistry.ts` which `ObjectRenderer` uses to look up renderers
- Avoids circular imports between Canvas and shape files

### Inline Editing
- Double-click on sticky/text shape → HTML textarea overlay positioned over the Konva node
- Text synced back to board object on blur or Enter
