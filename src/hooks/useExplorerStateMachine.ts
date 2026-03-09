import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentMessage } from '../agent/types';
import type { Confidence, QuizData } from '../agent/quizTypes';
import { saveExplorerState, loadExplorerState, clearExplorerState } from '../services/explorerPersistence';
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
  computeChildSpawnPlacements,
  computePrereqSpawnPlacements,
  getWelcomeMessage,
} from '../agent/explorerSpawn';
import { getNode, getChildren, getParents, getComponents, getEdgesAmong } from '../data/knowledge-graph-v2/index';
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
  resetExplorer: () => void;
}

export function useExplorerStateMachine(
  getViewportCenter: () => { x: number; y: number; bounds: { width: number } },
  boardId?: string,
): UseExplorerStateMachineReturn {
  const [state, setState] = useState<ExplorerState>(INITIAL_STATE);
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  const confidenceMapRef = useRef<Map<string, Confidence>>(new Map());
  const kgNodeMapRef = useRef<Map<string, string>>(new Map());
  const stateRef = useRef<ExplorerState>(INITIAL_STATE);
  const lastQuizRef = useRef<QuizData | null>(null);

  const actions = useBoardActions();
  const drawnEdgesRef = useRef<Set<string>>(new Set());

  const appendMessage = useCallback((content: string, role: 'agent' | 'status' = 'agent') => {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const spawnPlacementsToBoard = useCallback((placements: ReturnType<typeof computeChildSpawnPlacements>['placements'], grade: string): string[] => {
    const newKgIds: string[] = [];
    for (const p of placements) {
      if (kgNodeMapRef.current.has(p.kgNodeId)) continue;
      const boardId = actions.createObject('kg-node', p.x, p.y, {
        content: p.description,
        color: p.laneColor,
        kgNodeId: p.kgNodeId,
        kgConfidence: 'unexplored',
        kgGradeLevel: grade,
      });
      kgNodeMapRef.current.set(p.kgNodeId, boardId);
      newKgIds.push(p.kgNodeId);
    }
    return newKgIds;
  }, [actions]);

  const drawEdgesForVisibleNodes = useCallback(() => {
    const allVisibleKgIds = [...kgNodeMapRef.current.keys()];
    const edges = getEdgesAmong(allVisibleKgIds);
    for (const edge of edges) {
      const edgeKey = `${edge.source}->${edge.target}`;
      if (drawnEdgesRef.current.has(edgeKey)) continue;
      const fromBoardId = kgNodeMapRef.current.get(edge.source);
      const toBoardId = kgNodeMapRef.current.get(edge.target);
      if (fromBoardId && toBoardId) {
        actions.createObject('connector', 0, 0, {
          fromId: fromBoardId,
          toId: toBoardId,
          color: '#999999',
          strokeWidth: 2,
          arrowEnd: true,
        });
        drawnEdgesRef.current.add(edgeKey);
      }
    }
  }, [actions]);

  const executeSideEffect = useCallback((effect: SideEffect) => {
    switch (effect.type) {
      case 'SPAWN_ANCHORS': {
        const viewport = getViewportCenter();
        const placements = computeAnchorPlacements(
          effect.grade,
          { x: viewport.x, y: viewport.y },
          viewport.bounds.width,
        );

        spawnPlacementsToBoard(placements, effect.grade);
        drawEdgesForVisibleNodes();

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

      case 'SPAWN_CHILDREN': {
        const parentBoardId = kgNodeMapRef.current.get(effect.nodeId);
        if (!parentBoardId) break;
        const childIds = getChildren(effect.nodeId).filter((id) => !kgNodeMapRef.current.has(id));
        if (childIds.length === 0) {
          appendMessage('This topic has no further unlocks to explore yet.');
          break;
        }
        const viewport = getViewportCenter();
        const parentNode = getNode(effect.nodeId);
        const grade = stateRef.current.type !== 'CHOOSE_GRADE' ? (stateRef.current as any).grade : '5';
        const parentPos = { x: viewport.x, y: viewport.y };
        const { placements, remaining } = computeChildSpawnPlacements(parentPos, childIds, grade, viewport.bounds.width);
        const newKgIds = spawnPlacementsToBoard(placements, grade);
        drawEdgesForVisibleNodes();
        if (remaining > 0) {
          actions.updateObject(parentBoardId, { kgRemainingChildren: remaining } as any);
        }
        appendMessage(`Unlocked ${placements.length} topic${placements.length !== 1 ? 's' : ''}!${remaining > 0 ? ` (+${remaining} more to explore)` : ''}`);
        break;
      }

      case 'SPAWN_PREREQS': {
        const childBoardId = kgNodeMapRef.current.get(effect.nodeId);
        if (!childBoardId) break;
        const prereqIds = getParents(effect.nodeId).filter((id) => !kgNodeMapRef.current.has(id));
        if (prereqIds.length === 0) {
          appendMessage('All prerequisites are already on the board!');
          break;
        }
        const viewport = getViewportCenter();
        const grade = stateRef.current.type !== 'CHOOSE_GRADE' ? (stateRef.current as any).grade : '5';
        const childPos = { x: viewport.x, y: viewport.y };
        const { placements, remaining } = computePrereqSpawnPlacements(childPos, prereqIds, grade, viewport.bounds.width);
        const newKgIds = spawnPlacementsToBoard(placements, grade);
        drawEdgesForVisibleNodes();
        if (remaining > 0) {
          actions.updateObject(childBoardId, { kgRemainingPrereqs: remaining } as any);
        }
        appendMessage(`Found ${placements.length} prerequisite${placements.length !== 1 ? 's' : ''}!${remaining > 0 ? ` (+${remaining} more)` : ''}`);
        break;
      }

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
  }, [getViewportCenter, actions, appendMessage, spawnPlacementsToBoard, drawEdgesForVisibleNodes]);

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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistState = useCallback(() => {
    if (!boardId) return;
    const s = stateRef.current;
    if (s.type === 'CHOOSE_GRADE') return;
    const grade = (s as any).grade ?? '';
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveExplorerState(boardId, {
        grade,
        stateType: s.type,
        kgNodeMap: Object.fromEntries(kgNodeMapRef.current),
        confidenceMap: Object.fromEntries(confidenceMapRef.current),
        drawnEdges: [...drawnEdgesRef.current],
      });
    }, 200);
  }, [boardId]);

  const dispatch = useCallback((event: ExplorerEvent) => {
    dispatchEvent(event);
    persistState();
  }, [dispatchEvent, persistState]);

  const resetExplorer = useCallback(() => {
    for (const boardObjId of kgNodeMapRef.current.values()) {
      actions.deleteObject(boardObjId);
    }
    kgNodeMapRef.current.clear();
    confidenceMapRef.current.clear();
    drawnEdgesRef.current.clear();
    lastQuizRef.current = null;
    stateRef.current = INITIAL_STATE;
    setState(INITIAL_STATE);
    setMessages([]);
    if (boardId) void clearExplorerState(boardId);
  }, [actions, boardId]);

  // Restore persisted state on mount
  useEffect(() => {
    if (!boardId) return;
    void loadExplorerState(boardId).then((persisted) => {
      if (!persisted || !persisted.grade) return;
      for (const [kgId, confidence] of Object.entries(persisted.confidenceMap)) {
        confidenceMapRef.current.set(kgId, confidence);
      }
      for (const [kgId, boardObjId] of Object.entries(persisted.kgNodeMap)) {
        kgNodeMapRef.current.set(kgId, boardObjId);
      }
      for (const edgeKey of persisted.drawnEdges) {
        drawnEdgesRef.current.add(edgeKey);
      }
      const restored: ExplorerState = { type: 'IDLE', grade: persisted.grade };
      stateRef.current = restored;
      setState(restored);
      appendMessage(`Welcome back! Your Grade ${persisted.grade} map is restored. Click any node to continue.`);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  return {
    state,
    dispatch,
    confidenceMap: confidenceMapRef.current,
    kgNodeMap: kgNodeMapRef.current,
    messages,
    resetExplorer,
  };
}
