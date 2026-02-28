/**
 * Golden Set Evals — Sprint 2b
 *
 * Covers: connectKnowledgeNodes UUID fallback (gs-016), normal arrow creation (gs-017),
 * same-batch place+connect (gs-019), prompt labels (gs-018), anchor edges (gs-020),
 * liveObjects dimension fallback (gs-023), gap expansion pipeline hook (gs-021, gs-022),
 * and prereq x-spread (gs-024).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCalls } from '../../src/agent/executor';
import { buildLearningExplorerPrompt } from '../../src/agent/learningExplorerPrompt';
import { getAnchorNodes, getEdgesAmong } from '../../src/data/knowledge-graph';
import { runAgentCommand, getPipelineConfig } from '../../src/agent/pipeline';
import type { AgentToolCall } from '../../src/agent/types';
import type { BoardObject } from '../../src/types/board';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeToolCall(name: string, input: Record<string, unknown>): AgentToolCall {
  return { id: crypto.randomUUID(), name, input };
}

function makeActions() {
  const created: Array<{ type: string; x: number; y: number; overrides?: Partial<BoardObject> }> = [];
  const updated: Array<{ id: string; updates: Partial<BoardObject> }> = [];
  let nextId = 1;

  return {
    createObject(type: string, x: number, y: number, overrides?: Partial<BoardObject>): string {
      const id = `obj-${nextId++}`;
      created.push({ type, x, y, overrides });
      return id;
    },
    updateObject(id: string, updates: Partial<BoardObject>) {
      updated.push({ id, updates });
    },
    deleteObject: () => {},
    batchCreate: () => [],
    _created: created,
    _updated: updated,
  };
}

const VIEWPORT = { x: 500, y: 400 };

/** Two kg-node board objects with known IDs and kgNodeIds. */
function makeKgObjects(): BoardObject[] {
  return [
    {
      id: 'board-uuid-from',
      type: 'kg-node',
      kgNodeId: '4.NBT.A.1',
      x: 200, y: 300, width: 160, height: 80, zIndex: 1,
      content: 'Place value',
    } as BoardObject,
    {
      id: 'board-uuid-to',
      type: 'kg-node',
      kgNodeId: '5.NBT.A.1',
      x: 400, y: 300, width: 160, height: 80, zIndex: 2,
      content: 'Decimal place value',
    } as BoardObject,
  ];
}

// ── gs-016: UUID fallback ─────────────────────────────────────────────────────

describe('connectKnowledgeNodes UUID fallback (gs-016)', () => {
  it('[gs-016] succeeds when LLM passes board UUID instead of KG standard ID', () => {
    const actions = makeActions();
    const allObjects = makeKgObjects();

    // LLM passes the board object UUID ('board-uuid-from') as fromKgNodeId — wrong,
    // but the executor should silently fall back to matching by obj.id.
    const tc = makeToolCall('connectKnowledgeNodes', {
      fromKgNodeId: 'board-uuid-from',
      toKgNodeId: 'board-uuid-to',
    });

    const { results } = executeToolCalls([tc], actions as never, VIEWPORT, undefined, allObjects);

    expect(results[0]!.success).toBe(true);
    // A line must have been created with arrowEnd
    expect(actions._created.length).toBe(1);
    expect(actions._created[0]!.overrides?.arrowEnd).toBe(true);
  });

  it('[gs-016b] fails gracefully when neither kgNodeId nor board UUID matches', () => {
    const actions = makeActions();
    const allObjects = makeKgObjects();

    const tc = makeToolCall('connectKnowledgeNodes', {
      fromKgNodeId: 'nonexistent-id',
      toKgNodeId: '5.NBT.A.1',
    });

    const { results } = executeToolCalls([tc], actions as never, VIEWPORT, undefined, allObjects);

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('nonexistent-id');
  });
});

// ── gs-017: normal arrow creation ────────────────────────────────────────────

