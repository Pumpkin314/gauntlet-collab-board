// Core type definitions for CollabBoard
// This file is the single source of truth for the board data schema.
// All components, contexts, and the AI agent use these types.

export type ShapeType = 'sticky' | 'rect' | 'circle' | 'text' | 'line' | 'connector';

export type ActiveTool = 'cursor' | 'sticky' | 'rect' | 'circle' | 'text' | 'line' | 'connector';

export interface BoardObject {
  id: string;
  type: ShapeType;

  // Spatial (all types except connector)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // Visual
  color: string;
  strokeColor?: string;
  strokeWidth?: number;

  // Content (sticky, text)
  content?: string;
  fontSize?: number;

  // Line-specific: absolute points [x1,y1,x2,y2,...]
  points?: number[];

  // Connector-specific
  fromId?: string;
  toId?: string;
  fromAnchor?: 'top' | 'right' | 'bottom' | 'left';
  toAnchor?: 'top' | 'right' | 'bottom' | 'left';

  // Ordering
  zIndex: number;

  // Metadata
  createdBy: string;
  createdByName: string;
}

export interface PresenceUser {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  cursorX: number;
  cursorY: number;
}

// Props shared by all shape components
export interface ShapeProps {
  id: string;           // Konva node id (e.g. "note-<objectId>")
  data: BoardObject;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<BoardObject>) => void;
  onDelete: (id: string) => void;
  onShowColorPicker: (id: string, pos: { x: number; y: number }) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  onDimsChanged?: () => void;
}
