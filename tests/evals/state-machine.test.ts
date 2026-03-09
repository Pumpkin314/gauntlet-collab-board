import { describe, it, expect } from 'vitest';
import {
  transition,
  computeNewConfidence,
  getActionsForConfidence,
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

describe('Explorer State Machine — Happy paths', () => {
  it('1. full quiz cycle from grade selection to result dismissal', () => {
    const events: ExplorerEvent[] = [
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_QUIZ' },
      { type: 'QUIZ_READY', quiz: sampleQuiz },
      { type: 'QUIZ_ANSWERED', answerIndex: 1 },
      { type: 'QUIZ_GRADED', result: sampleResult },
      { type: 'DISMISS_RESULT' },
    ];

    const { state, allEffects } = runSequence(events);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    expect(allEffects.some(e => e.type === 'SPAWN_ANCHORS')).toBe(true);
    expect(allEffects.some(e => e.type === 'GENERATE_QUIZ')).toBe(true);
    expect(allEffects.some(e => e.type === 'GRADE_MC')).toBe(true);
    expect(allEffects.some(e => e.type === 'SET_CONFIDENCE')).toBe(true);
  });

  it('2. "don\'t know" path sets confidence to red', () => {
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
    expect(allEffects.some(e => e.type === 'SHOW_CHAT_MESSAGE')).toBe(true);
  });

  it('3. cancel quiz returns to IDLE', () => {
    const { state, allEffects } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_QUIZ' },
      { type: 'QUIZ_READY', quiz: sampleQuiz },
      { type: 'CANCEL_QUIZ' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    expect(allEffects).toContainEqual({
      type: 'SHOW_CHAT_MESSAGE',
      message: 'Quiz cancelled.',
    });
  });

  it('4. menu dismiss returns to IDLE', () => {
    const { state } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'MENU_DISMISSED' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
  });

  it('5. show children emits SPAWN_CHILDREN', () => {
    const { state, allEffects } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_SHOW_CHILDREN' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    expect(allEffects).toContainEqual({ type: 'SPAWN_CHILDREN', nodeId: NODE_ID });
  });

  it('6. show prereqs emits SPAWN_PREREQS', () => {
    const { state, allEffects } = runSequence([
      { type: 'SELECT_GRADE', grade: GRADE },
      { type: 'ANCHORS_PLACED' },
      { type: 'NODE_CLICKED', nodeId: NODE_ID },
      { type: 'ACTION_SHOW_PREREQS' },
    ]);

    expect(state).toEqual({ type: 'IDLE', grade: GRADE });
    expect(allEffects).toContainEqual({ type: 'SPAWN_PREREQS', nodeId: NODE_ID });
  });
});

describe('Explorer State Machine — Invalid transitions', () => {
  it('7. IDLE + QUIZ_ANSWERED is a no-op', () => {
    const idle: ExplorerState = { type: 'IDLE', grade: GRADE };
    const { nextState, effects } = transition(idle, { type: 'QUIZ_ANSWERED', answerIndex: 0 });
    expect(nextState).toEqual(idle);
    expect(effects).toEqual([]);
  });

  it('8. CHOOSE_GRADE + NODE_CLICKED is a no-op', () => {
    const { nextState, effects } = transition(INITIAL_STATE, { type: 'NODE_CLICKED', nodeId: NODE_ID });
    expect(nextState).toEqual(INITIAL_STATE);
    expect(effects).toEqual([]);
  });

  it('9. QUIZ_IN_PROGRESS + NODE_CLICKED is a no-op', () => {
    const quizState: ExplorerState = {
      type: 'QUIZ_IN_PROGRESS',
      grade: GRADE,
      nodeId: NODE_ID,
      quiz: sampleQuiz,
    };
    const { nextState, effects } = transition(quizState, { type: 'NODE_CLICKED', nodeId: 'other' });
    expect(nextState).toEqual(quizState);
    expect(effects).toEqual([]);
  });

  it('10. SPAWNING_ANCHORS + SELECT_GRADE is a no-op', () => {
    const spawning: ExplorerState = { type: 'SPAWNING_ANCHORS', grade: GRADE };
    const { nextState, effects } = transition(spawning, { type: 'SELECT_GRADE', grade: '6' });
    expect(nextState).toEqual(spawning);
    expect(effects).toEqual([]);
  });
});

describe('computeNewConfidence', () => {
  it('11. gray + correct(mc) → green', () => {
    expect(computeNewConfidence('gray', true, 'mc')).toBe('green');
  });

  it('12. gray + incorrect → red', () => {
    expect(computeNewConfidence('gray', false, 'mc')).toBe('red');
  });

  it('13. red + correct(mc) → yellow', () => {
    expect(computeNewConfidence('red', true, 'mc')).toBe('yellow');
  });

  it('14. red + correct(fr-text, llmConfidence=0.5) → yellow', () => {
    expect(computeNewConfidence('red', true, 'fr-text', 0.5)).toBe('yellow');
  });

  it('15. red + correct(fr-text, llmConfidence=0.9) → green', () => {
    expect(computeNewConfidence('red', true, 'fr-text', 0.9)).toBe('green');
  });

  it('16. red + incorrect → red', () => {
    expect(computeNewConfidence('red', false, 'mc')).toBe('red');
  });

  it('17. yellow + correct(any) → green', () => {
    expect(computeNewConfidence('yellow', true, 'mc')).toBe('green');
    expect(computeNewConfidence('yellow', true, 'fr-text', 0.7)).toBe('green');
  });

  it('18. yellow + incorrect → red', () => {
    expect(computeNewConfidence('yellow', false, 'mc')).toBe('red');
  });

  it('19. green + incorrect → yellow', () => {
    expect(computeNewConfidence('green', false, 'mc')).toBe('yellow');
  });

  it('20. green + correct → green', () => {
    expect(computeNewConfidence('green', true, 'mc')).toBe('green');
  });
});

describe('getActionsForConfidence', () => {
  it('21. gray actions', () => {
    expect(getActionsForConfidence('gray')).toEqual(['Quiz me!', "I don't know this"]);
  });

  it('22. green actions', () => {
    expect(getActionsForConfidence('green')).toEqual(['Quiz me again!', 'What does this unlock?']);
  });

  it('23. yellow actions', () => {
    expect(getActionsForConfidence('yellow')).toEqual([
      'Quiz me again!',
      'What leads to this?',
      'What does this unlock?',
    ]);
  });

  it('24. red actions', () => {
    expect(getActionsForConfidence('red')).toEqual(['Quiz me!', 'What leads to this?']);
  });
});

describe('Explorer State Machine — Side effects', () => {
  it('25. SELECT_GRADE produces SPAWN_ANCHORS + SHOW_CHAT_MESSAGE', () => {
    const { effects } = transition(INITIAL_STATE, { type: 'SELECT_GRADE', grade: GRADE });
    expect(effects).toHaveLength(2);
    expect(effects[0]).toEqual({ type: 'SPAWN_ANCHORS', grade: GRADE });
    expect(effects[1]).toMatchObject({ type: 'SHOW_CHAT_MESSAGE' });
  });

  it('26. ACTION_DONT_KNOW produces SET_CONFIDENCE + SHOW_CHAT_MESSAGE', () => {
    const menuState: ExplorerState = { type: 'NODE_MENU_OPEN', grade: GRADE, nodeId: NODE_ID };
    const { effects } = transition(menuState, { type: 'ACTION_DONT_KNOW' });
    expect(effects).toHaveLength(2);
    expect(effects[0]).toEqual({ type: 'SET_CONFIDENCE', nodeId: NODE_ID, confidence: 'red' });
    expect(effects[1]).toMatchObject({ type: 'SHOW_CHAT_MESSAGE' });
  });

  it('27. ACTION_QUIZ produces GENERATE_QUIZ', () => {
    const menuState: ExplorerState = { type: 'NODE_MENU_OPEN', grade: GRADE, nodeId: NODE_ID };
    const { effects } = transition(menuState, { type: 'ACTION_QUIZ' });
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ type: 'GENERATE_QUIZ', nodeId: NODE_ID });
  });

  it('28. QUIZ_GRADED produces SET_CONFIDENCE + SHOW_CHAT_MESSAGE', () => {
    const loadingState: ExplorerState = { type: 'QUIZ_LOADING', grade: GRADE, nodeId: NODE_ID };
    const { effects } = transition(loadingState, { type: 'QUIZ_GRADED', result: sampleResult });
    expect(effects).toHaveLength(2);
    expect(effects[0]).toEqual({
      type: 'SET_CONFIDENCE',
      nodeId: NODE_ID,
      confidence: 'green',
    });
    expect(effects[1]).toEqual({
      type: 'SHOW_CHAT_MESSAGE',
      message: 'Great job!',
    });
  });
});
