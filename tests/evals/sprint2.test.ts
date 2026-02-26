/**
 * Golden Set Evals — Sprint 2
 *
 * Covers: mode selection prompt gating, provisional confidence coloring,
 * givePracticeQuestion pipeline interception, and pending-question injection.
 * No real LLM calls — callAnthropic is mocked where needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCalls } from '../../src/agent/executor';
import { buildLearningExplorerPrompt } from '../../src/agent/learningExplorerPrompt';
import { runAgentCommand, getPipelineConfig } from '../../src/agent/pipeline';
import type { AgentToolCall } from '../../src/agent/types';
import type { BoardObject } from '../../src/types/board';

// ── Fixtures ────────────────────────────────────────────────────────────────

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
    deleteObject: vi.fn(),
    batchCreate: vi.fn().mockReturnValue([]),
    getAllObjects: vi.fn().mockReturnValue([]),
    _created: created,
    _updated: updated,
  };
}

const VIEWPORT = { x: 500, y: 400 };

/** Minimal Anthropic API response shape for mocking. */
function makeApiResponse(toolCalls: Array<{ name: string; input: Record<string, unknown> }>, text = '') {
  return {
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      ...toolCalls.map((tc) => ({
        type: 'tool_use',
        id: crypto.randomUUID(),
        name: tc.name,
        input: tc.input,
      })),
    ],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

// ── Mode selection prompt gating (gs-011, gs-012) ───────────────────────────

describe('Mode selection gating in system prompt', () => {
  it('[gs-011] null explorerMode forces immediate mode-selection message', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, null);
    expect(prompt).toContain('FIRST ACTION REQUIRED');
    expect(prompt).toContain('Map my knowledge');
    expect(prompt).toContain("I know my level, let's go");
    // Must not include the diagnostic or gamified sections when mode is unset
    expect(prompt).not.toContain('Current Mode: Diagnostic');
    expect(prompt).not.toContain('Current Mode: Gamified');
  });

  it('[gs-012a] diagnostic mode prompt includes diagnostic flow, not gamified', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, 'diagnostic');
    expect(prompt).toContain('Current Mode: Diagnostic');
    expect(prompt).toContain('provisional');
    expect(prompt).not.toContain('FIRST ACTION REQUIRED');
    expect(prompt).not.toContain('Current Mode: Gamified');
  });

  it('[gs-012b] gamified mode prompt includes gamified flow, not diagnostic', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, 'gamified');
    expect(prompt).toContain('Current Mode: Gamified');
    expect(prompt).not.toContain('FIRST ACTION REQUIRED');
    expect(prompt).not.toContain('Current Mode: Diagnostic');
  });
});

// ── Provisional confidence coloring (gs-013) ─────────────────────────────────

describe('Provisional confidence level in executor', () => {
  it('[gs-013a] placeKnowledgeNode with provisional uses light-green color', () => {
    const actions = makeActions();
    const kgNodeMap = new Map<string, string>();

    const tc = makeToolCall('placeKnowledgeNode', {
      kgNodeId: '5.NF.A.1',
      description: 'Add fractions',
      confidence: 'provisional',
      x: 200,
      y: 300,
    });

    const { results } = executeToolCalls([tc], actions as never, VIEWPORT, undefined, [], kgNodeMap);

    expect(results[0]!.success).toBe(true);
    const created = actions._created[0]!;
    expect(created.overrides?.kgConfidence).toBe('provisional');
    expect(created.overrides?.color).toBe('#A5D6A7');
  });

  it('[gs-013b] updateNodeConfidence to provisional updates color to light green', () => {
    const existingId = 'board-obj-5';
    const actions = makeActions();
    const allObjects: Partial<BoardObject>[] = [
      { id: existingId, type: 'kg-node', kgNodeId: '5.NF.A.1', x: 0, y: 0, width: 160, height: 80, zIndex: 1 },
    ];

    const tc = makeToolCall('updateNodeConfidence', {
      kgNodeId: '5.NF.A.1',
      confidence: 'provisional',
    });

    executeToolCalls([tc], actions as never, VIEWPORT, undefined, allObjects as BoardObject[]);

    expect(actions._updated.length).toBe(1);
    expect(actions._updated[0]!.updates.kgConfidence).toBe('provisional');
    expect(actions._updated[0]!.updates.color).toBe('#A5D6A7');
  });
});