describe('connectKnowledgeNodes normal arrow creation (gs-017)', () => {
  it('[gs-017] creates a line with arrowEnd=true when called with valid KG standard IDs', () => {
    const actions = makeActions();
    const allObjects = makeKgObjects();

    const tc = makeToolCall('connectKnowledgeNodes', {
      fromKgNodeId: '4.NBT.A.1',
      toKgNodeId: '5.NBT.A.1',
    });

    const { results } = executeToolCalls([tc], actions as never, VIEWPORT, undefined, allObjects);

    expect(results[0]!.success).toBe(true);
    expect(actions._created.length).toBe(1);
    const line = actions._created[0]!;
    expect(line.type).toBe('line');
    expect(line.overrides?.arrowEnd).toBe(true);
    // fromId/toId should reference the board object IDs, not the KG IDs
    expect(line.overrides?.fromId).toBe('board-uuid-from');
    expect(line.overrides?.toId).toBe('board-uuid-to');
  });
});

// ── gs-023: liveObjects width reflects SHAPE_DEFAULTS ────────────────────────

describe('same-batch place+connect uses correct kg-node dimensions (gs-023)', () => {
  it('[gs-023] connector endpoints land outside the 220px kg-node boundary', () => {
    const actions = makeActions();
    const toolCalls = [
      makeToolCall('placeKnowledgeNode', { kgNodeId: '4.NBT.A.1', description: 'Place value', confidence: 'unexplored', x: 200, y: 300 }),
      makeToolCall('placeKnowledgeNode', { kgNodeId: '5.NBT.A.1', description: 'Decimal place value', confidence: 'unexplored', x: 500, y: 300 }),
      makeToolCall('connectKnowledgeNodes', { fromKgNodeId: '4.NBT.A.1', toKgNodeId: '5.NBT.A.1' }),
    ];

    const kgNodeMap = new Map<string, string>();
    const { results } = executeToolCalls(toolCalls, actions as never, VIEWPORT, undefined, [], kgNodeMap);

    expect(results[2]!.success).toBe(true);

    const line = actions._created[2]!;
    const points = line.overrides?.points as number[];
    // points = [fromX, fromY, toX, toY]
    const fromX = points[0]!;
    const toX = points[2]!;

    // kg-node is 220px wide. Node A center = 200+110=310, Node B center = 500+110=610.
    // fromX should be at right edge of A (>=310) and toX at left edge of B (<=610).
    // With the old hardcoded 160, fromX would be ~280 (inside the 220px node).
    expect(fromX).toBeGreaterThanOrEqual(310);
    expect(toX).toBeLessThanOrEqual(610);
  });
});

// ── gs-019: same-batch place + connect ───────────────────────────────────────

describe('connectKnowledgeNodes in same batch as placeKnowledgeNode (gs-019)', () => {
  it('[gs-019] arrow is created when place and connect are in the same LLM turn', () => {
    const actions = makeActions();
    // Board starts empty — nodes will be placed and connected in one batch
    const toolCalls = [
      makeToolCall('placeKnowledgeNode', { kgNodeId: '4.NBT.A.1', description: 'Place value', confidence: 'unexplored', x: 200, y: 500 }),
      makeToolCall('placeKnowledgeNode', { kgNodeId: '5.NBT.A.1', description: 'Decimal place value', confidence: 'unexplored', x: 400, y: 300 }),
      makeToolCall('connectKnowledgeNodes', { fromKgNodeId: '4.NBT.A.1', toKgNodeId: '5.NBT.A.1' }),
    ];

    const kgNodeMap = new Map<string, string>();
    const { results } = executeToolCalls(toolCalls, actions as never, VIEWPORT, undefined, [], kgNodeMap);

    // All three calls must succeed
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(results[2]!.success).toBe(true);

    // Two nodes + one arrow line created
    expect(actions._created.length).toBe(3);
    const line = actions._created[2]!;
    expect(line.type).toBe('line');
    expect(line.overrides?.arrowEnd).toBe(true);
  });
});

// ── Prompt: kgNodeMap label updated (gs-018) ─────────────────────────────────

