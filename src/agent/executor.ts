import type { AgentToolCall, AgentMessage, ExecutionResult, ViewportCenter, ProgressCallback } from './types';
import type { BoardObject, ShapeType } from '../types/board';
import { TOOL_SCHEMAS } from './tools';
import { resolveColor } from './capabilities';
import { TEMPLATE_REGISTRY } from './templateRegistry';
import { gridPositions } from './geometryHelpers';
import { resolveEndpoint } from '../utils/anchorResolve';
import { checkSafety } from './safety';

interface BoardActions {
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
  updateObject(id: string, updates: Partial<BoardObject>): void;
  deleteObject(id: string): void;
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
}

/** Small random offset so objects at center don't stack exactly. */
function jitter(): number {
  return Math.round((Math.random() - 0.5) * 40);
}

const CONFIDENCE_COLORS: Record<string, string> = {
  mastered: '#4CAF50',
  /** provisional = self-reported mastered, awaiting practice verification (light green) */
  provisional: '#A5D6A7',
  shaky: '#FFB74D',
  gap: '#EF5350',
  unexplored: '#BDBDBD',
};

function findBoardObjectByKgNodeId(kgNodeId: string, objects?: BoardObject[]): BoardObject | undefined {
  return objects?.find(o => o.kgNodeId === kgNodeId);
}

/**
 * Dispatch a single already-validated tool action with explicit positions.
 * Template expansions call this directly so grid layout logic is bypassed —
 * template actions always carry pre-computed coordinates.
 * @param kgNodeMap - When provided, placeKnowledgeNode deduplicates against this map.
 */
