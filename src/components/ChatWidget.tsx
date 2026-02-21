import { useRef, useEffect, useState, useCallback } from 'react';
import type { AgentMessage } from '../agent/types';
import { useAgent } from '../agent/useAgent';

interface ChatWidgetProps {
  stagePosRef: React.RefObject<{ x: number; y: number }>;
  stageScaleRef: React.RefObject<number>;
}

export default function ChatWidget({ stagePosRef, stageScaleRef }: ChatWidgetProps) {
  const { messages, sendMessage, isLoading, isOpen, toggleOpen, clearMessages } = useAgent(stagePosRef, stageScaleRef);
  const [inputValue, setInputValue] = useState('');
  const [clickedOptionMsgIds, setClickedOptionMsgIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    void sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, sendMessage]);

  const handleOptionClick = useCallback((option: string) => {
    if (isLoading) return;
    void sendMessage(option);
    setClickedOptionMsgIds((prev) => {
      const next = new Set(prev);
      const lastOptMsg = [...messages].reverse().find((m) => m.options?.length);
      if (lastOptMsg) next.add(lastOptMsg.id);
      return next;
    });
  }, [isLoading, sendMessage, messages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Collapsed toggle tab
  if (!isOpen) {
    return (
      <button
        data-testid="boardie-toggle"
        onClick={toggleOpen}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#4ECDC4',
          color: 'white',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          padding: '12px 8px',
          cursor: 'pointer',
          zIndex: 1000,
          writingMode: 'vertical-rl',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '-2px 0 12px rgba(0,0,0,0.1)',
          letterSpacing: 1,
        }}
      >
        Boardie
      </button>
    );
  }

  return (
    <div
      data-testid="boardie-panel"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        width: 360,
        height: '100vh',
        background: 'white',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#4ECDC4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
          }}>B</div>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#333' }}>Boardie</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {messages.length > 0 && (
            <button
              data-testid="boardie-clear"
              onClick={clearMessages}
              title="Clear chat"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                color: '#999',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              Clear
            </button>
          )}
          <button
            data-testid="boardie-close"
            onClick={toggleOpen}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: '#999',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        data-testid="boardie-messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#aaa',
            fontSize: 13,
            marginTop: 40,
            lineHeight: 1.5,
          }}>
            Hi! I'm Boardie. Tell me what to create on the board.
            <br /><br />
            Try: "Add a yellow sticky note that says User Research"
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onOptionClick={msg.options && !clickedOptionMsgIds.has(msg.id) ? handleOptionClick : undefined}
          />
        ))}

        {isLoading && (
          <div style={{
            alignSelf: 'flex-start',
            background: '#f0f0f0',
            borderRadius: 12,
            padding: '8px 14px',
            fontSize: 13,
            color: '#888',
          }}>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #eee',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            data-testid="boardie-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell Boardie what to do..."
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              lineHeight: 1.4,
              maxHeight: 100,
              overflowY: 'auto',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#4ECDC4'; }}
            onBlur={(e) => { e.target.style.borderColor = '#ddd'; }}
          />
          <button
            data-testid="boardie-send"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            style={{
              background: inputValue.trim() && !isLoading ? '#4ECDC4' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: inputValue.trim() && !isLoading ? 'pointer' : 'default',
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onOptionClick }: { message: AgentMessage; onOptionClick?: (option: string) => void }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isStatus = message.role === 'status';

  if (isStatus) {
    return (
      <div style={{
        textAlign: 'center',
        fontSize: 12,
        color: '#888',
        padding: '4px 0',
      }}>
        {message.content}
      </div>
    );
  }

  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
    }}>
      <div style={{
        background: isUser ? '#4ECDC4' : isError ? '#FFF0F0' : '#f0f0f0',
        color: isUser ? 'white' : isError ? '#CC4444' : '#333',
        borderRadius: 12,
        padding: '8px 14px',
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {message.content}
      </div>
      {message.options && message.options.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 6,
        }}>
          {message.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onOptionClick?.(opt)}
              disabled={!onOptionClick}
              style={{
                background: 'white',
                color: '#4ECDC4',
                border: '1.5px solid #4ECDC4',
                borderRadius: 16,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                cursor: onOptionClick ? 'pointer' : 'default',
                opacity: onOptionClick ? 1 : 0.5,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <div style={{
        fontSize: 10,
        color: '#aaa',
        marginTop: 2,
        textAlign: isUser ? 'right' : 'left',
        paddingInline: 4,
      }}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
