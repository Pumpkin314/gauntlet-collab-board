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

export const requestBoardStateSchema = z.object({
  type: z.string().optional(),
  color: z.string().optional(),
  content_contains: z.string().optional(),
  spatial: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
  spatial_threshold: z.number().optional(),
});

export const applyTemplateSchema = z.object({
  template_id: z.enum(['swot', 'retrospective', 'kanban', 'journey_map', 'pros_cons', 'matrix_2x2']),
  x: z.number().optional(),
  y: z.number().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const askClarificationSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(4),
});

export const delegateToPlannerSchema = z.object({
  description: z.string(),
  board_context: z.string().optional(),
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
  requestBoardState:       requestBoardStateSchema,
  applyTemplate:           applyTemplateSchema,
  askClarification:        askClarificationSchema,
  delegateToPlanner:       delegateToPlannerSchema,
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
  {
    name: 'requestBoardState',
    description: 'Query existing objects on the board. Returns a filtered list of objects with their IDs, positions, and properties. Use this ONLY when you need to reference existing objects (e.g. move, delete, recolor). Never use for pure creation commands.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Filter by object type: sticky, rect, circle, text, line, frame' },
        color: { type: 'string', description: 'Filter by color name (pink, blue, etc.) or hex code' },
        content_contains: { type: 'string', description: 'Filter by text content (case-insensitive substring match)' },
        spatial: { type: 'string', enum: ['top', 'bottom', 'left', 'right', 'center'], description: 'Filter by spatial position on the board' },
        spatial_threshold: { type: 'number', description: 'Spatial filter threshold (0-1, default 0.25). Larger = more inclusive.' },
      },
    },
  },
  {
    name: 'applyTemplate',
    description: 'Apply a known board template. ALWAYS use this for recognized templates (SWOT, retrospective, kanban, user journey map, pros/cons, 2×2 matrix). Do NOT use if the request deviates significantly from the template definition.',
    input_schema: {
      type: 'object' as const,
      properties: {
        template_id: {
          type: 'string',
          enum: ['swot', 'retrospective', 'kanban', 'journey_map', 'pros_cons', 'matrix_2x2'],
          description: 'Which template to expand',
        },
        x: { type: 'number', description: 'Center X on canvas (defaults to viewport center)' },
        y: { type: 'number', description: 'Center Y on canvas (defaults to viewport center)' },
        options: { type: 'object', description: 'Template-specific overrides (columns, stages, labels, rows, title)' },
      },
      required: ['template_id'],
    },
  },
  {
    name: 'askClarification',
    description: 'Ask the user a clarifying question with 2-4 choice buttons before proceeding. Use when the request is ambiguous about layout, content, or style and would otherwise require delegation to the planner.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The clarifying question to ask the user' },
        options: {
          type: 'array' as const,
          items: { type: 'string' },
          description: 'Array of 2-4 choice labels. Last option should be an escape hatch like "Up to you" or "Just do it".',
          minItems: 2,
          maxItems: 4,
        },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'delegateToPlanner',
    description: 'Delegate complex layout or world-knowledge tasks to a more capable planner model. Use for requests requiring world knowledge (water cycle, solar system, OSI model, etc.) or creative layout with 5+ positioned objects where no template matches exactly. Describe the diagram fully in `description`. Include relevant board context in `board_context` if existing objects must be considered.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'Full description of the diagram to create, including all desired objects, labels, connections, and layout style' },
        board_context: { type: 'string', description: 'Optional summary of relevant existing board objects (IDs, positions) needed for placement decisions' },
      },
      required: ['description'],
    },
  },
];

/** Tool names that the planner may NOT use (meta/routing tools). */
const META_TOOL_NAMES = new Set([
  'requestBoardState',
  'delegateToPlanner',
  'askClarification',
  'applyTemplate',
  'respondConversationally',
]);

/** Subset of TOOL_DEFINITIONS sent to the Sonnet planner — mutation tools only. */
export const PLANNER_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter(
  (t) => !META_TOOL_NAMES.has(t.name),
);
