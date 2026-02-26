import { useState, useCallback, useRef } from 'react';
import type { AgentMessage, ViewportCenter } from './types';
import { runAgentCommand } from './pipeline';
import { getPipelineConfig } from './pipeline';
import { useBoardActions } from '../contexts/BoardContext';
import { useAuth } from '../contexts/AuthContext';

export type AgentMode = 'boardie' | 'explorer';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

interface UseAgentReturn {
  messages: AgentMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  isOpen: boolean;
  toggleOpen: () => void;
  clearMessages: () => void;
  cancelRequest: () => void;
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
}

export function useAgent(
  stagePosRef: React.RefObject<{ x: number; y: number }>,
  stageScaleRef: React.RefObject<number>,
): UseAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setModeState] = useState<AgentMode>('explorer');

  const actions = useBoardActions();
  const { currentUser } = useAuth();

  // Per-mode conversation histories and session objects
  const historyRef = useRef<Record<AgentMode, ConversationMessage[]>>({
    boardie: [],
    explorer: [],
  });
  const sessionObjectsRef = useRef<Record<AgentMode, Map<string, { type: string; content?: string; color?: string; createdAt: number }>>>({
    boardie: new Map(),
    explorer: new Map(),
  });
  /** Explorer-only: kgNodeId → boardObjectId. Enables dedup and bot awareness. */
  const kgNodeMapRef = useRef<Map<string, string>>(new Map());
  const messagesPerModeRef = useRef<Record<AgentMode, AgentMessage[]>>({
    boardie: [],
    explorer: [],
  });
  const streamingIdRef = useRef<string>('streaming-' + crypto.randomUUID());
  const abortControllerRef = useRef<AbortController | null>(null);

  const getViewportCenter = useCallback((): ViewportCenter => {
    const pos = stagePosRef.current ?? { x: 0, y: 0 };
    const scale = stageScaleRef.current ?? 1;
    const left = -pos.x / scale;
    const top = -pos.y / scale;
    const width = window.innerWidth / scale;
    const height = window.innerHeight / scale;
    return {
      x: left + width / 2,
      y: top + height / 2,
      bounds: { left, top, right: left + width, bottom: top + height, width, height, scale },
    };
  }, [stagePosRef, stageScaleRef]);

  const setMode = useCallback((newMode: AgentMode) => {
    if (newMode === mode) return;
    // Cancel any inflight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    // Save current mode's messages
    messagesPerModeRef.current[mode] = messages;
    // Switch and restore
    setModeState(newMode);
    setMessages(messagesPerModeRef.current[newMode]);
    setIsLoading(false);
  }, [mode, messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userId = currentUser?.uid ?? 'anonymous';

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const viewportCenter = getViewportCenter();
      const sid = streamingIdRef.current;

      const onProgress = (status: AgentMessage) => {
        const streamMsg: AgentMessage = { ...status, id: sid };
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === sid);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = streamMsg;
            return next;
          }
          return [...prev, streamMsg];
        });
      };

      // Inject session memory into conversation context
      const currentHistory = historyRef.current[mode];
      const currentSessionObjects = sessionObjectsRef.current[mode];
      let historyWithSessionMemory = currentHistory;
      if (currentSessionObjects.size > 0) {
        const allObjects = actions.getAllObjects();
        const sessionIds = new Set(currentSessionObjects.keys());
        const liveSessionObjects = allObjects
          .filter((obj) => sessionIds.has(obj.id))
          .map((obj) => ({ id: obj.id, type: obj.type, content: obj.content, x: Math.round(obj.x), y: Math.round(obj.y), color: obj.color }));

        if (liveSessionObjects.length > 0) {
          const memoryBlock: ConversationMessage = {
            role: 'user',
            content: `[Session memory] Objects you created this session: ${JSON.stringify(liveSessionObjects)}`,
          };
          historyWithSessionMemory = [memoryBlock, ...currentHistory];
        }
      }

      const pipelineConfig = getPipelineConfig(mode, mode === 'explorer' ? kgNodeMapRef.current : undefined);

      const { messages: resultMessages, createdObjectIds } = await runAgentCommand(
        trimmed,
        actions,
        userId,
        viewportCenter,
        historyWithSessionMemory,
        actions.getAllObjects,
        onProgress,
        abortController.signal,
        pipelineConfig,
      );

      // Store newly created objects in session memory
      for (const id of createdObjectIds) {
        const allObjects = actions.getAllObjects();
        const obj = allObjects.find((o) => o.id === id);
        if (obj) {
          currentSessionObjects.set(id, {
            type: obj.type,
            content: obj.content,
            color: obj.color,
            createdAt: Date.now(),
          });
          // Keep kgNodeMap in sync for explorer mode
          if (mode === 'explorer' && obj.type === 'kg-node' && obj.kgNodeId) {
            kgNodeMapRef.current.set(obj.kgNodeId, id);
          }
        }
      }

      historyRef.current[mode] = [
        ...currentHistory,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: resultMessages.map((m) => m.content).join('\n') },
      ];

      setMessages((prev) => [...prev.filter((m) => m.id !== sid), ...resultMessages]);
      streamingIdRef.current = 'streaming-' + crypto.randomUUID();
    } catch (err) {
      const isAbort = (err instanceof DOMException && err.name === 'AbortError')
        || (err instanceof Error && /abort/i.test(err.message));
      const errMsg = isAbort ? 'Request cancelled. Ready for your next message.' : (err instanceof Error ? err.message : String(err));
      const currentSid = streamingIdRef.current;
      setMessages((prev) => [
        ...prev.filter((m) => m.id === currentSid ? false : true),
        { id: crypto.randomUUID(), role: isAbort ? 'status' : 'error', content: errMsg, timestamp: Date.now() },
      ]);
      streamingIdRef.current = 'streaming-' + crypto.randomUUID();
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [isLoading, currentUser, actions, getViewportCenter, mode]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    historyRef.current[mode] = [];
    sessionObjectsRef.current[mode].clear();
    if (mode === 'explorer') kgNodeMapRef.current.clear();
  }, [mode]);

  return { messages, sendMessage, isLoading, isOpen, toggleOpen, clearMessages, cancelRequest, mode, setMode };
}