describe('kgNodeMap block label in system prompt (gs-018)', () => {
  it('[gs-018] kgNodeMap injection includes disambiguation label', () => {
    const kgNodeMap = new Map([['5.NBT.A.1', 'board-uuid-abc']]);
    const prompt = buildLearningExplorerPrompt(VIEWPORT, kgNodeMap, 'diagnostic');
    expect(prompt).toContain('use the LEFT key (kgNodeId) in tool calls');
    expect(prompt).toContain('not the right value (boardObjectId)');
  });

  it('[gs-018b] connectKnowledgeNodes tool description includes calling convention', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, 'diagnostic');
    expect(prompt).toContain('fromKgNodeId` = prerequisite node');
    expect(prompt).toContain('toKgNodeId` = dependent node');
  });

  it('[gs-018c] diagnostic flow includes explicit connect step after node placement', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, 'diagnostic');
    expect(prompt).toContain('connectKnowledgeNodes` for EVERY edge in the `edges` array');
  });
});

// ── gs-020: getAnchorNodes returns edges ─────────────────────────────────────

describe('getAnchorNodes returns dependency edges (gs-020)', () => {
  it('[gs-020a] grade 6 anchors include intra-grade edges (6.RP.A.1 → 6.RP.A.2)', () => {
    const nodes = getAnchorNodes('6', 8);
    const ids = nodes.map(n => n.id);
    const edges = getEdgesAmong(ids);

    // We know from the KG that 6.RP.A.1 → 6.RP.A.2 is a real edge
    const rpA1 = nodes.find(n => n.code === '6.RP.A.1');
    const rpA2 = nodes.find(n => n.code === '6.RP.A.2');
    expect(rpA1).toBeDefined();
    expect(rpA2).toBeDefined();

    const edge = edges.find(e => e.source === rpA1!.id && e.target === rpA2!.id);
    expect(edge).toBeDefined();
  });

  it('[gs-020b] getEdgesAmong includes cross-grade edge when both grades present', () => {
    const g6 = getAnchorNodes('6', 8);
    const g5 = getAnchorNodes('5', 3);
    const allIds = [...g6.map(n => n.id), ...g5.map(n => n.id)];
    const edges = getEdgesAmong(allIds);

    // 5.NF.B.3 → 6.RP.A.2 is a real cross-grade edge in the KG
    const nfB3 = g5.find(n => n.code === '5.NF.B.3');
    const rpA2 = g6.find(n => n.code === '6.RP.A.2');
    expect(nfB3).toBeDefined();
    expect(rpA2).toBeDefined();

    const crossEdge = edges.find(e => e.source === nfB3!.id && e.target === rpA2!.id);
    expect(crossEdge).toBeDefined();
  });

  it('[gs-020c] getEdgesAmong returns empty array when no edges exist among ids', () => {
    // Use two unrelated node IDs that have no edge between them
    const edges = getEdgesAmong(['nonexistent-a', 'nonexistent-b']);
    expect(edges).toEqual([]);
  });
});

// ── Gap expansion pipeline hook (gs-021, gs-022) ─────────────────────────────
// 6.RP.A.2 (UUID: c3126032-...) has 4 KG prerequisites in the real data.
// We use it as the gap node to validate the expansion hook.

vi.mock('../../src/agent/apiClient', () => ({
  callAnthropic: vi.fn(),
}));

import { callAnthropic } from '../../src/agent/apiClient';

