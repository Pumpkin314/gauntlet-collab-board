// Core type definitions for CollabBoard
// This file is the single source of truth for the board data schema.
// All components, contexts, and the AI agent use these types.

export type ShapeType = 'sticky' | 'rect' | 'circle' | 'text' | 'line' | 'connector' | 'frame' | 'kg-node';

export type ActiveTool = 'cursor' | 'box-select' | 'sticky' | 'rect' | 'circle' | 'text' | 'line' | 'connector' | 'frame';

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
  arrowStart?: boolean;
  arrowEnd?: boolean;

  // Connector-specific
  fromId?: string;
  toId?: string;
  fromAnchor?: 'top' | 'right' | 'bottom' | 'left';
  toAnchor?: 'top' | 'right' | 'bottom' | 'left';

  // Frame containment — ID of the parent frame this object belongs to
  parentId?: string;

  // Knowledge graph metadata (kg-node shapes only)
  kgNodeId?: string;
  kgConfidence?: 'mastered' | 'shaky' | 'gap' | 'unexplored';
  kgGradeLevel?: string;

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
  lastActive: import('firebase/firestore').Timestamp | null | undefined;
}

// Props shared by all shape components
export interface ShapeProps {
  id: string;           // Konva node id (e.g. "note-<objectId>")
  data: BoardObject;
  isSelected: boolean;
  onSelect: (id: string, e?: unknown) => void;
  onUpdate: (id: string, updates: Partial<BoardObject>) => void;
  onDelete: (id: string) => void;
  onShowColorPicker: (id: string, pos: { x: number; y: number }) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  onDimsChanged?: () => void;
  disableShadows?: boolean;
  visibleObjects?: BoardObject[];
  stageScaleRef?: React.RefObject<number>;
}
