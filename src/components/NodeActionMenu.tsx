import { useEffect, useRef, useCallback } from 'react';
import type { Confidence } from '../agent/quizTypes';

interface NodeActionMenuProps {
  confidence: Confidence;
  screenPosition: { x: number; y: number };
  onAction: (action: string) => void;
  onDismiss: () => void;
}

const ACTIONS: Record<Confidence, string[]> = {
  gray: ['Quiz me!', "I don't know this"],
  green: ['Quiz me again!', 'What does this unlock?'],
  yellow: ['Quiz me again!', 'What leads to this?', 'What does this unlock?'],
  red: ['Quiz me!', 'What leads to this?'],
};

const ACCENT = '#7C4DFF';

export default function NodeActionMenu({ confidence, screenPosition, onAction, onDismiss }: NodeActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onDismiss();
  }, [onDismiss]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleKeyDown, handleClickOutside]);

  const actions = ACTIONS[confidence];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: screenPosition.x + 10,
        top: screenPosition.y - 10,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: '6px 4px',
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 160,
      }}
    >
      {actions.map((label) => (
        <button
          key={label}
          onClick={() => onAction(label)}
          style={{
            background: 'none',
            border: 'none',
            padding: '7px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 13,
            fontWeight: 500,
            color: ACCENT,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#F3EEFF'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
