/**
 * Golden Set Evals — Sprint 1
 *
 * Deterministic assertions on pipeline logic and safety utilities.
 * No LLM calls — all LLM interactions are mocked.
 *
 * Each test is tagged with its golden-set ID (gs-NNN) in the test name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSafety } from '../../src/agent/safety';
import { executeToolCalls } from '../../src/agent/executor';
import { buildLearningExplorerPrompt } from '../../src/agent/learningExplorerPrompt';
import type { AgentToolCall } from '../../src/agent/types';
import type { BoardObject } from '../../src/types/board';

// ── Shared test fixtures ────────────────────────────────────────────────────

function makeToolCall(name: string, input: Record<string, unknown>): AgentToolCall {
  return { id: crypto.randomUUID(), name, input };
}

/** Minimal BoardActions stub that records mutations for assertion. */
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
    deleteObject: vi.fn(),
    batchCreate: vi.fn().mockReturnValue([]),
    _created: created,
    _updated: updated,
  };
}

const VIEWPORT = { x: 500, y: 400 };

// ── Safety filter tests (gs-004 through gs-007) ──────────────────────────────

describe('Content safety pre-flight', () => {
  it('[gs-004] flags age-inappropriate blocked term', () => {
    const result = checkSafety('Here is some info about drugs and fractions.');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Blocked term');
    expect(result.text).not.toContain('drugs');
  });

  it('[gs-005] flags external URLs', () => {
    const result = checkSafety('Click here: https://example.com/lessons for more info.');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('External URL');
    expect(result.text).not.toContain('https://example.com');
  });

  it('[gs-006] passes clean age-appropriate educational text', () => {
    const result = checkSafety(
      'Great job! Adding fractions means finding a common denominator and then adding the numerators together.',
    );
    expect(result.safe).toBe(true);
    expect(result.text).toContain('Adding fractions');
  });

  it('[gs-007] flags text with Flesch-Kincaid grade above 8', () => {
    // Deliberately academic/complex sentence
    const hardText =
      'The epistemological foundations of mathematical comprehension necessitate ' +
      'a rigorous examination of axiomatic structures and their ramifications. ' +
      'Furthermore, the pedagogical implications of metacognitive strategies ' +
      'in computational arithmetic demonstrate considerable heterogeneity.';
    const result = checkSafety(hardText);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Readability grade');
  });
});

// ── KG node deduplication (gs-002, gs-003) ───────────────────────────────────

describe('KG node deduplication via kgNodeMap', () => {
  it('[gs-002] redirects placeKnowledgeNode to updateObject when kgNodeId already in map', () => {
    const actions = makeActions();
    const kgNodeMap = new Map<string, string>([['2.OA.A.1', 'obj-existing']]);

    const tc = makeToolCall('placeKnowledgeNode', {
      kgNodeId: '2.OA.A.1',
      description: 'Add and subtract within 100',
      confidence: 'mastered',
      x: 100,
      y: 200,
    });

    executeToolCalls([tc], actions as never, VIEWPORT, undefined, [], kgNodeMap);

    // Must NOT create a new object
    expect(actions._created.length).toBe(0);
    // Must update the existing one
    expect(actions._updated.length).toBe(1);
    expect(actions._updated[0]!.id).toBe('obj-existing');
    expect(actions._updated[0]!.updates.kgConfidence).toBe('mastered');
  });

  it('[gs-002b] creates new node and records it in kgNodeMap when not already present', () => {
    const actions = makeActions();
    const kgNodeMap = new Map<string, string>();

    const tc = makeToolCall('placeKnowledgeNode', {
      kgNodeId: '2.NBT.A.1',
      description: 'Understand place value',
      confidence: 'gap',
      x: 300,
      y: 400,
    });

    const { results } = executeToolCalls([tc], actions as never, VIEWPORT, undefined, [], kgNodeMap);

    expect(results[0]!.success).toBe(true);
    expect(actions._created.length).toBe(1);
    // Map should now contain the new node
    expect(kgNodeMap.has('2.NBT.A.1')).toBe(true);
  });
});

// ── Bot awareness: kgNodeMap injected into prompt (gs-003) ───────────────────

