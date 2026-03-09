import { describe, it, expect } from 'vitest';
import {
  transition,
  computeNewConfidence,
  INITIAL_STATE,
  type ExplorerState,
  type ExplorerEvent,
  type SideEffect,
} from '../../src/agent/explorerStateMachine';
import type { QuizData, QuizResult } from '../../src/agent/quizTypes';

const GRADE = '5';
const NODE_ID = 'node-fractions';

const sampleQuiz: QuizData = {
  format: 'mc',
  nodeId: NODE_ID,
  kgNodeId: 'kg-fractions',
  questionText: 'What is 1/2 + 1/4?',
  options: ['1/4', '3/4', '2/6', '1/3'],
  correctIndex: 1,
  components: ['fractions-add'],
};

const sampleResult: QuizResult = {
  correct: true,
  feedback: 'Great job!',
  newConfidence: 'green',
};

function runSequence(
  events: ExplorerEvent[],
  initial: ExplorerState = INITIAL_STATE,
): { state: ExplorerState; allEffects: SideEffect[] } {
  let state = initial;
  const allEffects: SideEffect[] = [];
  for (const event of events) {
    const { nextState, effects } = transition(state, event);
    state = nextState;
    allEffects.push(...effects);
  }
  return { state, allEffects };
}

describe('Explorer State Machine', () => {
  it('full quiz cycle: grade select → quiz → grade → result → idle', () => {
    const { state, allEffects } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_QUIZ' },
      { type: 'QUIZ_READY', quiz: sampleQuiz },
      { type: 'QUIZ_ANSWERED', answerIndex: 1 },
      { type: 'QUIZ_GRADED', result: sampleResult },
      { type: 'DISMISS_RESULT' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    const effectTypes = allEffects.map(e => e.type);
    expect(effectTypes).toContain('SPAWN_ANCHORS');
    expect(effectTypes).toContain('GENERATE_QUIZ');
    expect(effectTypes).toContain('GRADE_MC');
    expect(effectTypes).toContain('SET_CONFIDENCE');
  });

  it('"don\'t know" sets confidence to red', () => {
    const { state, allEffects } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_DONT_KNOW' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    expect(allEffects).toContainEqual({
      type: 'SET_CONFIDENCE',
      nodeId: NODE_ID,
      confidence: 'red',
    });
  });

  it('cancel quiz returns to IDLE', () => {
    const { state } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_QUIZ' },
      { type: 'QUIZ_READY', quiz: sampleQuiz },
      { type: 'CANCEL_QUIZ' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
  });

  it('spawn actions emit correct effects', () => {
    const menu: ExplorerState = { type: 'NODE_MENU_OPEN', grade: GRADE, nodeId: NODE_ID };

    const children = transition(menu, { type: 'ACTION_SHOW_CHILDREN' });
    expect(children.effects).toContainEqual({ type: 'SPAWN_CHILDREN', nodeId: NODE_ID });

    const prereqs = transition(menu, { type: 'ACTION_SHOW_PREREQS' });
    expect(prereqs.effects).toContainEqual({ type: 'SPAWN_PREREQS', nodeId: NODE_ID });
  });

  it('invalid transitions are no-ops', () => {
    const idle: ExplorerState = { type: 'IDLE', grade: GRADE };
    const { nextState, effects } = transition(idle, { type: 'QUIZ_ANSWERED', answerIndex: 0 });
    expect(nextState).toEqual(idle);
    expect(effects).toEqual([]);
  });
});

describe('computeNewConfidence', () => {
  it('red + correct MC → yellow (not green)', () => {
    expect(computeNewConfidence('red', true, 'mc')).toBe('yellow');
  });

  it('red + correct FR below threshold → yellow', () => {
    expect(computeNewConfidence('red', true, 'fr-text', 0.5)).toBe('yellow');
  });

  it('red + correct FR above threshold → green', () => {
    expect(computeNewConfidence('red', true, 'fr-text', 0.9)).toBe('green');
  });

  it('green + incorrect → yellow (graceful demotion)', () => {
    expect(computeNewConfidence('green', false, 'mc')).toBe('yellow');
  });

  it('obvious transitions', () => {
    expect(computeNewConfidence('gray', true, 'mc')).toBe('green');
    expect(computeNewConfidence('gray', false, 'mc')).toBe('red');
    expect(computeNewConfidence('yellow', true, 'mc')).toBe('green');
    expect(computeNewConfidence('yellow', false, 'mc')).toBe('red');
  });
});
