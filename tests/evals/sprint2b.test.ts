/**
 * Golden Set Evals — Sprint 2b
 *
 * Covers: connectKnowledgeNodes UUID fallback (gs-016) and normal arrow creation (gs-017).
 */

import { describe, it, expect } from 'vitest';
import { executeToolCalls } from '../../src/agent/executor';
import { buildLearningExplorerPrompt } from '../../src/agent/learningExplorerPrompt';
import { getAnchorNodes, getEdgesAmong } from '../../src/data/knowledge-graph';
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
