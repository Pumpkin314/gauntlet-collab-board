import { useRef, useEffect, useState, useCallback } from 'react';
import type { AgentMessage } from '../agent/types';
import type { QuizData } from '../agent/quizTypes';
import { useAgent } from '../agent/useAgent';
import type { AgentMode } from '../agent/useAgent';
import { useExplorerOptional } from '../contexts/ExplorerContext';
import GradeSelector from './GradeSelector';

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
  const explorer = useExplorerOptional();
  const [inputValue, setInputValue] = useState('');
  const [clickedOptions, setClickedOptions] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cfg = MODE_CONFIG[mode];

  const useV2Explorer = mode === 'explorer' && explorer !== null;

  const explorerMessages = explorer?.messages;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, explorerMessages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    if (useV2Explorer && explorer.state.type === 'QUIZ_IN_PROGRESS' && explorer.state.quiz.format !== 'mc') {
      explorer.dispatch({ type: 'QUIZ_FR_ANSWERED', text: inputValue });
      setInputValue('');
      return;
    }
    void sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, sendMessage, useV2Explorer, explorer]);

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
          {useV2Explorer && explorer.state.type !== 'CHOOSE_GRADE' && (
            <button
              onClick={() => {
                if (window.confirm('Reset your learning map? This will clear all nodes and progress.')) {
                  explorer.resetExplorer();
                }
              }}
              title="Reset map"
              style={{
                background: 'none',
                border: '1px solid #ddd',
                cursor: 'pointer',
                fontSize: 11,
                color: '#999',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              Reset
            </button>
          )}
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
        {useV2Explorer && explorer.state.type === 'CHOOSE_GRADE' ? (
          <>
            <div style={{
              textAlign: 'center',
              color: '#aaa',
              fontSize: 13,
              marginTop: 20,
              lineHeight: 1.5,
            }}>
              {cfg.greeting}
            </div>
            <GradeSelector onSelectGrade={(grade) => explorer.dispatch({ type: 'SELECT_GRADE', grade })} />
          </>
        ) : useV2Explorer ? (
          <>
            {explorer.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                accentColor={cfg.color}
                onOptionClick={msg.options && !clickedOptions.has(msg.id) ? handleOptionClick : undefined}
                selectedOption={clickedOptions.get(msg.id)}
              />
            ))}
            {explorer.state.type === 'QUIZ_LOADING' && (
              <div style={{
                alignSelf: 'flex-start',
                background: '#f0f0f0',
                borderRadius: 12,
                padding: '8px 14px',
                fontSize: 13,
                color: '#888',
              }}>
                Generating quiz<TypingDots />
              </div>
            )}
            {(explorer.state.type === 'QUIZ_IN_PROGRESS' || explorer.state.type === 'QUIZ_LOADING') && (
              <>
                {explorer.state.type === 'QUIZ_IN_PROGRESS' && (
                  <QuizDisplay
                    quiz={explorer.state.quiz}
                    accentColor={cfg.color}
                    onAnswer={(answerIndex) => explorer.dispatch({ type: 'QUIZ_ANSWERED', answerIndex })}
                  />
                )}
                <button
                  onClick={() => explorer.dispatch({ type: 'CANCEL_QUIZ' })}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    color: '#999',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '4px 0',
                    marginTop: 4,
                  }}
                >
                  Cancel quiz
                </button>
              </>
            )}
            {explorer.state.type === 'QUIZ_RESULT' && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  background: explorer.state.result.correct ? '#E8F5E9' : '#FFF3E0',
                  color: '#333',
                  borderRadius: 12,
                  padding: '8px 14px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  borderLeft: `4px solid ${explorer.state.result.correct ? '#4CAF50' : '#FF9800'}`,
                }}>
                  {explorer.state.result.feedback}
                </div>
                <button
                  onClick={() => explorer.dispatch({ type: 'DISMISS_RESULT' })}
                  style={{
                    marginTop: 8,
                    background: cfg.color,
                    color: 'white',
                    border: 'none',
                    borderRadius: 16,
                    padding: '6px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Continue
                </button>
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
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

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function QuizDisplay({ quiz, accentColor, onAnswer }: {
  quiz: QuizData;
  accentColor: string;
  onAnswer: (answerIndex: number) => void;
}) {
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
      <div style={{
        background: '#f0f0f0',
        color: '#333',
        borderRadius: 12,
        padding: '8px 14px',
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {quiz.questionText}
      </div>
      {quiz.format === 'mc' && quiz.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {quiz.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAnswer(i)}
              style={{
                background: 'white',
                color: accentColor,
                border: `1.5px solid ${accentColor}`,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {OPTION_LABELS[i]}. {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ letterSpacing: 2 }}>
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }
      `}</style>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            display: 'inline-block',
          }}
        >.</span>
      ))}
    </span>
  );
}
