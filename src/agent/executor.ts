import type { AgentToolCall, ExecutionResult, ViewportCenter } from './types';
import type { BoardObject, ShapeType } from '../types/board';
import { TOOL_SCHEMAS } from './tools';
import { resolveColor } from './capabilities';

interface BoardActions {
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
  updateObject(id: string, updates: Partial<BoardObject>): void;
  deleteObject(id: string): void;
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
}

/** Compute grid positions for batch creates around a center point. */
function gridPositions(count: number, center: ViewportCenter, spacing = 220): Array<{ x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const startX = center.x - ((cols - 1) * spacing) / 2;
  const startY = center.y - ((rows - 1) * spacing) / 2;

  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: startX + col * spacing,
      y: startY + row * spacing,
    });
  }
  return positions;
}

/** Small random offset so objects at center don't stack exactly. */
function jitter(): number {
  return Math.round((Math.random() - 0.5) * 40);
}

/**
 * Execute a batch of validated tool calls against the board.
 * Returns execution results + any conversational messages.
 */
export function executeToolCalls(
  toolCalls: AgentToolCall[],
  actions: BoardActions,
  viewportCenter: ViewportCenter,
): { results: ExecutionResult[]; agentMessages: string[] } {
  const results: ExecutionResult[] = [];
  const agentMessages: string[] = [];

  // Identify create-type calls without explicit positions for grid layout
  const createToolNames = new Set([
    'createStickyNote', 'createShape', 'createFrame', 'createText',
  ]);
  const positionlessCreates = toolCalls.filter(
    (tc) => createToolNames.has(tc.name) && tc.input.x == null && tc.input.y == null,
  );
  const useGrid = positionlessCreates.length > 1;
  const gridPos = useGrid ? gridPositions(positionlessCreates.length, viewportCenter) : [];
  let gridIdx = 0;

  for (const tc of toolCalls) {
    try {
      // Validate input against schema
      const schema = TOOL_SCHEMAS[tc.name];
      if (!schema) {
        results.push({ success: false, error: `Unknown tool: ${tc.name}` });
        continue;
      }
      const parsed = schema.safeParse(tc.input);
      if (!parsed.success) {
        results.push({ success: false, error: `Validation failed for ${tc.name}: ${parsed.error.message}` });
        continue;
      }
      const input = parsed.data as Record<string, unknown>;

      // Determine position for create tools
      let posX: number;
      let posY: number;
      if (createToolNames.has(tc.name)) {
        if (input.x != null && input.y != null) {
          posX = input.x as number;
          posY = input.y as number;
        } else if (useGrid && gridIdx < gridPos.length) {
          posX = gridPos[gridIdx]!.x;
          posY = gridPos[gridIdx]!.y;
          gridIdx++;
        } else {
          posX = viewportCenter.x + jitter();
          posY = viewportCenter.y + jitter();
        }
      } else {
        posX = 0;
        posY = 0;
      }

      switch (tc.name) {
        case 'createStickyNote': {
          const color = input.color ? resolveColor(input.color as string) : undefined;
          const id = actions.createObject('sticky', posX, posY, {
            ...(input.content ? { content: input.content as string } : {}),
            ...(color ? { color } : {}),
          });
          results.push({ success: true, objectId: id });
          break;
        }

        case 'createShape': {
          const shapeType = input.shape_type as 'rect' | 'circle';
          const color = input.color ? resolveColor(input.color as string) : undefined;
          const id = actions.createObject(shapeType, posX, posY, {
            ...(input.width ? { width: input.width as number } : {}),
            ...(input.height ? { height: input.height as number } : {}),
            ...(color ? { color } : {}),
          });
          results.push({ success: true, objectId: id });
          break;
        }

        case 'createFrame': {
          const id = actions.createObject('frame', posX, posY, {
            ...(input.title ? { content: input.title as string } : {}),
            ...(input.width ? { width: input.width as number } : {}),
            ...(input.height ? { height: input.height as number } : {}),
          });
          results.push({ success: true, objectId: id });
          break;
        }

        case 'createText': {
          const color = input.color ? resolveColor(input.color as string) : undefined;
          const id = actions.createObject('text', posX, posY, {
            content: input.content as string,
            ...(color ? { color } : {}),
            ...(input.fontSize ? { fontSize: input.fontSize as number } : {}),
          });
          results.push({ success: true, objectId: id });
          break;
        }

        case 'createLine': {
          const x1 = input.x1 as number;
          const y1 = input.y1 as number;
          const x2 = input.x2 as number;
          const y2 = input.y2 as number;
          const color = input.color ? resolveColor(input.color as string) : undefined;
          const id = actions.createObject('line', x1, y1, {
            points: [x1, y1, x2, y2],
            ...(input.arrowEnd ? { arrowEnd: true } : {}),
            ...(input.arrowStart ? { arrowStart: true } : {}),
            ...(input.strokeWidth ? { strokeWidth: input.strokeWidth as number } : {}),
            ...(color ? { color } : {}),
          });
          results.push({ success: true, objectId: id });
          break;
        }

        case 'moveObject': {
          actions.updateObject(input.id as string, {
            x: input.x as number,
            y: input.y as number,
          });
          results.push({ success: true, objectId: input.id as string });
          break;
        }

        case 'resizeObject': {
          actions.updateObject(input.id as string, {
            width: input.width as number,
            height: input.height as number,
          });
          results.push({ success: true, objectId: input.id as string });
          break;
        }

        case 'updateText': {
          actions.updateObject(input.id as string, {
            content: input.content as string,
          });
          results.push({ success: true, objectId: input.id as string });
          break;
        }

        case 'changeColor': {
          const color = resolveColor(input.color as string);
          actions.updateObject(input.id as string, { color });
          results.push({ success: true, objectId: input.id as string });
          break;
        }

        case 'deleteObject': {
          actions.deleteObject(input.id as string);
          results.push({ success: true, objectId: input.id as string });
          break;
        }

        case 'respondConversationally': {
          agentMessages.push(input.message as string);
          results.push({ success: true });
          break;
        }

        default:
          results.push({ success: false, error: `Unhandled tool: ${tc.name}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Boardie] Tool execution failed for ${tc.name}:`, msg);
      results.push({ success: false, error: msg });
    }
  }

  return { results, agentMessages };
}
