import { useState, useCallback, useRef } from 'react';
import type { AgentMessage } from '../agent/types';
import type { Confidence, QuizData } from '../agent/quizTypes';
import {
  INITIAL_STATE,
  transition,
  computeNewConfidence,
  type ExplorerState,
  type ExplorerEvent,
  type SideEffect,
} from '../agent/explorerStateMachine';
import {
  computeAnchorPlacements,
  computeAnchorEdges,
  getWelcomeMessage,
} from '../agent/explorerSpawn';
import { getNode, getComponents } from '../data/knowledge-graph-v2/index';
import { pickQuizFormat, generateMCQuiz, generateFRQuiz, gradeMCAnswer, gradeFRAnswer } from '../agent/quizGenerator';
import { useBoardActions } from '../contexts/BoardContext';

const CONFIDENCE_TO_KG: Record<Confidence, string> = {
  gray: 'unexplored',
  green: 'mastered',
  yellow: 'shaky',
  red: 'gap',
};

export interface UseExplorerStateMachineReturn {
  state: ExplorerState;
  dispatch: (event: ExplorerEvent) => void;
  confidenceMap: Map<string, Confidence>;
  kgNodeMap: Map<string, string>;
  messages: AgentMessage[];
}

export function useExplorerStateMachine(
  getViewportCenter: () => { x: number; y: number; bounds: { width: number } },
): UseExplorerStateMachineReturn {
  const [state, setState] = useState<ExplorerState>(INITIAL_STATE);
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  const confidenceMapRef = useRef<Map<string, Confidence>>(new Map());
  const kgNodeMapRef = useRef<Map<string, string>>(new Map());
  const stateRef = useRef<ExplorerState>(INITIAL_STATE);
  const lastQuizRef = useRef<QuizData | null>(null);

  const actions = useBoardActions();

  const appendMessage = useCallback((content: string, role: 'agent' | 'status' = 'agent') => {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const executeSideEffect = useCallback((effect: SideEffect) => {
    switch (effect.type) {
      case 'SPAWN_ANCHORS': {
        const viewport = getViewportCenter();
        const placements = computeAnchorPlacements(
          effect.grade,
          { x: viewport.x, y: viewport.y },
          viewport.bounds.width,
        );

        const placedKgIds: string[] = [];
        for (const p of placements) {
          const boardId = actions.createObject('kg-node', p.x, p.y, {
            content: p.description,
            color: p.laneColor,
            kgNodeId: p.kgNodeId,
            kgConfidence: 'unexplored',
            kgGradeLevel: effect.grade,
          });
          kgNodeMapRef.current.set(p.kgNodeId, boardId);
          placedKgIds.push(p.kgNodeId);
        }

        const edges = computeAnchorEdges(effect.grade, placedKgIds);
        for (const edge of edges) {
          const fromBoardId = kgNodeMapRef.current.get(edge.sourceKgNodeId);
          const toBoardId = kgNodeMapRef.current.get(edge.targetKgNodeId);
          if (fromBoardId && toBoardId) {
            actions.createObject('connector', 0, 0, {
              fromId: fromBoardId,
              toId: toBoardId,
              color: '#999999',
              strokeWidth: 2,
              arrowEnd: true,
            });
          }
        }

        const welcome = getWelcomeMessage(effect.grade, placements.length);
        appendMessage(welcome);

        // Self-dispatch to transition out of SPAWNING_ANCHORS
        dispatchEvent({ type: 'ANCHORS_PLACED' });
        break;
      }

      case 'SET_CONFIDENCE': {
        confidenceMapRef.current.set(effect.nodeId, effect.confidence);
        const boardId = kgNodeMapRef.current.get(effect.nodeId);
        if (boardId) {
          actions.updateObject(boardId, {
            kgConfidence: CONFIDENCE_TO_KG[effect.confidence],
          } as any);
        }
        break;
      }

      case 'SHOW_CHAT_MESSAGE': {
        appendMessage(effect.message);
        break;
      }

      case 'SPAWN_CHILDREN':
      case 'SPAWN_PREREQS':
        console.warn(`[ExplorerSM] ${effect.type} not yet implemented (Sprint 4)`);
        break;

      case 'GENERATE_QUIZ': {
        const { nodeId, forceFormat } = effect;
        const node = getNode(nodeId);
        if (!node) break;
        const components = getComponents(node.id);
        const grade = stateRef.current.type !== 'CHOOSE_GRADE' ? (stateRef.current as any).grade : '5';
        const format = pickQuizFormat(grade, components.length, forceFormat);

        const generateFn = format === 'mc' ? generateMCQuiz : generateFRQuiz;
        generateFn(node, components, grade)
          .then((quiz) => {
            dispatchEvent({ type: 'QUIZ_READY', quiz });
          })
          .catch((err) => {
            console.error('[Explorer] Quiz generation failed:', err);
            appendMessage('Sorry, I had trouble creating a quiz. Try again!');
            dispatchEvent({ type: 'CANCEL_QUIZ' });
          });
        break;
      }

      case 'GRADE_MC': {
        const quiz = lastQuizRef.current;
        if (!quiz) break;
        const { correct, feedback } = gradeMCAnswer(quiz, effect.answerIndex);
        const currentConfidence = confidenceMapRef.current.get(effect.nodeId) ?? 'gray';
        const newConfidence = computeNewConfidence(currentConfidence, correct, quiz.format);
        dispatchEvent({
          type: 'QUIZ_GRADED',
          result: { correct, feedback, newConfidence },
        });
        break;
      }

      case 'GRADE_FR': {
        const quiz = lastQuizRef.current;
        if (!quiz) break;
        const node = getNode(effect.nodeId);
        if (!node) break;
        const grade = (stateRef.current as any).grade ?? '5';
        gradeFRAnswer(quiz, effect.answer, node, grade)
          .then(({ correct, partial, llmConfidence, feedback }) => {
            const currentConfidence = confidenceMapRef.current.get(effect.nodeId) ?? 'gray';
            const newConfidence = computeNewConfidence(currentConfidence, correct, quiz.format, llmConfidence);
            dispatchEvent({
              type: 'QUIZ_GRADED',
              result: { correct, partial, llmConfidence, feedback, newConfidence },
            });
          })
          .catch((err) => {
            console.error('[Explorer] FR grading failed:', err);
            appendMessage('Sorry, I had trouble grading your answer. Try again!');
            dispatchEvent({ type: 'CANCEL_QUIZ' });
          });
        break;
      }

      case 'PAN_TO_NODE':
        break;
    }
  }, [getViewportCenter, actions, appendMessage]);

  /** Uses stateRef to avoid stale closures when self-dispatching (e.g. ANCHORS_PLACED). */
  const dispatchEvent = useCallback((event: ExplorerEvent) => {
    const { nextState, effects } = transition(stateRef.current, event);
    stateRef.current = nextState;
    if (nextState.type === 'QUIZ_IN_PROGRESS') {
      lastQuizRef.current = nextState.quiz;
    }
    setState(nextState);
    for (const effect of effects) {
      executeSideEffect(effect);
    }
  }, [executeSideEffect]);

  const dispatch = useCallback((event: ExplorerEvent) => {
    dispatchEvent(event);
  }, [dispatchEvent]);

  return {
    state,
    dispatch,
    confidenceMap: confidenceMapRef.current,
    kgNodeMap: kgNodeMapRef.current,
    messages,
  };
}
