# Shapes Domain

## Overview

Shapes are pluggable via a registry pattern. Each shape file exports a memoized component and self-registers. `ObjectRenderer` maps board objects to shape components at render time.

## Key Files

| File | LoC | Role |
|---|---|---|
| `src/utils/shapeRegistry.ts` | 35 | Registry: `registerShape()` / `getShapeEntry()` / `getAllShapeTypes()` |
| `src/components/shapes/BaseShape.tsx` | 116 | Shared wrapper: drag, transform, local dimensions |
| `src/components/shapes/StickyNote.tsx` | 58 | Yellow sticky note with text + double-click edit |
| `src/components/shapes/RectShape.tsx` | 30 | Plain rectangle |
| `src/components/shapes/CircleShape.tsx` | 32 | Ellipse (Konva Ellipse with radiusX/Y) |
| `src/components/shapes/TextShape.tsx` | 58 | Text block with inline edit support |
| `src/components/shapes/LineShape.tsx` | 55 | Line with draggable endpoints (does NOT use BaseShape) |
| `src/components/Canvas/ObjectRenderer.tsx` | 80 | Maps objects to shapes via registry; memoized |

## Architecture

### Registry Pattern
```
Canvas.tsx (on mount) → registerShape('rect', { component: RectShape, defaults: {...} })
ObjectRenderer → getShapeEntry(obj.type) → renders component with ShapeProps
```

No switch statements. Adding a new shape = new file + one `registerShape()` call in Canvas.

### BaseShape (shared wrapper)
- Wraps Konva `Group` with drag and transform handlers
- Manages `localWidth` / `localHeight` to prevent transformer "flash" during resize
- Children render via render function: `(width, height) => <KonvaShape .../>`
- Calls `onDimsChanged` after resize so parent can refresh Transformer

### ShapeProps Interface
```ts
interface ShapeProps {
  obj: BoardObject;
  isSelected: boolean;
  onSelect: (e: KonvaEventObject<MouseEvent>) => void;
  onChange: (updates: Partial<BoardObject>) => void;
  onDimsChanged?: () => void;
  onStartEdit?: (id: string) => void;  // sticky/text only
}
```

### LineShape (special case)
- Does NOT use BaseShape — different interaction model
- Stores points as `[x1, y1, x2, y2]` in `obj.points`
- Shows draggable endpoint circles only when selected
- Entire line is draggable (repositions both endpoints)

### All shapes are `React.memo`'d
Part of Phase 1 optimization — prevents re-renders when sibling objects change.

## BoardObject Schema (from types/board.ts)
```ts
interface BoardObject {
  id: string;
  type: ShapeType;       // 'rect' | 'circle' | 'sticky' | 'text' | 'line'
  x: number; y: number;
  width: number; height: number;
  rotation?: number;
  fill?: string;
  text?: string;         // sticky/text content
  points?: number[];     // line endpoints [x1,y1,x2,y2]
}
```
