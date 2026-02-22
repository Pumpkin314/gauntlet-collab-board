import { useState, useCallback, useRef } from 'react';
import type { AgentMessage, ViewportCenter } from './types';
import { runAgentCommand } from './pipeline';
import { useBoardActions } from '../contexts/BoardContext';
import { useAuth } from '../contexts/AuthContext';

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
}

export function useAgent(
  stagePosRef: React.RefObject<{ x: number; y: number }>,
  stageScaleRef: React.RefObject<number>,
): UseAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const actions = useBoardActions();
  const { currentUser } = useAuth();

  // Track conversation history for multi-turn context
  const historyRef = useRef<ConversationMessage[]>([]);
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

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userId = currentUser?.uid ?? 'anonymous';

    // Add user message to chat
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

      const resultMessages = await runAgentCommand(
        trimmed,
        actions,
        userId,
        viewportCenter,
        historyRef.current,
        actions.getAllObjects,
        onProgress,
        abortController.signal,
      );

      // Update conversation history for context
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: resultMessages.map((m) => m.content).join('\n') },
      ];

      // Remove streaming status and add final results
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
  }, [isLoading, currentUser, actions, getViewportCenter]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, sendMessage, isLoading, isOpen, toggleOpen, clearMessages, cancelRequest };
}
