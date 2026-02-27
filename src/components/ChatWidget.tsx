import { useRef, useEffect, useState, useCallback } from 'react';
import type { AgentMessage } from '../agent/types';
import { useAgent } from '../agent/useAgent';
import type { AgentMode } from '../agent/useAgent';

interface ChatWidgetProps {
  stagePosRef: React.RefObject<{ x: number; y: number }>;
  stageScaleRef: React.RefObject<number>;
  onOpenChange?: (open: boolean) => void;
}

const MODE_CONFIG: Record<AgentMode, {
  label: string;
  icon: string;
  color: string;
  greeting: string;
  hint: string;
  placeholder: string;
}> = {
  boardie: {
    label: 'Boardie',
    icon: 'B',
    color: '#4ECDC4',
    greeting: "Hi! I'm Boardie. Tell me what to create on the board.",
    hint: 'Try: "Add a yellow sticky note that says User Research"',
    placeholder: 'Tell Boardie what to do...',
  },
  explorer: {
    label: 'Learnie',
    icon: 'L',
    color: '#7C4DFF',
    greeting: "Hi! I'm Learnie, your math learning guide. Let's explore what you know!",
    hint: 'Try: "I\'m in 5th grade"',
    placeholder: 'Chat with Learnie...',
  },
};

export default function ChatWidget({ stagePosRef, stageScaleRef, onOpenChange }: ChatWidgetProps) {
  const { messages, sendMessage, isLoading, isOpen, toggleOpen, clearMessages, cancelRequest, mode, setMode } = useAgent(stagePosRef, stageScaleRef);
  const [inputValue, setInputValue] = useState('');
  const [clickedOptions, setClickedOptions] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cfg = MODE_CONFIG[mode];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    void sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, sendMessage]);

  const handleOptionClick = useCallback((option: string) => {
    if (isLoading) return;
    void sendMessage(option);
    setClickedOptions((prev) => {
      const next = new Map(prev);
      const lastOptMsg = [...messages].reverse().find((m) => m.options?.length);
      if (lastOptMsg) next.set(lastOptMsg.id, option);
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

  const handleModeToggle = useCallback(() => {
    if (isLoading) return;
    setMode(mode === 'boardie' ? 'explorer' : 'boardie');
  }, [isLoading, mode, setMode]);

  // Collapsed toggle tab
  if (!isOpen) {
    return (
      <button
        data-testid="boardie-toggle"
        onClick={toggleOpen}
        style={{
          position: 'fixed',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: cfg.color,
          color: 'white',
          border: 'none',
          borderRadius: '0 8px 8px 0',
          padding: '12px 8px',
          cursor: 'pointer',
          zIndex: 1000,
          writingMode: 'vertical-rl',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '2px 0 12px rgba(0,0,0,0.1)',
          letterSpacing: 1,
        }}
      >
        {cfg.label}
      </button>
    );
  }

  return (
    <div
      data-testid="boardie-panel"
      style={{
        position: 'fixed',
        left: 0,
        top: 60,
        width: 360,
        height: 'calc(100vh - 60px)',
        background: 'white',
        boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
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
            background: cfg.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
          }}>{cfg.icon}</div>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#333' }}>{cfg.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Mode toggle */}
          <button
            onClick={handleModeToggle}
            disabled={isLoading}
            title={`Switch to ${mode === 'boardie' ? 'Learnie' : 'Boardie'}`}
            style={{
              background: 'none',
              border: '1px solid #ddd',
              cursor: isLoading ? 'default' : 'pointer',
              fontSize: 11,
              color: '#666',
              padding: '4px 8px',
              borderRadius: 4,
              opacity: isLoading ? 0.4 : 1,
            }}
          >
            {mode === 'boardie' ? '✨ Learnie' : '🎨 Boardie'}
          </button>
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
            {cfg.greeting}
            <br /><br />
            {cfg.hint}
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            accentColor={cfg.color}
            onOptionClick={msg.options && !clickedOptions.has(msg.id) ? handleOptionClick : undefined}
            selectedOption={clickedOptions.get(msg.id)}
          />
        ))}

        {isLoading && !messages.some((m) => m.id.startsWith('streaming-')) && (
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
            placeholder={cfg.placeholder}
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
            onFocus={(e) => { e.target.style.borderColor = cfg.color; }}
            onBlur={(e) => { e.target.style.borderColor = '#ddd'; }}
          />
          {isLoading ? (
            <button
              data-testid="boardie-cancel"
              onClick={cancelRequest}
              style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              data-testid="boardie-send"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              style={{
                background: inputValue.trim() ? cfg.color : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: inputValue.trim() ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, accentColor, onOptionClick, selectedOption }: {
  message: AgentMessage;
  accentColor: string;
  onOptionClick?: (option: string) => void;
  selectedOption?: string;
}) {
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
        background: isUser ? accentColor : isError ? '#FFF0F0' : '#f0f0f0',
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
          {message.options.map((opt) => {
            const isSelected = selectedOption === opt;
            const isDisabled = !onOptionClick;
            return (
              <button
                key={opt}
                onClick={() => onOptionClick?.(opt)}
                disabled={isDisabled}
                style={{
                  background: isSelected ? accentColor : 'white',
                  color: isSelected ? 'white' : accentColor,
                  border: `1.5px solid ${accentColor}`,
                  borderRadius: 16,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: onOptionClick ? 'pointer' : 'default',
                  opacity: isDisabled && !isSelected ? 0.4 : 1,
                }}
              >
                {opt}
              </button>
            );
          })}
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
