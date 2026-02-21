import type { AgentToolCall, ExecutionResult, ViewportCenter } from './types';
import type { BoardObject, ShapeType } from '../types/board';
import { TOOL_SCHEMAS } from './tools';
import { resolveColor } from './capabilities';
import { TEMPLATE_REGISTRY } from './templateRegistry';

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
 * Dispatch a single already-validated tool action with explicit positions.
 * Template expansions call this directly so grid layout logic is bypassed —
 * template actions always carry pre-computed coordinates.
 */
function dispatchSingleAction(
  name: string,
  input: Record<string, unknown>,
  actions: BoardActions,
): ExecutionResult {
  // posX/posY must be provided by the caller for create-type tools.
  const posX = (input.x as number | undefined) ?? 0;
  const posY = (input.y as number | undefined) ?? 0;

  switch (name) {
    case 'createStickyNote': {
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject('sticky', posX, posY, {
        ...(input.content ? { content: input.content as string } : {}),
        ...(color ? { color } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createShape': {
      const shapeType = input.shape_type as 'rect' | 'circle';
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject(shapeType, posX, posY, {
        ...(input.width  ? { width:  input.width  as number } : {}),
        ...(input.height ? { height: input.height as number } : {}),
        ...(color ? { color } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createFrame': {
      const id = actions.createObject('frame', posX, posY, {
        ...(input.title  ? { content: input.title  as string } : {}),
        ...(input.width  ? { width:   input.width  as number } : {}),
        ...(input.height ? { height:  input.height as number } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createText': {
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject('text', posX, posY, {
        content: input.content as string,
        ...(color ? { color } : {}),
        ...(input.fontSize ? { fontSize: input.fontSize as number } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createLine': {
      const x1 = input.x1 as number;
      const y1 = input.y1 as number;
      const x2 = input.x2 as number;
      const y2 = input.y2 as number;
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject('line', x1, y1, {
        points: [x1, y1, x2, y2],
        ...(input.arrowEnd    ? { arrowEnd:    true } : {}),
        ...(input.arrowStart  ? { arrowStart:  true } : {}),
        ...(input.strokeWidth ? { strokeWidth: input.strokeWidth as number } : {}),
        ...(color ? { color } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'moveObject': {
      actions.updateObject(input.id as string, {
        x: input.x as number,
        y: input.y as number,
      });
      return { success: true, objectId: input.id as string };
    }

    case 'resizeObject': {
      actions.updateObject(input.id as string, {
        width:  input.width  as number,
        height: input.height as number,
      });
      return { success: true, objectId: input.id as string };
    }

    case 'updateText': {
      actions.updateObject(input.id as string, {
        content: input.content as string,
      });
      return { success: true, objectId: input.id as string };
    }

    case 'changeColor': {
      const color = resolveColor(input.color as string);
      actions.updateObject(input.id as string, { color });
      return { success: true, objectId: input.id as string };
    }

    case 'deleteObject': {
      actions.deleteObject(input.id as string);
      return { success: true, objectId: input.id as string };
    }

    default:
      return { success: false, error: `Unhandled tool: ${name}` };
  }
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

      // ── Template expansion ────────────────────────────────────────────────
      if (tc.name === 'applyTemplate') {
        const tmpl = TEMPLATE_REGISTRY[input.template_id as string];
        if (!tmpl) {
          results.push({ success: false, error: `Unknown template: ${input.template_id}` });
          continue;
        }
        const cx = (input.x as number | undefined) ?? viewportCenter.x;
        const cy = (input.y as number | undefined) ?? viewportCenter.y;
        const expansion = tmpl.expand(cx, cy, input.options as Record<string, unknown> | undefined);
        for (const action of expansion.actions) {
          const r = dispatchSingleAction(action.name, action.input, actions);
          results.push(r);
        }
        continue;
      }

      // ── respondConversationally ───────────────────────────────────────────
      if (tc.name === 'respondConversationally') {
        agentMessages.push(input.message as string);
        results.push({ success: true });
        continue;
      }

      // ── Determine position for create tools ───────────────────────────────
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

      // Inject resolved position before dispatching
      const inputWithPos = { ...input, x: posX, y: posY };
      results.push(dispatchSingleAction(tc.name, inputWithPos, actions));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Boardie] Tool execution failed for ${tc.name}:`, msg);
      results.push({ success: false, error: msg });
    }
  }

  return { results, agentMessages };
}
