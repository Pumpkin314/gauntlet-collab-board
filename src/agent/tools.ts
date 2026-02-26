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
  fromId: z.string().optional(),
  toId: z.string().optional(),
});

export const createConnectorSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  arrowEnd: z.boolean().optional().default(true),
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

// ── Knowledge Graph tool schemas ─────────────────────────────────────────────

export const placeKnowledgeNodeSchema = z.object({
  kgNodeId: z.string(),
  description: z.string(),
  gradeLevel: z.string().optional(),
  confidence: z.enum(['mastered', 'shaky', 'gap', 'unexplored']).optional().default('unexplored'),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const connectKnowledgeNodesSchema = z.object({
  fromKgNodeId: z.string(),
  toKgNodeId: z.string(),
});

export const updateNodeConfidenceSchema = z.object({
  kgNodeId: z.string(),
  confidence: z.enum(['mastered', 'shaky', 'gap', 'unexplored']),
});

export const computeFrontierSchema = z.object({
  masteredNodeIds: z.array(z.string()),
});

export const expandAroundNodeSchema = z.object({
  kgNodeId: z.string(),
  depth: z.number().optional().default(1),
});

export const searchKnowledgeGraphSchema = z.object({
  query: z.string(),
  gradeLevel: z.string().optional(),
  limit: z.number().optional().default(10),
});

export const getPrerequisitesSchema = z.object({
  kgNodeId: z.string(),
});

export const getNodesByGradeSchema = z.object({
  grade: z.string(),
  limit: z.number().optional().default(20),
});

export const getAnchorNodesSchema = z.object({
  grade: z.string(),
  limit: z.number().optional().default(8),
});

// ── Schema lookup by tool name ───────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, z.ZodType> = {
  createStickyNote:        createStickyNoteSchema,
  createShape:             createShapeSchema,
  createFrame:             createFrameSchema,
  createText:              createTextSchema,
  createLine:              createLineSchema,
  createConnector:         createConnectorSchema,
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
  placeKnowledgeNode:      placeKnowledgeNodeSchema,
  connectKnowledgeNodes:   connectKnowledgeNodesSchema,
  updateNodeConfidence:    updateNodeConfidenceSchema,
  computeFrontier:         computeFrontierSchema,
  expandAroundNode:        expandAroundNodeSchema,
  searchKnowledgeGraph:    searchKnowledgeGraphSchema,
  getPrerequisites:        getPrerequisitesSchema,
  getNodesByGrade:         getNodesByGradeSchema,
  getAnchorNodes:          getAnchorNodesSchema,
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
    name: 'createConnector',
    description: 'Create a smart connector line between two existing objects by ID. The line automatically attaches to the nearest boundary points and follows the objects when they move.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: { type: 'string', description: 'ID of the source object' },
        toId: { type: 'string', description: 'ID of the target object' },
        arrowEnd: { type: 'boolean', description: 'Show arrowhead at target (default true)' },
        arrowStart: { type: 'boolean', description: 'Show arrowhead at source' },
        strokeWidth: { type: 'number', description: 'Line thickness in pixels' },
        color: { type: 'string', description: 'Line color name or hex code' },
      },
      required: ['fromId', 'toId'],
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

// ── Learning Explorer tool definitions ──────────────────────────────────────

const KG_TOOL_DEFINITIONS = [
  {
    name: 'placeKnowledgeNode',
    description: 'Place a knowledge graph node on the canvas as a visual card. The node represents a math standard or learning objective.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kgNodeId: { type: 'string', description: 'The knowledge graph node ID' },
        description: { type: 'string', description: 'Description text to display' },
        gradeLevel: { type: 'string', description: 'Grade level label (e.g. "5")' },
        confidence: { type: 'string', enum: ['mastered', 'shaky', 'gap', 'unexplored'], description: 'Student confidence level' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
      required: ['kgNodeId', 'description'],
    },
  },
  {
    name: 'connectKnowledgeNodes',
    description: 'Draw a prerequisite arrow between two knowledge nodes already on the canvas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromKgNodeId: { type: 'string', description: 'Source KG node ID (prerequisite)' },
        toKgNodeId: { type: 'string', description: 'Target KG node ID (dependent)' },
      },
      required: ['fromKgNodeId', 'toKgNodeId'],
    },
  },
  {
    name: 'updateNodeConfidence',
    description: 'Update the confidence level of a knowledge node on the canvas. Changes its color.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kgNodeId: { type: 'string', description: 'The knowledge graph node ID' },
        confidence: { type: 'string', enum: ['mastered', 'shaky', 'gap', 'unexplored'], description: 'New confidence level' },
      },
      required: ['kgNodeId', 'confidence'],
    },
  },
  {
    name: 'computeFrontier',
    description: 'Compute and return the learning frontier — nodes whose prerequisites are all mastered but the node itself is not. Read-only, does not modify the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        masteredNodeIds: { type: 'array', items: { type: 'string' }, description: 'IDs of mastered KG nodes' },
      },
      required: ['masteredNodeIds'],
    },
  },
  {
    name: 'expandAroundNode',
    description: 'Expand the knowledge graph view around a node, showing its prerequisites and dependents. Read-only query that returns graph data for placement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kgNodeId: { type: 'string', description: 'Center node ID to expand around' },
        depth: { type: 'number', description: 'How many levels to expand (default 1)' },
      },
      required: ['kgNodeId'],
    },
  },
  {
    name: 'searchKnowledgeGraph',
    description: 'Search the knowledge graph for math standards matching a query. Read-only, returns matching nodes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search text to match against standard descriptions' },
        gradeLevel: { type: 'string', description: 'Filter by grade level (e.g. "5")' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getPrerequisites',
    description: 'Get the prerequisite nodes for a given knowledge graph node. Read-only query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kgNodeId: { type: 'string', description: 'Node ID to look up prerequisites for' },
      },
      required: ['kgNodeId'],
    },
  },
  {
    name: 'getNodesByGrade',
    description: 'Get all math standards for a specific grade level. Returns up to `limit` standard nodes (excludes groupings). Use this when a student tells you their grade. Read-only query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        grade: { type: 'string', description: 'Grade level: "K", "1", "2", ..., "12"' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['grade'],
    },
  },
  {
    name: 'getAnchorNodes',
    description: 'Get the best "anchor" nodes for a grade — standards that sit in the middle of the KG (have both prerequisite parents AND dependent children). These are the most diagnostically useful starting nodes because they reveal the most about a student\'s knowledge. Use INSTEAD OF getNodesByGrade when placing the initial canvas nodes. Read-only.',
    input_schema: {
      type: 'object' as const,
      properties: {
        grade: { type: 'string', description: 'Grade level: "K", "1", "2", ..., "12"' },
        limit: { type: 'number', description: 'Max nodes to return (default 8)' },
      },
      required: ['grade'],
    },
  },
];

/** Tool definitions for the Learning Explorer mode. */
export const EXPLORER_TOOL_DEFINITIONS = [
  ...KG_TOOL_DEFINITIONS,
  // Include conversational + clarification + board query tools from Boardie
  TOOL_DEFINITIONS.find(t => t.name === 'respondConversationally')!,
  TOOL_DEFINITIONS.find(t => t.name === 'askClarification')!,
  TOOL_DEFINITIONS.find(t => t.name === 'requestBoardState')!,
  TOOL_DEFINITIONS.find(t => t.name === 'deleteObject')!,
  TOOL_DEFINITIONS.find(t => t.name === 'moveObject')!,
];

/** Read-only KG tools that don't count toward action limits. */
export const KG_READONLY_TOOLS = new Set([
  'searchKnowledgeGraph',
  'getPrerequisites',
  'computeFrontier',
  'expandAroundNode',
  'getNodesByGrade',
  'getAnchorNodes',
]);
