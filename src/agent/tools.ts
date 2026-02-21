import { z } from 'zod';

// ── Zod schemas for each tool's input ────────────────────────────────────────

export const createStickyNoteSchema = z.object({
  content: z.string().optional().default(''),
  color: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const createShapeSchema = z.object({
  shape_type: z.enum(['rect', 'circle']),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const createFrameSchema = z.object({
  title: z.string().optional().default('Frame'),
  width: z.number().optional(),
  height: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const createTextSchema = z.object({
  content: z.string(),
  color: z.string().optional(),
  fontSize: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const createLineSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  arrowEnd: z.boolean().optional().default(false),
  arrowStart: z.boolean().optional().default(false),
  strokeWidth: z.number().optional(),
  color: z.string().optional(),
});

export const moveObjectSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
});

export const resizeObjectSchema = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
});

export const updateTextSchema = z.object({
  id: z.string(),
  content: z.string(),
});

export const changeColorSchema = z.object({
  id: z.string(),
  color: z.string(),
});

export const deleteObjectSchema = z.object({
  id: z.string(),
});

export const respondConversationallySchema = z.object({
  message: z.string(),
});

// ── Schema lookup by tool name ───────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, z.ZodType> = {
  createStickyNote:        createStickyNoteSchema,
  createShape:             createShapeSchema,
  createFrame:             createFrameSchema,
  createText:              createTextSchema,
  createLine:              createLineSchema,
  moveObject:              moveObjectSchema,
  resizeObject:            resizeObjectSchema,
  updateText:              updateTextSchema,
  changeColor:             changeColorSchema,
  deleteObject:            deleteObjectSchema,
  respondConversationally: respondConversationallySchema,
};

// ── Anthropic tool definitions (sent in API request) ─────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'createStickyNote',
    description: 'Create a sticky note on the board. Omit x/y to place at viewport center.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Text content of the sticky note' },
        color: { type: 'string', description: 'Color name (yellow, blue, pink, green, etc.) or hex code' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
    },
  },
  {
    name: 'createShape',
    description: 'Create a rectangle or circle shape on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        shape_type: { type: 'string', enum: ['rect', 'circle'], description: 'Shape type' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        color: { type: 'string', description: 'Color name or hex code' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
      required: ['shape_type'],
    },
  },
  {
    name: 'createFrame',
    description: 'Create a frame (container) on the board. Frames visually group objects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Frame title label' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
    },
  },
  {
    name: 'createText',
    description: 'Create a text element on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Text content' },
        color: { type: 'string', description: 'Text color name or hex code' },
        fontSize: { type: 'number', description: 'Font size in pixels' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
      required: ['content'],
    },
  },
  {
    name: 'createLine',
    description: 'Create a line (optionally with arrowheads) between two points.',
    input_schema: {
      type: 'object' as const,
      properties: {
        x1: { type: 'number', description: 'Start X' },
        y1: { type: 'number', description: 'Start Y' },
        x2: { type: 'number', description: 'End X' },
        y2: { type: 'number', description: 'End Y' },
        arrowEnd: { type: 'boolean', description: 'Show arrowhead at end point' },
        arrowStart: { type: 'boolean', description: 'Show arrowhead at start point' },
        strokeWidth: { type: 'number', description: 'Line thickness in pixels' },
        color: { type: 'string', description: 'Line color name or hex code' },
      },
      required: ['x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'moveObject',
    description: 'Move an existing object to a new position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Object ID to move' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
      },
      required: ['id', 'x', 'y'],
    },
  },
  {
    name: 'resizeObject',
    description: 'Resize an existing object.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Object ID to resize' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
      },
      required: ['id', 'width', 'height'],
    },
  },
  {
    name: 'updateText',
    description: 'Update the text content of a sticky note or text element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Object ID to update' },
        content: { type: 'string', description: 'New text content' },
      },
      required: ['id', 'content'],
    },
  },
  {
    name: 'changeColor',
    description: 'Change the color of an existing object.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Object ID to recolor' },
        color: { type: 'string', description: 'New color name or hex code' },
      },
      required: ['id', 'color'],
    },
  },
  {
    name: 'deleteObject',
    description: 'Delete an object from the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Object ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'respondConversationally',
    description: 'Respond to the user with a text message without modifying the board. Use for questions, explanations, or when no board action is needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Response message to the user' },
      },
      required: ['message'],
    },
  },
];