// ── Pending practice question injected into system prompt (gs-014) ───────────

describe('Pending practice question block in system prompt', () => {
  it('[gs-014] pendingPracticeQuestion injects validation hint with kgNodeId and correctIndex', () => {
    const prompt = buildLearningExplorerPrompt(
      VIEWPORT,
      undefined,
      'diagnostic',
      { kgNodeId: '5.NF.A.1', correctIndex: 2 },
    );
    // The injected block uses a bracketed marker distinct from any prose mentions
    expect(prompt).toContain('[PENDING PRACTICE VALIDATION:');
    expect(prompt).toContain('5.NF.A.1');
    expect(prompt).toContain('correctAnswerIndex=2');
  });

  it('[gs-014b] no pendingPracticeQuestion means no validation hint block', () => {
    const prompt = buildLearningExplorerPrompt(VIEWPORT, undefined, 'diagnostic', null);
    // Bracketed marker only appears when a question is pending — prose mentions are fine
    expect(prompt).not.toContain('[PENDING PRACTICE VALIDATION:');
  });
});

// ── givePracticeQuestion pipeline interception (gs-015) ─────────────────────

vi.mock('../../src/agent/apiClient', () => ({
  callAnthropic: vi.fn(),
}));

import { callAnthropic } from '../../src/agent/apiClient';

describe('givePracticeQuestion pipeline interception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[gs-015a] pipeline returns pendingPracticeQuestion and lettered options', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    mockedCall.mockResolvedValueOnce(
      makeApiResponse([{
        name: 'givePracticeQuestion',
        input: {
          kgNodeId: '5.NF.A.1',
          questionText: 'What is 1/4 + 1/4?',
          options: ['1/8', '1/2', '2/4', '1'],
          correctIndex: 1,
          difficulty: 'medium',
        },
      }]),
    );

    const actions = makeActions();
    const config = getPipelineConfig('explorer', new Map(), 'diagnostic', null);
    const result = await runAgentCommand('quiz me', actions as never, 'user-1', VIEWPORT, [], actions.getAllObjects, undefined, undefined, config);

    // Must return the pending question with the correct index
    expect(result.pendingPracticeQuestion).toBeDefined();
    expect(result.pendingPracticeQuestion!.kgNodeId).toBe('5.NF.A.1');
    expect(result.pendingPracticeQuestion!.correctIndex).toBe(1);

    // Message must have lettered options
    const msg = result.messages[0]!;
    expect(msg.options).toBeDefined();
    expect(msg.options![0]).toMatch(/^A\)/);
    expect(msg.options![1]).toMatch(/^B\)/);
    expect(msg.content).toBe('What is 1/4 + 1/4?');
  });

  it('[gs-015b] board mutations co-emitted with givePracticeQuestion execute before early return', async () => {
    const mockedCall = vi.mocked(callAnthropic);
    // LLM returns a node placement AND a practice question in the same turn
    mockedCall.mockResolvedValueOnce(
      makeApiResponse([
        {
          name: 'placeKnowledgeNode',
          input: { kgNodeId: '5.NF.A.2', description: 'Subtract fractions', confidence: 'provisional', x: 300, y: 400 },
        },
        {
          name: 'givePracticeQuestion',
          input: {
            kgNodeId: '5.NF.A.2',
            questionText: 'What is 3/4 - 1/4?',
            options: ['1/4', '1/2', '2/4', '3/8'],
            correctIndex: 1,
            difficulty: 'medium',
          },
        },
      ]),
    );

    const actions = makeActions();
    const config = getPipelineConfig('explorer', new Map(), 'diagnostic', null);
    await runAgentCommand('quiz me on subtraction', actions as never, 'user-1', VIEWPORT, [], actions.getAllObjects, undefined, undefined, config);

    // The node must have been placed on the board before the early return
    expect(actions._created.length).toBe(1);
    expect(actions._created[0]!.overrides?.kgNodeId).toBe('5.NF.A.2');
  });
});