/** Minimal Anthropic response shape for mocking. */
function makeApiResponse2(toolCalls: Array<{ name: string; input: Record<string, unknown> }>) {
  return {
    content: toolCalls.map((tc) => ({
      type: 'tool_use',
      id: crypto.randomUUID(),
      name: tc.name,
      input: tc.input,
    })),
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const GAP_NODE_KG_ID = 'c3126032-2984-5b67-9ed5-2f2f0821e99f'; // 6.RP.A.2
const GAP_NODE_BOARD_ID = 'gap-board-obj';
const GAP_NODE_X = 300;
const GAP_NODE_Y = 400;

function makeGapBoardObject(): BoardObject {
  return {
    id: GAP_NODE_BOARD_ID,
    type: 'kg-node',
    kgNodeId: GAP_NODE_KG_ID,
    kgConfidence: 'unexplored',
    x: GAP_NODE_X, y: GAP_NODE_Y, width: 160, height: 80, zIndex: 1,
    content: 'Unit rate',
  } as BoardObject;
}

function makeGapActions() {
  const created: Array<{ type: string; x: number; y: number; overrides?: Partial<BoardObject> }> = [];
  const updated: Array<{ id: string; updates: Partial<BoardObject> }> = [];
  let nextId = 1;
  const gapObject = makeGapBoardObject();

  return {
    createObject(type: string, x: number, y: number, overrides?: Partial<BoardObject>): string {
      const id = `new-obj-${nextId++}`;
      created.push({ type, x, y, overrides });
      return id;
    },
    updateObject(id: string, updates: Partial<BoardObject>) {
      updated.push({ id, updates });
    },
    deleteObject: () => {},
    batchCreate: () => [],
    /** Returns the board state including the gap node (simulates post-updateNodeConfidence state). */
    getAllObjects: vi.fn().mockReturnValue([gapObject]),
    _created: created,
    _updated: updated,
  };
}

describe('Gap expansion pipeline hook (gs-021)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[gs-021a] updateNodeConfidence(gap) triggers prerequisite placement below the gap node', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse2([{
        name: 'updateNodeConfidence',
        input: { kgNodeId: GAP_NODE_KG_ID, confidence: 'gap' },
      }]),
    );

    const actions = makeGapActions();
    const kgNodeMap = new Map([[GAP_NODE_KG_ID, GAP_NODE_BOARD_ID]]);
    const config = getPipelineConfig('explorer', kgNodeMap, 'diagnostic', null);

    await runAgentCommand(
      "I don't know this",
      actions as never,
      'user-1',
      VIEWPORT,
      [],
      actions.getAllObjects,
      undefined,
      undefined,
      config,
    );

    // At least one prerequisite node must have been placed
    const newNodes = actions._created.filter(c => c.type === 'kg-node');
    expect(newNodes.length).toBeGreaterThan(0);

    // All placed nodes must be at y = GAP_NODE_Y + 200
    for (const node of newNodes) {
      expect(node.y).toBe(GAP_NODE_Y + 200);
    }

    // Prerequisite → gap edges must be drawn
    const newLines = actions._created.filter(c => c.type === 'line');
    expect(newLines.length).toBeGreaterThan(0);
  });

  it('[gs-021b] gap node not on board → expansion is skipped gracefully', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse2([{
        name: 'updateNodeConfidence',
        input: { kgNodeId: GAP_NODE_KG_ID, confidence: 'gap' },
      }]),
    );

    const actions = makeGapActions();
    // getAllObjects returns nothing — the gap node cannot be located
    actions.getAllObjects.mockReturnValue([]);

    const kgNodeMap = new Map([[GAP_NODE_KG_ID, GAP_NODE_BOARD_ID]]);
    const config = getPipelineConfig('explorer', kgNodeMap, 'diagnostic', null);

    // Should not throw; expansion is silently skipped
    await expect(
      runAgentCommand('I have no idea', actions as never, 'user-1', VIEWPORT, [], actions.getAllObjects, undefined, undefined, config),
    ).resolves.not.toThrow();

    // No prerequisite nodes or edges created
    expect(actions._created.length).toBe(0);
  });
});

