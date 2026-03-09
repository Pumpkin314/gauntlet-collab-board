import type { Confidence, QuizData, QuizFormat, QuizResult } from './quizTypes';

export type ExplorerState =
  | { type: 'CHOOSE_GRADE' }
  | { type: 'SPAWNING_ANCHORS'; grade: string }
  | { type: 'IDLE'; grade: string }
  | { type: 'NODE_MENU_OPEN'; grade: string; nodeId: string }
  | { type: 'QUIZ_LOADING'; grade: string; nodeId: string }
  | { type: 'QUIZ_IN_PROGRESS'; grade: string; nodeId: string; quiz: QuizData }
  | { type: 'QUIZ_RESULT'; grade: string; nodeId: string; result: QuizResult }
  | { type: 'INTERACTIVE_LESSON'; grade: string; nodeId: string };

export type ExplorerEvent =
  | { type: 'SELECT_GRADE'; grade: string }
  | { type: 'ANCHORS_PLACED' }
  | { type: 'NODE_CLICKED'; nodeId: string }
  | { type: 'MENU_DISMISSED' }
  | { type: 'ACTION_QUIZ'; forceFormat?: QuizFormat }
  | { type: 'ACTION_DONT_KNOW' }
  | { type: 'ACTION_SHOW_PREREQS' }
  | { type: 'ACTION_SHOW_CHILDREN' }
  | { type: 'ACTION_LESSON' }
  | { type: 'QUIZ_READY'; quiz: QuizData }
  | { type: 'QUIZ_ANSWERED'; answerIndex: number }
  | { type: 'QUIZ_FR_ANSWERED'; text: string }
  | { type: 'QUIZ_GRADED'; result: QuizResult }
  | { type: 'CANCEL_QUIZ' }
  | { type: 'DISMISS_RESULT' };

export type SideEffect =
  | { type: 'SPAWN_ANCHORS'; grade: string }
  | { type: 'SET_CONFIDENCE'; nodeId: string; confidence: Confidence }
  | { type: 'SPAWN_CHILDREN'; nodeId: string }
  | { type: 'SPAWN_PREREQS'; nodeId: string }
  | { type: 'GENERATE_QUIZ'; nodeId: string; forceFormat?: QuizFormat }
  | { type: 'GRADE_FR'; nodeId: string; answer: string }
  | { type: 'GRADE_MC'; nodeId: string; answerIndex: number }
  | { type: 'SHOW_CHAT_MESSAGE'; message: string }
  | { type: 'PAN_TO_NODE'; nodeId: string };

export const INITIAL_STATE: ExplorerState = { type: 'CHOOSE_GRADE' };

