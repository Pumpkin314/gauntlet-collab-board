import { useState, useCallback, useRef } from 'react';
import type { AgentMessage } from './types';
import type { ViewportCenter } from './types';
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

  const getViewportCenter = useCallback((): ViewportCenter => {
    const pos = stagePosRef.current ?? { x: 0, y: 0 };
    const scale = stageScaleRef.current ?? 1;
    return {
      x: (-pos.x + window.innerWidth / 2) / scale,
      y: (-pos.y + window.innerHeight / 2) / scale,
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

    try {
      const viewportCenter = getViewportCenter();
      const resultMessages = await runAgentCommand(
        trimmed,
        actions,
        userId,
        viewportCenter,
        historyRef.current,
        actions.getAllObjects,
      );

      // Update conversation history for context
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: resultMessages.map((m) => m.content).join('\n') },
      ];

      setMessages((prev) => [...prev, ...resultMessages]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'error', content: errMsg, timestamp: Date.now() },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, currentUser, actions, getViewportCenter]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, sendMessage, isLoading, isOpen, toggleOpen, clearMessages };
}