function dispatchSingleAction(
  name: string,
  input: Record<string, unknown>,
  actions: BoardActions,
  allObjects?: BoardObject[],
  kgNodeMap?: Map<string, string>,
): ExecutionResult {
  // posX/posY must be provided by the caller for create-type tools.
  const posX = (input.x as number | undefined) ?? 0;
  const posY = (input.y as number | undefined) ?? 0;

  switch (name) {
    case 'createStickyNote': {
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject('sticky', posX, posY, {
        ...(input.content  ? { content:  input.content  as string } : {}),
        ...(color          ? { color }                              : {}),
        ...(input.parentId ? { parentId: input.parentId as string } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createShape': {
      const shapeType = input.shape_type as 'rect' | 'circle';
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject(shapeType, posX, posY, {
        ...(input.width    ? { width:    input.width    as number } : {}),
        ...(input.height   ? { height:   input.height   as number } : {}),
        ...(color          ? { color }                              : {}),
        ...(input.parentId ? { parentId: input.parentId as string } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createFrame': {
      const id = actions.createObject('frame', posX, posY, {
        ...(input.title    ? { content:  input.title    as string } : {}),
        ...(input.width    ? { width:    input.width    as number } : {}),
        ...(input.height   ? { height:   input.height   as number } : {}),
        ...(input.parentId ? { parentId: input.parentId as string } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createText': {
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const id = actions.createObject('text', posX, posY, {
        content: input.content as string,
        ...(color          ? { color }                              : {}),
        ...(input.fontSize ? { fontSize: input.fontSize as number } : {}),
        ...(input.parentId ? { parentId: input.parentId as string } : {}),
      });
      return { success: true, objectId: id };
    }

    case 'createLine': {
      let x1 = input.x1 as number;
      let y1 = input.y1 as number;
      let x2 = input.x2 as number;
      let y2 = input.y2 as number;
      const color = input.color ? resolveColor(input.color as string) : undefined;
      const overrides: Partial<BoardObject> = {};

      // Resolve connected endpoints if fromId/toId provided
      if (input.fromId && allObjects) {
        const fromObj = allObjects.find(o => o.id === input.fromId);
        if (fromObj) {
          const pt = resolveEndpoint(fromObj, undefined, { x: x2, y: y2 });
          x1 = pt.x; y1 = pt.y;
          overrides.fromId = input.fromId as string;
        }
      }
      if (input.toId && allObjects) {
        const toObj = allObjects.find(o => o.id === input.toId);
        if (toObj) {
          const pt = resolveEndpoint(toObj, undefined, { x: x1, y: y1 });
          x2 = pt.x; y2 = pt.y;
          overrides.toId = input.toId as string;
        }
      }

      const id = actions.createObject('line', x1, y1, {
        points: [x1, y1, x2, y2],
        ...(input.arrowEnd    ? { arrowEnd:    true } : {}),
        ...(input.arrowStart  ? { arrowStart:  true } : {}),
        ...(input.strokeWidth ? { strokeWidth: input.strokeWidth as number } : {}),
        ...(color ? { color } : {}),
        ...overrides,
      });
      return { success: true, objectId: id };
    }

    case 'createConnector': {
      const fromId = input.fromId as string;
      const toId = input.toId as string;
      const color = input.color ? resolveColor(input.color as string) : undefined;

      // Resolve coordinates from object positions
      const fromObj = allObjects?.find(o => o.id === fromId);
      const toObj = allObjects?.find(o => o.id === toId);
      if (!fromObj || !toObj) {
        return { success: false, error: `Cannot find objects: fromId=${fromId}, toId=${toId}` };
      }

      const toPt = resolveEndpoint(toObj, undefined, { x: fromObj.x + fromObj.width / 2, y: fromObj.y + fromObj.height / 2 });
      const fromPt = resolveEndpoint(fromObj, undefined, toPt);

      const id = actions.createObject('line', fromPt.x, fromPt.y, {
        points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
        fromId,
        toId,
        arrowEnd: input.arrowEnd !== false ? true : undefined,
        ...(input.arrowStart ? { arrowStart: true } : {}),
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

    case 'placeKnowledgeNode': {
      const kgNodeId = input.kgNodeId as string;
      const confidence = (input.confidence as string) ?? 'unexplored';
      const color = CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.unexplored;

      // Dedup: if this KG node is already on the board, update confidence instead of duplicating.
      if (kgNodeMap && kgNodeMap.has(kgNodeId)) {
        const existingBoardId = kgNodeMap.get(kgNodeId)!;
        actions.updateObject(existingBoardId, {
          kgConfidence: confidence as BoardObject['kgConfidence'],
          color,
        });
        return { success: true, objectId: existingBoardId };
      }

      const id = actions.createObject('kg-node', posX, posY, {
        content: input.description as string,
        color,
        kgNodeId,
        kgConfidence: confidence as BoardObject['kgConfidence'],
        ...(input.gradeLevel ? { kgGradeLevel: input.gradeLevel as string } : {}),
      });
      // Record in map so subsequent calls for the same kgNodeId are redirected.
      kgNodeMap?.set(kgNodeId, id);
      return { success: true, objectId: id };
    }

    case 'connectKnowledgeNodes': {
      const fromObj = findBoardObjectByKgNodeId(input.fromKgNodeId as string, allObjects);
      const toObj = findBoardObjectByKgNodeId(input.toKgNodeId as string, allObjects);
      if (!fromObj || !toObj) {
        return { success: false, error: `KG nodes not found on canvas: from=${input.fromKgNodeId}, to=${input.toKgNodeId}` };
      }
      const toPt = resolveEndpoint(toObj, undefined, { x: fromObj.x + fromObj.width / 2, y: fromObj.y + fromObj.height / 2 });
      const fromPt = resolveEndpoint(fromObj, undefined, toPt);
      const id = actions.createObject('line', fromPt.x, fromPt.y, {
        points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
        fromId: fromObj.id,
        toId: toObj.id,
        arrowEnd: true,
        color: '#999999',
        strokeWidth: 2,
      });
      return { success: true, objectId: id };
    }

    case 'updateNodeConfidence': {
      const obj = findBoardObjectByKgNodeId(input.kgNodeId as string, allObjects);
      if (!obj) {
        return { success: false, error: `KG node not found on canvas: ${input.kgNodeId}` };
      }
      const conf = input.confidence as string;
      actions.updateObject(obj.id, {
        kgConfidence: conf as BoardObject['kgConfidence'],
        color: CONFIDENCE_COLORS[conf] ?? CONFIDENCE_COLORS.unexplored,
      });
      return { success: true, objectId: obj.id };
    }

    default:
      return { success: false, error: `Unhandled tool: ${name}` };
  }
}

/**
 * Execute a batch of validated tool calls against the board.
 * Returns execution results + any conversational messages.
 * @param kgNodeMap - Explorer-only map of kgNodeId → boardObjectId for deduplication.
 *   When provided, placeKnowledgeNode redirects to updateNodeConfidence if the node
 *   is already on the board, and new placements are recorded in the map.
 */
export function executeToolCalls(
  toolCalls: AgentToolCall[],
  actions: BoardActions,
  viewportCenter: ViewportCenter,
  onProgress?: ProgressCallback,
  allObjects?: BoardObject[],
  kgNodeMap?: Map<string, string>,
  applySafety?: boolean,
): { results: ExecutionResult[]; agentMessages: string[] } {
  const results: ExecutionResult[] = [];
  const agentMessages: string[] = [];
  const total = toolCalls.length;
  let completed = 0;

  const mutationOps = new Set(['deleteObject', 'moveObject', 'resizeObject', 'updateText', 'changeColor']);

  const toolLabel: Record<string, string> = {
    createStickyNote: 'sticky note',
    createShape: 'shape',
    createFrame: 'frame',
    createText: 'text',
    createLine: 'line',
    createConnector: 'connector',
    applyTemplate: 'template',
  };

  const fireProgress = (name: string) => {
    if (!onProgress || mutationOps.has(name)) return;
    completed++;
    const label = toolLabel[name] ?? name;
    onProgress({
      id: 'streaming-status',
      role: 'status',
      content: `✓ Created ${label} (${completed}/${total})`,
      timestamp: Date.now(),
    });
  };

  // Identify create-type calls without explicit positions for grid layout
  const createToolNames = new Set([
    'createStickyNote', 'createShape', 'createFrame', 'createText', 'placeKnowledgeNode',
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
        // Track IDs in creation order so parentActionIndex can resolve to real IDs.
        const createdIds: string[] = [];
        for (const action of expansion.actions) {
          const resolvedInput = { ...action.input };
          if (action.parentActionIndex !== undefined) {
            const parentId = createdIds[action.parentActionIndex];
            if (parentId) resolvedInput.parentId = parentId;
          }
          const r = dispatchSingleAction(action.name, resolvedInput, actions, allObjects, kgNodeMap);
          createdIds.push(r.objectId ?? '');
          results.push(r);
          if (r.success) fireProgress(action.name);
        }
        continue;
      }

      // ── respondConversationally ───────────────────────────────────────────
      if (tc.name === 'respondConversationally') {
        const rawMessage = input.message as string;
        const message = applySafety ? checkSafety(rawMessage).text : rawMessage;
        agentMessages.push(message);
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
      const result = dispatchSingleAction(tc.name, inputWithPos, actions, allObjects, kgNodeMap);
      results.push(result);
      if (result.success) fireProgress(tc.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Boardie] Tool execution failed for ${tc.name}:`, msg);
      results.push({ success: false, error: msg });
    }
  }

  return { results, agentMessages };
}