export function transition(
  state: ExplorerState,
  event: ExplorerEvent,
): { nextState: ExplorerState; effects: SideEffect[] } {
  const noop = { nextState: state, effects: [] as SideEffect[] };

  switch (state.type) {
    case 'CHOOSE_GRADE': {
      if (event.type === 'SELECT_GRADE') {
        return {
          nextState: { type: 'SPAWNING_ANCHORS', grade: event.grade },
          effects: [
            { type: 'SPAWN_ANCHORS', grade: event.grade },
            { type: 'SHOW_CHAT_MESSAGE', message: `Setting up Grade ${event.grade}...` },
          ],
        };
      }
      return noop;
    }

    case 'SPAWNING_ANCHORS': {
      if (event.type === 'ANCHORS_PLACED') {
        return {
          nextState: { type: 'IDLE', grade: state.grade },
          effects: [
            { type: 'SHOW_CHAT_MESSAGE', message: 'Welcome! Click on any topic to get started.' },
          ],
        };
      }
      return noop;
    }

    case 'IDLE': {
      if (event.type === 'NODE_CLICKED') {
        return {
          nextState: { type: 'NODE_MENU_OPEN', grade: state.grade, nodeId: event.nodeId },
          effects: [],
        };
      }
      return noop;
    }

    case 'NODE_MENU_OPEN': {
      switch (event.type) {
        case 'MENU_DISMISSED':
          return {
            nextState: { type: 'IDLE', grade: state.grade },
            effects: [],
          };

        case 'ACTION_DONT_KNOW':
          return {
            nextState: { type: 'IDLE', grade: state.grade },
            effects: [
              { type: 'SET_CONFIDENCE', nodeId: state.nodeId, confidence: 'red' },
              { type: 'SHOW_CHAT_MESSAGE', message: "No worries — let's build up to it!" },
            ],
          };

        case 'ACTION_QUIZ':
          return {
            nextState: { type: 'QUIZ_LOADING', grade: state.grade, nodeId: state.nodeId },
            effects: [
              { type: 'GENERATE_QUIZ', nodeId: state.nodeId, forceFormat: event.forceFormat },
            ],
          };

        case 'ACTION_SHOW_CHILDREN':
          return {
            nextState: { type: 'IDLE', grade: state.grade },
            effects: [{ type: 'SPAWN_CHILDREN', nodeId: state.nodeId }],
          };

        case 'ACTION_SHOW_PREREQS':
          return {
            nextState: { type: 'IDLE', grade: state.grade },
            effects: [{ type: 'SPAWN_PREREQS', nodeId: state.nodeId }],
          };

        default:
          return noop;
      }
    }

    case 'QUIZ_LOADING': {
      if (event.type === 'QUIZ_READY') {
        return {
          nextState: {
            type: 'QUIZ_IN_PROGRESS',
            grade: state.grade,
            nodeId: state.nodeId,
            quiz: event.quiz,
          },
          effects: [],
        };
      }
      if (event.type === 'QUIZ_GRADED') {
        return {
          nextState: {
            type: 'QUIZ_RESULT',
            grade: state.grade,
            nodeId: state.nodeId,
            result: event.result,
          },
          effects: [
            { type: 'SET_CONFIDENCE', nodeId: state.nodeId, confidence: event.result.newConfidence },
            { type: 'SHOW_CHAT_MESSAGE', message: event.result.feedback },
          ],
        };
      }
      return noop;
    }

    case 'QUIZ_IN_PROGRESS': {
      if (event.type === 'QUIZ_ANSWERED') {
        return {
          nextState: { type: 'QUIZ_LOADING', grade: state.grade, nodeId: state.nodeId },
          effects: [{ type: 'GRADE_MC', nodeId: state.nodeId, answerIndex: event.answerIndex }],
        };
      }
      if (event.type === 'QUIZ_FR_ANSWERED') {
        return {
          nextState: { type: 'QUIZ_LOADING', grade: state.grade, nodeId: state.nodeId },
          effects: [{ type: 'GRADE_FR', nodeId: state.nodeId, answer: event.text }],
        };
      }
      if (event.type === 'CANCEL_QUIZ') {
        return {
          nextState: { type: 'IDLE', grade: state.grade },
          effects: [{ type: 'SHOW_CHAT_MESSAGE', message: 'Quiz cancelled.' }],
        };
      }
      return noop;
    }

    case 'QUIZ_RESULT': {
      if (event.type === 'DISMISS_RESULT') {
        return {
          nextState: { type: 'IDLE', grade: state.grade },
          effects: [],
        };
      }
      return noop;
    }

    case 'INTERACTIVE_LESSON':
      return noop;

    default:
      return noop;
  }
}

export function computeNewConfidence(
  current: Confidence,
  correct: boolean,
  format: QuizFormat,
  llmConfidence?: number,
): Confidence {
  if (correct) {
    switch (current) {
      case 'gray':
        return 'green';
      case 'red':
        if (format !== 'mc' && llmConfidence !== undefined && llmConfidence >= 0.8) {
          return 'green';
        }
        return 'yellow';
      case 'yellow':
        return 'green';
      case 'green':
        return 'green';
    }
  } else {
    switch (current) {
      case 'gray':
        return 'red';
      case 'red':
        return 'red';
      case 'yellow':
        return 'red';
      case 'green':
        return 'yellow';
    }
  }
}

export function getActionsForConfidence(confidence: Confidence): string[] {
  switch (confidence) {
    case 'gray':
      return ['Quiz me!', "I don't know this"];
    case 'green':
      return ['Quiz me again!', 'What does this unlock?'];
    case 'yellow':
      return ['Quiz me again!', 'What leads to this?', 'What does this unlock?'];
    case 'red':
      return ['Quiz me!', 'What leads to this?'];
  }
}