describe('Gap expansion deduplication (gs-022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[gs-022a] prerequisite already in kgNodeMap is not re-placed', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse2([{
        name: 'updateNodeConfidence',
        input: { kgNodeId: GAP_NODE_KG_ID, confidence: 'gap' },
      }]),
    );

    // 5.NF.B.3 (UUID 9975ae78-...) is one of 6.RP.A.2's prerequisites — pre-populate it
    const prereqKgId = '9975ae78-2f08-5d8a-afae-f091931d277f'; // 5.NF.B.3
    const prereqBoardId = 'existing-prereq-board-id';
    const gapObject = makeGapBoardObject();
    const prereqObject: BoardObject = {
      id: prereqBoardId,
      type: 'kg-node',
      kgNodeId: prereqKgId,
      x: 300, y: 600, width: 160, height: 80, zIndex: 2,
      content: 'Fraction as division',
    } as BoardObject;

    const actions = makeGapActions();
    actions.getAllObjects.mockReturnValue([gapObject, prereqObject]);

    // Both gap node and the prereq are already in the map
    const kgNodeMap = new Map([
      [GAP_NODE_KG_ID, GAP_NODE_BOARD_ID],
      [prereqKgId, prereqBoardId],
    ]);
    const config = getPipelineConfig('explorer', kgNodeMap, 'diagnostic', null);

    await runAgentCommand(
      "I don't know unit rate",
      actions as never,
      'user-1',
      VIEWPORT,
      [],
      actions.getAllObjects,
      undefined,
      undefined,
      config,
    );

    // The already-on-board prereq must NOT be re-placed as a new kg-node
    const newNodes = actions._created.filter(c => c.type === 'kg-node');
    const reCreated = newNodes.find(c => c.overrides?.kgNodeId === prereqKgId);
    expect(reCreated).toBeUndefined();

    // Other (unplaced) prerequisites should still be placed
    // (6.RP.A.2 has 4 prereqs total; 1 is already on board → 3 new nodes)
    expect(newNodes.length).toBe(3);
  });

  it('[gs-024] multiple prereqs from gap expansion have distinct x values', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse2([{
        name: 'updateNodeConfidence',
        input: { kgNodeId: GAP_NODE_KG_ID, confidence: 'gap' },
      }]),
    );

    const actions = makeGapActions();
    const kgNodeMap = new Map([[GAP_NODE_KG_ID, GAP_NODE_BOARD_ID]]);
    const config = getPipelineConfig('explorer', kgNodeMap, 'diagnostic', null);

    await runAgentCommand(
      "I don't know this",
      actions as never,
      'user-1',
      VIEWPORT,
      [],
      actions.getAllObjects,
      undefined,
      undefined,
      config,
    );

    const newNodes = actions._created.filter(c => c.type === 'kg-node');
    expect(newNodes.length).toBeGreaterThan(1);

    const xValues = newNodes.map(n => n.x);
    const uniqueX = new Set(xValues);
    expect(uniqueX.size).toBe(xValues.length);
  });

  it('[gs-022b] existing prereq→gap edge is not duplicated', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse2([{
        name: 'updateNodeConfidence',
        input: { kgNodeId: GAP_NODE_KG_ID, confidence: 'gap' },
      }]),
    );

    const prereqKgId = '9975ae78-2f08-5d8a-afae-f091931d277f'; // 5.NF.B.3
    const prereqBoardId = 'existing-prereq-board-id';
    const gapObject = makeGapBoardObject();
    const prereqObject: BoardObject = {
      id: prereqBoardId,
      type: 'kg-node',
      kgNodeId: prereqKgId,
      x: 300, y: 600, width: 160, height: 80, zIndex: 2,
      content: 'Fraction as division',
    } as BoardObject;
    // Pre-existing line from prereq → gap
    const existingLine: BoardObject = {
      id: 'existing-line-id',
      type: 'line',
      fromId: prereqBoardId,
      toId: GAP_NODE_BOARD_ID,
      x: 0, y: 0, width: 0, height: 0, zIndex: 0,
    } as BoardObject;

    const actions = makeGapActions();
    actions.getAllObjects.mockReturnValue([gapObject, prereqObject, existingLine]);

    const kgNodeMap = new Map([
      [GAP_NODE_KG_ID, GAP_NODE_BOARD_ID],
      [prereqKgId, prereqBoardId],
    ]);
    const config = getPipelineConfig('explorer', kgNodeMap, 'diagnostic', null);

    await runAgentCommand(
      "I don't know unit rate",
      actions as never,
      'user-1',
      VIEWPORT,
      [],
      actions.getAllObjects,
      undefined,
      undefined,
      config,
    );

    // No duplicate line for the prereq that already has a connection
    const newLines = actions._created.filter(c => c.type === 'line');
    const dupLine = newLines.find(
      c => c.overrides?.fromId === prereqBoardId && c.overrides?.toId === GAP_NODE_BOARD_ID,
    );
    expect(dupLine).toBeUndefined();
  });
});