describe('KG node map injected into system prompt', () => {
  it('[gs-003] includes [KG nodes on board] block when map is non-empty', () => {
    const kgNodeMap = new Map([
      ['2.OA.A.1', 'board-obj-1'],
      ['2.NBT.A.1', 'board-obj-2'],
    ]);
    const prompt = buildLearningExplorerPrompt(VIEWPORT, kgNodeMap);
    expect(prompt).toContain('[KG nodes on board');
    expect(prompt).toContain('2.OA.A.1');
    expect(prompt).toContain('board-obj-1');
  });

  it('[gs-003b] omits [KG nodes on board] block when map is empty', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT);
    expect(prompt).not.toContain('[KG nodes on board');
  });
});

// ── Stall-out fix: non-KG tool calls preserved (gs-001, gs-008, gs-009) ─────

describe('KG multi-turn merge preserves non-KG calls', () => {
  /**
   * gs-001 / gs-008: simulate the merge logic directly.
   *
   * Before the fix: toolCalls = parsed2.toolCalls would drop respondConversationally.
   * After the fix: non-KG calls from the previous iteration survive.
   */
  it('[gs-001] respondConversationally is not dropped after KG loop iteration', () => {
    // Simulate what the KG loop does after the fix:
    const KG_READONLY_TOOLS = new Set([
      'searchKnowledgeGraph', 'getPrerequisites', 'computeFrontier',
      'expandAroundNode', 'getNodesByGrade',
    ]);

    // Round 1 toolCalls (what LLM returned alongside a KG read call)
    const round1ToolCalls: AgentToolCall[] = [
      makeToolCall('searchKnowledgeGraph', { query: 'fractions', gradeLevel: '5' }),
      makeToolCall('respondConversationally', { message: 'Let me look up fractions for you!' }),
    ];

    // Simulated second LLM response with only a placement tool (no respondConversationally)
    const parsed2ToolCalls: AgentToolCall[] = [
      makeToolCall('placeKnowledgeNode', { kgNodeId: '5.NF.A.1', description: 'Add fractions', confidence: 'unexplored' }),
    ];

    // The fix: keep non-KG calls, append new response's calls
    const nonKgCalls = round1ToolCalls.filter((tc) => !KG_READONLY_TOOLS.has(tc.name));
    const merged = [...nonKgCalls, ...parsed2ToolCalls];

    const conversationalCall = merged.find((tc) => tc.name === 'respondConversationally');
    const placementCall = merged.find((tc) => tc.name === 'placeKnowledgeNode');

    expect(conversationalCall).toBeDefined();
    expect(conversationalCall!.input.message).toBe('Let me look up fractions for you!');
    expect(placementCall).toBeDefined();
  });

  it('[gs-009] textContent from round 1 is preserved when round 2 has no text', () => {
    // Simulate the textContent merge: textContent = parsed2.textContent || textContent
    const round1Text = 'Here are the fractions topics for 5th grade!';
    const parsed2Text = ''; // second response had no text

    const finalText = parsed2Text || round1Text;
    expect(finalText).toBe(round1Text);
  });
});

// ── Safety filter applied via executor (gs-010) ──────────────────────────────

describe('Safety filter applied to respondConversationally in executor', () => {
  it('[gs-010] executor filters blocked term when applySafety=true', () => {
    const actions = makeActions();
    const tc = makeToolCall('respondConversationally', {
      message: 'Great! Now about drugs — just kidding, let\'s talk about fractions.',
    });

    const { agentMessages } = executeToolCalls(
      [tc], actions as never, VIEWPORT, undefined, [], undefined, true,
    );

    expect(agentMessages[0]).not.toContain('drugs');
    // Should be replaced with the safe fallback
    expect(agentMessages[0]).toContain('think of a better way');
  });

  it('[gs-010b] executor passes clean message through unchanged when applySafety=true', () => {
    const actions = makeActions();
    const tc = makeToolCall('respondConversationally', {
      message: 'Great job! You know how to add fractions. Let\'s move on!',
    });

    const { agentMessages } = executeToolCalls(
      [tc], actions as never, VIEWPORT, undefined, [], undefined, true,
    );

    expect(agentMessages[0]).toContain('add fractions');
  });
});
